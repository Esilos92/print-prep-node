const OpenAI = require('openai');
const axios = require('axios');

/**
 * ENHANCED Red Flag Emergency System
 * Detects AI hallucination and triggers emergency web search with character name extraction
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
   * ENHANCED: Emergency filmography search with character name extraction
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ Emergency web search not available - no SerpAPI key');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: Enhanced filmography search for ${celebrityName}`);
      
      // Step 1: Find filmography sources
      const filmographySources = await this.findFilmographySources(celebrityName);
      
      // Step 2: Extract titles from sources
      const discoveredTitles = await this.extractTitlesFromSources(filmographySources, celebrityName);
      
      // Step 3: For each title, find the character name
      const rolesWithCharacters = await this.findCharacterNamesForTitles(discoveredTitles, celebrityName);
      
      console.log(`✅ Emergency search recovered ${rolesWithCharacters.length} roles with character names`);
      return rolesWithCharacters;

    } catch (error) {
      console.error(`❌ Emergency filmography search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: Find filmography sources (IMDb, Wikipedia)
   */
  async findFilmographySources(celebrityName) {
    const searchQueries = [
      `"${celebrityName}" filmography site:imdb.com`,
      `"${celebrityName}" movies site:imdb.com`,
      `"${celebrityName}" site:wikipedia.org filmography`,
      `"${celebrityName}" actor site:imdb.com`,
      `"${celebrityName}" actress site:imdb.com`
    ];

    const allSources = [];
    
    for (const query of searchQueries) {
      try {
        console.log(`🔍 Finding sources: ${query}`);
        const searchResult = await this.performWebSearch(query);
        
        if (searchResult.organic_results && searchResult.organic_results.length > 0) {
          // Filter for high-quality sources
          const qualitySources = searchResult.organic_results.filter(result => {
            const url = (result.link || '').toLowerCase();
            const title = (result.title || '').toLowerCase();
            
            // Prefer IMDb actor pages and Wikipedia pages
            return (url.includes('imdb.com/name/') || 
                   url.includes('imdb.com/title/') ||
                   (url.includes('wikipedia.org') && title.includes(celebrityName.toLowerCase())));
          });
          
          allSources.push(...qualitySources);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.log(`⚠️ Source search failed: ${query} - ${error.message}`);
      }
    }

    console.log(`📊 Found ${allSources.length} potential filmography sources`);
    return allSources;
  }

  /**
   * ENHANCED: Extract titles from filmography sources
   */
  async extractTitlesFromSources(sources, celebrityName) {
    const discoveredTitles = [];
    const seenTitles = new Set();
    
    for (const source of sources.slice(0, 5)) { // Limit to avoid rate limits
      try {
        const url = source.link;
        const title = source.title || '';
        
        console.log(`📖 Extracting from: ${url}`);
        
        if (url.includes('imdb.com')) {
          const imdbTitles = await this.extractFromIMDbPage(url, celebrityName);
          imdbTitles.forEach(title => {
            if (!seenTitles.has(title.toLowerCase())) {
              seenTitles.add(title.toLowerCase());
              discoveredTitles.push({
                title: title,
                source: 'imdb',
                sourceUrl: url,
                medium: 'live_action_movie' // Default, will be refined
              });
            }
          });
        } else if (url.includes('wikipedia.org')) {
          const wikiTitles = await this.extractFromWikipediaPage(url, celebrityName);
          wikiTitles.forEach(title => {
            if (!seenTitles.has(title.toLowerCase())) {
              seenTitles.add(title.toLowerCase());
              discoveredTitles.push({
                title: title,
                source: 'wikipedia',
                sourceUrl: url,
                medium: 'live_action_movie' // Default, will be refined
              });
            }
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`⚠️ Failed to extract from ${source.link}: ${error.message}`);
      }
    }

    console.log(`📝 Extracted ${discoveredTitles.length} unique titles`);
    return discoveredTitles;
  }

  /**
   * ENHANCED: Extract titles from IMDb pages
   */
  async extractFromIMDbPage(url, celebrityName) {
    try {
      // Search for IMDb titles that mention the celebrity
      const imdbSearchQuery = `"${celebrityName}" site:imdb.com title`;
      const searchResult = await this.performWebSearch(imdbSearchQuery);
      
      const titles = [];
      
      if (searchResult.organic_results) {
        searchResult.organic_results.forEach(result => {
          const title = result.title || '';
          const url = result.link || '';
          
          // Extract title from IMDb page title formats
          const titleMatch = title.match(/^(.+?)\s*\(\d{4}\)/); // "Movie Title (2022)"
          if (titleMatch) {
            const movieTitle = titleMatch[1].trim();
            if (movieTitle && movieTitle.length > 1 && movieTitle.length < 100) {
              titles.push(movieTitle);
            }
          }
        });
      }

      return titles;
      
    } catch (error) {
      console.log(`⚠️ IMDb extraction failed: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: Extract titles from Wikipedia pages
   */
  async extractFromWikipediaPage(url, celebrityName) {
    try {
      // Search for Wikipedia filmography mentions
      const wikiSearchQuery = `"${celebrityName}" filmography site:wikipedia.org`;
      const searchResult = await this.performWebSearch(wikiSearchQuery);
      
      const titles = [];
      
      if (searchResult.organic_results) {
        searchResult.organic_results.forEach(result => {
          const snippet = result.snippet || '';
          const title = result.title || '';
          
          // Extract titles from filmography snippets
          const filmTitles = this.extractTitlesFromText(snippet);
          titles.push(...filmTitles);
        });
      }

      return titles;
      
    } catch (error) {
      console.log(`⚠️ Wikipedia extraction failed: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: Extract titles from text snippets
   */
  extractTitlesFromText(text) {
    const titles = [];
    
    // Look for quoted titles
    const quotedTitles = text.match(/"([^"]+)"/g);
    if (quotedTitles) {
      quotedTitles.forEach(match => {
        const title = match.replace(/"/g, '').trim();
        if (title.length > 2 && title.length < 100 && !title.includes('said') && !title.includes('told')) {
          titles.push(title);
        }
      });
    }
    
    // Look for italicized titles (common in Wikipedia)
    const italicTitles = text.match(/\*([^*]+)\*/g);
    if (italicTitles) {
      italicTitles.forEach(match => {
        const title = match.replace(/\*/g, '').trim();
        if (title.length > 2 && title.length < 100) {
          titles.push(title);
        }
      });
    }
    
    return titles;
  }

  /**
   * ENHANCED: Find character names for discovered titles
   */
  async findCharacterNamesForTitles(discoveredTitles, celebrityName) {
    const rolesWithCharacters = [];
    
    for (const titleData of discoveredTitles.slice(0, 8)) { // Limit to avoid rate limits
      try {
        console.log(`🔍 Finding character for: ${celebrityName} in ${titleData.title}`);
        
        // Try multiple approaches to find character name
        let characterName = null;
        
        // Approach 1: Direct cast search
        characterName = await this.findCharacterFromCastSearch(celebrityName, titleData.title);
        
        // Approach 2: AI-assisted character extraction if web search fails
        if (!characterName && this.hasOpenAI) {
          characterName = await this.findCharacterWithAI(celebrityName, titleData.title);
        }
        
        // Approach 3: Generic character search
        if (!characterName) {
          characterName = await this.findCharacterFromGenericSearch(celebrityName, titleData.title);
        }
        
        if (characterName) {
          rolesWithCharacters.push({
            character: characterName,
            title: titleData.title,
            medium: this.determineMediumType(titleData.title),
            year: 'unknown',
            popularity: 'medium',
            source: 'emergency_recovery',
            recoveryMethod: 'web_search_with_character_extraction',
            confidence: 'medium'
          });
          
          console.log(`✅ Found: ${characterName} in ${titleData.title}`);
        } else {
          console.log(`❌ Could not find character for ${celebrityName} in ${titleData.title}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 400));
        
      } catch (error) {
        console.log(`⚠️ Character search failed for ${titleData.title}: ${error.message}`);
      }
    }

    return rolesWithCharacters;
  }

  /**
   * ENHANCED: Find character from cast search
   */
  async findCharacterFromCastSearch(celebrityName, movieTitle) {
    try {
      const castSearchQueries = [
        `"${celebrityName}" "${movieTitle}" cast character`,
        `"${celebrityName}" "${movieTitle}" plays`,
        `"${celebrityName}" "${movieTitle}" role`,
        `"${movieTitle}" cast "${celebrityName}"`,
        `"${celebrityName}" as character "${movieTitle}"`
      ];

      for (const query of castSearchQueries) {
        try {
          console.log(`🎭 Cast search: ${query}`);
          const searchResult = await this.performWebSearch(query);
          
          if (searchResult.organic_results && searchResult.organic_results.length > 0) {
            const character = this.extractCharacterFromCastResults(searchResult.organic_results, celebrityName, movieTitle);
            if (character) {
              return character;
            }
          }
        } catch (error) {
          console.log(`⚠️ Cast search query failed: ${query}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      return null;
      
    } catch (error) {
      console.log(`⚠️ Cast search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * ENHANCED: Extract character from cast search results
   */
  extractCharacterFromCastResults(results, celebrityName, movieTitle) {
    const celebrityLower = celebrityName.toLowerCase();
    
    for (const result of results) {
      const snippet = (result.snippet || '').toLowerCase();
      const title = (result.title || '').toLowerCase();
      const allText = `${snippet} ${title}`;
      
      // Pattern 1: "[Celebrity] as [Character]"
      const asPattern = new RegExp(`${celebrityLower}\\s+as\\s+([\\w\\s]+?)(?:\\s|,|\\.|$)`, 'i');
      const asMatch = allText.match(asPattern);
      if (asMatch) {
        const character = asMatch[1].trim();
        if (this.isValidCharacterName(character)) {
          return this.cleanCharacterName(character);
        }
      }
      
      // Pattern 2: "[Celebrity] plays [Character]"
      const playsPattern = new RegExp(`${celebrityLower}\\s+plays\\s+([\\w\\s]+?)(?:\\s|,|\\.|$)`, 'i');
      const playsMatch = allText.match(playsPattern);
      if (playsMatch) {
        const character = playsMatch[1].trim();
        if (this.isValidCharacterName(character)) {
          return this.cleanCharacterName(character);
        }
      }
      
      // Pattern 3: "[Character] played by [Celebrity]"
      const playedByPattern = new RegExp(`([\\w\\s]+?)\\s+played\\s+by\\s+${celebrityLower}`, 'i');
      const playedByMatch = allText.match(playedByPattern);
      if (playedByMatch) {
        const character = playedByMatch[1].trim();
        if (this.isValidCharacterName(character)) {
          return this.cleanCharacterName(character);
        }
      }
      
      // Pattern 4: "[Character] ([Celebrity])"
      const parenthesesPattern = new RegExp(`([\\w\\s]+?)\\s*\\(${celebrityLower}\\)`, 'i');
      const parenthesesMatch = allText.match(parenthesesPattern);
      if (parenthesesMatch) {
        const character = parenthesesMatch[1].trim();
        if (this.isValidCharacterName(character)) {
          return this.cleanCharacterName(character);
        }
      }
    }
    
    return null;
  }

  /**
   * ENHANCED: Find character with AI assistance
   */
  async findCharacterWithAI(celebrityName, movieTitle) {
    try {
      const prompt = `What character did "${celebrityName}" play in "${movieTitle}"? 

IMPORTANT: Only provide the character name if you are absolutely certain. If you're not sure, respond with "UNKNOWN".

Response format: Just the character name, or "UNKNOWN" if uncertain.
Examples:
- "John Smith"
- "Detective Sarah Johnson"
- "UNKNOWN"`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      });

      const response = completion.choices[0].message.content.trim();
      
      if (response === "UNKNOWN" || response.toLowerCase().includes("unknown") || response.toLowerCase().includes("not sure")) {
        return null;
      }
      
      // Clean up the response
      const cleanResponse = response.replace(/["""]/g, '').trim();
      
      if (this.isValidCharacterName(cleanResponse)) {
        console.log(`🤖 AI found character: ${cleanResponse}`);
        return cleanResponse;
      }
      
      return null;
      
    } catch (error) {
      console.log(`⚠️ AI character search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * ENHANCED: Find character from generic search
   */
  async findCharacterFromGenericSearch(celebrityName, movieTitle) {
    try {
      const genericQuery = `"${celebrityName}" "${movieTitle}" character name`;
      const searchResult = await this.performWebSearch(genericQuery);
      
      if (searchResult.organic_results && searchResult.organic_results.length > 0) {
        return this.extractCharacterFromGenericResults(searchResult.organic_results, celebrityName, movieTitle);
      }
      
      return null;
      
    } catch (error) {
      console.log(`⚠️ Generic character search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * ENHANCED: Extract character from generic search results
   */
  extractCharacterFromGenericResults(results, celebrityName, movieTitle) {
    const celebrityLower = celebrityName.toLowerCase();
    
    for (const result of results) {
      const snippet = (result.snippet || '').toLowerCase();
      const title = (result.title || '').toLowerCase();
      const allText = `${snippet} ${title}`;
      
      // Look for character names in context
      const words = allText.split(/\s+/);
      const celebrityIndex = words.findIndex(word => word.includes(celebrityLower.split(' ')[0]));
      
      if (celebrityIndex !== -1) {
        // Look for capitalized names near the celebrity mention
        const contextWords = words.slice(Math.max(0, celebrityIndex - 5), celebrityIndex + 5);
        
        for (const word of contextWords) {
          if (word.length > 2 && word[0] === word[0].toUpperCase() && 
              !word.includes(celebrityLower) && !word.includes(movieTitle.toLowerCase())) {
            
            // Check if this looks like a character name
            if (this.isValidCharacterName(word)) {
              return this.cleanCharacterName(word);
            }
          }
        }
      }
    }
    
    return null;
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
      'cast', 'crew', 'director', 'producer', 'writer', 'unknown', 'various'
    ];
    
    const nameLower = cleanName.toLowerCase();
    if (excludeWords.includes(nameLower)) return false;
    
    // Should contain at least one letter
    if (!/[a-zA-Z]/.test(cleanName)) return false;
    
    // Should not be mostly numbers
    if (/\d{3,}/.test(cleanName)) return false;
    
    return true;
  }

  /**
   * ENHANCED: Clean character name
   */
  cleanCharacterName(name) {
    return name
      .trim()
      .replace(/["""]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '')
      .replace(/,$/, '')
      .trim();
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
}

module.exports = RedFlagRoleDetector;
