const axios = require('axios');
const TitleValidation = require('./TitleValidation');
const CharacterExtraction = require('./CharacterExtraction');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

class GoogleVerificationService {

  /**
   * ENHANCED CHARACTER-SPECIFIC VERIFICATION: Find actual characters in each project
   */
  static async googleVerifyRole(celebrityName, roleName) {
    try {
      logger.info(`🔍 Character discovery for ${celebrityName} in ${roleName}...`);
      
      // Multiple targeted searches for character discovery
      const characterQueries = [
        `"${celebrityName}" "${roleName}" character voices plays as`,
        `"${celebrityName}" voice cast "${roleName}" character name`,
        `"${roleName}" voice actors "${celebrityName}" plays character`,
        `"${celebrityName}" "${roleName}" voice behind scenes character`
      ];

      let discoveredCharacters = [];
      let hasStrongEvidence = false;

      for (const query of characterQueries) {
        try {
          const params = {
            api_key: config.api.serpApiKey,
            engine: 'google',
            q: query,
            num: 8
          };

          const response = await axios.get(config.api.serpEndpoint, { 
            params,
            timeout: 10000
          });

          if (response.data?.organic_results) {
            const results = response.data.organic_results;
            
            for (const result of results) {
              const title = (result.title || '').toLowerCase();
              const snippet = (result.snippet || '').toLowerCase();
              const combined = title + ' ' + snippet;
              
              const hasActor = combined.includes(celebrityName.toLowerCase());
              const hasRole = combined.includes(roleName.toLowerCase());
              
              if (!hasActor || !hasRole) continue;

              // Look for STRONG role evidence
              const strongRoleIndicators = [
                'voice of', 'voices', 'plays', 'character', 'role of', 'cast as',
                'portrays', 'stars as', 'voice cast', 'voice actor', 'recurring character'
              ];
              
              if (strongRoleIndicators.some(indicator => combined.includes(indicator))) {
                hasStrongEvidence = true;
                
                // Extract character names using enhanced patterns
                const characters = CharacterExtraction.extractCharacterFromSnippet(combined, celebrityName, roleName);
                if (characters.length > 0) {
                  discoveredCharacters.push(...characters);
                }
              }
            }
          }
          
          // Small delay between character searches
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (error) {
          logger.warn(`Character search failed for query: ${query}`);
        }
        
        // Stop early if we found good characters
        if (discoveredCharacters.length >= 3) break;
      }

      // Deduplicate and clean characters
      const uniqueCharacters = [...new Set(discoveredCharacters)]
        .filter(char => char && char.length > 1 && char.length < 30)
        .slice(0, 3); // Top 3 characters

      if (hasStrongEvidence && uniqueCharacters.length > 0) {
        const mainCharacter = uniqueCharacters[0]; // Use primary character
        logger.info(`✅ VERIFIED: ${roleName} → ${mainCharacter} (+ ${uniqueCharacters.length - 1} others)`);
        return {
          isVerified: true,
          character: mainCharacter,
          allCharacters: uniqueCharacters
        };
      } else if (hasStrongEvidence) {
        logger.info(`✅ VERIFIED: ${roleName} (role confirmed, no specific character found)`);
        return {
          isVerified: true,
          character: null,
          allCharacters: []
        };
      } else {
        logger.info(`❌ REJECTED: ${roleName} (no strong role evidence)`);
        return {
          isVerified: false,
          character: null,
          allCharacters: []
        };
      }
      
    } catch (error) {
      logger.warn(`Character verification failed for "${roleName}": ${error.message}`);
      return { isVerified: false, character: null, allCharacters: [] };
    }
  }

  /**
   * OPTIMIZED HAIL MARY: Reduced from 8 to 3 API calls
   * OLD: 8 queries = 8 API calls
   * NEW: 3 queries + early stop = 3 API calls (62.5% reduction)
   */
  static async googleHailMarySearch(celebrityName) {
    try {
      logger.info('🎯 Executing OPTIMIZED Hail Mary search...');
      
      // REDUCED: Only 3 high-value queries (was 8)
      const hailMaryQueries = [
        `"${celebrityName}" voice actor animated shows characters`,
        `"${celebrityName}" voice acting credits television animation`,
        `site:behindthevoiceactors.com "${celebrityName}"`
      ];

      const extractedRoles = [];
      
      for (const query of hailMaryQueries) {
        try {
          logger.info(`🔍 Hail Mary query: ${query}`);
          
          const params = {
            api_key: config.api.serpApiKey,
            engine: 'google',
            q: query,
            num: 15 // More results per query to compensate for fewer queries
          };

          const response = await axios.get(config.api.serpEndpoint, { 
            params,
            timeout: 15000
          });

          if (response.data?.organic_results) {
            const roles = this.extractRolesFromGoogleResults(response.data.organic_results, celebrityName);
            extractedRoles.push(...roles);
            logger.info(`   → Found ${roles.length} candidates`);
          }

          // EARLY TERMINATION: Stop if we have enough candidates
          if (extractedRoles.length >= 12) {
            logger.info(`🛑 Early termination: Found ${extractedRoles.length} candidates, stopping search`);
            break;
          }

          // Delay between searches
          await new Promise(resolve => setTimeout(resolve, 800));
          
        } catch (error) {
          logger.warn(`Hail Mary query failed: ${query} - ${error.message}`);
        }
      }

      // Enhanced filtering and deduplication
      const uniqueRoles = [...new Set(extractedRoles)];
      const qualityRoles = uniqueRoles.filter(role => {
        return role.length >= 4 && 
               role.length <= 40 && 
               !role.toLowerCase().includes('wikipedia') &&
               !role.toLowerCase().includes('imdb') &&
               !role.toLowerCase().includes('credits') &&
               TitleValidation.isValidExtractedTitle(role, celebrityName);
      });
      
      // Generic voice acting show prioritization (not actor-specific)
      const voiceActingKeywords = [
        'animated', 'cartoon', 'voice', 'character', 'animation',
        'adult swim', 'cartoon network', 'nickelodeon', 'disney'
      ];
      
      const prioritizedRoles = qualityRoles.sort((a, b) => {
        const aHasVoiceKeyword = voiceActingKeywords.some(keyword => 
          a.toLowerCase().includes(keyword)
        );
        const bHasVoiceKeyword = voiceActingKeywords.some(keyword => 
          b.toLowerCase().includes(keyword)
        );
        
        if (aHasVoiceKeyword && !bHasVoiceKeyword) return -1;
        if (!aHasVoiceKeyword && bHasVoiceKeyword) return 1;
        return 0;
      });
      
      logger.info(`🎯 Hail Mary extraction: ${extractedRoles.length} → ${uniqueRoles.length} → ${qualityRoles.length} quality`);
      logger.info(`🎯 Top priority candidates: ${prioritizedRoles.slice(0, 6).join(', ')}`);
      
      // REDUCED: Return top 8 candidates instead of 12
      return prioritizedRoles.slice(0, 8);
      
    } catch (error) {
      logger.error('Optimized Hail Mary search failed:', error.message);
      return [];
    }
  }

  /**
   * Extract movie/show titles from Google search results
   */
  static extractRolesFromGoogleResults(results, celebrityName) {
    const extractedTitles = [];
    
    for (const result of results) {
      const title = result.title || '';
      const snippet = result.snippet || '';
      const combined = title + ' ' + snippet;
      
      // Look for title patterns in the text
      const titlePatterns = [
        // "in Movie Name" or "in TV Show"
        /\bin\s+([A-Z][^,.\n()]{2,30}?)(?:\s*[,.(]|$)/g,
        // "Movie Name starring" or "starring in Movie Name"
        /(?:^|\s)([A-Z][^,.\n()]{2,30}?)\s+starring/g,
        /starring\s+in\s+([A-Z][^,.\n()]{2,30}?)(?:\s*[,.(]|$)/g,
        // "cast of Movie Name" or "Movie Name cast"
        /cast\s+of\s+([A-Z][^,.\n()]{2,30}?)(?:\s*[,.(]|$)/g,
        /([A-Z][^,.\n()]{2,30}?)\s+cast/g,
        // "Movie Name (Year)" pattern
        /([A-Z][^,.\n()]{2,30}?)\s*\(\d{4}\)/g,
        // "known for Movie Name"
        /known\s+for\s+([A-Z][^,.\n()]{2,30}?)(?:\s*[,.(]|$)/g
      ];
      
      for (const pattern of titlePatterns) {
        let match;
        while ((match = pattern.exec(combined)) !== null) {
          let extractedTitle = match[1].trim();
          
          // Clean up the extracted title
          extractedTitle = extractedTitle.replace(/^(the|a|an)\s+/i, '');
          extractedTitle = extractedTitle.replace(/\s+(and|or|,).*$/i, '');
          extractedTitle = extractedTitle.trim();
          
          // Filter out obvious non-titles
          if (TitleValidation.isValidTitle(extractedTitle)) {
            extractedTitles.push(extractedTitle);
          }
        }
      }
    }
    
    return extractedTitles;
  }

  /**
   * OPTIMIZED: Single targeted search for specific information
   * Use this when you need to verify just one specific thing
   */
  static async quickGoogleSearch(query, maxResults = 5) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google',
        q: query,
        num: maxResults
      };

      const response = await axios.get(config.api.serpEndpoint, { 
        params,
        timeout: 10000
      });

      return response.data?.organic_results || [];
      
    } catch (error) {
      logger.warn(`Quick Google search failed for: ${query}`);
      return [];
    }
  }

  /**
   * Verify if celebrity is associated with specific networks/studios
   * Useful for voice actors to determine their primary work areas
   */
  static async verifyNetworkAssociation(celebrityName, networks = ['Adult Swim', 'Cartoon Network']) {
    const associations = {};
    
    for (const network of networks) {
      try {
        const query = `"${celebrityName}" "${network}" voice actor shows`;
        const results = await this.quickGoogleSearch(query, 3);
        
        // Count mentions and strong indicators
        let score = 0;
        results.forEach(result => {
          const text = `${result.title} ${result.snippet}`.toLowerCase();
          if (text.includes(celebrityName.toLowerCase()) && text.includes(network.toLowerCase())) {
            score += text.includes('voice') ? 2 : 1;
          }
        });
        
        associations[network] = {
          score,
          hasStrong: score >= 3,
          results: results.length
        };
        
        // Small delay between network checks
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        logger.warn(`Network verification failed for ${network}`);
        associations[network] = { score: 0, hasStrong: false, results: 0 };
      }
    }
    
    return associations;
  }

  /**
   * Get celebrity's primary voice acting genre/style
   */
  static async getVoiceActingStyle(celebrityName) {
    const styleQuery = `"${celebrityName}" voice actor style comedy animation`;
    const results = await this.quickGoogleSearch(styleQuery, 5);
    
    const styles = {
      comedy: 0,
      animation: 0,
      character: 0,
      narrator: 0
    };
    
    results.forEach(result => {
      const text = `${result.title} ${result.snippet}`.toLowerCase();
      if (text.includes('comedy')) styles.comedy++;
      if (text.includes('animation') || text.includes('animated')) styles.animation++;
      if (text.includes('character')) styles.character++;
      if (text.includes('narrator') || text.includes('narration')) styles.narrator++;
    });
    
    return styles;
  }
}

module.exports = GoogleVerificationService;
