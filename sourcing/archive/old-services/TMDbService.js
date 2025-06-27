const axios = require('axios');
const VoiceActorUtils = require('./VoiceActorUtils');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

class TMDbService {

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
        logger.warn('❌ TMDb found no person matches');
        return [];
      }
      
      const personId = searchResponse.data.results[0].id;
      
      // Get person's COMBINED credits (both movies and TV)
      const creditsUrl = `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${config.api.tmdbKey}`;
      const creditsResponse = await axios.get(creditsUrl);
      
      const allCredits = creditsResponse.data.cast || [];
      
      if (allCredits.length === 0) {
        logger.warn('❌ TMDb found person but no credits');
        return [];
      }
      
      // Process and sort all credits (movies and TV)
      const roles = allCredits
        .filter(credit => {
          const title = credit.title || credit.name || '';
          const character = credit.character || '';
          
          // Enhanced talk show and guest appearance filtering
          const isTalkShow = VoiceActorUtils.isTalkShowOrGuestAppearance(title, character);
          
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
          
          // Enhanced voice role detection
          const isVoiceRole = VoiceActorUtils.detectVoiceRole(title, celebrityName);
          
          return {
            name: title,
            character: credit.character || 'Unknown role',
            year: releaseDate ? new Date(releaseDate).getFullYear() : null,
            media_type: credit.media_type,
            popularity: credit.popularity || 0,
            vote_count: credit.vote_count || 0,
            isKnownFor: isKnownFor,
            isVoiceRole: isVoiceRole,
            characterName: isVoiceRole ? credit.character : null,
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
   * CRITICAL FIX: Validate TMDb results against Wikipedia to catch wrong person
   */
  static validateTMDbAgainstWikipedia(tmdbRoles, knownForTitles) {
    if (knownForTitles.length === 0) {
      return true; // No Wikipedia data to validate against
    }
    
    // Check if ANY TMDb role matches ANY Wikipedia known-for title
    const hasMatch = tmdbRoles.some(tmdbRole => {
      return knownForTitles.some(knownTitle => {
        return this.matchesKnownForTitles(tmdbRole.name, [knownTitle]);
      });
    });
    
    // Also check for partial matches on character names for voice actors
    const hasCharacterMatch = tmdbRoles.some(tmdbRole => {
      if (!tmdbRole.character || tmdbRole.character === 'Unknown role') return false;
      
      return knownForTitles.some(knownTitle => {
        const titleLower = knownTitle.toLowerCase();
        const characterLower = tmdbRole.character.toLowerCase();
        
        // Check if character name appears in known title
        return titleLower.includes(characterLower) || characterLower.includes(titleLower);
      });
    });
    
    const isValid = hasMatch || hasCharacterMatch;
    
    if (!isValid) {
      logger.info('🔍 TMDb validation failed:');
      logger.info(`  TMDb roles: ${tmdbRoles.slice(0, 3).map(r => `${r.name} (${r.character})`).join(', ')}`);
      logger.info(`  Wikipedia known for: ${knownForTitles.join(', ')}`);
      logger.info('  No matches found - likely wrong person with same name');
    }
    
    return isValid;
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
   * Get detailed person information from TMDb
   */
  static async getPersonDetails(celebrityName) {
    if (!config.api.tmdbKey) {
      logger.warn('TMDb API key not configured');
      return null;
    }

    try {
      // Search for person
      const searchUrl = `https://api.themoviedb.org/3/search/person?api_key=${config.api.tmdbKey}&query=${encodeURIComponent(celebrityName)}`;
      const searchResponse = await axios.get(searchUrl);
      
      if (searchResponse.data.results.length === 0) {
        return null;
      }
      
      const personId = searchResponse.data.results[0].id;
      
      // Get detailed person info
      const detailsUrl = `https://api.themoviedb.org/3/person/${personId}?api_key=${config.api.tmdbKey}`;
      const detailsResponse = await axios.get(detailsUrl);
      
      return detailsResponse.data;
      
    } catch (error) {
      logger.warn(`Failed to get person details for ${celebrityName}:`, error.message);
      return null;
    }
  }

  /**
   * Validate that TMDb person matches expected celebrity
   */
  static validatePersonMatch(tmdbPerson, expectedName, knownForTitles = []) {
    if (!tmdbPerson) return false;
    
    const tmdbName = tmdbPerson.name?.toLowerCase() || '';
    const expectedNameLower = expectedName.toLowerCase();
    
    // Check name similarity
    const nameMatch = tmdbName.includes(expectedNameLower) || expectedNameLower.includes(tmdbName);
    
    if (!nameMatch) {
      logger.warn(`Name mismatch: TMDb="${tmdbPerson.name}" vs Expected="${expectedName}"`);
      return false;
    }
    
    // If we have known titles, validate against biography or known_for
    if (knownForTitles.length > 0) {
      const biography = (tmdbPerson.biography || '').toLowerCase();
      const knownFor = (tmdbPerson.known_for_department || '').toLowerCase();
      
      const hasKnownTitleInBio = knownForTitles.some(title => 
        biography.includes(title.toLowerCase())
      );
      
      if (!hasKnownTitleInBio && knownFor !== 'acting') {
        logger.warn(`Biography validation failed for ${expectedName}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get person's known roles from TMDb's known_for field
   */
  static extractKnownForFromTMDb(tmdbPerson) {
    if (!tmdbPerson?.known_for) return [];
    
    return tmdbPerson.known_for.map(item => ({
      name: item.title || item.name || '',
      media_type: item.media_type,
      year: item.release_date ? new Date(item.release_date).getFullYear() : null,
      popularity: item.popularity || 0
    })).filter(role => role.name.length > 0);
  }

  /**
   * Enhanced filtering for TMDb results
   */
  static filterTMDbResults(credits, celebrityName) {
    return credits.filter(credit => {
      const title = credit.title || credit.name || '';
      const character = credit.character || '';
      
      // Filter documentaries about the person
      if (title.toLowerCase().includes(celebrityName.toLowerCase()) && 
          (title.toLowerCase().includes('documentary') || 
           title.toLowerCase().includes('biography'))) {
        return false;
      }
      
      // Filter obvious non-acting roles
      const nonActingRoles = [
        'himself', 'herself', 'narrator', 'host', 'presenter',
        'archive footage', 'thanks', 'special thanks'
      ];
      
      if (nonActingRoles.some(role => character.toLowerCase().includes(role))) {
        return false;
      }
      
      // Keep roles with good metadata
      return title.length > 0 && (credit.vote_count > 10 || credit.popularity > 1);
    });
  }
}

module.exports = TMDbService;
