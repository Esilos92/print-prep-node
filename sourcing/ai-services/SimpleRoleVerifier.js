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
    
    // Multi-actor roles only
    this.definiteMultiActorRoles = [
      { char: ['batman', 'bruce wayne'], shows: ['batman'], reason: '8+ actors' },
      { char: ['superman', 'clark kent'], shows: ['superman'], reason: '6+ actors' },
      { char: ['spider-man', 'spiderman', 'peter parker'], shows: ['spider'], reason: '3+ actors' },
      { char: ['joker'], shows: ['batman', 'joker'], reason: '10+ actors' },
      { char: ['doctor', 'the doctor'], shows: ['doctor who'], reason: '15+ actors' },
      { char: ['james bond', 'bond', '007'], shows: ['bond', '007', 'james bond'], reason: '6+ actors' },
      { char: ['sherlock holmes', 'sherlock'], shows: ['sherlock'], reason: '20+ actors' }
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
   * SIMPLIFIED: Role verification - trust emergency roles, be lenient with regular roles
   */
  async verifyRoles(celebrityName, discoveredRoles) {
    console.log(`🔍 Verifying ${discoveredRoles.length} roles for ${celebrityName}...`);
    
    const verifiedRoles = [];
    const rejectedRoles = [];
    
    for (const role of discoveredRoles) {
      // Auto-approve emergency roles
      if (this.isEmergencyRole(role)) {
        verifiedRoles.push({
          ...role,
          verificationConfidence: 'HIGH',
          verificationReason: 'Emergency recovery role - auto-approved'
        });
        console.log(`✅ EMERGENCY: ${role.character} in ${role.title}`);
      } else {
        // SIMPLIFIED verification for regular roles
        const verification = await this.verifyRoleSimple(celebrityName, role);
        
        if (verification.isValid) {
          verifiedRoles.push({
            ...role,
            verificationConfidence: verification.confidence,
            verificationReason: verification.reason
          });
          console.log(`✅ ${verification.confidence}: ${role.character} in ${role.title}`);
        } else {
          rejectedRoles.push({
            ...role,
            rejectionReason: verification.reason,
            confidence: verification.confidence
          });
          console.log(`❌ ${verification.confidence}: ${role.character} in ${role.title} - ${verification.reason}`);
        }
      }
    }
    
    console.log(`🎭 ${verifiedRoles.length}/${discoveredRoles.length} roles verified`);
    return verifiedRoles;
  }

  /**
   * Check if role is from emergency recovery
   */
  isEmergencyRole(role) {
    return role.source === 'imdb_emergency' || 
           role.source === 'emergency_web_recovery';
  }

  /**
   * SIMPLIFIED: Basic role verification - be lenient
   */
  async verifyRoleSimple(celebrityName, role) {
    // Try web search first
    if (this.hasWebSearch) {
      try {
        const webResult = await this.verifyRoleWithWebSearch(celebrityName, role);
        if (webResult.confidence !== 'UNKNOWN') {
          return webResult;
        }
      } catch (error) {
        console.log(`⚠️ Web search failed: ${error.message}`);
      }
    }

    // Fallback to AI verification
    if (this.hasOpenAI) {
      try {
        // SIMPLIFIED prompt
        const prompt = `Did "${celebrityName}" play "${role.character}" in "${role.title}"?

Be lenient - include main roles, supporting roles, cameos, voice acting, any appearance.
Only say NO if you're absolutely certain it's wrong.

Answer: HIGH|YES|reason OR MEDIUM|NO|reason`;

        const completion = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 100
        });

        const response = completion.choices[0].message.content.trim();
        return this.parseVerificationResponse(response);
        
      } catch (error) {
        console.log(`⚠️ AI verification failed: ${error.message}`);
      }
    }

    // Default to allowing role
    return { 
      isValid: true, 
      confidence: 'UNKNOWN', 
      reason: 'No verification available, allowing role' 
    };
  }

  /**
   * SIMPLIFIED: Web search verification
   */
  async verifyRoleWithWebSearch(celebrityName, role) {
    try {
      console.log(`🔍 Web verifying: ${celebrityName} as ${role.character} in ${role.title}`);
      
      const searchQueries = [
        `"${celebrityName}" "${role.title}" cast site:imdb.com`,
        `"${celebrityName}" "${role.character}" site:imdb.com`,
        `"${celebrityName}" played "${role.character}" "${role.title}"`
      ];

      for (const query of searchQueries) {
        try {
          const searchResult = await this.performWebSearch(query);
          const verification = this.analyzeSearchResults(searchResult, celebrityName, role);
          
          if (verification.confidence !== 'UNKNOWN') {
            return verification;
          }
        } catch (error) {
          console.log(`⚠️ Search query failed: ${query}`);
        }
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
   * SIMPLIFIED: Analyze search results - be lenient
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
      new RegExp(`${celebrityLower}.*plays.*${characterLower}`, 'i'),
      new RegExp(`${celebrityLower}.*as.*${characterLower}`, 'i')
    ];

    const hasPositiveMatch = positivePatterns.some(pattern => pattern.test(allText));
    const hasIMDbSource = results.some(r => r.link && r.link.includes('imdb.com'));

    if (hasPositiveMatch && hasIMDbSource) {
      return {
        isValid: true,
        confidence: 'HIGH',
        reason: 'Confirmed by IMDb'
      };
    }

    if (hasPositiveMatch) {
      return {
        isValid: true,
        confidence: 'MEDIUM',
        reason: 'Confirmed by web search'
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

    // No results
    if (results.length === 0) {
      return {
        isValid: false,
        confidence: 'MEDIUM',
        reason: 'No search results found'
      };
    }

    // Default to unknown
    return {
      isValid: true,
      confidence: 'UNKNOWN',
      reason: 'Inconclusive search results'
    };
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
      
      const isValid = decision.includes('YES');
      
      return {
        isValid,
        confidence,
        reason: reason || 'No reason provided'
      };
    }
    
    // Fallback parsing
    const upperResponse = response.toUpperCase();
    
    if (upperResponse.includes('NO') && upperResponse.includes('HIGH')) {
      return { 
        isValid: false, 
        confidence: 'HIGH', 
        reason: 'AI provided clear rejection' 
      };
    }
    
    // Default to allowing
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
      num: 10
    };

    const response = await axios.get('https://serpapi.com/search', { 
      params,
      timeout: 10000
    });

    return response.data;
  }

  /**
   * Get search strategy
   */
  async getSearchStrategy(celebrityName, role) {
    const character = (role.character || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    
    // Check if multi-actor character
    const isMultiActor = this.isMultiActorCharacter(character, title);
    
    if (isMultiActor) {
      return {
        searchTerms: [
          `"${celebrityName}" "${role.title}"`,
          `"${celebrityName}" "${role.character}"`,
          `"${celebrityName}" as "${role.character}"`
        ],
        maxImages: 15,
        reason: `Multi-actor character - search for ${celebrityName}'s version`
      };
    }
    
    // Standard approach
    return {
      searchTerms: [
        `"${role.character}" "${role.title}"`,
        `"${celebrityName}" "${role.character}"`,
        `"${celebrityName}" "${role.title}"`
      ],
      maxImages: 20,
      reason: 'Standard search'
    };
  }

  /**
   * Multi-actor detection
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
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      hasWebSearch: this.hasWebSearch,
      hasAI: this.hasOpenAI,
      primaryVerification: this.hasWebSearch ? 'Web Search' : this.hasOpenAI ? 'AI' : 'None',
      verificationMode: 'Lenient - trust AI, strict only for obvious fakes'
    };
  }
}

module.exports = SimpleRoleVerifier;
