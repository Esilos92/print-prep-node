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
      
      // Try TMDb first, fallback to Wikipedia
      let roles = await this.fetchFromTMDb(celebrityName);
      
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
   * Fetch roles from TMDb API
   */
  static async fetchFromTMDb(celebrityName) {
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
          const hasVotes = credit.vote_count && credit.vote_count > 100;
          const isActingRole = character && character !== 'Self' && !character.includes('Unknown');
          
          return hasTitle && !isTalkShow && (hasVotes || isActingRole);
        })
        .map(credit => {
          // Normalize the data structure for both movies and TV
          const isMovie = credit.media_type === 'movie';
          const title = isMovie ? credit.title : credit.name;
          const releaseDate = isMovie ? credit.release_date : credit.first_air_date;
          
          return {
            name: title,
            character: credit.character || 'Unknown role',
            year: releaseDate ? new Date(releaseDate).getFullYear() : null,
            media_type: credit.media_type,
            popularity: credit.popularity || 0,
            vote_count: credit.vote_count || 0,
            tags: [credit.media_type, 'tmdb'],
            searchTerms: [title, credit.character, celebrityName].filter(Boolean)
          };
        })
        .sort((a, b) => {
          // Sort by VOTE COUNT first (long-term popularity), then by popularity
          if (b.vote_count !== a.vote_count) {
            return b.vote_count - a.vote_count;
          }
          return b.popularity - a.popularity;
        })
        .slice(0, 5);
      
      logger.info(`Found ${roles.length} roles from TMDb`);
      roles.forEach(role => {
        logger.info(`- ${role.name} (${role.media_type}) - ${role.character} [Votes: ${role.vote_count}, Pop: ${role.popularity.toFixed(1)}]`);
      });
      
      return roles;
      
    } catch (error) {
      logger.error('TMDb API error:', error.message);
      return [];
    }
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
