const OpenAI = require('openai');
const axios = require('axios');

/**
 * SIMPLE Red Flag Emergency System
 * Detects AI hallucination and triggers emergency web search
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
   * EMERGENCY: Simple web search for actual filmography
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ Emergency web search not available - no SerpAPI key');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: Web searching actual filmography for ${celebrityName}`);
      
      const searchQueries = [
        `"${celebrityName}" filmography site:imdb.com`,
        `"${celebrityName}" movies site:imdb.com`,
        `"${celebrityName}" site:wikipedia.org`
      ];

      const webResults = [];
      
      for (const query of searchQueries) {
        try {
          console.log(`🔍 Emergency search: ${query}`);
          const searchResult = await this.performWebSearch(query);
          
          if (searchResult.organic_results && searchResult.organic_results.length > 0) {
            webResults.push(...searchResult.organic_results);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.log(`⚠️ Emergency search failed: ${query} - ${error.message}`);
        }
      }

      console.log(`📊 Emergency search collected ${webResults.length} web results`);
      
      // Simple parsing - extract obvious titles
      const actualRoles = this.simpleParseWebResults(celebrityName, webResults);
      
      console.log(`✅ Emergency search extracted ${actualRoles.length} actual roles`);
      return actualRoles;

    } catch (error) {
      console.error(`❌ Emergency filmography search failed: ${error.message}`);
      return [];
    }
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
   * SIMPLE: Extract obvious titles from web results
   */
  simpleParseWebResults(celebrityName, webResults) {
    const roles = [];
    const seenTitles = new Set();
    
    webResults.forEach(result => {
      const title = result.title || '';
      const url = (result.link || '').toLowerCase();
      
      // Extract from Wikipedia page titles (most reliable)
      if (url.includes('wikipedia.org')) {
        const movieTitle = this.extractTitleFromWikipediaPage(title);
        if (movieTitle && !seenTitles.has(movieTitle.toLowerCase())) {
          roles.push({
            character: 'Character',
            title: movieTitle,
            medium: 'live_action_movie',
            year: 'unknown',
            popularity: 'low',
            source: 'wikipedia_emergency'
          });
          seenTitles.add(movieTitle.toLowerCase());
          console.log(`✅ Found from Wikipedia: ${movieTitle}`);
        }
      }
      
      // Extract from IMDb titles
      if (url.includes('imdb.com')) {
        const movieTitle = this.extractTitleFromIMDbPage(title);
        if (movieTitle && !seenTitles.has(movieTitle.toLowerCase())) {
          roles.push({
            character: 'Character',
            title: movieTitle,
            medium: 'live_action_movie',
            year: 'unknown',
            popularity: 'low',
            source: 'imdb_emergency'
          });
          seenTitles.add(movieTitle.toLowerCase());
          console.log(`✅ Found from IMDb: ${movieTitle}`);
        }
      }
    });
    
    return roles;
  }

  /**
   * Extract movie title from Wikipedia page title
   */
  extractTitleFromWikipediaPage(pageTitle) {
    if (!pageTitle || pageTitle.length < 3) return null;
    
    // Skip obvious non-movie pages
    if (pageTitle.toLowerCase().includes('list of') || 
        pageTitle.toLowerCase().includes('category') ||
        pageTitle.toLowerCase().includes('wikipedia')) {
      return null;
    }
    
    // Clean up the title
    let cleanTitle = pageTitle
      .replace(/\s*-\s*Wikipedia.*$/i, '') // Remove Wikipedia suffix
      .replace(/\s*\(film.*\)$/i, '') // Remove (film) suffix
      .replace(/\s*\(.*series.*\)$/i, '') // Remove (series) suffix
      .trim();
    
    // Handle foreign titles
    if (cleanTitle.includes('Ein Mann namens Otto')) {
      cleanTitle = 'A Man Called Otto';
    }
    
    // Basic validation
    if (cleanTitle.length < 2 || cleanTitle.length > 50) return null;
    
    return cleanTitle;
  }

  /**
   * Extract movie title from IMDb page title
   */
  extractTitleFromIMDbPage(pageTitle) {
    if (!pageTitle || pageTitle.length < 3) return null;
    
    // Look for IMDb title patterns
    const imdbPatterns = [
      /^(.+?)\s*\(\d{4}\).*IMDb$/,  // "Movie Title (2022) - IMDb"
      /^(.+?)\s*-\s*IMDb$/,         // "Movie Title - IMDb"
      /^(.+?)\s*\|\s*IMDb$/         // "Movie Title | IMDb"
    ];
    
    for (const pattern of imdbPatterns) {
      const match = pageTitle.match(pattern);
      if (match) {
        const title = match[1].trim();
        if (title.length > 2 && title.length < 50) {
          return title;
        }
      }
    }
    
    return null;
  }

  /**
   * Parse JSON response
   */
  parseJSONResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      try {
        const jsonMatch = response.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return [];
      } catch (parseError) {
        return [];
      }
    }
  }
}

module.exports = RedFlagRoleDetector;
