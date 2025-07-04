const OpenAI = require('openai');
const axios = require('axios');

/**
 * FIXED: Red Flag Emergency System with Precise IMDb Character Extraction
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
   * EMERGENCY: Search IMDb directly and extract character names precisely
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ Emergency search requires SerpAPI');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: Searching IMDb for ${celebrityName} with precise character extraction`);
      
      // FIXED: Multiple targeted IMDb searches
      const imdbRoles = await this.searchIMDbWithCharacterExtraction(celebrityName);
      
      console.log(`✅ Emergency found ${imdbRoles.length} roles with character names`);
      return imdbRoles;

    } catch (error) {
      console.error(`❌ Emergency search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * FIXED: Search IMDb with precise character name extraction
   */
  async searchIMDbWithCharacterExtraction(celebrityName) {
    const imdbRoles = [];
    
    // FIXED: Target IMDb cast pages and filmography directly
    const searchQueries = [
      `"${celebrityName}" site:imdb.com filmography`,
      `"${celebrityName}" site:imdb.com cast`,
      `"${celebrityName}" site:imdb.com actor`,
      `"${celebrityName}" site:imdb.com actress`
    ];
    
    for (const query of searchQueries) {
      try {
        console.log(`🔍 Emergency search: ${query}`);
        const searchResult = await this.performWebSearch(query);
        
        if (searchResult.organic_results) {
          for (const result of searchResult.organic_results) {
            if (result.link && result.link.includes('imdb.com')) {
              const roles = await this.extractRolesFromIMDbResult(result, celebrityName);
              imdbRoles.push(...roles);
            }
          }
        }
        
        // Brief pause between searches
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`⚠️ Emergency search failed for: ${query}`);
      }
    }
    
    // Remove duplicates and return
    return this.removeDuplicateRoles(imdbRoles);
  }

  /**
   * FIXED: Extract roles from IMDb search results with precise character extraction
   */
  async extractRolesFromIMDbResult(result, celebrityName) {
    const roles = [];
    const url = result.link || '';
    const title = result.title || '';
    const snippet = result.snippet || '';
    
    console.log(`🔍 Processing IMDb result: ${title}`);
    console.log(`📄 Snippet: ${snippet.substring(0, 200)}...`);
    
    // FIXED: Extract movie titles from IMDb page titles
    const movieTitles = this.extractMovieTitlesFromIMDbTitle(title);
    
    for (const movieTitle of movieTitles) {
      console.log(`🎬 Found movie: ${movieTitle.title} (${movieTitle.year})`);
      
      // FIXED: Search for character name in this specific movie
      const character = await this.findCharacterForMovie(celebrityName, movieTitle.title, snippet);
      
      if (character) {
        roles.push({
          character: character,
          title: movieTitle.title,
          medium: this.guessMediumFromTitle(movieTitle.title),
          year: movieTitle.year,
          popularity: 'medium',
          source: 'imdb_emergency',
          confidence: 'high',
          imdbUrl: url
        });
        
        console.log(`✅ EMERGENCY EXTRACTED: ${character} in ${movieTitle.title} (${movieTitle.year})`);
      } else {
        console.log(`❌ No character found for ${movieTitle.title}`);
      }
    }
    
    return roles;
  }

  /**
   * FIXED: Extract movie titles from IMDb page titles
   */
  extractMovieTitlesFromIMDbTitle(title) {
    const movies = [];
    
    // Pattern 1: Standard IMDb format "Movie Title (Year)"
    const standardPattern = /^(.+?)\s*\((\d{4})\)/;
    const standardMatch = title.match(standardPattern);
    
    if (standardMatch) {
      const movieTitle = standardMatch[1].trim();
      const year = standardMatch[2];
      
      if (this.isValidMovieTitle(movieTitle)) {
        movies.push({ title: movieTitle, year: year });
      }
    }
    
    // Pattern 2: Filmography pages - extract from title
    if (title.toLowerCase().includes('filmography')) {
      // Look for movie titles in snippet later
      movies.push({ title: 'FILMOGRAPHY_PAGE', year: 'unknown' });
    }
    
    return movies;
  }

  /**
   * FIXED: Find character name for specific movie
   */
  async findCharacterForMovie(celebrityName, movieTitle, snippet) {
    if (movieTitle === 'FILMOGRAPHY_PAGE') {
      // Extract from filmography snippet
      return this.extractCharacterFromFilmographySnippet(snippet, celebrityName);
    }
    
    // FIXED: Precise character extraction patterns
    const character = this.extractCharacterFromSnippet(snippet, celebrityName, movieTitle);
    
    if (character) {
      return character;
    }
    
    // FIXED: If no character found, do a specific search for this movie
    return await this.searchSpecificMovieForCharacter(celebrityName, movieTitle);
  }

  /**
   * FIXED: Extract character from IMDb snippet with precise patterns
   */
  extractCharacterFromSnippet(snippet, celebrityName, movieTitle = '') {
    const snippetLower = snippet.toLowerCase();
    const celebrityLower = celebrityName.toLowerCase();
    
    console.log(`🔍 Extracting character from snippet for ${celebrityName}`);
    
    // FIXED Pattern 1: "Celebrity as Character" - EXACT extraction
    const asPatterns = [
      new RegExp(`${this.escapeRegex(celebrityLower)}\\s+as\\s+([A-Z][a-zA-Z\\s'-]{1,30})`, 'i'),
      new RegExp(`${this.escapeRegex(celebrityLower)}\\s+as\\s+([A-Z][a-zA-Z\\s'-]{1,30})\\s*[,\\.]`, 'i')
    ];
    
    for (const pattern of asPatterns) {
      const match = snippet.match(pattern);
      if (match) {
        const character = match[1].trim();
        if (this.isValidCharacterName(character, celebrityName)) {
          console.log(`✅ Found via "as" pattern: ${character}`);
          return character;
        }
      }
    }
    
    // FIXED Pattern 2: "Celebrity plays Character"
    const playsPatterns = [
      new RegExp(`${this.escapeRegex(celebrityLower)}\\s+plays\\s+([A-Z][a-zA-Z\\s'-]{1,30})`, 'i'),
      new RegExp(`${this.escapeRegex(celebrityLower)}\\s+plays\\s+([A-Z][a-zA-Z\\s'-]{1,30})\\s*[,\\.]`, 'i')
    ];
    
    for (const pattern of playsPatterns) {
      const match = snippet.match(pattern);
      if (match) {
        const character = match[1].trim();
        if (this.isValidCharacterName(character, celebrityName)) {
          console.log(`✅ Found via "plays" pattern: ${character}`);
          return character;
        }
      }
    }
    
    // FIXED Pattern 3: "Character (Celebrity)" or "Character - Celebrity"
    const castPatterns = [
      new RegExp(`([A-Z][a-zA-Z\\s'-]{1,30})\\s*\\(${this.escapeRegex(celebrityLower)}\\)`, 'i'),
      new RegExp(`([A-Z][a-zA-Z\\s'-]{1,30})\\s*-\\s*${this.escapeRegex(celebrityLower)}`, 'i'),
      new RegExp(`([A-Z][a-zA-Z\\s'-]{1,30})\\s*\\.\\.\\s*${this.escapeRegex(celebrityLower)}`, 'i')
    ];
    
    for (const pattern of castPatterns) {
      const match = snippet.match(pattern);
      if (match) {
        const character = match[1].trim();
        if (this.isValidCharacterName(character, celebrityName)) {
          console.log(`✅ Found via cast pattern: ${character}`);
          return character;
        }
      }
    }
    
    console.log(`❌ No character found in snippet`);
    return null;
  }

  /**
   * FIXED: Extract character from filmography snippet
   */
  extractCharacterFromFilmographySnippet(snippet, celebrityName) {
    const lines = snippet.split(/[.\n]/);
    const celebrityLower = celebrityName.toLowerCase();
    
    for (const line of lines) {
      if (line.toLowerCase().includes(celebrityLower)) {
        const character = this.extractCharacterFromSnippet(line, celebrityName);
        if (character) {
          return character;
        }
      }
    }
    
    return null;
  }

  /**
   * FIXED: Search for specific movie to find character
   */
  async searchSpecificMovieForCharacter(celebrityName, movieTitle) {
    try {
      const query = `"${celebrityName}" "${movieTitle}" character site:imdb.com`;
      console.log(`🔍 Specific character search: ${query}`);
      
      const searchResult = await this.performWebSearch(query);
      
      if (searchResult.organic_results) {
        for (const result of searchResult.organic_results) {
          if (result.link && result.link.includes('imdb.com')) {
            const character = this.extractCharacterFromSnippet(result.snippet || '', celebrityName, movieTitle);
            if (character) {
              console.log(`✅ Found via specific search: ${character}`);
              return character;
            }
          }
        }
      }
      
      return null;
      
    } catch (error) {
      console.log(`❌ Specific character search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * FIXED: Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * FIXED: Strict character name validation
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
      'portrays', 'performance', 'role', 'unknown', 'various', 'and', 'the', 'of', 'in'
    ];
    
    return !excludeWords.some(word => nameLower.includes(word));
  }

  /**
   * Check if it's a valid movie title
   */
  isValidMovieTitle(title) {
    if (!title || title.length < 2 || title.length > 100) return false;
    
    const excludeWords = ['imdb', 'biography', 'filmography', 'photos', 'news'];
    const titleLower = title.toLowerCase();
    
    return !excludeWords.some(word => titleLower.includes(word));
  }

  /**
   * Guess medium from title
   */
  guessMediumFromTitle(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('tv') || titleLower.includes('series')) {
      return 'live_action_tv';
    }
    
    return 'live_action_movie';
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
      emergencyMethod: this.hasWebSearch ? 'Precise IMDb Character Extraction' : 'None',
      systemReady: this.hasWebSearch
    };
  }
}

module.exports = RedFlagRoleDetector;
