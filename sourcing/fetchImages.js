const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');

class ImageFetcher {
  
  constructor() {
    this.preferredDomains = [
      'imdb.com', 'themoviedb.org', 'rottentomatoes.com',
      'variety.com', 'hollywoodreporter.com', 'entertainment.com',
      'disney.com', 'marvel.com', 'starwars.com', 'paramount.com',
      'warnerbros.com', 'netflix.com', 'hulu.com', 'amazon.com'
    ];
    
    this.watermarkedDomains = [
      'alamy.com', 'alamyimages.fr', 'alamy.de', 'alamy.es',
      'gettyimages.com', 'gettyimages.ca', 'gettyimages.co.uk',
      'shutterstock.com', 'istockphoto.com', 'depositphotos.com', 
      'bigstock.com', 'dreamstime.com', 'stockphoto.com',
      'photobucket.com', 'imageshack.us', '123rf.com',
      'canstockphoto.com', 'fotolia.com', 'stockvault.net'
    ];
    
    this.fanContentKeywords = [
      'fanart', 'fan art', 'fan-art', 'deviantart', 'tumblr art',
      'drawing', 'sketch', 'illustration', 'artwork', 'digital art',
      'concept art', 'poster design', 'fan poster', 'custom poster',
      'photomanipulation', 'manip', 'edit', 'fan edit'
    ];
    
    this.watermarkPatterns = [
      '/comp/', '/preview/', '/sample/', '/watermark/', '/thumb/',
      'watermarked', 'preview', 'sample', 'comp-', 'stockphoto',
      'low-res', 'lowres', 'proof', 'copyright', '©'
    ];
  }
  
  /**
   * Fetch images for a specific celebrity and role with enhanced filtering
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      logger.info(`🖼️ Fetching images for ${celebrityName} in ${role.name}...`);
      
      const fetcher = new ImageFetcher();
      const maxImages = config.image.maxImagesPerRole || 50;
      
      // Generate enhanced queries based on role type
      const searchQueries = fetcher.generateEnhancedQueries(celebrityName, role);
      let allImages = [];
      
      // Execute searches with different strategies
      for (const query of searchQueries) {
        try {
          logger.info(`Search query: "${query.text}"`);
          const images = await fetcher.searchSerpAPI(query.text, Math.ceil(maxImages / searchQueries.length));
          const filteredImages = fetcher.filterImageSources(images, role);
          allImages.push(...filteredImages);
          
          if (allImages.length >= maxImages) break;
        } catch (error) {
          logger.warn(`Query failed: ${query.text} - ${error.message}`);
        }
      }
      
      // Remove duplicates
      const uniqueImages = fetcher.removeDuplicateImages(allImages);
      
      // Apply enhanced verification (with voice role support)
      const verifiedImages = fetcher.filterAndVerifyImages(uniqueImages, celebrityName, role);
      logger.info(`${verifiedImages.length} images passed verification`);
      
      // Download the verified images
      const downloadedImages = await fetcher.downloadImages(
        verifiedImages.slice(0, maxImages), 
        workDir, 
        celebrityName, 
        role
      );
      
      logger.info(`Successfully downloaded ${downloadedImages.length} images for ${role.name}`);
      return downloadedImages;
      
    } catch (error) {
      logger.error(`Error fetching images for ${role.name}:`, error.message);
      return [];
    }
  }
  
  /**
   * Generate enhanced search queries with aggressive watermark exclusions
   */
  generateEnhancedQueries(celebrityName, role) {
    const queries = [];
    
    // Aggressive exclusions for watermarked sites and unwanted content
    const watermarkExclusions = this.watermarkedDomains.map(domain => `-site:${domain}`).join(' ');
    const contentExclusions = [
      '-signed', '-autograph', '-autographed', '-auction', '-ebay', 
      '-memorabilia', '-collectible', '-sale', '-selling', '-bid', '-lot',
      '-"comic con"', '-comicon', '-convention', '-podcast', '-interview',
      '-"promotional graphic"', '-"event poster"', '-vhs', '-dvd', '-"blu ray"',
      '-"red carpet"', '-premiere', '-gala', '-awards', '-ceremony',
      '-vs', '-versus', '-"side by side"', '-comparison', '-"then and now"',
      '-meme', '-parody', '-watermark', '-website', '-fanart', '-"fan art"',
      '-drawing', '-sketch', '-illustration', '-artwork', '-"digital art"'
    ].join(' ');
    
    const allExclusions = `${watermarkExclusions} ${contentExclusions}`;
    
    if (role.isVoiceRole) {
      logger.info(`🎭 Voice role detected for ${role.name}, focusing on character images`);
      
      if (role.characterName) {
        queries.push({
          text: `"${role.characterName}" "${role.name}" character official movie still ${allExclusions}`,
          priority: 'high'
        });
        queries.push({
          text: `"${role.characterName}" "${role.name}" animated character scene ${allExclusions}`,
          priority: 'high'
        });
      }
      
      queries.push({
        text: `"${role.name}" character images official movie stills ${allExclusions}`,
        priority: 'medium'
      });
    } else {
      logger.info(`🎬 Live action role detected for ${role.name}, focusing on actor in role`);
      
      queries.push({
        text: `"${celebrityName}" "${role.name}" movie still scene photo ${allExclusions}`,
        priority: 'high'
      });
      
      if (role.character && role.character !== 'Unknown role') {
        queries.push({
          text: `"${celebrityName}" "${role.character}" "${role.name}" scene still ${allExclusions}`,
          priority: 'high'
        });
      }
      
      queries.push({
        text: `"${celebrityName}" "${role.name}" promotional photo official ${allExclusions}`,
        priority: 'medium'
      });
    }

    return queries.slice(0, 3); // Limit to top 3 most specific queries
  }
  
  /**
   * Search SerpAPI with enhanced parameters and aggressive filtering
   */
  async searchSerpAPI(query, maxResults = 20) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query, // Query already contains exclusions
        num: Math.min(maxResults, 100),
        ijn: 0,
        safe: 'active',
        imgsz: 'l', // Large images only
        imgtype: 'photo'
      };

      const response = await axios.get(config.api.serpEndpoint, { 
        params,
        timeout: 30000
      });

      if (!response.data || !response.data.images_results) {
        logger.warn(`No images found in SerpAPI response for: ${query}`);
        return [];
      }

      // Pre-filter results before returning
      const rawImages = response.data.images_results;
      const filteredImages = rawImages.filter(img => {
        // Aggressive watermark domain filtering
        const sourceUrl = (img.link || '').toLowerCase();
        if (this.watermarkedDomains.some(domain => sourceUrl.includes(domain))) {
          return false;
        }
        
        // Check original URL for watermark domains
        const originalUrl = (img.original || '').toLowerCase();
        if (this.watermarkedDomains.some(domain => originalUrl.includes(domain))) {
          return false;
        }
        
        return true;
      });

      // Convert to our format
      const images = filteredImages.map((img, index) => ({
        original: img.original || img.thumbnail,
        thumbnail: img.thumbnail,
        title: img.title || `Image ${index + 1}`,
        source: img.source || 'Unknown',
        link: img.link || '',
        position: img.position || index + 1,
        url: img.original || img.thumbnail,
        thumbnailUrl: img.thumbnail,
        sourceUrl: img.link || '',
        width: img.original_width || null,
        height: img.original_height || null,
        searchQuery: query
      }));

      logger.info(`Found ${rawImages.length} raw images, filtered to ${images.length} for: ${query}`);
      return images;

    } catch (error) {
      if (error.response) {
        logger.error(`SerpAPI HTTP Error ${error.response.status}: ${error.response.data?.error || error.message}`);
        
        if (error.response.status === 401) {
          throw new Error('Invalid SerpAPI key. Check your SERP_API_KEY in .env file');
        }
        if (error.response.status === 403) {
          throw new Error('SerpAPI quota exceeded or access denied');
        }
      } else {
        logger.error(`SerpAPI Request Error: ${error.message}`);
      }
      
      return [];
    }
  }
  
  /**
   * Filter image sources with aggressive watermark and smart fan content filtering
   */
  filterImageSources(images, role) {
    return images.filter(image => {
      const url = (image.sourceUrl || '').toLowerCase();
      const title = (image.title || '').toLowerCase();
      
      // Aggressive watermark domain blocking
      if (this.watermarkedDomains.some(domain => url.includes(domain))) {
        logger.warn(`Blocked watermarked domain: ${url}`);
        return false;
      }

      // Check image URL itself for watermark domains
      const imageUrl = (image.url || image.original || '').toLowerCase();
      if (this.watermarkedDomains.some(domain => imageUrl.includes(domain))) {
        logger.warn(`Blocked watermarked image URL: ${imageUrl}`);
        return false;
      }

      // Aggressive watermark pattern detection
      if (this.watermarkPatterns.some(pattern => url.includes(pattern) || imageUrl.includes(pattern))) {
        logger.warn(`Blocked watermark pattern: ${url}`);
        return false;
      }

      // Smart fan content filtering (by title/content, not domain)
      if (this.fanContentKeywords.some(keyword => title.includes(keyword))) {
        logger.warn(`Blocked fan content: ${title}`);
        return false;
      }

      // For voice roles, prefer animation/character-related sources
      if (role.isVoiceRole) {
        return this.isGoodVoiceRoleSource(image, role);
      }

      // For live action, prefer official promotional sources
      return this.isGoodLiveActionSource(image);
    });
  }

  /**
   * Check for signed items or auction content
   */
  isSignedOrAuctionContent(image) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    const signedKeywords = [
      'signed', 'autograph', 'autographed', 'signature',
      'auction', 'ebay', 'bid', 'lot', 'sale', 'selling',
      'memorabilia', 'collectible', 'vintage', 'rare',
      'authentic', 'coa', 'certificate of authenticity'
    ];
    
    return signedKeywords.some(keyword => 
      title.includes(keyword) || url.includes(keyword)
    );
  }
  
  /**
   * Check if domain has watermarks
   */
  hasWatermarks(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return this.watermarkedDomains.some(domain => lowerUrl.includes(domain)) ||
           this.watermarkPatterns.some(pattern => lowerUrl.includes(pattern));
  }
  
  /**
   * Check if source is good for voice roles
   */
  isGoodVoiceRoleSource(image, role) {
    const url = image.sourceUrl.toLowerCase();
    const title = image.title.toLowerCase();
    
    // Prefer official movie/animation studio sites
    const animationSites = [
      'disney.com', 'pixar.com', 'dreamworks.com', 'paramount.com',
      'imdb.com', 'themoviedb.org', 'rottentomatoes.com'
    ];
    
    if (animationSites.some(site => url.includes(site))) {
      return true;
    }

    // Look for character-related content
    const characterKeywords = ['character', 'animated', 'animation', 'still'];
    if (characterKeywords.some(keyword => title.includes(keyword) || url.includes(keyword))) {
      return true;
    }

    // Avoid actor photos for voice roles unless clearly character-related
    const actorKeywords = ['actor', 'celebrity', 'portrait', 'headshot'];
    if (actorKeywords.some(keyword => title.includes(keyword))) {
      return false;
    }

    return true;
  }
  
  /**
   * Check if source is good for live action roles
   */
  isGoodLiveActionSource(image) {
    const url = (image.sourceUrl || '').toLowerCase();
    
    // Prefer official and entertainment industry sources
    if (this.preferredDomains.some(domain => url.includes(domain))) {
      return true;
    }

    // Allow fandom sites but will filter fan content by title later
    if (url.includes('fandom.com') || url.includes('wikia.com')) {
      return true;
    }

    // Avoid obvious fan sites and social media
    const problematicSites = [
      'facebook.com', 'twitter.com', 'instagram.com',
      'blog', 'wordpress', 'blogspot', 'forum'
    ];
    
    if (problematicSites.some(site => url.includes(site))) {
      return false;
    }

    return true;
  }
  
  /**
   * Remove duplicates with enhanced poster detection
   */
  removeDuplicateImages(images) {
    const seen = new Set();
    const seenPosters = new Set();
    
    return images.filter(img => {
      const urlKey = (img.url || img.original).split('?')[0].toLowerCase();
      
      // Standard URL duplicate check
      if (seen.has(urlKey)) {
        return false;
      }
      seen.add(urlKey);
      
      // Enhanced poster duplicate detection
      const title = (img.title || '').toLowerCase();
      if (title.includes('poster')) {
        // Create a poster signature from title
        const posterSignature = title
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .split(' ')
          .filter(word => word.length > 3)
          .sort()
          .join(' ');
          
        if (seenPosters.has(posterSignature)) {
          logger.info(`🎬 Skipping duplicate poster: ${title}`);
          return false;
        }
        seenPosters.add(posterSignature);
      }
      
      return true;
    });
  }
  
  /**
   * Filter and verify images with enhanced voice role support and content diversification
   */
  filterAndVerifyImages(images, celebrityName, role) {
    // First pass: basic validation and scoring
    const scoredImages = images
      .map(image => ({
        ...image,
        reliabilityScore: this.scoreImageSource(image, celebrityName, role),
        personVerification: this.validatePersonInImage(image, celebrityName, role),
        contentType: this.detectContentType(image)
      }))
      .filter(image => {
        // Must pass person verification
        if (!image.personVerification.isValid) {
          logger.warn(`❌ Rejected: ${image.title} - Failed verification (score: ${image.personVerification.confidence})`);
          return false;
        }
        
        // Must have reasonable reliability score
        if (image.reliabilityScore < -2) {
          logger.warn(`❌ Rejected: ${image.title} - Very low reliability source`);
          return false;
        }
        
        return true;
      });

    // Second pass: diversify content types
    return this.diversifyContentTypes(scoredImages);
  }

  /**
   * Detect the type of content (poster, still, portrait, etc.)
   */
  detectContentType(image) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    // Movie posters
    if (title.includes('poster') || title.includes('movie poster') || 
        url.includes('poster') || title.includes('theatrical poster')) {
      return 'poster';
    }
    
    // Behind the scenes / production stills
    if (title.includes('behind the scenes') || title.includes('production still') ||
        title.includes('on set') || title.includes('filming')) {
      return 'behind_scenes';
    }
    
    // Press/promotional photos
    if (title.includes('press') || title.includes('promotional') || 
        title.includes('publicity') || title.includes('promo')) {
      return 'press';
    }
    
    // Movie stills/scenes
    if (title.includes('still') || title.includes('scene') || 
        title.includes('movie still') || title.includes('film still')) {
      return 'movie_still';
    }
    
    // Cast/group photos
    if (title.includes('cast') || title.includes('group') || 
        title.includes('ensemble') || title.includes('crew')) {
      return 'cast_group';
    }
    
    // Portrait/headshot
    if (title.includes('portrait') || title.includes('headshot') || 
        title.includes('photo shoot')) {
      return 'portrait';
    }
    
    // Default
    return 'general';
  }

  /**
   * Diversify content types to avoid too many of the same type
   */
  diversifyContentTypes(images) {
    const contentTypeLimits = {
      poster: 3,           // Max 3 posters
      behind_scenes: 5,    // Max 5 behind scenes
      press: 8,            // Max 8 press photos
      movie_still: 10,     // Max 10 movie stills
      cast_group: 6,       // Max 6 group photos
      portrait: 4,         // Max 4 portraits
      general: 10          // Max 10 general images
    };

    const contentTypeCounts = {};
    const diversifiedImages = [];

    // Sort by combined score first
    const sortedImages = images.sort((a, b) => {
      const scoreA = a.personVerification.confidence + a.reliabilityScore;
      const scoreB = b.personVerification.confidence + b.reliabilityScore;
      return scoreB - scoreA;
    });

    for (const image of sortedImages) {
      const contentType = image.contentType;
      const currentCount = contentTypeCounts[contentType] || 0;
      const limit = contentTypeLimits[contentType] || 5;

      if (currentCount < limit) {
        diversifiedImages.push(image);
        contentTypeCounts[contentType] = currentCount + 1;
        
        logger.info(`✅ Added ${contentType}: ${image.title} (${currentCount + 1}/${limit})`);
      } else {
        logger.info(`⏭️  Skipped ${contentType}: ${image.title} (limit reached: ${limit})`);
      }

      // Stop when we have enough images
      if (diversifiedImages.length >= 50) break;
    }

    logger.info(`Content distribution: ${Object.entries(contentTypeCounts)
      .map(([type, count]) => `${type}:${count}`)
      .join(', ')}`);

    return diversifiedImages;
  }
  
  /**
   * Score image source reliability with role-specific bonuses
   */
  scoreImageSource(imageData, celebrityName, role) {
    const url = (imageData.source || '').toLowerCase();
    const title = (imageData.title || '').toLowerCase();
    
    let score = 0;
    
    // High reliability sources
    const highReliabilitySources = [
      'imdb.com', 'themoviedb.org', 'rottentomatoes.com'
    ];
    
    // Medium reliability sources
    const mediumReliabilitySources = [
      'variety.com', 'hollywoodreporter.com', 'people.com'
    ];
    
    // Animation-specific sources (for voice roles)
    const animationSources = [
      'disney.com', 'pixar.com', 'dreamworks.com', 'paramount.com'
    ];
    
    // Apply scoring
    highReliabilitySources.forEach(source => {
      if (url.includes(source)) score += 3;
    });
    
    mediumReliabilitySources.forEach(source => {
      if (url.includes(source)) score += 2;
    });
    
    // Bonus for animation sources on voice roles
    if (role.isVoiceRole) {
      animationSources.forEach(source => {
        if (url.includes(source)) score += 4;
      });
    }
    
    return score;
  }
  
  /**
   * Enhanced person verification with balanced validation for group shots (FIXED SCOPE)
   */
  validatePersonInImage(imageData, celebrityName, role) {
    const title = (imageData.title || '').toLowerCase();
    const source = (imageData.source || '').toLowerCase();
    const url = (imageData.sourceUrl || '').toLowerCase();
    
    const name = celebrityName.toLowerCase();
    const nameWords = name.split(' ');
    const lastName = nameWords[nameWords.length - 1];
    const firstName = nameWords[0];
    
    // Define variables at function scope to fix scope errors
    const groupIndicators = [
      'cast', 'crew', 'ensemble', 'group', 'team', 'together', 
      'with', 'co-star', 'co-stars', 'behind the scenes', 'on set'
    ];
    
    const roleWords = role.name.toLowerCase().split(' ').filter(word => word.length > 3);
    
    let confidence = 0;
    let penalties = 0;
    
    // STRICT NEGATIVE FILTERS FIRST - immediate rejection
    
    // Reject if ONLY other actors mentioned and NO mention of target actor
    const otherActors = [
      'sandra bullock', 'benjamin bratt', 'michael caine', 'candice bergen',
      'chris pine', 'zachary quinto', 'jim parsons', 'johnny galecki', 'kaley cuoco',
      'simon helberg', 'kunal nayyar', 'mayim bialik', 'melissa rauch'
    ];
    
    let hasOtherActor = false;
    let hasTargetActor = title.includes(name) || title.includes(lastName);
    
    for (const actor of otherActors) {
      if (title.includes(actor)) {
        hasOtherActor = true;
        // If it's ONLY about other actors and NO mention of target, reject
        if (!hasTargetActor) {
          return {
            isValid: false,
            confidence: -100,
            reasons: { rejection: `Only contains other actor: ${actor}, no mention of ${celebrityName}` }
          };
        }
      }
    }
    
    // Reject promotional graphics, podcasts, conventions
    const promotionalRejects = [
      'comic con', 'comicon', 'convention', 'podcast', 'interview graphic',
      'promotional graphic', 'event poster', 'announcement', 'logo',
      'vhs', 'dvd box', 'blu ray', 'bluray', 'box art', 'cover art'
    ];
    
    for (const reject of promotionalRejects) {
      if (title.includes(reject) || url.includes(reject)) {
        return {
          isValid: false,
          confidence: -100,
          reasons: { rejection: `Promotional/packaging content: ${reject}` }
        };
      }
    }
    
    // Reject edited/composite images
    const editedRejects = [
      'vs', 'versus', 'side by side', 'comparison', 'then and now',
      'old and new', 'young and old', 'photoshop', 'edited', 'composite',
      'mashup', 'meme', 'parody'
    ];
    
    for (const reject of editedRejects) {
      if (title.includes(reject)) {
        return {
          isValid: false,
          confidence: -100,
          reasons: { rejection: `Edited/composite image: ${reject}` }
        };
      }
    }
    
    // Reject website watermarks
    if (title.includes('watermark') || url.includes('watermark') || 
        title.includes('.com') || title.includes('website')) {
      return {
        isValid: false,
        confidence: -100,
        reasons: { rejection: 'Website watermark detected' }
      };
    }
    
    // Light penalties for red carpet (but don't reject - some are good)
    const eventTerms = ['red carpet', 'premiere', 'gala', 'awards', 'ceremony'];
    for (const term of eventTerms) {
      if (title.includes(term)) {
        penalties += 3; // Light penalty, not rejection
      }
    }
    
    // VOICE ROLE SPECIFIC VALIDATION
    if (role.isVoiceRole) {
      // For voice roles, character name is essential
      if (role.characterName) {
        const character = role.characterName.toLowerCase();
        if (title.includes(character)) {
          confidence += 10;
        } else {
          // No character name for voice role is suspicious
          penalties += 5;
        }
      }
      
      // Animation context required for voice roles
      const animationKeywords = ['character', 'animated', 'animation', 'cartoon'];
      const hasAnimationContext = animationKeywords.some(keyword => 
        title.includes(keyword) || url.includes(keyword)
      );
      
      if (hasAnimationContext) {
        confidence += 5;
      } else {
        penalties += 3;
      }
      
      // Actor name in voice role images is usually wrong (unless it's cast info)
      if (title.includes(name) && !hasAnimationContext && !title.includes('cast')) {
        penalties += 5;
      }
    } else {
      // LIVE ACTION VALIDATION - balanced for group shots
      
      // Name matching (generous for group shots)
      const hasFullName = title.includes(name);
      const hasLastName = title.includes(lastName);
      const hasFirstName = title.includes(firstName) && firstName.length > 3;
      
      if (hasFullName) {
        confidence += 15; // Strong bonus for full name
      } else if (hasLastName) {
        confidence += 10; // Good bonus for last name (important for group shots)
      } else if (hasFirstName) {
        confidence += 6; // Medium bonus for first name
      } else {
        // No direct name match - check if it's a legitimate group/cast photo
        const hasGroupContext = groupIndicators.some(term => title.includes(term));
        
        if (hasGroupContext) {
          // Group photo without direct name mention - smaller penalty
          penalties += 3;
        } else {
          // No name and no group context - bigger penalty
          penalties += 8;
        }
      }
      
      // BONUS for group shots and cast photos
      const groupMatches = groupIndicators.filter(indicator => title.includes(indicator));
      confidence += groupMatches.length * 4; // Good bonus for group context
      
      // Role context
      const roleMatches = roleWords.filter(word => title.includes(word));
      
      if (roleMatches.length >= 2) {
        confidence += 8; // Multiple role words
      } else if (roleMatches.length === 1) {
        confidence += 4; // One role word
      } else {
        penalties += 3; // No role context (lighter penalty)
      }
      
      // Character context (if available)
      if (role.character && role.character !== 'Unknown role') {
        const character = role.character.toLowerCase();
        if (title.includes(character)) {
          confidence += 6;
        }
      }
    }
    
    // COMMON VALIDATION (both voice and live action)
    
    // Franchise context (important for group shots)
    if (role.franchiseName) {
      const franchiseWords = role.franchiseName.toLowerCase().split(' ');
      const franchiseMatches = franchiseWords.filter(word => 
        word.length > 3 && title.includes(word)
      );
      confidence += franchiseMatches.length * 3; // Good bonus for franchise context
    }
    
    // Good source bonus
    const goodSources = ['imdb', 'themoviedb', 'rottentomatoes'];
    if (goodSources.some(goodSource => source.includes(goodSource))) {
      confidence += 4;
    }
    
    // Professional context
    const professionalTerms = ['actor', 'star', 'cast', 'movie', 'film'];
    if (professionalTerms.some(term => title.includes(term))) {
      confidence += 3;
    }
    
    // FINAL SCORING
    const finalScore = confidence - penalties;
    
    // Balanced thresholds - not too strict for group shots
    const threshold = role.isVoiceRole ? 8 : 7; // Reasonable thresholds
    
    const result = {
      isValid: finalScore >= threshold,
      confidence: finalScore,
      reasons: {
        nameMatch: hasTargetActor,
        hasOtherActor: hasOtherActor,
        groupContext: !role.isVoiceRole && groupIndicators.some(indicator => title.includes(indicator)),
        characterMatch: role.characterName && title.includes(role.characterName.toLowerCase()),
        roleContext: roleWords && roleWords.some(word => word.length > 3 && title.includes(word)),
        franchiseContext: role.franchiseName && role.franchiseName.toLowerCase().split(' ').some(word => 
          word.length > 3 && title.includes(word)
        ),
        isVoiceRole: role.isVoiceRole,
        penalties: penalties,
        threshold: threshold,
        details: `Score: ${finalScore} (confidence: ${confidence}, penalties: ${penalties}, threshold: ${threshold})`
      }
    };
    
    // Log rejections for debugging
    if (!result.isValid) {
      logger.info(`❌ REJECTED "${title}" - Score: ${finalScore}/${threshold} (conf:${confidence}, pen:${penalties})`);
    } else if (result.reasons.groupContext) {
      logger.info(`✅ GROUP SHOT: "${title}" - Score: ${finalScore}/${threshold}`);
    }
    
    return result;
  }
  
  /**
   * Download verified images with enhanced error handling
   */
  async downloadImages(images, workDir, celebrityName, role) {
    const downloadDir = path.join(workDir, 'downloaded');
    await fs.mkdir(downloadDir, { recursive: true });
    
    const downloadedImages = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        const filename = this.generateSafeFilename(role.name, i + 1, image.url || image.original);
        const filepath = path.join(downloadDir, filename);
        
        const success = await this.downloadSingleImage(image.url || image.original, filepath);
        
        if (success) {
          downloadedImages.push({
            filename: filename,
            filepath: filepath,
            originalUrl: image.url || image.original,
            role: role.name,
            character: role.character || role.characterName,
            title: image.title,
            source: image.source,
            sourceUrl: image.sourceUrl,
            reliabilityScore: image.reliabilityScore || 0,
            verificationScore: image.personVerification?.confidence || 0,
            tags: [
              role.media_type || 'unknown', 
              'serpapi',
              role.isVoiceRole ? 'voice_role' : 'live_action'
            ]
          });
          
          logger.info(`✅ Downloaded: ${filename} (verification: ${image.personVerification?.confidence || 0})`);
        }
        
      } catch (error) {
        logger.warn(`❌ Failed to download image ${i + 1}:`, error.message);
      }
    }
    
    return downloadedImages;
  }
  
  /**
   * Download single image with enhanced URL validation and retry logic
   */
  async downloadSingleImage(url, filepath, retries = 3) {
    // Pre-validate URL before attempting download
    if (!this.isValidImageUrl(url)) {
      logger.warn(`Skipping invalid image URL: ${url}`);
      return false;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios({
          method: 'GET',
          url: url,
          responseType: 'stream',
          timeout: 15000,
          maxRedirects: 3,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/*,*/*;q=0.8'
          }
        });

        // Check content type before proceeding
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
          throw new Error(`Invalid content type: ${contentType}`);
        }

        // Check content length if available
        const contentLength = response.headers['content-length'];
        if (contentLength && parseInt(contentLength) < 10000) { // Less than 10KB
          throw new Error(`File too small: ${contentLength} bytes`);
        }

        const writer = require('fs').createWriteStream(filepath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on('finish', () => resolve(true));
          writer.on('error', reject);
        });
        
      } catch (error) {
        logger.warn(`Download attempt ${attempt} failed for ${filepath}: ${error.message}`);
        
        if (attempt === retries) {
          return false;
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  }

  /**
   * Validate if URL is likely to return an actual image
   */
  isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    const lowerUrl = url.toLowerCase();
    
    // Check for obvious non-image URLs
    const badPatterns = [
      '/search?', '/login', '/signin', '/register',
      'javascript:', 'data:', 'mailto:',
      '.html', '.htm', '.php', '.asp', '.jsp',
      'facebook.com', 'twitter.com', 'instagram.com'
    ];
    
    if (badPatterns.some(pattern => lowerUrl.includes(pattern))) {
      return false;
    }
    
    // Should have image extension or be from known image hosting
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const imageHosts = ['imgur.com', 'flickr.com', 'photobucket.com'];
    
    const hasImageExtension = imageExtensions.some(ext => lowerUrl.includes(ext));
    const isImageHost = imageHosts.some(host => lowerUrl.includes(host));
    
    return hasImageExtension || isImageHost;
  }
  
  /**
   * Generate safe filename
   */
  generateSafeFilename(roleName, index, originalUrl) {
    const cleanRoleName = roleName
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
    
    const extension = this.getImageExtension(originalUrl);
    return `${cleanRoleName}_${index}.${extension}`;
  }
  
  /**
   * Get image extension
   */
  getImageExtension(url) {
    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    
    for (const ext of extensions) {
      if (url.toLowerCase().includes(`.${ext}`)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
    
    return 'jpg';
  }
}

module.exports = { fetchImages: ImageFetcher.fetchImages.bind(ImageFetcher) };
