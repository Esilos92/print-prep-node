const OpenAI = require('openai');
const axios = require('axios');

/**
 * ENHANCED Red Flag Emergency System
 * WEB-FIRST approach: Search IMDb/Wikipedia for real roles, then use AI for character extraction
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
   * ENHANCED: WEB-FIRST Emergency filmography search
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ Emergency web search not available - no SerpAPI key');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: Web-first filmography search for ${celebrityName}`);
      
      // Step 1: Search IMDb/Wikipedia for real filmography
      const realTitles = await this.searchRealFilmography(celebrityName);
      
      // Step 2: For each real title, extract character names
      const rolesWithCharacters = await this.extractCharacterNamesForTitles(realTitles, celebrityName);
      
      console.log(`✅ Emergency web search recovered ${rolesWithCharacters.length} roles with character names`);
      return rolesWithCharacters;

    } catch (error) {
      console.error(`❌ Emergency filmography search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: Search IMDb/Wikipedia for real filmography
   */
  async searchRealFilmography(celebrityName) {
    const filmographyQueries = [
      // Primary: IMDb searches
      `"${celebrityName}" site:imdb.com`,
      `"${celebrityName}" filmography site:imdb.com`,
      `"${celebrityName}" movies site:imdb.com`,
      
      // Secondary: Wikipedia searches
      `"${celebrityName}" site:wikipedia.org`,
      `"${celebrityName}" filmography site:wikipedia.org`,
      
      // Tertiary: General searches
      `"${celebrityName}" actor movies`,
      `"${celebrityName}" actress films`
    ];

    const allTitles = [];
    const seenTitles = new Set();

    for (const query of filmographyQueries) {
      try {
        console.log(`🔍 Searching filmography: ${query}`);
        const searchResult = await this.performWebSearch(query);
        
        if (searchResult.organic_results) {
          const titles = this.extractTitlesFromSearchResults(searchResult.organic_results, celebrityName);
          
          titles.forEach(title => {
            const titleLower = title.toLowerCase();
            if (!seenTitles.has(titleLower) && title.length > 1) {
              seenTitles.add(titleLower);
              allTitles.push(title);
            }
          });
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.log(`⚠️ Filmography search failed: ${query} - ${error.message}`);
      }
    }

    console.log(`📊 Found ${allTitles.length} potential titles from web search`);
    return allTitles.slice(0, 10); // Limit to top 10 to avoid rate limits
  }

  /**
   * ENHANCED: Extract titles from search results
   */
  extractTitlesFromSearchResults(results, celebrityName) {
    const titles = [];
    const celebrityLower = celebrityName.toLowerCase();
    
    results.forEach(result => {
      const title = result.title || '';
      const snippet = result.snippet || '';
      const url = result.link || '';
      
      // Extract from IMDb URLs and titles
      if (url.includes('imdb.com')) {
        const imdbTitles = this.extractFromIMDbResult(title, snippet, url);
        titles.push(...imdbTitles);
      }
      
      // Extract from Wikipedia results
      if (url.includes('wikipedia.org')) {
        const wikiTitles = this.extractFromWikipediaResult(title, snippet, celebrityLower);
        titles.push(...wikiTitles);
      }
      
      // Extract from general results
      const generalTitles = this.extractFromGeneralResult(title, snippet, celebrityLower);
      titles.push(...generalTitles);
    });
    
    return [...new Set(titles)]; // Remove duplicates
  }

  /**
   * ENHANCED: Extract titles from IMDb results
   */
  extractFromIMDbResult(title, snippet, url) {
    const titles = [];
    
    // Pattern 1: IMDb title format "Movie Title (Year)"
    const titleMatch = title.match(/^(.+?)\s*\((\d{4})\)/);
    if (titleMatch) {
      const movieTitle = titleMatch[1].trim();
      if (this.isValidTitle(movieTitle)) {
        titles.push(movieTitle);
      }
    }
    
    // Pattern 2: Extract from snippet text
    const snippetTitles = snippet.match(/"([^"]+)"/g);
    if (snippetTitles) {
      snippetTitles.forEach(match => {
        const title = match.replace(/"/g, '').trim();
        if (this.isValidTitle(title)) {
          titles.push(title);
        }
      });
    }
    
    return titles;
  }

  /**
   * ENHANCED: Extract titles from Wikipedia results
   */
  extractFromWikipediaResult(title, snippet, celebrityLower) {
    const titles = [];
    
    // Look for quoted titles in snippets
    const quotedTitles = snippet.match(/"([^"]+)"/g);
    if (quotedTitles) {
      quotedTitles.forEach(match => {
        const title = match.replace(/"/g, '').trim();
        if (this.isValidTitle(title)) {
          titles.push(title);
        }
      });
    }
    
    // Look for italicized titles (common in Wikipedia)
    const italicTitles = snippet.match(/\*([^*]+)\*/g);
    if (italicTitles) {
      italicTitles.forEach(match => {
        const title = match.replace(/\*/g, '').trim();
        if (this.isValidTitle(title)) {
          titles.push(title);
        }
      });
    }
    
    return titles;
  }

  /**
   * ENHANCED: Extract titles from general results
   */
  extractFromGeneralResult(title, snippet, celebrityLower) {
    const titles = [];
    
    // Look for movie/show patterns
    const moviePatterns = [
      /in\s+"([^"]+)"/gi,
      /movie\s+"([^"]+)"/gi,
      /film\s+"([^"]+)"/gi,
      /show\s+"([^"]+)"/gi,
      /series\s+"([^"]+)"/gi
    ];
    
    const allText = `${title} ${snippet}`;
    
    moviePatterns.forEach(pattern => {
      const matches = allText.matchAll(pattern);
      for (const match of matches) {
        const title = match[1].trim();
        if (this.isValidTitle(title)) {
          titles.push(title);
        }
      }
    });
    
    return titles;
  }

  /**
   * ENHANCED: Extract character names for discovered titles
   */
  async extractCharacterNamesForTitles(titles, celebrityName) {
    const rolesWithCharacters = [];
    
    for (const title of titles) {
      try {
        console.log(`🔍 Finding character for: ${celebrityName} in ${title}`);
        
        // Search for character information
        const characterName = await this.findCharacterNameForTitle(celebrityName, title);
        
        if (characterName) {
          rolesWithCharacters.push({
            character: characterName,
            title: title,
            medium: this.determineMediumType(title),
            year: 'unknown',
            popularity: 'medium',
            source: 'emergency_web_recovery',
            recoveryMethod: 'web_search_with_character_extraction',
            confidence: 'medium'
          });
          
          console.log(`✅ Found: ${characterName} in ${title}`);
        } else {
          console.log(`❌ Could not find character for ${celebrityName} in ${title}`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 400));
        
      } catch (error) {
        console.log(`⚠️ Character extraction failed for ${title}: ${error.message}`);
      }
    }

    return rolesWithCharacters;
  }

  /**
   * ENHANCED: Find character name for a specific title
   */
  async findCharacterNameForTitle(celebrityName, title) {
    // Method 1: Web search for character information
    const webCharacter = await this.searchForCharacterName(celebrityName, title);
    if (webCharacter) {
      return webCharacter;
    }

    // Method 2: AI extraction if web search fails
    if (this.hasOpenAI) {
      const aiCharacter = await this.aiExtractCharacterName(celebrityName, title);
      if (aiCharacter) {
        return aiCharacter;
      }
    }

    return null;
  }

  /**
   * ENHANCED: Web search for character name
   */
  async searchForCharacterName(celebrityName, title) {
    const characterQueries = [
      `"${celebrityName}" "${title}" character name`,
      `"${celebrityName}" "${title}" plays`,
      `"${celebrityName}" "${title}" cast`,
      `"${title}" cast "${celebrityName}"`,
      `"${celebrityName}" as character "${title}"`,
      `"${title}" "${celebrityName}" role`
    ];

    for (const query of characterQueries) {
      try {
        console.log(`🎭 Character search: ${query}`);
        const searchResult = await this.performWebSearch(query);
        
        if (searchResult.organic_results) {
          const character = this.extractCharacterFromResults(searchResult.organic_results, celebrityName, title);
          if (character) {
            return character;
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.log(`⚠️ Character search failed: ${query}`);
      }
    }

    return null;
  }

  /**
   * ENHANCED: Extract character from search results
   */
  extractCharacterFromResults(results, celebrityName, title) {
    const celebrityLower = celebrityName.toLowerCase();
    
    for (const result of results) {
      const snippet = (result.snippet || '').toLowerCase();
      const resultTitle = (result.title || '').toLowerCase();
      const allText = `${snippet} ${resultTitle}`;
      
      // Pattern 1: "[Celebrity] as [Character]"
      const asPattern = new RegExp(`${celebrityLower}\\s+as\\s+([A-Z][a-zA-Z\\s]+?)(?:\\s|,|\\.|$)`, 'i');
      const asMatch = allText.match(asPattern);
      if (asMatch) {
        const character = this.cleanCharacterName(asMatch[1]);
        if (this.isValidCharacterName(character)) {
          return character;
        }
      }
      
      // Pattern 2: "[Celebrity] plays [Character]"
      const playsPattern = new RegExp(`${celebrityLower}\\s+plays\\s+([A-Z][a-zA-Z\\s]+?)(?:\\s|,|\\.|$)`, 'i');
      const playsMatch = allText.match(playsPattern);
      if (playsMatch) {
        const character = this.cleanCharacterName(playsMatch[1]);
        if (this.isValidCharacterName(character)) {
          return character;
        }
      }
      
      // Pattern 3: "[Character] played by [Celebrity]"
      const playedByPattern = new RegExp(`([A-Z][a-zA-Z\\s]+?)\\s+played\\s+by\\s+${celebrityLower}`, 'i');
      const playedByMatch = allText.match(playedByPattern);
      if (playedByMatch) {
        const character = this.cleanCharacterName(playedByMatch[1]);
        if (this.isValidCharacterName(character)) {
          return character;
        }
      }
      
      // Pattern 4: "[Character] ([Celebrity])"
      const parenthesesPattern = new RegExp(`([A-Z][a-zA-Z\\s]+?)\\s*\\(${celebrityLower}\\)`, 'i');
      const parenthesesMatch = allText.match(parenthesesPattern);
      if (parenthesesMatch) {
        const character = this.cleanCharacterName(parenthesesMatch[1]);
        if (this.isValidCharacterName(character)) {
          return character;
        }
      }
    }
    
    return null;
  }

  /**
   * ENHANCED: AI character extraction as fallback
   */
  async aiExtractCharacterName(celebrityName, title) {
    try {
      const prompt = `What character did "${celebrityName}" play in "${title}"?

IMPORTANT: Only provide the character name if you are absolutely certain. If you're not sure, respond with "UNKNOWN".

Response format: Just the character name, or "UNKNOWN" if uncertain.
Examples:
- "Sarah Mitchell"
- "Detective Johnson"
- "Dr. Elizabeth Stone"
- "UNKNOWN"`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      });

      const response = completion.choices[0].message.content.trim();
      
      if (response === "UNKNOWN" || response.toLowerCase().includes("unknown")) {
        return null;
      }
      
      const cleanResponse = this.cleanCharacterName(response);
      
      if (this.isValidCharacterName(cleanResponse)) {
        console.log(`🤖 AI extracted character: ${cleanResponse}`);
        return cleanResponse;
      }
      
      return null;
      
    } catch (error) {
      console.log(`⚠️ AI character extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * ENHANCED: Clean character name
   */
  cleanCharacterName(name) {
    if (!name || typeof name !== 'string') return '';
    
    let cleaned = name.trim();
    
    // Remove common prefixes that get picked up during extraction
    cleaned = cleaned.replace(/^(as|plays|played by|portrayed by|voiced by|in|the|a|an)\s+/i, '');
    
    // Remove quotes and extra punctuation
    cleaned = cleaned.replace(/["""]/g, '');
    cleaned = cleaned.replace(/[,.;:!?]+$/, '');
    
    // Remove any remaining celebrity name artifacts
    cleaned = cleaned.replace(/kailey hyman/gi, '');
    cleaned = cleaned.replace(/as\s+/gi, '');
    
    // Clean up extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Capitalize properly
    if (cleaned.length > 0) {
      cleaned = cleaned.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    }
    
    return cleaned;
  }

  /**
   * ENHANCED: Validate character name
   */
  isValidCharacterName(name) {
    if (!name || typeof name !== 'string') return false;
    
    const cleanName = name.trim();
    
    // Basic validation
    if (cleanName.length < 2 || cleanName.length > 50) return false;
    
    // Exclude common non-character words
    const excludeWords = [
      'actor', 'actress', 'character', 'role', 'film', 'movie', 'show', 'series',
      'cast', 'starring', 'plays', 'played', 'portrays', 'portrayed', 'the', 'and',
      'crew', 'director', 'producer', 'writer', 'unknown', 'various', 'herself', 'himself'
    ];
    
    const nameLower = cleanName.toLowerCase();
    if (excludeWords.includes(nameLower)) return false;
    
    // Should contain at least one letter
    if (!/[a-zA-Z]/.test(cleanName)) return false;
    
    // Should not be mostly numbers
    if (/\d{3,}/.test(cleanName)) return false;
    
    // Should not contain artifacts
    if (nameLower.includes('kailey hyman') || nameLower.includes('as cindi') || nameLower.includes('as brooke')) {
      return false;
    }
    
    return true;
  }

  /**
   * ENHANCED: Validate title
   */
  isValidTitle(title) {
    if (!title || typeof title !== 'string') return false;
    
    const cleanTitle = title.trim();
    
    // Basic validation
    if (cleanTitle.length < 2 || cleanTitle.length > 100) return false;
    
    // Exclude common non-title words
    const excludeWords = [
      'actor', 'actress', 'biography', 'imdb', 'wikipedia', 'filmography'
    ];
    
    const titleLower = cleanTitle.toLowerCase();
    if (excludeWords.some(word => titleLower.includes(word))) return false;
    
    return true;
  }

  /**
   * ENHANCED: Determine medium type from title
   */
  determineMediumType(title) {
    const titleLower = title.toLowerCase();
    
    // TV indicators
    if (titleLower.includes('season') || titleLower.includes('episode') || 
        titleLower.includes('series') || titleLower.includes('show')) {
      return 'live_action_tv';
    }
    
    // Movie indicators
    if (titleLower.includes('film') || titleLower.includes('movie') || 
        titleLower.includes('cinema')) {
      return 'live_action_movie';
    }
    
    // Animation indicators
    if (titleLower.includes('anime') || titleLower.includes('animation') || 
        titleLower.includes('cartoon')) {
      return 'voice_anime_tv';
    }
    
    // Default to movie
    return 'live_action_movie';
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

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      hasWebSearch: this.hasWebSearch,
      hasOpenAI: this.hasOpenAI,
      emergencyRecoveryMethod: this.hasWebSearch ? 'Web-First IMDb/Wikipedia Search' : 'None',
      characterExtractionMethod: this.hasWebSearch ? 'Web Search + AI Fallback' : 'AI Only',
      webSearchEnabled: this.hasWebSearch,
      systemReady: this.hasWebSearch
    };
  }
}

module.exports = RedFlagRoleDetector;
