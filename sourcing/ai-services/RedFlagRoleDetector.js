const OpenAI = require('openai');
const axios = require('axios');

/**
 * SIMPLE: Red Flag Emergency - TMDb API (Because We Had It All Along)
 */
class RedFlagRoleDetector {
  constructor() {
    this.serpApiKey = process.env.SERP_API_KEY;
    this.hasWebSearch = !!this.serpApiKey;
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // TMDb API setup
    this.tmdbApiKey = process.env.TMDB_API_KEY;
    this.hasTMDb = !!this.tmdbApiKey;
    this.tmdbBaseUrl = 'https://api.themoviedb.org/3';
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
   * SIMPLE: TMDb API Emergency Recovery (Finally!)
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasTMDb) {
      console.log('⚠️ TMDb API not available, falling back to web search');
      return this.fallbackWebSearch(celebrityName);
    }

    try {
      console.log(`🚨 EMERGENCY: Using TMDb API for ${celebrityName}...`);
      
      // Step 1: Find the person on TMDb
      const personId = await this.findPersonOnTMDb(celebrityName);
      
      if (!personId) {
        console.log(`❌ Could not find ${celebrityName} on TMDb`);
        return this.fallbackWebSearch(celebrityName);
      }
      
      // Step 2: Get their filmography with character names
      const roles = await this.getFilmographyFromTMDb(personId, celebrityName);
      
      console.log(`✅ TMDb API found ${roles.length} roles with character names`);
      return roles;

    } catch (error) {
      console.error(`❌ TMDb API emergency failed: ${error.message}`);
      return this.fallbackWebSearch(celebrityName);
    }
  }

  /**
   * SIMPLE: Find person on TMDb
   */
  async findPersonOnTMDb(celebrityName) {
    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/search/person`, {
        params: {
          api_key: this.tmdbApiKey,
          query: celebrityName
        }
      });

      const results = response.data.results || [];
      
      if (results.length === 0) {
        console.log(`❌ No TMDb results for ${celebrityName}`);
        return null;
      }

      // Find the best match
      const bestMatch = results.find(person => 
        person.name.toLowerCase() === celebrityName.toLowerCase()
      ) || results[0];

      console.log(`✅ Found on TMDb: ${bestMatch.name} (ID: ${bestMatch.id})`);
      return bestMatch.id;

    } catch (error) {
      console.log(`❌ TMDb person search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * SIMPLE: Get filmography from TMDb with character names
   */
  async getFilmographyFromTMDb(personId, celebrityName) {
    try {
      // Get movie credits
      const movieResponse = await axios.get(`${this.tmdbBaseUrl}/person/${personId}/movie_credits`, {
        params: {
          api_key: this.tmdbApiKey
        }
      });

      // Get TV credits
      const tvResponse = await axios.get(`${this.tmdbBaseUrl}/person/${personId}/tv_credits`, {
        params: {
          api_key: this.tmdbApiKey
        }
      });

      const roles = [];

      // Process movie credits
      const movieCredits = movieResponse.data.cast || [];
      for (const movie of movieCredits) {
        if (movie.character && movie.title && movie.release_date) {
          roles.push({
            character: movie.character,
            title: movie.title,
            medium: 'live_action_movie',
            year: movie.release_date.split('-')[0],
            popularity: movie.popularity > 10 ? 'high' : movie.popularity > 5 ? 'medium' : 'low',
            source: 'tmdb_emergency',
            confidence: 'high',
            tmdbId: movie.id
          });
          
          console.log(`🎬 Movie: ${movie.character} in ${movie.title} (${movie.release_date.split('-')[0]})`);
        }
      }

      // Process TV credits
      const tvCredits = tvResponse.data.cast || [];
      for (const show of tvCredits) {
        if (show.character && show.name && show.first_air_date) {
          roles.push({
            character: show.character,
            title: show.name,
            medium: 'live_action_tv',
            year: show.first_air_date.split('-')[0],
            popularity: show.popularity > 10 ? 'high' : show.popularity > 5 ? 'medium' : 'low',
            source: 'tmdb_emergency',
            confidence: 'high',
            tmdbId: show.id
          });
          
          console.log(`📺 TV: ${show.character} in ${show.name} (${show.first_air_date.split('-')[0]})`);
        }
      }

      // Sort by popularity and return top results
      return roles
        .sort((a, b) => {
          const popularityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          return popularityOrder[b.popularity] - popularityOrder[a.popularity];
        })
        .slice(0, 8);

    } catch (error) {
      console.log(`❌ TMDb filmography extraction failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Fallback to web search if TMDb fails
   */
  async fallbackWebSearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ No fallback available');
      return [];
    }

    console.log(`🔄 Falling back to web search for ${celebrityName}`);
    
    try {
      const query = `"${celebrityName}" site:imdb.com`;
      const searchResult = await this.performWebSearch(query);
      
      const roles = [];
      
      if (searchResult.organic_results) {
        for (const result of searchResult.organic_results) {
          if (result.link && result.link.includes('imdb.com')) {
            const snippet = result.snippet || '';
            const title = result.title || '';
            
            // Basic extraction from IMDb results
            const extractedRoles = this.extractBasicRoles(snippet + ' ' + title, celebrityName);
            roles.push(...extractedRoles);
          }
        }
      }
      
      return this.removeDuplicateRoles(roles);
      
    } catch (error) {
      console.log(`❌ Fallback web search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Basic role extraction from text (fallback only)
   */
  extractBasicRoles(text, celebrityName) {
    const roles = [];
    const celebrityLower = celebrityName.toLowerCase();
    
    // Very basic pattern: "Celebrity as Character in Movie (Year)"
    const pattern = new RegExp(`${this.escapeRegex(celebrityLower)}\\s+as\\s+([A-Z][a-zA-Z\\s'-]{1,30})\\s+in\\s+([A-Z][^\\(]+)\\s*\\(?(\\d{4})?`, 'gi');
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const character = match[1].trim();
      const movie = match[2].trim();
      const year = match[3] || 'unknown';
      
      if (this.isValidCharacterName(character, celebrityName) && this.isValidMovieTitle(movie)) {
        roles.push({
          character: character,
          title: movie,
          medium: 'live_action_movie',
          year: year,
          popularity: 'medium',
          source: 'web_fallback',
          confidence: 'medium'
        });
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
      'character', 'actor', 'actress', 'unknown', 'various', 'self'
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
      hasTMDb: this.hasTMDb,
      emergencyMethod: this.hasTMDb ? 'TMDb API (Clean Data)' : this.hasWebSearch ? 'Web Search Fallback' : 'None',
      systemReady: this.hasTMDb || this.hasWebSearch
    };
  }
}

module.exports = RedFlagRoleDetector;
