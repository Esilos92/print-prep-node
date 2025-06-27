const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../utils/config');
const logger = require('../utils/logger');

class RoleFetcher {
  
  /**
   * Fetch top 5 iconic roles for a celebrity with franchise diversification and comprehensive fallback
   */
  static async fetchRoles(celebrityName) {
    try {
      logger.info(`Fetching roles for: ${celebrityName}`);
      
      // Get Wikipedia "best known for" information first
      const knownForTitles = await this.getKnownForTitles(celebrityName);
      logger.info(`Wikipedia "known for": ${knownForTitles.join(', ') || 'None found'}`);
      
      // Get more roles from TMDb for franchise detection (up to 20)
      let allRoles = await this.fetchFromTMDb(celebrityName, knownForTitles, 20);
      
      // CRITICAL FIX: Validate TMDb results against Wikipedia
      if (allRoles.length > 0 && knownForTitles.length > 0) {
        const tmdbMatchesWikipedia = this.validateTMDbAgainstWikipedia(allRoles, knownForTitles);
        
        if (!tmdbMatchesWikipedia) {
          logger.warn(`🚨 TMDb found "${celebrityName}" but results don't match Wikipedia known roles`);
          logger.warn(`TMDb titles: ${allRoles.map(r => r.name).slice(0, 3).join(', ')}`);
          logger.warn(`Wikipedia known for: ${knownForTitles.join(', ')}`);
          logger.warn(`🔄 Treating as TMDb failure - using Wikipedia fallback`);
          allRoles = []; // Clear TMDb results to trigger fallback
        }
      }
      
      // ENHANCED FALLBACK CHAIN
      if (allRoles.length === 0) {
        logger.warn('🚨 TMDb returned zero results OR wrong person - implementing enhanced fallback chain');
        allRoles = await this.executeComprehensiveFallback(celebrityName, knownForTitles);
        
        if (allRoles.length === 0) {
          logger.warn('All fallback methods failed, using generic fallback');
          return this.getFallbackRoles(celebrityName);
        }
        
        logger.info(`✅ Fallback chain successful: ${allRoles.length} roles found`);
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
   * COMPREHENSIVE FALLBACK CHAIN: Wikipedia → Verification → Google Hail Mary
   */
  static async executeComprehensiveFallback(celebrityName, knownForTitles) {
    try {
      logger.info('🔄 Starting comprehensive fallback chain...');
      
      // Step 1: Get Wikipedia + BTVA data
      const wikipediaRoles = await this.fetchExpandedWikipediaRoles(celebrityName);
      
      let behindVoiceActorsRoles = [];
      if (this.isLikelyVoiceActor(knownForTitles)) {
        behindVoiceActorsRoles = await this.fetchFromBehindTheVoiceActors(celebrityName);
      }
      
      // Combine all sources
      const potentialTitles = [
        ...knownForTitles,
        ...behindVoiceActorsRoles,
        ...wikipediaRoles
      ];
      
      const uniqueTitles = [...new Set(potentialTitles)];
      
      // CRITICAL FIX: Apply title validation filter BEFORE Google verification
      const filteredTitles = uniqueTitles.filter(title => 
        this.isValidExtractedTitle(title, celebrityName)
      );
      
      logger.info(`📋 Found ${uniqueTitles.length} potential titles → ${filteredTitles.length} after filtering`);
      if (uniqueTitles.length > filteredTitles.length) {
        const rejected = uniqueTitles.filter(title => !filteredTitles.includes(title));
        logger.info(`🚫 Filtered out garbage titles: ${rejected.join(', ')}`);
      }
      
      // Step 2: Google verify each VALID potential role with character extraction
      const verifiedRoles = [];
      const roleCharacters = new Map(); // Store extracted characters
      
      for (const title of filteredTitles.slice(0, 10)) { // Check top 10 valid titles
        const verification = await this.googleVerifyRole(celebrityName, title);
        if (verification.isVerified) {
          verifiedRoles.push(title);
          if (verification.character) {
            roleCharacters.set(title, verification.character);
            logger.info(`✅ Verified: ${title} (as ${verification.character})`);
          } else {
            logger.info(`✅ Verified: ${title}`);
          }
        } else {
          logger.info(`❌ Not verified: ${title} (no strong role evidence)`);
        }
        
        // Stop early if we have enough verified roles
        if (verifiedRoles.length >= 4) break;
      }
      
      logger.info(`🔍 Google verification: ${verifiedRoles.length} roles confirmed`);
      
      // Step 3: If we don't have enough (4-5), trigger Google Hail Mary
      if (verifiedRoles.length < 4) {
        logger.warn(`🚨 Only ${verifiedRoles.length} verified roles - triggering Google Hail Mary search`);
        const hailMaryRoles = await this.googleHailMarySearch(celebrityName);
        
        // Verify each Hail Mary result to avoid more false positives
        logger.info(`🔍 Verifying ${hailMaryRoles.length} Hail Mary candidates...`);
        for (const hailMaryRole of hailMaryRoles) {
          if (verifiedRoles.length >= 6) break; // Stop when we have enough
          
          // Skip if we already have this role
          if (verifiedRoles.includes(hailMaryRole)) {
            logger.info(`⏭️ Skipping duplicate: ${hailMaryRole}`);
            continue;
          }
          
          const verification = await this.googleVerifyRole(celebrityName, hailMaryRole);
          if (verification.isVerified) {
            verifiedRoles.push(hailMaryRole);
            if (verification.character) {
              roleCharacters.set(hailMaryRole, verification.character);
              logger.info(`✅ Hail Mary verified: ${hailMaryRole} (as ${verification.character})`);
            } else {
              logger.info(`✅ Hail Mary verified: ${hailMaryRole}`);
            }
          } else {
            logger.info(`❌ Hail Mary rejected: ${hailMaryRole} (no strong role evidence)`);
          }
        }
        
        logger.info(`🎯 Hail Mary result: ${verifiedRoles.length} total verified roles`);
      }
      
      // Step 4: Convert to role objects with DEDUPLICATION
      const uniqueVerifiedRoles = [...new Set(verifiedRoles)]; // Remove exact duplicates
      
      // Additional deduplication: remove partial matches
      const deduplicatedRoles = [];
      for (const role of uniqueVerifiedRoles) {
        // Check if this role is a substring of any existing role
        const isPartialDuplicate = deduplicatedRoles.some(existingRole => {
          return existingRole.toLowerCase().includes(role.toLowerCase()) || 
                 role.toLowerCase().includes(existingRole.toLowerCase());
        });
        
        if (!isPartialDuplicate) {
          deduplicatedRoles.push(role);
        } else {
          logger.info(`🚫 Removed partial duplicate: "${role}"`);
        }
      }
      
      logger.info(`🔄 Deduplication: ${verifiedRoles.length} → ${uniqueVerifiedRoles.length} → ${deduplicatedRoles.length} roles`);
      
      // CRITICAL: IP DEDUPLICATION - Prevent multiple roles from same franchise
      logger.info(`📊 Pre-deduplication: ${deduplicatedRoles.length} roles`);
      const ipDeduplicatedRoles = this.deduplicateByIP(deduplicatedRoles, celebrityName);
      logger.info(`📊 Post-IP deduplication: ${ipDeduplicatedRoles.length} roles`);
      
      const finalRoles = ipDeduplicatedRoles.slice(0, 5).map((title, index) => {
        const isVoiceRole = this.detectVoiceRole(title, celebrityName);
        const extractedCharacter = roleCharacters.get(title) || (isVoiceRole ? this.extractCharacterName(title, celebrityName) : 'Unknown role');
        
        return {
          name: title,
          character: extractedCharacter,
          year: null,
          media_type: isVoiceRole ? 'tv' : 'movie',
          popularity: 100 - (index * 10),
          vote_count: 1000 - (index * 100),
          isKnownFor: knownForTitles.includes(title) || filteredTitles.includes(title),
          isVoiceRole: isVoiceRole,
          characterName: extractedCharacter !== 'Unknown role' ? extractedCharacter : null,
          tags: ['comprehensive_fallback', isVoiceRole ? 'voice_role' : 'live_action'],
          source: 'comprehensive_fallback',
          searchTerms: [title, celebrityName, extractedCharacter !== 'Unknown role' ? extractedCharacter : null].filter(Boolean)
        };
      });
      
      logger.info(`🎭 Comprehensive fallback created ${finalRoles.length} verified roles:`);
      finalRoles.forEach((role, i) => {
        const voiceMarker = role.isVoiceRole ? ' (VOICE)' : '';
        const knownMarker = role.isKnownFor ? ' ⭐' : '';
        const characterInfo = role.characterName ? ` [${role.characterName}]` : '';
        logger.info(`  ${i + 1}. ${role.name}${voiceMarker}${characterInfo}${knownMarker}`);
      });
      
      return finalRoles;
      
    } catch (error) {
      logger.error('Comprehensive fallback failed:', error.message);
      return [];
    }
  }

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
                const characters = this.extractCharacterFromSnippet(combined, celebrityName, roleName);
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
   * ENHANCED HAIL MARY: Target major voice acting projects specifically
   */
  static async googleHailMarySearch(celebrityName) {
    try {
      logger.info('🎯 Executing ENHANCED Hail Mary search...');
      
      // Voice actor specific queries targeting major animated shows
      const hailMaryQueries = [
        `"${celebrityName}" voice actor "Adult Swim" shows characters`,
        `"${celebrityName}" "Cartoon Network" voice cast recurring`,
        `"${celebrityName}" voice acting credits television animation`,
        `"${celebrityName}" "Robot Chicken" "Harvey Birdman" "Squidbillies" voice`,
        `"${celebrityName}" animated series voice work filmography`,
        `"${celebrityName}" voices characters cartoon comedy shows`,
        `site:imdb.com "${celebrityName}" voice credits`,
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
            num: 20 // More results for comprehensive coverage
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
               this.isValidExtractedTitle(role, celebrityName);
      });
      
      // Prioritize known voice acting shows
      const voiceActingShows = [
        'Robot Chicken', 'Harvey Birdman', 'Squidbillies', 'Metalocalypse',
        'Venture Bros', 'Tim and Eric', 'Check It Out', 'Xavier Renegade Angel',
        'Stroker and Hoop', 'Perfect Hair Forever', 'Space Ghost Coast to Coast'
      ];
      
      const prioritizedRoles = qualityRoles.sort((a, b) => {
        const aIsVoiceShow = voiceActingShows.some(show => 
          a.toLowerCase().includes(show.toLowerCase())
        );
        const bIsVoiceShow = voiceActingShows.some(show => 
          b.toLowerCase().includes(show.toLowerCase())
        );
        
        if (aIsVoiceShow && !bIsVoiceShow) return -1;
        if (!aIsVoiceShow && bIsVoiceShow) return 1;
        return 0;
      });
      
      logger.info(`🎯 Hail Mary extraction: ${extractedRoles.length} → ${uniqueRoles.length} → ${qualityRoles.length} quality`);
      logger.info(`🎯 Top priority candidates: ${prioritizedRoles.slice(0, 8).join(', ')}`);
      
      return prioritizedRoles.slice(0, 12); // Return top 12 candidates for verification
      
    } catch (error) {
      logger.error('Enhanced Hail Mary search failed:', error.message);
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
          if (this.isValidTitle(extractedTitle)) {
            extractedTitles.push(extractedTitle);
          }
        }
      }
    }
    
    return extractedTitles;
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
          
          // Enhanced voice role detection
          const isVoiceRole = this.detectVoiceRole(title, celebrityName);
          
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

  /**
   * CRITICAL FIX: Validate extracted title from Google results - MUCH MORE RESTRICTIVE
   */
  static isValidExtractedTitle(title, celebrityName) {
    if (!title || title.length < 3 || title.length > 50) return false;
    
    // Filter out partial phrases and prepositions - THE CORE FIX
    const invalidPrefixes = ['in ', 'on ', 'of ', 'the ', 'a ', 'an ', 'and ', 'or '];
    const invalidSuffixes = ["'s animated", "'s ", " animated", " show", " series"];
    const titleLower = title.toLowerCase();
    
    // Reject if starts with preposition - PREVENTS "in Aqua Teen Hunger Force"
    if (invalidPrefixes.some(prefix => titleLower.startsWith(prefix))) return false;
    
    // Reject if ends with generic terms - PREVENTS "Cartoon Network's animated"
    if (invalidSuffixes.some(suffix => titleLower.endsWith(suffix))) return false;
    
    // ADDITIONAL FIX: Reject incomplete titles (less than 2 substantial words)
    const words = title.split(/\s+/).filter(word => word.length > 2);
    if (words.length < 2) {
      logger.info(`🚫 Rejected incomplete title: "${title}" (only ${words.length} substantial words)`);
      return false;
    }
    
    // Filter out common non-title words
    const excludeWords = [
      'actor', 'actress', 'voice', 'character', 'role', 'cast', 'starring',
      'movie', 'film', 'show', 'series', 'television', 'tv', 'episode',
      'season', 'year', 'years', 'career', 'work', 'performance', 'latest',
      'news', 'interview', 'photos', 'images', 'biography', 'wikipedia',
      'animated', 'cartoon', 'network'
    ];
    
    // Don't include if it's just an excluded word
    if (excludeWords.includes(titleLower)) return false;
    
    // Don't include if it contains the actor's name (likely a bio page)
    if (titleLower.includes(celebrityName.toLowerCase())) return false;
    
    // Must contain at least one letter and be a substantial word
    if (!/[a-zA-Z]/.test(title) || title.split(' ').length < 2) return false;
    
    // Must not be just generic phrases - ADDITIONAL PROTECTION
    const genericPhrases = [
      'cartoon network', 'adult swim', 'comedy central', 'animated series',
      'voice actor', 'voice acting', 'television series', 'tv show'
    ];
    if (genericPhrases.includes(titleLower)) return false;
    
    return true;
  }

  /**
   * ENHANCED CHARACTER EXTRACTION: Multiple patterns for better character discovery
   */
  static extractCharacterFromSnippet(text, actorName, projectName) {
    const actorLower = actorName.toLowerCase();
    const projectLower = projectName.toLowerCase();
    const characters = [];
    
    // Enhanced patterns for character extraction
    const characterPatterns = [
      // "John Doe voices CHARACTER in Project"
      new RegExp(`${actorLower}\\s+(?:voices?|plays?)\\s+([A-Z][A-Za-z\\s]+?)\\s+(?:in|on)\\s+${projectLower}`, 'gi'),
      // "CHARACTER (voiced by John Doe)"
      new RegExp(`([A-Z][A-Za-z\\s]+?)\\s*\\((?:voiced|played)\\s+by\\s+${actorLower}\\)`, 'gi'),
      // "John Doe as CHARACTER"
      new RegExp(`${actorLower}\\s+as\\s+([A-Z][A-Za-z\\s]+?)(?:\\s*[,.]|$)`, 'gi'),
      // "CHARACTER - John Doe" 
      new RegExp(`([A-Z][A-Za-z\\s]+?)\\s*-\\s*${actorLower}`, 'gi'),
      // "voice of CHARACTER"
      new RegExp(`voice\\s+of\\s+([A-Z][A-Za-z\\s]+?)(?:\\s*[,.]|$)`, 'gi'),
      // "CHARACTER voiced by John Doe"
      new RegExp(`([A-Z][A-Za-z\\s]+?)\\s+voiced\\s+by\\s+${actorLower}`, 'gi'),
      // "plays CHARACTER"
      new RegExp(`plays\\s+([A-Z][A-Za-z\\s]+?)(?:\\s*[,.]|$)`, 'gi'),
      // Project-specific patterns for common shows
      new RegExp(`${projectLower}[^.]*?([A-Z][A-Za-z\\s]+?)\\s*\\(${actorLower}\\)`, 'gi'),
      // "CHARACTER character"
      new RegExp(`([A-Z][A-Za-z\\s]+?)\\s+character`, 'gi')
    ];
    
    for (const pattern of characterPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          let character = match[1].trim();
          
          // Clean up the character name
          character = character.replace(/\s+(voice|actor|character|voiced|plays?)$/gi, '');
          character = character.replace(/^(the|a|an)\s+/gi, '');
          character = character.replace(/\s+(and|or|,).*$/gi, '');
          character = character.trim();
          
          // Validate character name
          if (this.isValidCharacterName(character, actorName, projectName)) {
            characters.push(character);
          }
        }
      }
    }
    
    return characters;
  }

  /**
   * IP DEDUPLICATION: Prevent multiple roles from same franchise/IP
   */
  static deduplicateByIP(roles, celebrityName) {
    const ipGroups = {};
    const standalone = [];
    
    // Group roles by IP/franchise
    for (const role of roles) {
      const ip = this.detectIP(role);
      
      if (ip) {
        if (!ipGroups[ip]) {
          ipGroups[ip] = [];
        }
        ipGroups[ip].push(role);
      } else {
        standalone.push(role);
      }
    }
    
    const deduplicatedRoles = [];
    
    // For each IP group, select the most specific/character-focused role
    for (const [ip, ipRoles] of Object.entries(ipGroups)) {
      if (ipRoles.length === 1) {
        deduplicatedRoles.push(ipRoles[0]);
        logger.info(`📺 ${ip}: Single role → ${ipRoles[0]}`);
      } else {
        // Prioritize character names over show names
        const prioritized = ipRoles.sort((a, b) => {
          const aIsCharacter = this.isCharacterName(a, ip);
          const bIsCharacter = this.isCharacterName(b, ip);
          
          if (aIsCharacter && !bIsCharacter) return -1;
          if (!aIsCharacter && bIsCharacter) return 1;
          
          // If both are characters or both are shows, prefer shorter (more specific)
          return a.length - b.length;
        });
        
        deduplicatedRoles.push(prioritized[0]);
        logger.info(`📺 ${ip}: ${ipRoles.length} roles → KEPT: ${prioritized[0]} | REMOVED: ${prioritized.slice(1).join(', ')}`);
      }
    }
    
    // Add standalone roles
    deduplicatedRoles.push(...standalone);
    
    return deduplicatedRoles;
  }

  /**
   * DETECT IP/FRANCHISE: Identify which IP/franchise a role belongs to
   */
  static detectIP(roleName) {
    const ipMappings = {
      'aqua teen': 'Aqua Teen Hunger Force',
      'master shake': 'Aqua Teen Hunger Force',
      'robot chicken': 'Robot Chicken',
      'harvey birdman': 'Harvey Birdman',
      'squidbillies': 'Squidbillies',
      'early cuyler': 'Squidbillies',
      'granny cuyler': 'Squidbillies',
      'metalocalypse': 'Metalocalypse',
      'venture bros': 'Venture Bros',
      'tim and eric': 'Tim and Eric',
      'check it out': 'Tim and Eric',
      'space ghost': 'Space Ghost'
    };
    
    const roleLower = roleName.toLowerCase();
    
    for (const [keyword, ip] of Object.entries(ipMappings)) {
      if (roleLower.includes(keyword)) {
        return ip;
      }
    }
    
    return null; // Standalone role
  }

  /**
   * CHECK IF ROLE NAME IS A CHARACTER: Determine if this is a character name vs show name
   */
  static isCharacterName(roleName, ip) {
    const roleLower = roleName.toLowerCase();
    const ipLower = ip.toLowerCase();
    
    // If the role name doesn't contain the IP name, it's likely a character
    if (!roleLower.includes(ipLower)) {
      return true;
    }
    
    // Known character indicators
    const characterIndicators = [
      'master shake', 'early cuyler', 'granny cuyler', 'dr reducto', 
      'mayor', 'sheriff', 'rusty venture', 'dean venture'
    ];
    
    return characterIndicators.some(char => roleLower.includes(char));
  }

  /**
   * VALIDATE CHARACTER NAMES: Filter out false character extractions
   */
  static isValidCharacterName(character, actorName, projectName) {
    if (!character || character.length < 2 || character.length > 25) return false;
    
    const charLower = character.toLowerCase();
    const actorLower = actorName.toLowerCase();
    const projectLower = projectName.toLowerCase();
    
    // Don't include if it's the actor's name
    if (charLower.includes(actorLower) || actorLower.includes(charLower)) return false;
    
    // Don't include if it's the project name
    if (charLower.includes(projectLower) || projectLower.includes(charLower)) return false;
    
    // Filter out common non-character words
    const invalidCharacterWords = [
      'voice', 'actor', 'actress', 'character', 'role', 'cast', 'member',
      'show', 'series', 'movie', 'film', 'episode', 'season', 'network',
      'animation', 'animated', 'cartoon', 'adult', 'swim', 'comedy', 'central',
      'television', 'starring', 'featuring', 'guest', 'recurring', 'main'
    ];
    
    if (invalidCharacterWords.includes(charLower)) return false;
    
    // Must contain actual letters
    if (!/[A-Za-z]/.test(character)) return false;
    
    // Character names should be mostly alphabetic
    const alphaRatio = (character.match(/[A-Za-z]/g) || []).length / character.length;
    if (alphaRatio < 0.6) return false;
    
    return true;
  }

  /**
   * Check if this appears to be a voice actor based on known titles
   */
  static isLikelyVoiceActor(knownForTitles) {
    if (!knownForTitles || knownForTitles.length === 0) return false;
    
    const voiceActorIndicators = [
      'adult swim', 'cartoon network', 'animated', 'voice', 'character',
      'aqua teen', 'robot chicken', 'family guy', 'simpsons', 'south park'
    ];
    
    return knownForTitles.some(title => {
      const titleLower = title.toLowerCase();
      return voiceActorIndicators.some(indicator => titleLower.includes(indicator));
    });
  }

  /**
   * EXPERIMENTAL: Fetch from BehindTheVoiceActors.com for voice actor roles
   */
  static async fetchFromBehindTheVoiceActors(celebrityName) {
    try {
      logger.info('🎤 Attempting BehindTheVoiceActors.com lookup...');
      
      // Create URL-friendly name
      const urlName = celebrityName.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      
      const btvaUrl = `https://www.behindthevoiceactors.com/voice-actors/${urlName}/`;
      
      const response = await axios.get(btvaUrl, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      const roles = [];
      
      // Look for voice acting credits
      $('.voice-acting table tr').each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const character = $(cells[0]).text().trim();
          const show = $(cells[1]).text().trim();
          
          if (character && show && character !== 'Character' && show !== 'Show/Movie') {
            const roleTitle = `${show}: ${character}`;
            if (roleTitle.length > 5 && roleTitle.length < 100) {
              roles.push(roleTitle);
            }
          }
        }
      });
      
      // Also check for popular roles section
      $('.popular-roles .role').each((i, elem) => {
        const roleText = $(elem).text().trim();
        if (roleText && roleText.length > 3 && roleText.length < 100) {
          roles.push(roleText);
        }
      });
      
      const uniqueRoles = [...new Set(roles)].slice(0, 8); // Top 8 voice roles
      
      if (uniqueRoles.length > 0) {
        logger.info(`🎤 BehindTheVoiceActors found ${uniqueRoles.length} roles: ${uniqueRoles.slice(0, 3).join(', ')}`);
      } else {
        logger.info('🎤 BehindTheVoiceActors: No roles found');
      }
      
      return uniqueRoles;
      
    } catch (error) {
      logger.info(`🎤 BehindTheVoiceActors lookup failed: ${error.message}`);
      return []; // Fail silently, this is experimental
    }
  }

  /**
   * Enhanced Wikipedia scraping for fallback scenarios
   */
  static async fetchExpandedWikipediaRoles(celebrityName) {
    try {
      const wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(celebrityName.replace(/\s+/g, '_'))}`;
      const response = await axios.get(wikipediaUrl, { timeout: 10000 });
      const $ = cheerio.load(response.data);
      
      const roles = new Set(); // Use Set to avoid duplicates
      
      // Strategy 1: Look for filmography sections
      $('h2, h3').each((i, heading) => {
        const headingText = $(heading).text().toLowerCase();
        if (headingText.includes('filmography') || headingText.includes('voice') || 
            headingText.includes('television') || headingText.includes('film')) {
          
          // Get the next few elements after this heading
          let nextElement = $(heading).next();
          let attempts = 0;
          
          while (nextElement.length > 0 && attempts < 5) {
            if (nextElement.is('table')) {
              // Extract from tables
              nextElement.find('tr').each((j, row) => {
                const cells = $(row).find('td');
                if (cells.length >= 2) {
                  // Usually format is: Year | Title | Role
                  let title = '';
                  
                  // Try different cell positions for title
                  for (let cellIndex = 0; cellIndex < Math.min(cells.length, 3); cellIndex++) {
                    const cellText = $(cells[cellIndex]).text().trim();
                    if (cellText && cellText.length > 2 && !cellText.match(/^\d{4}$/)) {
                      title = cellText;
                      break;
                    }
                  }
                  
                  if (title && this.isValidTitle(title)) {
                    roles.add(title);
                  }
                }
              });
              break; // Found table, stop looking
            } else if (nextElement.is('ul')) {
              // Extract from lists
              nextElement.find('li').each((j, item) => {
                const text = $(item).text().trim();
                const titleMatch = text.match(/^([^(]+)/); // Get text before first parenthesis
                if (titleMatch && this.isValidTitle(titleMatch[1].trim())) {
                  roles.add(titleMatch[1].trim());
                }
              });
              break;
            }
            
            nextElement = nextElement.next();
            attempts++;
          }
        }
      });
      
      // Strategy 2: Look for notable works in the intro
      const firstParagraph = $('p').first().text();
      const notableWorksPattern = /(?:known for|appeared in|voiced|starred in)[^.]*?([A-Z][^,.]*?)(?:\s+and|\s*,|\s*\(|\.)/gi;
      let match;
      while ((match = notableWorksPattern.exec(firstParagraph)) !== null) {
        const potentialTitle = match[1].trim();
        if (this.isValidTitle(potentialTitle)) {
          roles.add(potentialTitle);
        }
      }
      
      logger.info(`Found ${roles.size} roles from expanded Wikipedia search`);
      return Array.from(roles).slice(0, 10); // Return up to 10 roles
      
    } catch (error) {
      logger.warn('Expanded Wikipedia scraping failed:', error.message);
      return [];
    }
  }

  /**
   * GENERALIZED: Enhanced voice role detection for all voice actors
   */
  static detectVoiceRole(title, celebrityName) {
    if (!title) return false;
    
    const titleLower = title.toLowerCase();
    
    // Animation networks and studios
    const animationNetworks = [
      'adult swim', 'cartoon network', 'nickelodeon', 'disney channel', 'disney junior',
      'fox kids', 'kids wb', 'toonami', 'boomerang', 'comedy central'
    ];
    
    // Animation-specific terms
    const animationTerms = [
      'animated', 'animation', 'cartoon', 'anime', 'voice', 'voice actor',
      'voice cast', 'animated series', 'animated film', 'animated movie'
    ];
    
    // Common animated show patterns
    const animatedShowPatterns = [
      'adventures of', 'tales of', 'chronicles of', 'legend of',
      'teenage mutant', 'transformers', 'my little pony', 'pokemon',
      'dragon ball', 'naruto', 'one piece', 'attack on titan'
    ];
    
    // Production companies known for animation
    const animationStudios = [
      'pixar', 'dreamworks', 'illumination', 'blue sky', 'warner bros animation',
      'sony pictures animation', 'paramount animation', 'disney animation'
    ];
    
    // Check all categories
    const allVoiceIndicators = [
      ...animationNetworks,
      ...animationTerms,
      ...animatedShowPatterns,
      ...animationStudios
    ];
    
    return allVoiceIndicators.some(indicator => titleLower.includes(indicator));
  }

  /**
   * GENERALIZED: Extract character name for any voice role
   */
  static extractCharacterName(title, celebrityName) {
    if (!title) return 'Unknown Character';
    
    const titleLower = title.toLowerCase();
    
    // Generic character extraction patterns
    const characterExtractionPatterns = [
      // "Voice of Character in Show" -> Character
      /voice\s+of\s+([A-Z][^,\n\(]+?)(?:\s+in|\s*,|\s*\(|$)/i,
      // "Character (voice)" -> Character  
      /^([A-Z][^,\n\(]+?)\s*\(voice\)/i,
      // "Show: Character" -> Character
      /:\s*([A-Z][^,\n\(]+?)(?:\s*,|\s*\(|$)/i,
      // "Character - Show" -> Character
      /^([A-Z][^,\n\-]+?)\s*-\s*/i,
      // Look for character names in parentheses
      /\(([A-Z][^,\n\)]+?)\)/i,
      // "as Character" -> Character
      /\bas\s+([A-Z][^,\n\(]+?)(?:\s*,|\s*\(|$)/i
    ];
    
    // Try pattern-based extraction first
    for (const pattern of characterExtractionPatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        let character = match[1].trim();
        
        // Clean up common artifacts
        character = character.replace(/\s+(voice|actor|character)$/i, '');
        character = character.replace(/^(the|a|an)\s+/i, '');
        
        if (character.length > 1 && character.length < 50) {
          return character;
        }
      }
    }
    
    // Fallback: Look for capitalized words that could be character names
    const words = title.split(/\s+/);
    const potentialCharacterWords = words.filter(word => {
      // Must be capitalized and substantial
      if (word.length < 2 || word[0] !== word[0].toUpperCase()) return false;
      
      // Filter out common show-related words
      const commonWords = [
        'show', 'series', 'movie', 'film', 'animated', 'adventures',
        'tales', 'chronicles', 'legend', 'story', 'season', 'episode',
        'voice', 'actor', 'cast', 'starring', 'featuring'
      ];
      
      return !commonWords.includes(word.toLowerCase());
    });
    
    // Return first 1-2 potential character words
    if (potentialCharacterWords.length > 0) {
      return potentialCharacterWords.slice(0, 2).join(' ');
    }
    
    // Ultimate fallback: extract from title without common words
    const cleanTitle = title.replace(/\b(the|a|an|voice|of|in|as|actor|character|show|series|movie|film|animated)\b/gi, ' ')
                           .replace(/\s+/g, ' ')
                           .trim();
    
    if (cleanTitle && cleanTitle.length > 2 && cleanTitle.length < 30) {
      return cleanTitle;
    }
    
    return 'Unknown Character';
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
      
      // CRITICAL FIX: Filter out garbage titles using isValidExtractedTitle
      const rawTitles = [...new Set(knownForTitles)]
        .filter(title => title.length > 2 && title.length < 50);
      
      const validTitles = rawTitles.filter(title => 
        this.isValidExtractedTitle(title, celebrityName)
      );
      
      logger.info(`📋 Wikipedia extraction: ${rawTitles.length} raw titles → ${validTitles.length} valid titles`);
      if (rawTitles.length > validTitles.length) {
        const filtered = rawTitles.filter(title => !validTitles.includes(title));
        logger.info(`🚫 Filtered out: ${filtered.join(', ')}`);
      }
      
      return validTitles.slice(0, 5); // Top 5 valid titles
      
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
}

module.exports = { fetchRoles: RoleFetcher.fetchRoles.bind(RoleFetcher) };
