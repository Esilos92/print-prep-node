const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../utils/config');
const logger = require('../utils/logger');

class RoleFetcher {
  
  /**
   * Fetch top 5 iconic roles for a celebrity with franchise diversification
   */
  static async fetchRoles(celebrityName) {
    try {
      logger.info(`Fetching roles for: ${celebrityName}`);
      
      // Get Wikipedia "best known for" information first
      const knownForTitles = await this.getKnownForTitles(celebrityName);
      logger.info(`Wikipedia "known for": ${knownForTitles.join(', ') || 'None found'}`);
      
      // Get more roles from TMDb for franchise detection (up to 20)
      let allRoles = await this.fetchFromTMDb(celebrityName, knownForTitles, 20);
      
      if (allRoles.length === 0) {
        logger.warn('TMDb returned no results, trying Wikipedia');
        allRoles = await this.fetchFromWikipedia(celebrityName);
        return allRoles.slice(0, 5);
      }
      
      // Apply franchise diversification
      const diversifiedRoles = this.diversifyByFranchise(allRoles);
      
      return diversifiedRoles.slice(0, 5); // Top 5 diversified roles
      
    } catch (error) {
      logger.error('Error fetching roles:', error.message);
      // Return fallback generic roles
      return this.getFallbackRoles(celebrityName);
    }
  }
  
  /**
   * Enhanced talk show and guest appearance detection
   */
  static isTalkShowOrGuestAppearance(title, character) {
    if (!title) return false;
    
    const titleLower = title.toLowerCase();
    const characterLower = (character || '').toLowerCase();
    
    // Talk show title patterns - be specific to avoid false positives
    const talkShowPatterns = [
      // Late night shows
      'tonight show', 'late show', 'late late show', 'late night',
      'jimmy fallon', 'jimmy kimmel', 'stephen colbert', 'craig ferguson',
      'conan', 'seth meyers', 'james corden',
      
      // Daytime shows
      'kelly clarkson show', 'ellen degeneres show', 'the ellen show',
      'oprah winfrey show', 'the view', 'the talk', 'live with kelly',
      'good morning america', 'today show', 'this morning',
      
      // Comedy/variety shows  
      'saturday night live', 'snl', 'daily show', 'real time with bill maher',
      'comedy central presents', 'last week tonight',
      
      // Award shows (but be careful - some actors host legitimately)
      'academy awards', 'golden globe awards', 'emmy awards', 'tony awards',
      'peoples choice awards', 'critics choice awards', 'sag awards',
      
      // Game shows
      'jeopardy!', 'wheel of fortune', 'family feud', 'celebrity family feud',
      'hollywood squares', 'match game',
      
      // News/interview shows  
      'anderson cooper', '60 minutes', 'dateline', '20/20'
    ];
    
    // Check if title matches talk show patterns
    const isTalkShowTitle = talkShowPatterns.some(pattern => titleLower.includes(pattern));
    
    // Guest character patterns - these indicate guest appearances
    const guestCharacters = [
      'self', 'himself', 'herself', 'guest', 'host', 'presenter', 
      'interviewee', 'panelist', 'contestant', 'themselves'
    ];
    
    // Check for exact guest character matches
    const isGuestCharacter = guestCharacters.some(guestType => {
      return characterLower === guestType || 
             characterLower === `self - ${guestType}` ||
             characterLower.includes(`(${guestType})`) ||
             characterLower.startsWith(guestType + ' ') ||
             characterLower.endsWith(' ' + guestType);
    });
    
    // Additional red flags for guest appearances
    const hasGuestIndicators = titleLower.includes('celebrity') && 
                              (titleLower.includes('special') || titleLower.includes('edition'));
    
    // White list check - make sure we don't filter actual acting roles
    const isLikelyActingRole = this.isLikelyActingRole(title, character);
    
    // Final determination
    const isFiltered = (isTalkShowTitle || isGuestCharacter || hasGuestIndicators) && !isLikelyActingRole;
    
    if (isFiltered) {
      logger.info(`🚫 Filtered talk show/guest: "${title}" (${character})`);
    }
    
    return isFiltered;
  }
  
  /**
   * Check if this is likely a legitimate acting role vs guest appearance
   */
  static isLikelyActingRole(title, character) {
    if (!title || !character) return false;
    
    const titleLower = title.toLowerCase();
    const characterLower = character.toLowerCase();
    
    // Legitimate acting roles usually have:
    // 1. Character names that aren't "self" variants
    const hasRealCharacterName = !characterLower.includes('self') && 
                                !characterLower.includes('himself') &&
                                !characterLower.includes('herself') &&
                                characterLower !== 'guest' &&
                                characterLower !== 'host';
    
    // 2. Title doesn't look like a talk show format
    const isNotTalkShowFormat = !titleLower.match(/\b(show|live|tonight|morning|today)\b/) ||
                               titleLower.includes('movie') ||
                               titleLower.includes('film') ||
                               titleLower.includes('series');
    
    // 3. Character has substance (not just single words)
    const hasSubstantialCharacter = character && character.length > 3 && 
                                  character.includes(' ') && // Multi-word character names
                                  !character.toLowerCase().includes('unknown');
    
    return hasRealCharacterName && (isNotTalkShowFormat || hasSubstantialCharacter);
  }
  
  /**
   * Diversify roles by detecting and limiting franchise dominance
   * FIXED VERSION - Properly handles franchise vs standalone detection
   */
  static diversifyByFranchise(roles) {
    logger.info('🎯 Applying franchise diversification...');
    
    // Step 1: Detect franchises automatically
    const franchises = this.detectFranchises(roles);
    
    // Step 2: Create a set of all franchise names for filtering
    const franchiseNames = new Set(franchises.map(f => f.name));
    
    // Step 3: Select best roles from each franchise + standalone roles
    const selectedRoles = [];
    const usedRoleIds = new Set();
    
    // Add franchise roles (max 2 per franchise)
    franchises.forEach(franchise => {
      const maxFromFranchise = franchise.roles.length >= 5 ? 2 : 1; // Big franchises get 2 slots
      const selectedFromFranchise = franchise.roles.slice(0, maxFromFranchise);
      
      logger.info(`📁 ${franchise.name} franchise: Taking ${selectedFromFranchise.length}/${franchise.roles.length} roles`);
      
      selectedFromFranchise.forEach(role => {
        // Set the franchise name properly
        role.franchiseName = franchise.name;
        selectedRoles.push(role);
        usedRoleIds.add(role.name);
      });
    });
    
    // Add TRUE standalone roles (not part of any detected franchise)
    const standaloneRoles = roles.filter(role => {
      // Skip if already used
      if (usedRoleIds.has(role.name)) return false;
      
      // Check if this role belongs to any detected franchise
      const roleFranchise = this.extractBaseFranchiseName(role.name);
      const belongsToFranchise = franchiseNames.has(roleFranchise);
      
      return !belongsToFranchise;
    });
    
    // Add standalone roles to selection
    standaloneRoles.forEach(role => {
      role.franchiseName = null; // Mark as truly standalone
      selectedRoles.push(role);
    });
    
    // Sort by priority: Known for first, then by vote count
    const finalRoles = selectedRoles.sort((a, b) => {
      if (a.isKnownFor && !b.isKnownFor) return -1;
      if (!a.isKnownFor && b.isKnownFor) return 1;
      return b.vote_count - a.vote_count;
    });
    
    logger.info('🎬 Final diversified selection:');
    finalRoles.slice(0, 5).forEach((role, i) => {
      const knownForMarker = role.isKnownFor ? ' ⭐ KNOWN FOR' : '';
      const franchiseInfo = role.franchiseName ? ` [${role.franchiseName} franchise]` : ' [standalone]';
      logger.info(`  ${i + 1}. ${role.name}${franchiseInfo}${knownForMarker}`);
    });
    
    return finalRoles;
  }
  
  /**
   * Automatically detect franchises by grouping similar titles
   */
  static detectFranchises(roles) {
    const groups = {};
    
    // Group roles by base title
    roles.forEach(role => {
      const baseTitle = this.extractBaseFranchiseName(role.name);
      
      if (!groups[baseTitle]) {
        groups[baseTitle] = [];
      }
      
      groups[baseTitle].push({
        ...role,
        franchiseName: baseTitle
      });
    });
    
    // Identify franchises (3+ related titles)
    const franchises = Object.entries(groups)
      .filter(([name, roleGroup]) => roleGroup.length >= 3)
      .map(([name, roleGroup]) => ({
        name: name,
        roles: roleGroup.sort((a, b) => {
          // Sort by known-for first, then vote count
          if (a.isKnownFor && !b.isKnownFor) return -1;
          if (!a.isKnownFor && b.isKnownFor) return 1;
          return b.vote_count - a.vote_count;
        })
      }));
    
    if (franchises.length > 0) {
      logger.info('🔍 Detected franchises:');
      franchises.forEach(franchise => {
        logger.info(`  📁 ${franchise.name}: ${franchise.roles.length} titles`);
      });
    }
    
    return franchises;
  }
  
  /**
   * Extract base franchise name from a title
   */
  static extractBaseFranchiseName(title) {
    if (!title) return 'unknown';
    
    const titleLower = title.toLowerCase();
    
    // Handle special cases first for better grouping
    const specialCases = {
      'star trek': 'star trek',          // All Star Trek movies/shows
      'captain america': 'marvel',
      'iron man': 'marvel', 
      'thor': 'marvel',
      'avengers': 'marvel',
      'spider-man': 'marvel',
      'x-men': 'marvel',
      'guardians of the galaxy': 'marvel',
      'doctor strange': 'marvel',
      'black panther': 'marvel',
      'ant-man': 'marvel',
      
      'star wars': 'star wars',
      'empire strikes back': 'star wars',
      'return of the jedi': 'star wars',
      'phantom menace': 'star wars',
      'attack of the clones': 'star wars',
      'revenge of the sith': 'star wars',
      
      'fast & furious': 'fast furious',
      'fast five': 'fast furious',
      '2 fast 2 furious': 'fast furious',
      'furious': 'fast furious',
      
      'harry potter': 'harry potter',
      'fantastic beasts': 'harry potter'
    };
    
    // Check for special case matches FIRST
    for (const [pattern, franchise] of Object.entries(specialCases)) {
      if (titleLower.includes(pattern)) {
        return franchise;
      }
    }
    
    // If no special case, clean up the title and extract base name
    let baseName = titleLower
      // Remove roman numerals and numbers (II, III, IV, 2, 3, etc.)
      .replace(/\s+(ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, '')
      .replace(/\s+\d+\b/g, '')
      // Remove subtitle after colon or dash
      .split(/[:\-]/)[0]
      // Remove common subtitle indicators
      .replace(/\s+(the|a|an)\s+/g, ' ')
      .replace(/\s+(part|episode|chapter)\s*\d*/g, '')
      .trim();
    
    // Default: use the cleaned base name
    return baseName || 'unknown';
  }
  
  /**
   * Extract "best known for" titles from Wikipedia
   */
  static async getKnownForTitles(celebrityName) {
    try {
      const wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(celebrityName.replace(/\s+/g, '_'))}`;
      const response = await axios.get(wikipediaUrl, { timeout: 10000 });
      const $ = cheerio.load(response.data);
      
      // Get the first few paragraphs of the article
      let articleText = '';
      $('p').slice(0, 3).each((i, p) => {
        const text = $(p).text().trim();
        if (text.length > 0) {
          articleText += text + ' ';
        }
      });
      
      const knownForTitles = [];
      
      // Simpler, more flexible patterns
      const patterns = [
        // "best known for his portrayal of Character in Title"
        /(?:best known for|known for|famous for).*?(?:portrayal|role|playing).*?of\s+([^,.\n]+?)\s+in\s+(?:the\s+)?([^,.\n]+)/gi,
        // "best known for playing Character"  
        /(?:best known for|known for|famous for).*?(?:playing|portraying)\s+([^,.\n]+)/gi,
        // "best known for Title" or mentions of franchises
        /(?:best known for|known for|famous for).*?(?:his|her|their).*?([A-Z][^,.\n]*(?:franchise|series|trilogy|saga))/gi,
        // Direct title mentions after "known for"
        /(?:best known for|known for|famous for)[^.]*?([A-Z][a-zA-Z\s:'-]{3,25}?)(?:\s+franchise|\s+series|\s*,|\s*\(|\.|$)/gi
      ];
      
      for (const pattern of patterns) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(articleText)) !== null) {
          // Get all capture groups
          for (let i = 1; i < match.length; i++) {
            if (match[i]) {
              const knownForText = match[i].trim();
              
              // Extract titles from the "known for" text
              const extractedTitles = this.extractTitlesFromText(knownForText);
              knownForTitles.push(...extractedTitles);
              
              // Also add the raw text as a potential title
              if (this.isValidTitle(knownForText)) {
                knownForTitles.push(knownForText);
              }
            }
          }
        }
      }
      
      // Remove duplicates and clean up
      return [...new Set(knownForTitles)]
        .filter(title => title.length > 2 && title.length < 50)
        .slice(0, 5); // Top 5 most mentioned
      
    } catch (error) {
      logger.warn('Could not parse Wikipedia for known-for titles:', error.message);
      return [];
    }
  }
  
  /**
   * Extract title names from "known for" text
   */
  static extractTitlesFromText(text) {
    const titles = [];
    
    // Handle specific patterns we know work for common cases
    if (text.toLowerCase().includes('star trek')) {
      titles.push('Star Trek');
    }
    
    // Look for patterns like "Character in Title" or "Title"
    const titlePatterns = [
      // "James T. Kirk in the Star Trek franchise" -> "Star Trek"
      /\bin\s+(?:the\s+)?([A-Z][^,.\n]*?)(?:\s+franchise|\s+series|\s*,|\.|$)/gi,
      // General title extraction
      /\b([A-Z][a-zA-Z\s:'-]{2,25}?)(?:\s+franchise|\s+series|\s+and|\s*,|\.|$)/gi
    ];
    
    for (const pattern of titlePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let title = match[1].trim();
        
        // Clean up the extracted title
        title = title.replace(/^(the|a|an)\s+/i, '');
        title = title.replace(/\s+(and|or|,).*$/i, '');
        title = title.trim();
        
        // Filter out obvious non-titles
        if (this.isValidTitle(title)) {
          titles.push(title);
        }
      }
    }
    
    return titles;
  }
  
  /**
   * Check if extracted text is likely a valid title
   */
  static isValidTitle(title) {
    if (!title || title.length < 3) return false;
    
    // Filter out common non-title words (but be careful with partial matches)
    const excludeWords = [
      'actor', 'actress', 'director', 'producer', 'writer', 'comedian', 'singer',
      'musician', 'artist', 'celebrity', 'performer', 'character',
      'role', 'roles', 'performance', 'performances', 'portrayal', 'work',
      'career', 'american', 'british', 'canadian', 'english', 'film', 'movie',
      'television', 'tv', 'show', 'series', 'franchise'
    ];
    
    const titleLower = title.toLowerCase();
    
    // Only filter if the title is EXACTLY one of these words, or ends with " [word]"
    // This protects "Star Trek" and "Star Wars" which START with "star"
    return !excludeWords.some(word => {
      return titleLower === word || 
             (titleLower.endsWith(' ' + word) && titleLower !== 'star trek' && titleLower !== 'star wars');
    });
  }
  
  /**
   * Fetch roles from TMDb API with Wikipedia prioritization
   */
  static async fetchFromTMDb(celebrityName, knownForTitles = [], maxResults = 5) {
    if (!config.api.tmdbKey) {
      logger.warn('TMDb API key not configured');
      return [];
    }
    
    try {
      // Search for person
      const searchUrl = `https://api.themoviedb.org/3/search/person?api_key=${config.api.tmdbKey}&query=${encodeURIComponent(celebrityName)}`;
      const searchResponse = await axios.get(searchUrl);
      
      if (searchResponse.data.results.length === 0) {
        return [];
      }
      
      const personId = searchResponse.data.results[0].id;
      
      // Get person's COMBINED credits (both movies and TV)
      const creditsUrl = `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${config.api.tmdbKey}`;
      const creditsResponse = await axios.get(creditsUrl);
      
      const allCredits = creditsResponse.data.cast || [];
      
      // Process and sort all credits (movies and TV)
      const roles = allCredits
        .filter(credit => {
          const title = credit.title || credit.name || '';
          const character = credit.character || '';
          
          // Enhanced talk show and guest appearance filtering
          const isTalkShow = this.isTalkShowOrGuestAppearance(title, character);
          
          // Keep substantial acting roles with good vote counts
          const hasTitle = title.length > 0;
          const hasVotes = credit.vote_count && credit.vote_count > 50;
          const isActingRole = character && character !== 'Self' && !character.includes('Unknown');
          
          return hasTitle && !isTalkShow && (hasVotes || isActingRole);
        })
        .map(credit => {
          // Normalize the data structure for both movies and TV
          const isMovie = credit.media_type === 'movie';
          const title = isMovie ? credit.title : credit.name;
          const releaseDate = isMovie ? credit.release_date : credit.first_air_date;
          
          // Check if this title matches Wikipedia "known for"
          const isKnownFor = this.matchesKnownForTitles(title, knownForTitles);
          
          return {
            name: title,
            character: credit.character || 'Unknown role',
            year: releaseDate ? new Date(releaseDate).getFullYear() : null,
            media_type: credit.media_type,
            popularity: credit.popularity || 0,
            vote_count: credit.vote_count || 0,
            isKnownFor: isKnownFor,
            tags: [credit.media_type, 'tmdb'],
            searchTerms: [title, credit.character, celebrityName].filter(Boolean)
          };
        })
        .sort((a, b) => {
          // Sort by vote count primarily (for initial franchise detection)
          return b.vote_count - a.vote_count;
        });
      
      logger.info(`Found ${roles.length} total roles from TMDb, analyzing top ${Math.min(maxResults, roles.length)}...`);
      
      return roles.slice(0, maxResults);
      
    } catch (error) {
      logger.error('TMDb API error:', error.message);
      return [];
    }
  }
  
  /**
   * Check if a TMDb title matches any Wikipedia "known for" titles
   */
  static matchesKnownForTitles(tmdbTitle, knownForTitles) {
    if (!tmdbTitle || knownForTitles.length === 0) return false;
    
    const tmdbLower = tmdbTitle.toLowerCase();
    
    return knownForTitles.some(knownTitle => {
      const knownLower = knownTitle.toLowerCase();
      
      // Exact match
      if (tmdbLower === knownLower) return true;
      
      // Partial match (handles "Star Trek" matching "Star Trek II")
      if (tmdbLower.includes(knownLower) || knownLower.includes(tmdbLower)) return true;
      
      // Handle variations like "Star Trek" vs "Star Trek: The Original Series"
      const tmdbWords = tmdbLower.split(/\s+/);
      const knownWords = knownLower.split(/\s+/);
      
      // If most words match, consider it a match
      const commonWords = tmdbWords.filter(word => knownWords.includes(word));
      return commonWords.length >= Math.min(tmdbWords.length, knownWords.length) * 0.6;
    });
  }
  
  /**
   * Fetch roles from Wikipedia (fallback)
   */
  static async fetchFromWikipedia(celebrityName) {
    try {
      const searchUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(celebrityName.replace(/\s+/g, '_'))}`;
      const response = await axios.get(searchUrl);
      const $ = cheerio.load(response.data);
      
      const roles = [];
      
      // Look for filmography tables or notable works
      $('table.wikitable').each((i, table) => {
        const tableText = $(table).text().toLowerCase();
        if (tableText.includes('film') || tableText.includes('television') || tableText.includes('role')) {
          $(table).find('tr').slice(1, 6).each((j, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 2) {
              const title = $(cells[0]).text().trim() || $(cells[1]).text().trim();
              if (title && title.length > 2) {
                roles.push({
                  name: title,
                  character: null,
                  year: null,
                  tags: ['wikipedia'],
                  searchTerms: [title, celebrityName]
                });
              }
            }
          });
        }
      });
      
      logger.info(`Found ${roles.length} roles from Wikipedia`);
      return roles.slice(0, 5);
      
    } catch (error) {
      logger.error('Wikipedia scraping error:', error.message);
      return [];
    }
  }
  
  /**
   * Generate fallback roles when APIs fail
   */
  static getFallbackRoles(celebrityName) {
    logger.warn('Using fallback generic roles');
    return [
      {
        name: `${celebrityName} - Professional Photos`,
        character: null,
        year: null,
        tags: ['fallback', 'professional'],
        searchTerms: [celebrityName, 'professional photos', 'headshots']
      },
      {
        name: `${celebrityName} - Red Carpet`,
        character: null,
        year: null,
        tags: ['fallback', 'events'],
        searchTerms: [celebrityName, 'red carpet', 'premiere']
      },
      {
        name: `${celebrityName} - Portrait`,
        character: null,
        year: null,
        tags: ['fallback', 'portrait'],
        searchTerms: [celebrityName, 'portrait', 'photo shoot']
      }
    ];
  }
}

module.exports = { fetchRoles: RoleFetcher.fetchRoles.bind(RoleFetcher) };
