const OpenAI = require('openai');
const axios = require('axios');

/**
 * SIMPLE Red Flag Emergency System - FIXED CHARACTER EXTRACTION
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
   * SIMPLE: Emergency = Search IMDb directly, only return what's actually there
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ Emergency search requires SerpAPI');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: Searching IMDb directly for ${celebrityName}`);
      
      // Step 1: Search IMDb for this celebrity
      const imdbRoles = await this.searchIMDbDirectly(celebrityName);
      
      console.log(`✅ Found ${imdbRoles.length} roles on IMDb`);
      return imdbRoles;

    } catch (error) {
      console.error(`❌ Emergency IMDb search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * SIMPLE: Search IMDb directly for celebrity
   */
  async searchIMDbDirectly(celebrityName) {
    const imdbQuery = `"${celebrityName}" site:imdb.com`;
    
    try {
      console.log(`🔍 IMDb search: ${imdbQuery}`);
      const searchResult = await this.performWebSearch(imdbQuery);
      
      if (!searchResult.organic_results || searchResult.organic_results.length === 0) {
        console.log(`❌ No IMDb results found for ${celebrityName}`);
        return [];
      }

      const imdbRoles = [];
      
      for (const result of searchResult.organic_results) {
        const url = result.link || '';
        const title = result.title || '';
        const snippet = result.snippet || '';
        
        // Only process IMDb URLs
        if (!url.includes('imdb.com')) continue;
        
        // Extract roles from IMDb results
        const roles = this.extractRolesFromIMDbResult(title, snippet, url, celebrityName);
        imdbRoles.push(...roles);
      }

      // Remove duplicates
      const uniqueRoles = this.removeDuplicateRoles(imdbRoles);
      
      console.log(`📊 Extracted ${uniqueRoles.length} unique roles from IMDb`);
      return uniqueRoles;

    } catch (error) {
      console.error(`❌ IMDb search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * SIMPLE: Extract roles from IMDb search results
   */
  extractRolesFromIMDbResult(title, snippet, url, celebrityName) {
    const roles = [];
    
    // Pattern 1: Movie/TV show titles in IMDb format
    const titleMatch = title.match(/^(.+?)\s*\((\d{4})\)/);
    if (titleMatch) {
      const movieTitle = titleMatch[1].trim();
      const year = titleMatch[2];
      
      if (this.isValidMovieTitle(movieTitle)) {
        // FIXED: Try to get character name from snippet
        const character = this.extractCharacterFromSnippet(snippet, celebrityName);
        
        roles.push({
          character: character || 'Character',
          title: movieTitle,
          medium: this.guessMediumFromTitle(movieTitle),
          year: year,
          popularity: 'medium',
          source: 'imdb_emergency',
          confidence: 'high',
          imdbUrl: url
        });
        
        console.log(`✅ IMDb: ${character || 'Character'} in ${movieTitle} (${year})`);
      }
    }
    
    return roles;
  }

  /**
   * FIXED: Extract character name from IMDb snippet - PRECISE PATTERNS ONLY
   */
  extractCharacterFromSnippet(snippet, celebrityName) {
    const snippetLower = snippet.toLowerCase();
    const celebrityLower = celebrityName.toLowerCase();
    
    // FIXED Pattern 1: "Celebrity as Character"
    const asPattern = new RegExp(`${this.escapeRegex(celebrityLower)}\\s+as\\s+([A-Z][a-zA-Z\\s]{2,25})`, 'i');
    const asMatch = snippet.match(asPattern);
    if (asMatch) {
      const character = asMatch[1].trim();
      if (this.isValidCharacterName(character)) {
        console.log(`✅ Found character via "as": ${character}`);
        return character;
      }
    }
    
    // FIXED Pattern 2: "Celebrity plays Character"
    const playsPattern = new RegExp(`${this.escapeRegex(celebrityLower)}\\s+plays\\s+([A-Z][a-zA-Z\\s]{2,25})`, 'i');
    const playsMatch = snippet.match(playsPattern);
    if (playsMatch) {
      const character = playsMatch[1].trim();
      if (this.isValidCharacterName(character)) {
        console.log(`✅ Found character via "plays": ${character}`);
        return character;
      }
    }
    
    // FIXED Pattern 3: Cast format "Character ... Celebrity"
    const castPattern = new RegExp(`([A-Z][a-zA-Z\\s]{2,25})\\s*[\\.\\.\\-]+\\s*${this.escapeRegex(celebrityLower)}`, 'i');
    const castMatch = snippet.match(castPattern);
    if (castMatch) {
      const character = castMatch[1].trim();
      if (this.isValidCharacterName(character)) {
        console.log(`✅ Found character via cast: ${character}`);
        return character;
      }
    }
    
    console.log(`❌ No character found for ${celebrityName}`);
    return null;
  }

  /**
   * FIXED: Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * FIXED: Stricter character name validation
   */
  isValidCharacterName(name) {
    if (!name || name.length < 2 || name.length > 50) return false;
    
    const nameLower = name.toLowerCase();
    
    // FIXED: Block obvious junk
    const excludeWords = [
      'actor', 'actress', 'character', 'imdb', 'movie', 'film', 'show', 'series',
      'cast', 'starring', 'featuring', 'director', 'producer', 'writer'
    ];
    
    return !excludeWords.some(word => nameLower.includes(word));
  }

  /**
   * SIMPLE: Check if it's a valid movie title
   */
  isValidMovieTitle(title) {
    if (!title || title.length < 2 || title.length > 100) return false;
    
    const excludeWords = ['imdb', 'biography', 'filmography', 'photos', 'news'];
    const titleLower = title.toLowerCase();
    
    return !excludeWords.some(word => titleLower.includes(word));
  }

  /**
   * SIMPLE: Guess medium from title
   */
  guessMediumFromTitle(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('tv') || titleLower.includes('series')) {
      return 'live_action_tv';
    }
    
    return 'live_action_movie';
  }

  /**
   * SIMPLE: Remove duplicate roles
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
      num: 20
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
      emergencyMethod: this.hasWebSearch ? 'Direct IMDb Search' : 'None',
      systemReady: this.hasWebSearch
    };
  }
}

module.exports = RedFlagRoleDetector;
