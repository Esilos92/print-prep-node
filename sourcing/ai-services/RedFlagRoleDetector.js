const OpenAI = require('openai');
const axios = require('axios');

/**
 * ENHANCED Red Flag Emergency System
 * AI-Focused approach for reliable character extraction from IMDb/Wikipedia
 */
class RedFlagRoleDetector {
  constructor() {
    this.serpApiKey = process.env.SERP_API_KEY;
    this.hasWebSearch = !!this.serpApiKey;
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
      }
    } catch (error) {
      console.log('⚠️ OpenAI not available for red flag system');
    }
  }

  /**
   * MAIN: Detect red flags in verification results
   */
  detectRedFlags(celebrityName, verifiedRoles, rejectedRoles) {
    console.log(`🔍 Red flag analysis: ${verifiedRoles.length} verified, ${rejectedRoles.length} rejected`);
    
    const redFlags = [];
    
    // Red Flag 1: Fake character names
    const fakeCharacterRejections = rejectedRoles.filter(r => {
      const reason = r.rejectionReason || r.verificationReason || '';
      return reason.includes('Celebrity in title but not this character');
    });
    
    if (fakeCharacterRejections.length >= 2) {
      redFlags.push({
        type: 'AI_HALLUCINATION',
        severity: 'HIGH',
        count: fakeCharacterRejections.length,
        description: `${fakeCharacterRejections.length} fake character names - AI is inventing roles`
      });
    }

    // Red Flag 2: Non-existent titles
    const noResultsRejections = rejectedRoles.filter(r => {
      const reason = r.rejectionReason || r.verificationReason || '';
      return reason.includes('No search results found');
    });
    
    if (noResultsRejections.length >= 2) {
      redFlags.push({
        type: 'FAKE_TITLES',
        severity: 'HIGH',
        count: noResultsRejections.length,
        description: `${noResultsRejections.length} non-existent titles - AI inventing shows/movies`
      });
    }

    // Red Flag 3: Low success rate
    const totalRoles = verifiedRoles.length + rejectedRoles.length;
    const successRate = totalRoles > 0 ? (verifiedRoles.length / totalRoles) * 100 : 0;
    
    if (successRate < 50 && totalRoles >= 3) {
      redFlags.push({
        type: 'LOW_SUCCESS_RATE',
        severity: 'HIGH',
        successRate: Math.round(successRate),
        description: `Only ${Math.round(successRate)}% success rate - AI struggling with this celebrity`
      });
    }

    console.log(`🔍 Red flags detected: ${redFlags.length}`);
    const triggerEmergency = redFlags.length >= 2 || redFlags.some(f => f.severity === 'HIGH');
    
    return {
      hasRedFlags: redFlags.length > 0,
      triggerEmergency,
      redFlags,
      celebrityName,
      analysis: {
        totalRoles,
        verifiedCount: verifiedRoles.length,
        rejectedCount: rejectedRoles.length,
        successRate: Math.round(successRate),
        fakeCharacterCount: fakeCharacterRejections.length,
        noResultsCount: noResultsRejections.length
      }
    };
  }

  /**
   * ENHANCED: AI-Driven Emergency filmography search
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasOpenAI) {
      console.log('⚠️ Emergency search requires OpenAI for character extraction');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: AI-driven filmography search for ${celebrityName}`);
      
      // Step 1: AI discovers real filmography
      const aiDiscoveredRoles = await this.aiDiscoverRealFilmography(celebrityName);
      
      // Step 2: Verify with web search if available
      let verifiedRoles = [];
      if (this.hasWebSearch && aiDiscoveredRoles.length > 0) {
        verifiedRoles = await this.webVerifyAIRoles(celebrityName, aiDiscoveredRoles);
      } else {
        verifiedRoles = aiDiscoveredRoles;
      }
      
      console.log(`✅ Emergency search recovered ${verifiedRoles.length} roles with character names`);
      return verifiedRoles;

    } catch (error) {
      console.error(`❌ Emergency filmography search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: AI discovers real filmography with character names
   */
  async aiDiscoverRealFilmography(celebrityName) {
    try {
      const prompt = `You are an entertainment expert with access to IMDb and Wikipedia data. For "${celebrityName}", provide their REAL acting roles with exact character names.

🚨 CRITICAL: Only include roles you are 100% certain about. Do not invent or guess.

DISCOVERY STRATEGY:
1. Search your training data for this actor's verified filmography
2. Include major roles, supporting roles, and notable appearances
3. Use exact character names from official sources
4. Include recent work and breakthrough roles

REQUIREMENTS:
- Use exact character names (not "Character" or "Unknown")
- Include exact show/movie titles
- Provide years when known
- Include all types of acting (movies, TV, voice work)

FORMAT: Return as JSON array
[
  {
    "character": "Exact Character Name",
    "title": "Exact Show/Movie Title",
    "medium": "live_action_movie|live_action_tv|voice_anime_tv|voice_anime_movie|voice_cartoon|voice_game",
    "year": "YYYY",
    "popularity": "high|medium|low",
    "source": "emergency_ai_discovery",
    "confidence": "high"
  }
]

🚨 VERIFICATION: Review each role before including. Only include roles you can verify from your training data.

Find real filmography for "${celebrityName}":`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert entertainment database with access to IMDb and Wikipedia information. Only provide roles you are absolutely certain about. Never invent or guess roles."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.05, // Very low for accuracy
        max_tokens: 1000
      });

      const response = completion.choices[0].message.content;
      const roles = this.parseAIResponse(response, celebrityName);
      
      console.log(`🤖 AI discovered ${roles.length} roles for ${celebrityName}`);
      return roles;

    } catch (error) {
      console.error(`❌ AI discovery failed: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: Web verify AI-discovered roles
   */
  async webVerifyAIRoles(celebrityName, aiRoles) {
    if (!this.hasWebSearch) return aiRoles;

    const verifiedRoles = [];
    
    for (const role of aiRoles) {
      try {
        console.log(`🔍 Web verifying: ${role.character} in ${role.title}`);
        
        // Quick verification search
        const verificationQueries = [
          `"${celebrityName}" "${role.title}" cast`,
          `"${celebrityName}" "${role.character}" "${role.title}"`,
          `"${role.title}" "${celebrityName}"`
        ];

        let verified = false;
        for (const query of verificationQueries) {
          try {
            const searchResult = await this.performWebSearch(query);
            if (this.quickVerifyFromResults(searchResult, celebrityName, role)) {
              verified = true;
              break;
            }
          } catch (error) {
            console.log(`⚠️ Verification query failed: ${query}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (verified) {
          verifiedRoles.push({
            ...role,
            verificationMethod: 'web_confirmed'
          });
          console.log(`✅ Verified: ${role.character} in ${role.title}`);
        } else {
          console.log(`❌ Could not verify: ${role.character} in ${role.title}`);
        }

      } catch (error) {
        console.log(`⚠️ Verification failed for ${role.title}: ${error.message}`);
      }
    }

    console.log(`📊 Web verification: ${verifiedRoles.length}/${aiRoles.length} roles confirmed`);
    return verifiedRoles.length > 0 ? verifiedRoles : aiRoles; // Return AI roles if web verification fails
  }

  /**
   * ENHANCED: Quick verification from search results
   */
  quickVerifyFromResults(searchResult, celebrityName, role) {
    if (!searchResult.organic_results || searchResult.organic_results.length === 0) {
      return false;
    }

    const results = searchResult.organic_results;
    const allText = results.map(r => `${r.title || ''} ${r.snippet || ''}`).join(' ').toLowerCase();
    
    const celebrityLower = celebrityName.toLowerCase();
    const titleLower = role.title.toLowerCase();
    
    // Look for celebrity and title together
    const hasCelebrityAndTitle = allText.includes(celebrityLower) && allText.includes(titleLower);
    
    // Look for authoritative sources
    const hasAuthoritativeSource = results.some(r => {
      const url = (r.link || '').toLowerCase();
      return url.includes('imdb.com') || url.includes('wikipedia.org');
    });

    return hasCelebrityAndTitle && hasAuthoritativeSource;
  }

  /**
   * ENHANCED: Parse AI response with better error handling
   */
  parseAIResponse(response, celebrityName) {
    try {
      // Try to parse as JSON
      let roles = this.parseJSONResponse(response);
      
      if (!roles || !Array.isArray(roles)) {
        console.log(`⚠️ AI response not valid JSON, trying fallback parsing`);
        roles = this.fallbackParseAIResponse(response, celebrityName);
      }
      
      if (!roles || !Array.isArray(roles)) {
        console.log(`❌ Could not parse AI response for ${celebrityName}`);
        return [];
      }

      // Clean and validate roles
      const cleanedRoles = roles
        .filter(role => role.character && role.title)
        .map(role => ({
          character: this.cleanCharacterName(role.character),
          title: this.cleanTitle(role.title),
          medium: role.medium || 'live_action_movie',
          year: role.year || 'unknown',
          popularity: role.popularity || 'medium',
          source: 'emergency_ai_discovery',
          confidence: role.confidence || 'medium',
          recoveryMethod: 'ai_filmography_search'
        }))
        .filter(role => this.isValidRole(role));

      console.log(`🧹 Cleaned ${cleanedRoles.length} valid roles from AI response`);
      return cleanedRoles;

    } catch (error) {
      console.error(`❌ Failed to parse AI response: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: Fallback parsing for non-JSON AI responses
   */
  fallbackParseAIResponse(response, celebrityName) {
    try {
      const roles = [];
      const lines = response.split('\n');
      
      for (const line of lines) {
        // Look for patterns like "Character in Title (Year)"
        const match = line.match(/([A-Z][a-zA-Z\s]+)\s+in\s+([A-Z][a-zA-Z\s:]+)(?:\s+\((\d{4})\))?/);
        if (match) {
          const character = match[1].trim();
          const title = match[2].trim();
          const year = match[3] || 'unknown';
          
          if (character.length > 1 && title.length > 1) {
            roles.push({
              character: character,
              title: title,
              medium: 'live_action_movie',
              year: year,
              popularity: 'medium',
              source: 'emergency_ai_discovery',
              confidence: 'medium'
            });
          }
        }
      }
      
      return roles;
      
    } catch (error) {
      console.error(`❌ Fallback parsing failed: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: Clean character name
   */
  cleanCharacterName(name) {
    if (!name || typeof name !== 'string') return 'Unknown';
    
    let cleaned = name.trim();
    
    // Remove common prefixes
    cleaned = cleaned.replace(/^(as|plays|played by|portrayed by|voiced by)\s+/i, '');
    
    // Remove quotes
    cleaned = cleaned.replace(/["""]/g, '');
    
    // Remove trailing punctuation
    cleaned = cleaned.replace(/[,.;:!?]+$/, '');
    
    // Capitalize properly
    cleaned = cleaned.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    return cleaned;
  }

  /**
   * ENHANCED: Clean title
   */
  cleanTitle(title) {
    if (!title || typeof title !== 'string') return 'Unknown';
    
    let cleaned = title.trim();
    
    // Remove quotes
    cleaned = cleaned.replace(/["""]/g, '');
    
    // Remove trailing punctuation
    cleaned = cleaned.replace(/[,.;:!?]+$/, '');
    
    // Clean up extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    return cleaned;
  }

  /**
   * ENHANCED: Validate role
   */
  isValidRole(role) {
    if (!role.character || !role.title) return false;
    
    // Character name validation
    const character = role.character.toLowerCase();
    if (character === 'unknown' || character === 'character' || character.length < 2) {
      return false;
    }
    
    // Title validation
    const title = role.title.toLowerCase();
    if (title === 'unknown' || title.length < 2) {
      return false;
    }
    
    // Avoid obvious AI hallucinations
    const suspiciousPatterns = [
      'example', 'sample', 'placeholder', 'test', 'demo'
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (character.includes(pattern) || title.includes(pattern)) {
        return false;
      }
    }
    
    return true;
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
   * Parse JSON response
   */
  parseJSONResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      try {
        // Extract JSON from markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          return JSON.parse(jsonMatch[1]);
        }
        
        // Extract array pattern
        const arrayMatch = response.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          return JSON.parse(arrayMatch[0]);
        }
        
        return null;
      } catch (parseError) {
        console.log(`JSON parsing failed: ${response.substring(0, 200)}...`);
        return null;
      }
    }
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      hasWebSearch: this.hasWebSearch,
      hasOpenAI: this.hasOpenAI,
      emergencyRecoveryMethod: this.hasOpenAI ? 'AI-Driven Discovery' : 'None',
      characterExtractionMethod: this.hasOpenAI ? 'AI-Powered' : 'None',
      webVerificationEnabled: this.hasWebSearch,
      systemReady: this.hasOpenAI || this.hasWebSearch
    };
  }
}

module.exports = RedFlagRoleDetector;
