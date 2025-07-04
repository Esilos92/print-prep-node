const OpenAI = require('openai');
const axios = require('axios');

class SimpleRoleVerifier {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // Web search configuration
    this.serpApiKey = process.env.SERP_API_KEY;
    this.hasWebSearch = !!this.serpApiKey;
    
    // REFINED: Essential multi-actor roles only
    this.definiteMultiActorRoles = [
      // Major Superheroes
      { char: ['batman', 'bruce wayne'], shows: ['batman'], reason: '8+ actors (Keaton, Bale, Affleck, Pattinson, etc.)' },
      { char: ['superman', 'clark kent'], shows: ['superman'], reason: '6+ actors (Reeve, Routh, Cavill, etc.)' },
      { char: ['spider-man', 'spiderman', 'peter parker'], shows: ['spider'], reason: '3+ actors (Maguire, Garfield, Holland)' },
      { char: ['joker'], shows: ['batman', 'joker'], reason: '10+ actors (Nicholson, Ledger, Phoenix, etc.)' },
      
      // Long-Running Characters
      { char: ['doctor', 'the doctor'], shows: ['doctor who'], reason: '15+ actors across 60+ years' },
      { char: ['james bond', 'bond', '007'], shows: ['bond', '007', 'james bond'], reason: '6+ actors (Connery, Moore, Brosnan, Craig, etc.)' },
      
      // Classic Literature
      { char: ['sherlock holmes', 'sherlock'], shows: ['sherlock'], reason: '20+ actors (Cumberbatch, RDJ, Brett, etc.)' },
      
      // Horror Icons
      { char: ['dracula'], shows: ['dracula'], reason: '15+ actors across horror films' },
      { char: ['frankenstein', 'frankenstein monster'], shows: ['frankenstein'], reason: '10+ actors' }
    ];
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
      }
    } catch (error) {
      console.log('⚠️ OpenAI not available for role verification');
    }
  }

  /**
   * ENHANCED: Role verification with IMDb auto-approval
   */
  async verifyRoles(celebrityName, discoveredRoles) {
    console.log(`🔍 Verifying ${discoveredRoles.length} roles for ${celebrityName}...`);
    
    const verifiedRoles = [];
    const rejectedRoles = [];
    let verificationCost = 0;
    
    for (const role of discoveredRoles) {
      // 🚨 AUTO-APPROVE: If role comes from IMDb emergency recovery, trust it completely
      if (this.isIMDbSourcedRole(role)) {
        verifiedRoles.push({
          ...role,
          verificationConfidence: 'HIGH',
          verificationReason: 'Auto-approved: IMDb-sourced emergency recovery role'
        });
        console.log(`✅ AUTO-APPROVED (IMDb): ${role.character} in ${role.title}`);
        continue;
      }

      // 🚨 LENIENT: If role is from any emergency recovery, be very lenient
      if (this.isEmergencyRecoveryRole(role)) {
        verifiedRoles.push({
          ...role,
          verificationConfidence: 'MEDIUM',
          verificationReason: 'Auto-approved: Emergency recovery role'
        });
        console.log(`✅ AUTO-APPROVED (Emergency): ${role.character} in ${role.title}`);
        continue;
      }

      // Regular verification for normal AI-discovered roles
      const verification = await this.verifyRegularRole(celebrityName, role);
      verificationCost += this.hasWebSearch ? 0.002 : 0.0002;
      
      if (verification.isValid) {
        verifiedRoles.push({
          ...role,
          verificationConfidence: verification.confidence,
          verificationReason: verification.reason
        });
        console.log(`✅ ${verification.confidence}: ${role.character} in ${role.title} - ${verification.reason}`);
      } else {
        rejectedRoles.push({
          ...role,
          rejectionReason: verification.reason,
          confidence: verification.confidence
        });
        console.log(`❌ ${verification.confidence}: ${role.character} in ${role.title} - ${verification.reason}`);
      }
    }
    
    console.log(`💰 Verification cost: $${verificationCost.toFixed(4)}`);
    console.log(`🎭 ${verifiedRoles.length}/${discoveredRoles.length} roles verified`);
    
    if (rejectedRoles.length > 0) {
      const uncertainRejections = rejectedRoles.filter(r => r.confidence === 'UNCERTAIN');
      if (uncertainRejections.length > 0) {
        console.log(`💡 ${uncertainRejections.length} uncertain rejections might need manual review`);
      }
    }
    
    return verifiedRoles;
  }

  /**
   * ENHANCED: Check if role is IMDb-sourced
   */
  isIMDbSourcedRole(role) {
    // Check if role comes from emergency recovery AND mentions IMDb
    return (role.source === 'emergency_web_recovery' || 
            role.source === 'emergency_ai_discovery') &&
           (role.recoveryMethod?.includes('imdb') || 
            role.sourceUrl?.includes('imdb.com') ||
            role.verificationMethod?.includes('imdb'));
  }

  /**
   * ENHANCED: Check if role is from emergency recovery
   */
  isEmergencyRecoveryRole(role) {
    return role.source === 'emergency_web_recovery' || 
           role.source === 'emergency_ai_discovery' ||
           role.recoveryMethod?.includes('emergency') ||
           role.emergencyRecovered === true;
  }

  /**
   * ENHANCED: Verify regular (non-emergency) roles
   */
  async verifyRegularRole(celebrityName, role) {
    // Try web search verification first (most accurate)
    if (this.hasWebSearch) {
      try {
        const webResult = await this.verifyRoleWithWebSearch(celebrityName, role);
        if (webResult.confidence !== 'UNKNOWN') {
          return webResult;
        }
      } catch (error) {
        console.log(`⚠️ Web search verification failed: ${error.message}`);
      }
    }

    // Fallback to AI verification
    if (this.hasOpenAI) {
      try {
        const prompt = this.buildVerificationPrompt(celebrityName, role);

        const completion = await this.openai.chat.completions.create({
          model: "gpt-4o-mini", // Cost-efficient for verification
          messages: [{ role: "user", content: prompt }],
          temperature: 0.05,
          max_tokens: 80
        });

        const response = completion.choices[0].message.content.trim();
        return this.parseVerificationResponse(response);
        
      } catch (error) {
        console.log(`⚠️ AI verification failed: ${error.message}`);
      }
    }

    // Final fallback - allow role with low confidence
    return { 
      isValid: true, 
      confidence: 'UNKNOWN', 
      reason: 'No verification available, allowing role' 
    };
  }

  /**
   * ENHANCED: Web search verification for regular roles
   */
  async verifyRoleWithWebSearch(celebrityName, role) {
    try {
      console.log(`🔍 Web verifying regular role: ${celebrityName} as ${role.character} in ${role.title}`);
      
      const searchQueries = [
        `"${celebrityName}" "${role.title}" cast`,
        `"${celebrityName}" "${role.character}" "${role.title}"`,
        `"${celebrityName}" "${role.title}"`,
        `"${role.character}" "${role.title}" cast`,
        `"${role.title}" "${role.character}" played by`
      ];

      for (const query of searchQueries) {
        try {
          const searchResult = await this.performWebSearch(query);
          const verification = this.analyzeSearchResults(searchResult, celebrityName, role);
          
          if (verification.confidence !== 'UNKNOWN') {
            console.log(`🌐 Web verification: ${verification.confidence} - ${verification.reason}`);
            return verification;
          }
        } catch (error) {
          console.log(`⚠️ Search query failed: ${query}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      return { 
        isValid: true, 
        confidence: 'UNKNOWN', 
        reason: 'No definitive web search results' 
      };

    } catch (error) {
      throw new Error(`Web search verification failed: ${error.message}`);
    }
  }

  /**
   * ENHANCED: Analyze search results for regular roles
   */
  analyzeSearchResults(searchData, celebrityName, role) {
    const results = searchData.organic_results || [];
    const snippets = results.map(r => (r.snippet || '').toLowerCase()).join(' ');
    const titles = results.map(r => (r.title || '').toLowerCase()).join(' ');
    const allText = `${snippets} ${titles}`.toLowerCase();

    const celebrityLower = celebrityName.toLowerCase();
    const characterLower = role.character.toLowerCase();
    const titleLower = role.title.toLowerCase();

    // Look for positive matches
    const positivePatterns = [
      new RegExp(`${celebrityLower}.*${characterLower}`, 'i'),
      new RegExp(`${characterLower}.*${celebrityLower}`, 'i'),
      new RegExp(`${celebrityLower}.*${titleLower}`, 'i'),
      new RegExp(`${titleLower}.*${celebrityLower}`, 'i'),
      new RegExp(`${celebrityLower}.*plays.*${characterLower}`, 'i'),
      new RegExp(`${celebrityLower}.*as.*${characterLower}`, 'i'),
      new RegExp(`cast.*${celebrityLower}.*${characterLower}`, 'i'),
      new RegExp(`${characterLower}.*played by.*${celebrityLower}`, 'i')
    ];

    const hasPositiveMatch = positivePatterns.some(pattern => pattern.test(allText));

    // Check for authoritative sources
    const hasIMDbSource = results.some(r => r.link && r.link.includes('imdb.com'));
    const hasWikipediaSource = results.some(r => r.link && r.link.includes('wikipedia.org'));
    const hasAuthorativeSource = hasIMDbSource || hasWikipediaSource;

    if (hasPositiveMatch && hasIMDbSource) {
      return {
        isValid: true,
        confidence: 'HIGH',
        reason: 'Confirmed by IMDb'
      };
    }

    if (hasPositiveMatch && hasWikipediaSource) {
      return {
        isValid: true,
        confidence: 'HIGH',
        reason: 'Confirmed by Wikipedia'
      };
    }

    if (hasPositiveMatch && hasAuthorativeSource) {
      return {
        isValid: true,
        confidence: 'MEDIUM',
        reason: 'Confirmed by authoritative source'
      };
    }

    if (hasPositiveMatch) {
      return {
        isValid: true,
        confidence: 'MEDIUM',
        reason: 'Confirmed by web search'
      };
    }

    // Check if celebrity and title exist together
    const hasCelebrityAndTitle = allText.includes(celebrityLower) && allText.includes(titleLower);
    if (hasCelebrityAndTitle) {
      return {
        isValid: true,
        confidence: 'MEDIUM',
        reason: 'Celebrity and title found together'
      };
    }

    // Check for clear contradictions
    const negativePatterns = [
      new RegExp(`${characterLower}.*played by.*(?!${celebrityLower})\\w+`, 'i'),
      new RegExp(`${characterLower}.*portrayed by.*(?!${celebrityLower})\\w+`, 'i')
    ];

    const hasNegativeMatch = negativePatterns.some(pattern => pattern.test(allText));

    if (hasNegativeMatch && hasAuthorativeSource) {
      return {
        isValid: false,
        confidence: 'HIGH',
        reason: 'Contradicted by authoritative source'
      };
    }

    if (results.length === 0) {
      return {
        isValid: false,
        confidence: 'MEDIUM',
        reason: 'No search results found'
      };
    }

    return {
      isValid: true,
      confidence: 'UNKNOWN',
      reason: 'Inconclusive search results'
    };
  }

  /**
   * Build verification prompt for regular roles
   */
  buildVerificationPrompt(celebrityName, role) {
    return `Verify if "${celebrityName}" played the character "${role.character}" in "${role.title}".

GUIDELINES:
- Include ALL types of roles: main, supporting, cameo, guest, voice acting
- Character names may be nicknames or partial names
- Include early career and lesser-known work
- Only reject if you're confident it's completely wrong

RESPOND FORMAT: [CONFIDENCE]|[YES/NO]|[BRIEF_REASON]

VERIFY: Did "${celebrityName}" play "${role.character}" in "${role.title}"?`;
  }

  /**
   * Parse verification response
   */
  parseVerificationResponse(response) {
    const parts = response.split('|');
    
    if (parts.length >= 3) {
      const confidence = parts[0].trim().toUpperCase();
      const decision = parts[1].trim().toUpperCase();
      const reason = parts[2].trim();
      
      const isValid = decision.includes('YES') || 
                     (confidence === 'LOW' && !decision.includes('NO')) ||
                     (confidence === 'UNKNOWN' && !decision.includes('NO'));
      
      return {
        isValid,
        confidence,
        reason: reason || 'No reason provided'
      };
    }
    
    // Default to allowing uncertain cases
    return { 
      isValid: true, 
      confidence: 'UNKNOWN', 
      reason: 'Uncertain response, allowing role' 
    };
  }

  /**
   * Perform web search using SerpAPI
   */
  async performWebSearch(query) {
    const params = {
      api_key: this.serpApiKey,
      engine: 'google',
      q: query,
      num: 10,
      gl: 'us',
      hl: 'en'
    };

    const response = await axios.get('https://serpapi.com/search', { 
      params,
      timeout: 10000
    });

    return response.data;
  }

  /**
   * Get search strategy for image sourcing
   */
  async getSearchStrategy(celebrityName, role) {
    const character = (role.character || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    
    // Check if multi-actor character
    const isMultiActor = this.isMultiActorCharacter(character, title);
    
    if (isMultiActor) {
      console.log(`🎭 Multi-actor strategy for ${character} in ${title}`);
      return {
        searchTerms: [
          `"${celebrityName}" "${role.title}"`,
          `"${celebrityName}" "${role.character}"`,
          `"${celebrityName}" as "${role.character}"`,
          `"${celebrityName}" ${role.title}`,
        ],
        maxImages: 15,
        reason: `Multi-actor character - search for ${celebrityName}'s version`
      };
    }
    
    // Standard single-actor approach
    return {
      searchTerms: [
        `"${role.character}" "${role.title}"`,
        `"${celebrityName}" "${role.character}"`,
        `"${celebrityName}" "${role.title}"`,
        `${role.character} ${role.title}`,
      ],
      maxImages: 20,
      reason: 'Single-actor character - standard search'
    };
  }

  /**
   * Multi-actor character detection
   */
  isMultiActorCharacter(character, title) {
    for (const role of this.definiteMultiActorRoles) {
      const characterMatches = role.char.some(charVariant => 
        character.includes(charVariant) || charVariant.includes(character)
      );
      
      const titleMatches = role.shows.some(showVariant => 
        title.includes(showVariant) || showVariant.includes(title)
      );
      
      if (characterMatches && titleMatches) {
        console.log(`🎭 MULTI-ACTOR: ${character} in ${title} - ${role.reason}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get verification statistics
   */
  getVerificationStats(verifiedRoles) {
    const stats = {
      total: verifiedRoles.length,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      unknown: 0,
      imdbAutoApproved: 0,
      emergencyAutoApproved: 0,
      hasWebSearch: this.hasWebSearch,
      hasAI: this.hasOpenAI
    };
    
    verifiedRoles.forEach(role => {
      const confidence = role.verificationConfidence || 'UNKNOWN';
      const reason = role.verificationReason || '';
      
      if (reason.includes('IMDb-sourced')) {
        stats.imdbAutoApproved++;
      } else if (reason.includes('Emergency recovery')) {
        stats.emergencyAutoApproved++;
      }
      
      switch (confidence) {
        case 'HIGH': stats.highConfidence++; break;
        case 'MEDIUM': stats.mediumConfidence++; break;
        case 'LOW': stats.lowConfidence++; break;
        default: stats.unknown++; break;
      }
    });
    
    return stats;
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      hasWebSearch: this.hasWebSearch,
      hasAI: this.hasOpenAI,
      multiActorDatabase: this.definiteMultiActorRoles.length,
      primaryVerification: this.hasWebSearch ? 'Web Search' : this.hasOpenAI ? 'AI' : 'None',
      costPerVerification: this.hasWebSearch ? '$0.002' : '$0.0002',
      accuracy: this.hasWebSearch ? 'High' : 'Medium',
      emergencyRecoverySupport: true,
      imdbAutoApproval: true
    };
  }
}

module.exports = SimpleRoleVerifier;
