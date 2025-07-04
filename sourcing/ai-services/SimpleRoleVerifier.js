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
   * IMPROVED: Role verification with emergency recovery role support
   */
  async verifyRoles(celebrityName, discoveredRoles) {
    console.log(`🔍 Verifying ${discoveredRoles.length} roles for ${celebrityName}...`);
    
    if (this.hasWebSearch) {
      console.log(`🌐 Using web search verification (authoritative)`);
    } else if (this.hasOpenAI) {
      console.log(`🤖 Using AI verification (fallback)`);
    } else {
      console.log(`⚠️ No verification available, allowing all roles`);
    }
    
    const verifiedRoles = [];
    const rejectedRoles = [];
    let verificationCost = 0;
    
    for (const role of discoveredRoles) {
      // ENHANCED: Special handling for emergency recovery roles
      const isEmergencyRecovery = role.source === 'emergency_recovery';
      
      const verification = await this.verifyRoleWithConfidence(celebrityName, role, isEmergencyRecovery);
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
   * ENHANCED: Role verification with emergency recovery support
   */
  async verifyRoleWithConfidence(celebrityName, role, isEmergencyRecovery = false) {
    // ENHANCED: More lenient verification for emergency recovery roles
    if (isEmergencyRecovery) {
      console.log(`🚨 Emergency recovery role - using lenient verification`);
      return await this.verifyEmergencyRecoveryRole(celebrityName, role);
    }

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
        const prompt = this.buildImprovedVerificationPrompt(celebrityName, role);

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
   * ENHANCED: Verify emergency recovery roles with lenient approach
   */
  async verifyEmergencyRecoveryRole(celebrityName, role) {
    try {
      console.log(`🔍 Lenient verification: ${celebrityName} as ${role.character} in ${role.title}`);
      
      // For emergency recovery roles, use more lenient verification
      const lenientQueries = [
        `"${celebrityName}" "${role.title}"`,
        `"${role.title}" cast`,
        `"${role.title}" "${celebrityName}"`,
        `"${celebrityName}" actor "${role.title}"`
      ];

      for (const query of lenientQueries) {
        try {
          const searchResult = await this.performWebSearch(query);
          const verification = this.analyzeLenientSearchResults(searchResult, celebrityName, role);
          
          if (verification.confidence !== 'UNKNOWN') {
            console.log(`🌐 Lenient verification: ${verification.confidence} - ${verification.reason}`);
            return verification;
          }
        } catch (error) {
          console.log(`⚠️ Lenient search query failed: ${query}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // ENHANCED: For emergency recovery, be more permissive
      return {
        isValid: true,
        confidence: 'MEDIUM',
        reason: 'Emergency recovery role - allowing with medium confidence'
      };

    } catch (error) {
      console.log(`⚠️ Emergency recovery verification failed: ${error.message}`);
      return {
        isValid: true,
        confidence: 'LOW',
        reason: 'Emergency recovery role - allowing with low confidence'
      };
    }
  }

  /**
   * ENHANCED: Analyze search results with lenient approach
   */
  analyzeLenientSearchResults(searchData, celebrityName, role) {
    const results = searchData.organic_results || [];
    const snippets = results.map(r => (r.snippet || '').toLowerCase()).join(' ');
    const titles = results.map(r => (r.title || '').toLowerCase()).join(' ');
    const allText = `${snippets} ${titles}`.toLowerCase();

    const celebrityLower = celebrityName.toLowerCase();
    const titleLower = role.title.toLowerCase();
    const characterLower = role.character.toLowerCase();

    // ENHANCED: More flexible patterns for emergency recovery
    const positivePatterns = [
      new RegExp(`${celebrityLower}.*${titleLower}`, 'i'),
      new RegExp(`${titleLower}.*${celebrityLower}`, 'i'),
      new RegExp(`${celebrityLower}.*${characterLower}`, 'i'),
      new RegExp(`${characterLower}.*${celebrityLower}`, 'i'),
      new RegExp(`cast.*${celebrityLower}`, 'i'),
      new RegExp(`${celebrityLower}.*cast`, 'i'),
      new RegExp(`${celebrityLower}.*star`, 'i'),
      new RegExp(`${celebrityLower}.*appear`, 'i'),
      new RegExp(`${celebrityLower}.*role`, 'i'),
      new RegExp(`${celebrityLower}.*play`, 'i')
    ];

    const hasPositiveMatch = positivePatterns.some(pattern => pattern.test(allText));

    // Check for high-authority sources
    const hasIMDbSource = results.some(r => r.link && r.link.includes('imdb.com'));
    const hasWikipediaSource = results.some(r => r.link && r.link.includes('wikipedia.org'));
    const hasAuthorativeSource = hasIMDbSource || hasWikipediaSource;

    // ENHANCED: More lenient decision making for emergency recovery
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

    // ENHANCED: Check if celebrity and title exist together (even without character)
    const hasCelebrityAndTitle = allText.includes(celebrityLower) && allText.includes(titleLower);
    if (hasCelebrityAndTitle) {
      return {
        isValid: true,
        confidence: 'MEDIUM',
        reason: 'Celebrity and title found together'
      };
    }

    // ENHANCED: Check for clear contradictions
    const negativePatterns = [
      new RegExp(`${characterLower}.*played by.*(?!${celebrityLower})\\w+`, 'i'),
      new RegExp(`${characterLower}.*portrayed by.*(?!${celebrityLower})\\w+`, 'i'),
      new RegExp(`${characterLower}.*voiced by.*(?!${celebrityLower})\\w+`, 'i')
    ];

    const hasNegativeMatch = negativePatterns.some(pattern => pattern.test(allText));

    if (hasNegativeMatch && hasAuthorativeSource) {
      return {
        isValid: false,
        confidence: 'HIGH',
        reason: 'Contradicted by authoritative source'
      };
    }

    // No results is suspicious for regular roles, but acceptable for emergency recovery
    if (results.length === 0) {
      return {
        isValid: true,
        confidence: 'LOW',
        reason: 'No search results found - allowing emergency recovery role'
      };
    }

    // Default to unknown for inconclusive results
    return {
      isValid: true,
      confidence: 'UNKNOWN',
      reason: 'Inconclusive search results - allowing emergency recovery role'
    };
  }

  /**
   * ENHANCED: Web search verification with better character name matching
   */
  async verifyRoleWithWebSearch(celebrityName, role) {
    try {
      console.log(`🔍 Web verifying: ${celebrityName} as ${role.character} in ${role.title}`);
      
      // ENHANCED: More targeted search queries with character name variations
      const searchQueries = [
        // Primary: Direct IMDb searches
        `"${celebrityName}" "${role.title}" cast site:imdb.com`,
        `"${celebrityName}" "${role.character}" site:imdb.com`,
        
        // Secondary: Wikipedia for broader verification
        `"${celebrityName}" "${role.title}" site:wikipedia.org`,
        
        // Tertiary: Character name variations
        `"${celebrityName}" played "${role.character}" "${role.title}"`,
        `"${celebrityName}" as "${role.character}" "${role.title}"`,
        
        // Quaternary: General verification
        `"${celebrityName}" "${role.title}" character`,
        `"${role.character}" "${role.title}" cast`
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
        
        // Brief pause between queries
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
   * ENHANCED: Better analysis of search results with character name matching
   */
  analyzeSearchResults(searchData, celebrityName, role) {
    const results = searchData.organic_results || [];
    const snippets = results.map(r => (r.snippet || '').toLowerCase()).join(' ');
    const titles = results.map(r => (r.title || '').toLowerCase()).join(' ');
    const allText = `${snippets} ${titles}`.toLowerCase();

    const celebrityLower = celebrityName.toLowerCase();
    const characterLower = role.character.toLowerCase();
    const titleLower = role.title.toLowerCase();

    // ENHANCED: More flexible positive patterns with character name variations
    const positivePatterns = [
      new RegExp(`${celebrityLower}.*${characterLower}`, 'i'),
      new RegExp(`${characterLower}.*${celebrityLower}`, 'i'),
      new RegExp(`${celebrityLower}.*plays.*${characterLower}`, 'i'),
      new RegExp(`${celebrityLower}.*as.*${characterLower}`, 'i'),
      new RegExp(`${celebrityLower}.*portrayed.*${characterLower}`, 'i'),
      new RegExp(`cast.*${celebrityLower}.*${characterLower}`, 'i'),
      new RegExp(`${characterLower}.*played by.*${celebrityLower}`, 'i'),
      new RegExp(`${characterLower}.*voiced by.*${celebrityLower}`, 'i'),
      // ENHANCED: Partial character name matching
      new RegExp(`${celebrityLower}.*${this.getFirstName(characterLower)}`, 'i'),
      new RegExp(`${this.getFirstName(characterLower)}.*${celebrityLower}`, 'i'),
      // ENHANCED: Character in parentheses pattern
      new RegExp(`${characterLower}\\s*\\(${celebrityLower}\\)`, 'i'),
      new RegExp(`${celebrityLower}\\s*\\(${characterLower}\\)`, 'i')
    ];

    const hasPositiveMatch = positivePatterns.some(pattern => pattern.test(allText));

    // Check for high-authority sources
    const hasIMDbSource = results.some(r => r.link && r.link.includes('imdb.com'));
    const hasWikipediaSource = results.some(r => r.link && r.link.includes('wikipedia.org'));
    const hasAuthorativeSource = hasIMDbSource || hasWikipediaSource;

    // ENHANCED: More nuanced decision making
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

    // ENHANCED: Check for partial character name matches
    const firstNameMatch = this.checkPartialCharacterMatch(allText, celebrityLower, characterLower);
    if (firstNameMatch) {
      return {
        isValid: true,
        confidence: 'MEDIUM',
        reason: 'Partial character name match found'
      };
    }

    // Check for clear contradictions
    const negativePatterns = [
      new RegExp(`${characterLower}.*played by.*(?!${celebrityLower})\\w+`, 'i'),
      new RegExp(`${characterLower}.*portrayed by.*(?!${celebrityLower})\\w+`, 'i'),
      new RegExp(`${characterLower}.*voiced by.*(?!${celebrityLower})\\w+`, 'i')
    ];

    const hasNegativeMatch = negativePatterns.some(pattern => pattern.test(allText));

    if (hasNegativeMatch && hasAuthorativeSource) {
      return {
        isValid: false,
        confidence: 'HIGH',
        reason: 'Contradicted by authoritative source'
      };
    }

    // Check if celebrity and title exist but not character
    const hasCelebrityAndTitle = allText.includes(celebrityLower) && allText.includes(titleLower);
    if (hasCelebrityAndTitle && !allText.includes(characterLower)) {
      return {
        isValid: false,
        confidence: 'MEDIUM',
        reason: 'Celebrity in title but not this character'
      };
    }

    // No results is suspicious
    if (results.length === 0) {
      return {
        isValid: false,
        confidence: 'MEDIUM',
        reason: 'No search results found'
      };
    }

    // Default to unknown for inconclusive results
    return {
      isValid: true,
      confidence: 'UNKNOWN',
      reason: 'Inconclusive search results'
    };
  }

  /**
   * ENHANCED: Check for partial character name matches
   */
  checkPartialCharacterMatch(allText, celebrityLower, characterLower) {
    const characterFirstName = this.getFirstName(characterLower);
    const characterLastName = this.getLastName(characterLower);
    
    // Check if first name of character appears with celebrity
    if (characterFirstName && characterFirstName.length > 2) {
      const firstNamePattern = new RegExp(`${celebrityLower}.*${characterFirstName}`, 'i');
      if (firstNamePattern.test(allText)) {
        return true;
      }
    }
    
    // Check if last name of character appears with celebrity
    if (characterLastName && characterLastName.length > 2) {
      const lastNamePattern = new RegExp(`${celebrityLower}.*${characterLastName}`, 'i');
      if (lastNamePattern.test(allText)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * ENHANCED: Get first name from character name
   */
  getFirstName(characterName) {
    if (!characterName || typeof characterName !== 'string') return '';
    const parts = characterName.trim().split(/\s+/);
    return parts[0] || '';
  }

  /**
   * ENHANCED: Get last name from character name
   */
  getLastName(characterName) {
    if (!characterName || typeof characterName !== 'string') return '';
    const parts = characterName.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : '';
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
   * ENHANCED: Better verification prompt with character name flexibility
   */
  buildImprovedVerificationPrompt(celebrityName, role) {
    return `Verify if "${celebrityName}" played the character "${role.character}" in "${role.title}".

IMPORTANT GUIDELINES:
- Include ALL types of roles: main, supporting, cameo, guest, voice acting
- Character names may be nicknames, partial names, or slight variations
- Include early career and lesser-known work
- Allow for character name variations (e.g., "John Smith" vs "John")
- Only reject if you're confident it's completely wrong

CONFIDENCE LEVELS:
- HIGH: Definitely correct or definitely incorrect
- MEDIUM: Likely correct or likely incorrect
- LOW: Uncertain, limited information
- UNKNOWN: Cannot determine either way

RESPOND FORMAT: [CONFIDENCE]|[YES/NO]|[BRIEF_REASON]

Examples:
- "HIGH|YES|Well-known role from major film"
- "MEDIUM|NO|Character doesn't exist in that show"
- "LOW|YES|Possible but uncertain"
- "UNKNOWN|YES|Cannot verify but no contradiction found"

VERIFY: Did "${celebrityName}" play "${role.character}" in "${role.title}"?`;
  }

  /**
   * ENHANCED: Better parsing with more permissive approach
   */
  parseVerificationResponse(response) {
    const parts = response.split('|');
    
    if (parts.length >= 3) {
      const confidence = parts[0].trim().toUpperCase();
      const decision = parts[1].trim().toUpperCase();
      const reason = parts[2].trim();
      
      // ENHANCED: More permissive for emergency recovery and uncertain cases
      const isValid = decision.includes('YES') || 
                     (confidence === 'LOW' && !decision.includes('NO')) ||
                     (confidence === 'UNKNOWN' && !decision.includes('NO'));
      
      return {
        isValid,
        confidence,
        reason: reason || 'No reason provided'
      };
    }
    
    // ENHANCED: Fallback parsing
    const upperResponse = response.toUpperCase();
    
    // Only reject clear negatives with high confidence
    if (upperResponse.includes('NO') && 
        (upperResponse.includes('HIGH') || upperResponse.includes('MEDIUM'))) {
      return { 
        isValid: false, 
        confidence: 'MEDIUM', 
        reason: 'AI provided clear rejection' 
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
   * OPTIMIZED: Smart search strategy with multi-actor detection
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
   * STREAMLINED: Multi-actor detection using safety net only
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
   * OPTIMIZED: Batch verification with better error handling
   */
  async batchVerifyRoles(celebrityName, roles, batchSize = 5) {
    console.log(`🔍 Batch verifying ${roles.length} roles for ${celebrityName}...`);
    
    const verifiedRoles = [];
    let totalCost = 0;
    
    for (let i = 0; i < roles.length; i += batchSize) {
      const batch = roles.slice(i, i + batchSize);
      
      const batchPromises = batch.map(role => 
        this.verifyRoleWithConfidence(celebrityName, role)
      );
      
      const batchResults = await Promise.all(batchPromises);
      totalCost += batchResults.length * (this.hasWebSearch ? 0.002 : 0.0002);
      
      batchResults.forEach((verification, index) => {
        const role = batch[index];
        if (verification.isValid) {
          verifiedRoles.push({
            ...role,
            verificationConfidence: verification.confidence,
            verificationReason: verification.reason
          });
          console.log(`✅ ${verification.confidence}: ${role.character} in ${role.title}`);
        } else {
          console.log(`❌ ${verification.confidence}: ${role.character} in ${role.title} - ${verification.reason}`);
        }
      });
      
      // Brief pause between batches
      if (i + batchSize < roles.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`💰 Total verification cost: $${totalCost.toFixed(4)}`);
    console.log(`🎭 ${verifiedRoles.length}/${roles.length} roles verified`);
    
    return verifiedRoles;
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
      hasWebSearch: this.hasWebSearch,
      hasAI: this.hasOpenAI
    };
    
    verifiedRoles.forEach(role => {
      const confidence = role.verificationConfidence || 'UNKNOWN';
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
      emergencyRecoverySupport: true
    };
  }
}

module.exports = SimpleRoleVerifier;
