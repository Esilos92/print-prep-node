const WikipediaService = require('./services/WikipediaService');
const TMDbService = require('./services/TMDbService');
const GoogleVerificationService = require('./services/GoogleVerificationService');
const DeduplicationService = require('./services/DeduplicationService');
const VoiceActorUtils = require('./services/VoiceActorUtils');
const TitleValidation = require('./services/TitleValidation');
const logger = require('../utils/logger');

class RoleFetcher {
  
  /**
   * Fetch top 5 iconic roles for a celebrity with franchise diversification and comprehensive fallback
   */
  static async fetchRoles(celebrityName) {
    try {
      logger.info(`Fetching roles for: ${celebrityName}`);
      
      // Get Wikipedia "best known for" information first
      const knownForTitles = await WikipediaService.getKnownForTitles(celebrityName);
      logger.info(`Wikipedia "known for": ${knownForTitles.join(', ') || 'None found'}`);
      
      // Get more roles from TMDb for franchise detection (up to 20)
      let allRoles = await TMDbService.fetchFromTMDb(celebrityName, knownForTitles, 20);
      
      // CRITICAL FIX: Validate TMDb results against Wikipedia
      if (allRoles.length > 0 && knownForTitles.length > 0) {
        const tmdbMatchesWikipedia = TMDbService.validateTMDbAgainstWikipedia(allRoles, knownForTitles);
        
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
      const diversifiedRoles = DeduplicationService.diversifyByFranchise(allRoles);
      
      return diversifiedRoles.slice(0, 5); // Top 5 diversified roles
      
    } catch (error) {
      logger.error('Error fetching roles:', error.message);
      // Return fallback generic roles
      return this.getFallbackRoles(celebrityName);
    }
  }

  /**
   * COMPREHENSIVE FALLBACK CHAIN: Wikipedia → Verification → Google Hail Mary
   */
  static async executeComprehensiveFallback(celebrityName, knownForTitles) {
    try {
      logger.info('🔄 Starting comprehensive fallback chain...');
      
      // Step 1: Get Wikipedia + BTVA data
      const wikipediaRoles = await WikipediaService.fetchExpandedWikipediaRoles(celebrityName);
      
      let behindVoiceActorsRoles = [];
      if (VoiceActorUtils.isLikelyVoiceActor(knownForTitles)) {
        behindVoiceActorsRoles = await WikipediaService.fetchFromBehindTheVoiceActors(celebrityName);
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
        TitleValidation.isValidExtractedTitle(title, celebrityName)
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
        const verification = await GoogleVerificationService.googleVerifyRole(celebrityName, title);
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
        const hailMaryRoles = await GoogleVerificationService.googleHailMarySearch(celebrityName);
        
        // Verify each Hail Mary result to avoid more false positives
        logger.info(`🔍 Verifying ${hailMaryRoles.length} Hail Mary candidates...`);
        for (const hailMaryRole of hailMaryRoles) {
          if (verifiedRoles.length >= 6) break; // Stop when we have enough
          
          // Skip if we already have this role
          if (verifiedRoles.includes(hailMaryRole)) {
            logger.info(`⏭️ Skipping duplicate: ${hailMaryRole}`);
            continue;
          }
          
          const verification = await GoogleVerificationService.googleVerifyRole(celebrityName, hailMaryRole);
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
      const deduplicatedRoles = DeduplicationService.removeDuplicateRoles(uniqueVerifiedRoles);
      
      // CRITICAL: IP DEDUPLICATION - Prevent multiple roles from same franchise
      logger.info(`📊 Pre-deduplication: ${deduplicatedRoles.length} roles`);
      const ipDeduplicatedRoles = DeduplicationService.deduplicateByIP(deduplicatedRoles, celebrityName);
      logger.info(`📊 Post-IP deduplication: ${ipDeduplicatedRoles.length} roles`);
      
      const finalRoles = ipDeduplicatedRoles.slice(0, 5).map((title, index) => {
        const isVoiceRole = VoiceActorUtils.detectVoiceRole(title, celebrityName);
        const extractedCharacter = roleCharacters.get(title) || 
          (isVoiceRole ? VoiceActorUtils.extractCharacterName(title, celebrityName) : 'Unknown role');
        
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
