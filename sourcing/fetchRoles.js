const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../utils/config');
const logger = require('../utils/logger');

class RoleFetcher {
  
  /**
   * Fetch top 5 iconic roles for a celebrity
   */
  static async fetchRoles(celebrityName) {
    try {
      logger.info(`Fetching roles for: ${celebrityName}`);
      
      // Get Wikipedia "best known for" information first
      const knownForTitles = await this.getKnownForTitles(celebrityName);
      logger.info(`Wikipedia "known for": ${knownForTitles.join(', ') || 'None found'}`);
      
      // Try TMDb first, fallback to Wikipedia
      let roles = await this.fetchFromTMDb(celebrityName, knownForTitles);
      
      if (roles.length === 0) {
        logger.warn('TMDb returned no results, trying Wikipedia');
        roles = await this.fetchFromWikipedia(celebrityName);
      }
      
      return roles.slice(0, 5); // Top 5 roles
      
    } catch (error) {
      logger.error('Error fetching roles:', error.message);
      // Return fallback generic roles
      return this.getFallbackRoles(celebrityName);
    }
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
    
    // Handle specific patterns we know work for William Shatner's case
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
    
    // Filter out common non-title words
    const excludeWords = [
      'actor', 'actress', 'director', 'producer', 'writer', 'comedian', 'singer',
      'musician', 'artist', 'star', 'celebrity', 'performer', 'character',
      'role', 'roles', 'performance', 'performances', 'portrayal', 'work',
      'career', 'american', 'british', 'canadian', 'english', 'film', 'movie',
      'television', 'tv', 'show', 'series', 'franchise'
    ];
    
    const titleLower = title.toLowerCase();
    return !excludeWords.some(word => titleLower === word || titleLower.endsWith(' ' + word));
  }
  
  /**
   * Fetch roles from TMDb API with Wikipedia prioritization
   */
  static async fetchFromTMDb(celebrityName, knownForTitles = []) {
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
          
          // Filter OUT talk shows and guest appearances
          const isTalkShow = title.toLowerCase().includes('tonight show') ||
                           title.toLowerCase().includes('late show') ||
                           title.toLowerCase().includes('late late show') ||
                           title.toLowerCase().includes('colbert') ||
                           title.toLowerCase().includes('ferguson') ||
                           title.toLowerCase().includes('kelly clarkson') ||
                           character.toLowerCase().includes('self') ||
                           character.toLowerCase().includes('guest');
          
          // Keep substantial acting roles with good vote counts
          const hasTitle = title.length > 0;
          const hasVotes = credit.vote_count && credit.vote_count > 50; // Lower threshold
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
          // Prioritize Wikipedia "known for" titles
          if (a.isKnownFor && !b.isKnownFor) return -1;
          if (!a.isKnownFor && b.isKnownFor) return 1;
          
          // Then sort by VOTE COUNT first (long-term popularity), then by popularity
          if (b.vote_count !== a.vote_count) {
            return b.vote_count - a.vote_count;
          }
          return b.popularity - a.popularity;
        })
        .slice(0, 5);
      
      logger.info(`Found ${roles.length} roles from TMDb`);
      roles.forEach(role => {
        const knownForMarker = role.isKnownFor ? ' ⭐ KNOWN FOR' : '';
        logger.info(`- ${role.name} (${role.media_type}) - ${role.character} [Votes: ${role.vote_count}, Pop: ${role.popularity.toFixed(1)}]${knownForMarker}`);
      });
      
      return roles;
      
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
