const OpenAI = require('openai');
const axios = require('axios');

/**
 * SIMPLE: Red Flag Emergency - Direct IMDb Page Approach
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
        description: `${fakeCharacterRejections.length} fake character names`
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
        description: `${noResultsRejections.length} non-existent titles`
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
        description: `Only ${Math.round(successRate)}% success rate`
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
   * SIMPLE: Find their IMDb page and extract filmography
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ Emergency search requires SerpAPI');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: Finding ${celebrityName} IMDb page...`);
      
      // Step 1: Find their IMDb page
      const imdbUrl = await this.findIMDbPage(celebrityName);
      
      if (!imdbUrl) {
        console.log(`❌ Could not find IMDb page for ${celebrityName}`);
        return [];
      }
      
      // Step 2: Get filmography from IMDb page
      const roles = await this.getFilmographyFromIMDb(celebrityName, imdbUrl);
      
      console.log(`✅ Emergency extracted ${roles.length} roles from IMDb`);
      return roles;

    } catch (error) {
      console.error(`❌ Emergency search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * SIMPLE: Find their IMDb page
   */
  async findIMDbPage(celebrityName) {
    const query = `"${celebrityName}" site:imdb.com`;
    
    try {
      console.log(`🔍 Finding IMDb page: ${query}`);
      const searchResult = await this.performWebSearch(query);
      
      if (searchResult.organic_results) {
        for (const result of searchResult.organic_results) {
          const url = result.link || '';
          
          // Look for their main IMDb page (not specific movies)
          if (url.includes('imdb.com/name/') || 
              (url.includes('imdb.com') && result.title && result.title.toLowerCase().includes(celebrityName.toLowerCase()))) {
            console.log(`✅ Found IMDb page: ${url}`);
            return url;
          }
        }
      }
      
      return null;
      
    } catch (error) {
      console.log(`❌ IMDb page search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * SIMPLE: Get filmography from IMDb page using search
   */
  async getFilmographyFromIMDb(celebrityName, imdbUrl) {
    try {
      // Search for filmography info about this person
      const query = `"${celebrityName}" filmography site:imdb.com`;
      
      console.log(`🔍 Getting filmography: ${query}`);
      const searchResult = await this.performWebSearch(query);
      
      const roles = [];
      
      if (searchResult.organic_results) {
        for (const result of searchResult.organic_results) {
          if (result.link && result.link.includes('imdb.com')) {
            const snippet = result.snippet || '';
            const title = result.title || '';
            
            // Extract roles from this result
            const extractedRoles = this.extractRolesFromText(snippet + ' ' + title, celebrityName);
            roles.push(...extractedRoles);
          }
        }
      }
      
      return this.removeDuplicateRoles(roles);
      
    } catch (error) {
      console.log(`❌ Filmography extraction failed: ${error.message}`);
      return [];
    }
  }

  /**
   * SIMPLE: Extract roles from text using basic patterns
   */
  extractRolesFromText(text, celebrityName) {
    const roles = [];
    const lines = text.split(/[.\n]/);
    
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      const celebrityLower = celebrityName.toLowerCase();
      
      // Look for lines that mention the celebrity
      if (lineLower.includes(celebrityLower)) {
        
        // Pattern 1: "Celebrity as Character in Movie (Year)"
        const pattern1 = new RegExp(`${this.escapeRegex(celebrityLower)}\\s+as\\s+([A-Z][a-zA-Z\\s'-]{1,30})\\s+in\\s+([A-Z][^\\(]+)\\s*\\(?(\\d{4})?`, 'i');
        const match1 = line.match(pattern1);
        
        if (match1) {
          const character = match1[1].trim();
          const movie = match1[2].trim();
          const year = match1[3] || 'unknown';
          
          if (this.isValidCharacterName(character, celebrityName) && this.isValidMovieTitle(movie)) {
            roles.push({
              character: character,
              title: movie,
              medium: 'live_action_movie',
              year: year,
              popularity: 'medium',
              source: 'imdb_emergency',
              confidence: 'high'
            });
            
            console.log(`✅ Found: ${character} in ${movie} (${year})`);
          }
        }
        
        // Pattern 2: "Movie (Year) ... Celebrity as Character"
        const pattern2 = new RegExp(`([A-Z][^\\(]+)\\s*\\((\\d{4})\\).*${this.escapeRegex(celebrityLower)}\\s+as\\s+([A-Z][a-zA-Z\\s'-]{1,30})`, 'i');
        const match2 = line.match(pattern2);
        
        if (match2) {
          const movie = match2[1].trim();
          const year = match2[2];
          const character = match2[3].trim();
          
          if (this.isValidCharacterName(character, celebrityName) && this.isValidMovieTitle(movie)) {
            roles.push({
              character: character,
              title: movie,
              medium: 'live_action_movie',
              year: year,
              popularity: 'medium',
              source: 'imdb_emergency',
              confidence: 'high'
            });
            
            console.log(`✅ Found: ${character} in ${movie} (${year})`);
          }
        }
        
        // Pattern 3: Basic "Celebrity as Character"
        const pattern3 = new RegExp(`${this.escapeRegex(celebrityLower)}\\s+as\\s+([A-Z][a-zA-Z\\s'-]{1,30})`, 'i');
        const match3 = line.match(pattern3);
        
        if (match3) {
          const character = match3[1].trim();
          
          // Try to find movie title in the same line
          const moviePattern = /([A-Z][^\\(]+)\\s*\\((\\d{4})\\)/;
          const movieMatch = line.match(moviePattern);
          
          if (movieMatch && this.isValidCharacterName(character, celebrityName) && this.isValidMovieTitle(movieMatch[1])) {
            roles.push({
              character: character,
              title: movieMatch[1].trim(),
              medium: 'live_action_movie',
              year: movieMatch[2],
              popularity: 'medium',
              source: 'imdb_emergency',
              confidence: 'high'
            });
            
            console.log(`✅ Found: ${character} in ${movieMatch[1]} (${movieMatch[2]})`);
          }
        }
      }
    }
    
    return roles;
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validate character name
   */
  isValidCharacterName(name, celebrityName) {
    if (!name || name.length < 2 || name.length > 50) return false;
    
    const nameLower = name.toLowerCase();
    const celebrityLower = (celebrityName || '').toLowerCase();
    
    // Don't allow the celebrity's name as the character name
    if (nameLower.includes(celebrityLower) || celebrityLower.includes(nameLower)) {
      return false;
    }
    
    // Block obvious junk
    const excludeWords = [
      'character', 'actor', 'actress', 'imdb', 'movie', 'film', 'show', 'series',
      'cast', 'starring', 'featuring', 'director', 'producer', 'writer', 'plays',
      'portrays', 'performance', 'role', 'unknown', 'various'
    ];
    
    return !excludeWords.some(word => nameLower.includes(word));
  }

  /**
   * Validate movie title
   */
  isValidMovieTitle(title) {
    if (!title || title.length < 2 || title.length > 100) return false;
    
    const excludeWords = ['imdb', 'biography', 'filmography', 'photos', 'news'];
    const titleLower = title.toLowerCase();
    
    return !excludeWords.some(word => titleLower.includes(word));
  }

  /**
   * Remove duplicate roles
   */
  removeDuplicateRoles(roles) {
    const seen = new Set();
    const unique = [];
    
    for (const role of roles) {
      const key = `${role.title.toLowerCase()}_${role.character.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(role);
      }
    }
    
    return unique;
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
   * Get system status
   */
  getSystemStatus() {
    return {
      hasWebSearch: this.hasWebSearch,
      hasOpenAI: this.hasOpenAI,
      emergencyMethod: this.hasWebSearch ? 'Simple IMDb Direct' : 'None',
      systemReady: this.hasWebSearch
    };
  }
}

module.exports = RedFlagRoleDetector;
