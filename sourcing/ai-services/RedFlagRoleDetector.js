const OpenAI = require('openai');
const axios = require('axios');

/**
 * RED FLAG EMERGENCY SYSTEM
 * Detects when AI is hallucinating roles and triggers emergency web search
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
    
    // Red Flag 1: Too many rejections with "Celebrity in title but not this character"
    const fakeCharacterRejections = rejectedRoles.filter(r => {
      const reason = r.rejectionReason || r.verificationReason || '';
      return reason.includes('Celebrity in title but not this character');
    });
    
    console.log(`🔍 Fake character rejections: ${fakeCharacterRejections.length}`);
    
    if (fakeCharacterRejections.length >= 2) { // Lowered threshold
      redFlags.push({
        type: 'AI_HALLUCINATION',
        severity: 'HIGH',
        count: fakeCharacterRejections.length,
        description: `${fakeCharacterRejections.length} fake character names detected - AI is inventing roles`,
        trigger: 'emergency_web_search'
      });
    }

    // Red Flag 2: Too many "No search results found" (AI inventing titles)
    const noResultsRejections = rejectedRoles.filter(r => {
      const reason = r.rejectionReason || r.verificationReason || '';
      return reason.includes('No search results found');
    });
    
    console.log(`🔍 No results rejections: ${noResultsRejections.length}`);
    
    if (noResultsRejections.length >= 2) {
      redFlags.push({
        type: 'FAKE_TITLES',
        severity: 'HIGH', // Raised severity
        count: noResultsRejections.length,
        description: `${noResultsRejections.length} non-existent titles detected - AI inventing shows/movies`,
        trigger: 'emergency_web_search'
      });
    }

    // Red Flag 3: Very low success rate for lesser-known actors
    const totalRoles = verifiedRoles.length + rejectedRoles.length;
    const successRate = totalRoles > 0 ? (verifiedRoles.length / totalRoles) * 100 : 0;
    
    console.log(`🔍 Success rate: ${Math.round(successRate)}% (${verifiedRoles.length}/${totalRoles})`);
    
    // LOWERED threshold for lesser-known actors
    if (successRate < 50 && totalRoles >= 3) {
      redFlags.push({
        type: 'LOW_SUCCESS_RATE',
        severity: 'HIGH', // Raised severity for lesser-known actors
        successRate: Math.round(successRate),
        description: `Only ${Math.round(successRate)}% verification success rate - likely lesser-known actor with AI hallucination`,
        trigger: 'emergency_web_search'
      });
    }

    // Red Flag 4: Any verification failures for very small filmographies
    if (totalRoles <= 3 && rejectedRoles.length >= 2) {
      redFlags.push({
        type: 'SMALL_FILMOGRAPHY_FAILURES',
        severity: 'HIGH',
        count: rejectedRoles.length,
        description: `${rejectedRoles.length} failures in small filmography - AI likely hallucinating for unknown actor`,
        trigger: 'emergency_web_search'
      });
    }

    // Red Flag 4: Pattern of similar fake roles (same shows with different characters)
    const titleCounts = {};
    rejectedRoles.forEach(role => {
      const title = role.title;
      if (title) {
        titleCounts[title] = (titleCounts[title] || 0) + 1;
      }
    });
    
    const repeatedTitles = Object.entries(titleCounts).filter(([title, count]) => count > 1);
    if (repeatedTitles.length > 0) {
      redFlags.push({
        type: 'REPEATED_FAKE_TITLES',
        severity: 'HIGH',
        repeatedTitles: repeatedTitles.map(([title, count]) => `${title} (${count}x)`),
        description: `AI repeatedly using same fake titles with different characters`,
        trigger: 'emergency_web_search'
      });
    }

    console.log(`🔍 Red flags detected: ${redFlags.length}`);
    redFlags.forEach(flag => {
      console.log(`   - ${flag.type} (${flag.severity}): ${flag.description}`);
    });

    // Determine if emergency action needed
    const highSeverityFlags = redFlags.filter(flag => flag.severity === 'HIGH');
    const triggerEmergency = highSeverityFlags.length > 0 || redFlags.length >= 2;
    
    console.log(`🔍 Emergency trigger: ${triggerEmergency} (${highSeverityFlags.length} high severity, ${redFlags.length} total)`);

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
   * EMERGENCY: Web search for actual filmography when red flags detected
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ Emergency web search not available - no SerpAPI key');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: Web searching actual filmography for ${celebrityName}`);
      
      // Targeted searches for actual filmography
      const searchQueries = [
        `"${celebrityName}" filmography site:imdb.com`,
        `"${celebrityName}" movies TV shows site:imdb.com`,
        `"${celebrityName}" cast site:imdb.com`,
        `"${celebrityName}" actor credits site:wikipedia.org`,
        `"${celebrityName}" filmography site:wikipedia.org`
      ];

      const webResults = [];
      
      for (const query of searchQueries) {
        try {
          console.log(`🔍 Emergency search: ${query}`);
          const searchResult = await this.performWebSearch(query);
          
          if (searchResult.organic_results && searchResult.organic_results.length > 0) {
            webResults.push(...searchResult.organic_results);
          }
          
          // Brief pause between searches
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.log(`⚠️ Emergency search failed: ${query} - ${error.message}`);
        }
      }

      console.log(`📊 Emergency search collected ${webResults.length} web results`);
      
      // Parse web results to extract actual roles
      const actualRoles = await this.parseWebResultsForRoles(celebrityName, webResults);
      
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
   * ENHANCED: Parse web results to extract actual roles
   */
  async parseWebResultsForRoles(celebrityName, webResults) {
    console.log(`🔍 Parsing web results for ${celebrityName}...`);
    
    // Try manual parsing first (more reliable)
    const manualRoles = this.manualParseWebResults(webResults);
    
    if (manualRoles.length > 0) {
      console.log(`✅ Manual parsing found ${manualRoles.length} roles`);
      return manualRoles;
    }
    
    // Fallback to AI parsing if manual fails
    if (!this.hasOpenAI) {
      console.log(`⚠️ No roles found and no AI available`);
      return [];
    }

    try {
      console.log(`🤖 Trying AI parsing of web results...`);
      
      // Combine all web snippets and titles
      const webContent = webResults.map(result => {
        return `${result.title || ''} ${result.snippet || ''}`;
      }).join('\n').substring(0, 4000); // Increased content length

      const parsePrompt = `Extract actual acting roles for "${celebrityName}" from these web search results:

${webContent}

INSTRUCTIONS:
- Look for ANY mention of acting roles, movies, TV shows, voice work
- Extract character names if mentioned, otherwise use "Character"
- Look for titles like "Terrifier", "The Loud House", or any film/TV show
- Include years if mentioned
- Look for patterns like "appeared in", "starred in", "cast in", "voice of"

Format as JSON array (return empty array if no roles found):
[
  {
    "character": "Character Name (or 'Character' if unclear)",
    "title": "Movie/Show Title",
    "medium": "live_action_movie/live_action_tv/voice_cartoon",
    "year": "YYYY (if mentioned, otherwise 'unknown')",
    "popularity": "low",
    "source": "ai_web_parse"
  }
]

If no acting roles are mentioned in the text, return: []`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are parsing web search results to extract factual acting roles. Look for any mention of films, TV shows, or voice work. Be thorough but only extract what's actually mentioned."
          },
          {
            role: "user",
            content: parsePrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 600
      });

      const response = completion.choices[0].message.content;
      const parsedRoles = this.parseJSONResponse(response);
      
      if (Array.isArray(parsedRoles) && parsedRoles.length > 0) {
        console.log(`🤖 AI parsed ${parsedRoles.length} roles from web results`);
        return parsedRoles;
      }

      console.log(`⚠️ AI parsing found no roles`);
      return [];

    } catch (error) {
      console.log(`⚠️ AI parsing of web results failed: ${error.message}`);
      return [];
    }
  }

  /**
   * ENHANCED: Manual parsing of web results as primary method
   */
  manualParseWebResults(webResults) {
    console.log(`🔍 Manual parsing ${webResults.length} web results...`);
    const roles = [];
    const seenRoles = new Set();
    
    webResults.forEach(result => {
      const text = `${result.title || ''} ${result.snippet || ''}`.toLowerCase();
      const url = (result.link || '').toLowerCase();
      
      // Look for IMDb patterns
      if (url.includes('imdb.com')) {
        console.log(`🎬 Found IMDb result: ${result.title}`);
        
        // Extract from IMDb titles and snippets
        const imdbRoles = this.extractFromIMDbContent(text, result.title, result.snippet);
        imdbRoles.forEach(role => {
          const roleKey = `${role.character}_${role.title}`;
          if (!seenRoles.has(roleKey)) {
            roles.push(role);
            seenRoles.add(roleKey);
          }
        });
      }
      
      // Look for Wikipedia patterns
      if (url.includes('wikipedia.org')) {
        console.log(`📚 Found Wikipedia result: ${result.title}`);
        
        const wikiRoles = this.extractFromWikipediaContent(text, result.title, result.snippet);
        wikiRoles.forEach(role => {
          const roleKey = `${role.character}_${role.title}`;
          if (!seenRoles.has(roleKey)) {
            roles.push(role);
            seenRoles.add(roleKey);
          }
        });
      }
      
      // Look for general film/TV patterns
      const generalRoles = this.extractFromGeneralContent(text, result.title, result.snippet);
      generalRoles.forEach(role => {
        const roleKey = `${role.character}_${role.title}`;
        if (!seenRoles.has(roleKey)) {
          roles.push(role);
          seenRoles.add(roleKey);
        }
      });
    });
    
    console.log(`🎭 Manual parsing extracted ${roles.length} roles`);
    return roles;
  }

  /**
   * ENHANCED: Extract roles from IMDb content with better parsing
   */
  extractFromIMDbContent(text, title, snippet) {
    const roles = [];
    
    // Look for individual sentences to avoid mixing titles
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 10);
    
    sentences.forEach(sentence => {
      // Patterns for single role mentions
      const singleRolePatterns = [
        /actress.*known for (.+)/i,
        /actor.*known for (.+)/i,
        /appeared in (.+)/i,
        /starred in (.+)/i,
        /cast.*in (.+)/i,
        /role in (.+)/i,
        /featured in (.+)/i,
        /voice.*in (.+)/i
      ];
      
      singleRolePatterns.forEach(pattern => {
        const match = sentence.match(pattern);
        if (match) {
          const content = match[1].trim();
          
          // Extract the first clear title (before commas, 'and', 'or')
          const firstTitle = content.split(/[,;]|and|or/)[0].trim();
          
          // Clean up the title
          const cleanedTitle = this.cleanAndValidateTitle(firstTitle);
          
          if (cleanedTitle && this.looksLikeRealTitle(cleanedTitle)) {
            // Check if this looks like a real role mention
            if (this.isValidRoleMention(sentence, cleanedTitle)) {
              roles.push({
                character: this.extractCharacterName(sentence, cleanedTitle) || 'Character',
                title: cleanedTitle,
                medium: this.guessMedium(cleanedTitle, sentence),
                year: this.extractYear(sentence) || 'unknown',
                popularity: 'low',
                source: 'imdb_enhanced'
              });
            }
          }
        }
      });
    });
    
    return this.deduplicateRoles(roles);
  }

  /**
   * NEW: Better title cleaning and validation
   */
  cleanAndValidateTitle(title) {
    if (!title || title.length < 2) return null;
    
    // Remove parentheses and years
    title = title.replace(/\([^)]*\)/g, '').trim();
    
    // Remove common prefixes/suffixes
    title = title.replace(/^(the|a|an)\s+/i, '').trim();
    
    // Remove quotation marks
    title = title.replace(/["']/g, '').trim();
    
    // Capitalize properly
    title = title.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    return title;
  }

  /**
   * NEW: Check if this looks like a real title (not a sentence fragment)
   */
  looksLikeRealTitle(title) {
    // Too short or too long
    if (title.length < 2 || title.length > 50) return false;
    
    // Contains obvious non-title words
    const nonTitleWords = ['appeared', 'starred', 'acted', 'known', 'famous', 'career', 'filmography'];
    if (nonTitleWords.some(word => title.toLowerCase().includes(word))) return false;
    
    // Too many common words
    const commonWords = ['the', 'and', 'or', 'but', 'with', 'for', 'in', 'on', 'at', 'to', 'from', 'of', 'as'];
    const words = title.toLowerCase().split(' ');
    const commonWordCount = words.filter(word => commonWords.includes(word)).length;
    
    if (commonWordCount > words.length / 2) return false;
    
    return true;
  }

  /**
   * ENHANCED: More specific validation for role mentions
   */
  isValidRoleMention(sentence, title) {
    const sentenceLower = sentence.toLowerCase();
    const titleLower = title.toLowerCase();
    
    // Must contain the title
    if (!sentenceLower.includes(titleLower)) return false;
    
    // Look for STRONG role indicators (not just mentions)
    const strongRoleWords = [
      'starred in', 'stars in', 'appeared in', 'appears in', 
      'cast in', 'cast as', 'plays', 'played', 'portrays', 'portrayed',
      'role in', 'featured in', 'voice of', 'voices'
    ];
    
    const hasStrongIndicator = strongRoleWords.some(phrase => sentenceLower.includes(phrase));
    if (!hasStrongIndicator) return false;
    
    // EXCLUDE weak mentions that don't indicate actual roles
    const weakMentions = [
      'also known for', 'similar to', 'compared to', 'like in',
      'related to', 'associated with', 'mentioned in', 'credits include',
      'filmography', 'other works', 'also appeared', 'previously in'
    ];
    
    const hasWeakMention = weakMentions.some(phrase => sentenceLower.includes(phrase));
    if (hasWeakMention) return false;
    
    // EXCLUDE list-style mentions (often inaccurate)
    // "filmography includes X, Y, Z" often mixes real and fake roles
    if (sentenceLower.includes('includes') && sentenceLower.includes(',')) {
      return false;
    }
    
    // EXCLUDE "known for" lists that might be inaccurate
    if (sentenceLower.includes('known for') && sentenceLower.includes(',')) {
      return false;
    }
    
    // Should be a direct role statement
    return true;
  }

  /**
   * ENHANCED: Extract roles with stricter validation
   */
  extractFromIMDbContent(text, title, snippet) {
    const roles = [];
    
    // Split into sentences for individual analysis
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 10);
    
    sentences.forEach(sentence => {
      // Look for DIRECT role statements only
      const directRolePatterns = [
        /starred in (.+)/i,
        /appeared in (.+)/i,
        /cast in (.+)/i,
        /plays (.+?) in (.+)/i,
        /role in (.+)/i,
        /featured in (.+)/i,
        /voice of (.+?) in (.+)/i,
        /voices (.+?) in (.+)/i
      ];
      
      directRolePatterns.forEach(pattern => {
        const match = sentence.match(pattern);
        if (match) {
          let titleExtracted;
          let characterExtracted = 'Character';
          
          // Handle different pattern types
          if (pattern.source.includes('plays') || pattern.source.includes('voice')) {
            // Pattern: "plays CHARACTER in TITLE" or "voice of CHARACTER in TITLE"
            characterExtracted = match[1].trim();
            titleExtracted = match[2].trim();
          } else {
            // Pattern: "appeared in TITLE"
            titleExtracted = match[1].trim();
          }
          
          // Clean up the extracted title
          const cleanedTitle = this.cleanAndValidateTitle(titleExtracted);
          
          if (cleanedTitle && this.looksLikeRealTitle(cleanedTitle)) {
            // STRICT validation - must be a clear role statement
            if (this.isValidRoleMention(sentence, cleanedTitle)) {
              roles.push({
                character: this.cleanCharacterName(characterExtracted) || 'Character',
                title: cleanedTitle,
                medium: this.guessMedium(cleanedTitle, sentence),
                year: this.extractYear(sentence) || 'unknown',
                popularity: 'low',
                source: 'imdb_strict',
                originalSentence: sentence.trim() // For debugging
              });
            }
          }
        }
      });
    });
    
    // Additional validation: remove roles that appear in "lists" or "also known for"
    const validatedRoles = roles.filter(role => {
      const sentence = role.originalSentence.toLowerCase();
      
      // Skip if it's part of a list (often inaccurate)
      if (sentence.includes(',') && sentence.includes('and')) {
        return false;
      }
      
      // Skip if it's a "also" mention (often secondary/inaccurate)
      if (sentence.includes('also') || sentence.includes('other')) {
        return false;
      }
      
      return true;
    });
    
    return this.deduplicateRoles(validatedRoles);
  }

  /**
   * NEW: Try to extract character name from sentence
   */
  extractCharacterName(sentence, title) {
    const patterns = [
      new RegExp(`plays (.+?) in ${title}`, 'i'),
      new RegExp(`as (.+?) in ${title}`, 'i'),
      new RegExp(`role of (.+?) in ${title}`, 'i'),
      new RegExp(`character (.+?) in ${title}`, 'i')
    ];
    
    for (const pattern of patterns) {
      const match = sentence.match(pattern);
      if (match) {
        const character = match[1].trim();
        if (character.length > 1 && character.length < 30) {
          return this.cleanCharacterName(character);
        }
      }
    }
    
    return null;
  }

  /**
   * NEW: Clean character name
   */
  cleanCharacterName(name) {
    return name
      .replace(/[^\w\s-]/g, '')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * NEW: Enhanced medium detection
   */
  guessMedium(title, context = '') {
    const titleLower = title.toLowerCase();
    const contextLower = context.toLowerCase();
    
    // Voice work indicators
    if (contextLower.includes('voice') || contextLower.includes('voiced')) {
      if (titleLower.includes('house') || titleLower.includes('cartoon') || titleLower.includes('animated')) {
        return 'voice_cartoon';
      }
      return 'voice_anime_tv';
    }
    
    // TV indicators
    if (titleLower.includes('series') || titleLower.includes('show') || 
        contextLower.includes('tv') || contextLower.includes('television')) {
      return 'live_action_tv';
    }
    
    // Default to movie
    return 'live_action_movie';
  }

  /**
   * NEW: Remove duplicate roles
   */
  deduplicateRoles(roles) {
    const seen = new Set();
    return roles.filter(role => {
      const key = `${role.title.toLowerCase()}_${role.character.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * NEW: Extract roles from Wikipedia content
   */
  extractFromWikipediaContent(text, title, snippet) {
    const roles = [];
    
    // Wikipedia patterns
    const patterns = [
      /actress.*appeared in (.+)/i,
      /actor.*appeared in (.+)/i,
      /filmography (.+)/i,
      /career.*includes (.+)/i
    ];
    
    patterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match) {
        const content = match[1];
        const titles = content.split(/[,;]/).map(t => t.trim()).filter(t => t.length > 2);
        titles.forEach(movieTitle => {
          if (movieTitle.length > 2 && movieTitle.length < 50) {
            roles.push({
              character: 'Character',
              title: this.cleanTitle(movieTitle),
              medium: 'live_action_movie',
              year: 'unknown',
              popularity: 'low',
              source: 'wikipedia_manual'
            });
          }
        });
      }
    });
    
    return roles;
  }

  /**
   * NEW: Extract roles from general content using generic patterns
   */
  extractFromGeneralContent(text, title, snippet) {
    const roles = [];
    
    // Generic film/TV patterns
    const mediaPatterns = [
      /appeared in (.+)/i,
      /starred in (.+)/i,
      /cast in (.+)/i,
      /role in (.+)/i,
      /acted in (.+)/i,
      /featured in (.+)/i,
      /performance in (.+)/i
    ];
    
    mediaPatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match) {
        const content = match[1];
        // Extract potential titles (words that could be movie/show titles)
        const potentialTitles = content.split(/[,;]/).map(t => t.trim()).filter(t => t.length > 2);
        potentialTitles.forEach(potentialTitle => {
          if (this.looksLikeTitle(potentialTitle)) {
            roles.push({
              character: 'Character',
              title: this.cleanTitle(potentialTitle),
              medium: this.guessMedium(potentialTitle),
              year: this.extractYear(text) || 'unknown',
              popularity: 'low',
              source: 'general_pattern'
            });
          }
        });
      }
    });
    
    return roles;
  }

  /**
   * NEW: Check if text looks like a movie/show title
   */
  looksLikeTitle(text) {
    // Filter out obvious non-titles
    const nonTitles = ['the', 'and', 'or', 'but', 'with', 'for', 'in', 'on', 'at', 'to', 'from'];
    const words = text.toLowerCase().split(' ');
    
    // Too short or too long
    if (text.length < 3 || text.length > 40) return false;
    
    // All common words
    if (words.every(word => nonTitles.includes(word))) return false;
    
    // Contains numbers (likely not a title)
    if (/^\d+$/.test(text.trim())) return false;
    
    // Looks like a sentence (has too many common words)
    const commonWordCount = words.filter(word => nonTitles.includes(word)).length;
    if (commonWordCount > words.length / 2) return false;
    
    return true;
  }

  /**
   * NEW: Guess medium type from title
   */
  guessMedium(title) {
    const titleLower = title.toLowerCase();
    
    // TV indicators
    if (titleLower.includes('series') || titleLower.includes('show') || titleLower.includes('season')) {
      return 'live_action_tv';
    }
    
    // Animation indicators
    if (titleLower.includes('cartoon') || titleLower.includes('animated') || titleLower.includes('anime')) {
      return 'voice_cartoon';
    }
    
    // Default to movie
    return 'live_action_movie';
  }

  /**
   * NEW: Extract year from text
   */
  extractYear(text) {
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? yearMatch[0] : null;
  }

  /**
   * NEW: Clean extracted titles
   */
  cleanTitle(title) {
    return title
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, ' ') // Clean spaces
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Parse JSON response with error handling
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
        console.log(`JSON parsing failed: ${response.substring(0, 100)}...`);
        return [];
      }
    }
  }

  /**
   * Generate red flag report
   */
  generateRedFlagReport(redFlagResult) {
    const report = {
      timestamp: new Date().toISOString(),
      celebrity: redFlagResult.celebrityName,
      redFlagsDetected: redFlagResult.hasRedFlags,
      emergencyTriggered: redFlagResult.triggerEmergency,
      analysis: redFlagResult.analysis,
      flags: redFlagResult.redFlags,
      recommendations: []
    };

    // Generate recommendations
    if (redFlagResult.hasRedFlags) {
      report.recommendations.push('AI role discovery is unreliable for this celebrity');
      
      if (redFlagResult.triggerEmergency) {
        report.recommendations.push('Emergency web search recommended');
        report.recommendations.push('Consider manual research for this celebrity');
      }
      
      redFlagResult.redFlags.forEach(flag => {
        switch (flag.type) {
          case 'AI_HALLUCINATION':
            report.recommendations.push('AI is inventing character names - switch to web-first approach');
            break;
          case 'FAKE_TITLES':
            report.recommendations.push('AI is inventing show/movie titles - verify all roles');
            break;
          case 'LOW_SUCCESS_RATE':
            report.recommendations.push('Very low success rate - celebrity may be lesser-known');
            break;
          case 'REPEATED_FAKE_TITLES':
            report.recommendations.push('AI is recycling fake titles - complete discovery failure');
            break;
        }
      });
    }

    return report;
  }
}

module.exports = RedFlagRoleDetector;
