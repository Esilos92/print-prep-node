const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');
const AIImageVerifier = require('./ai-services/AIImageVerifier');

class ImageFetcher {
  
  constructor() {
    // Initialize AI verifier
    this.aiVerifier = new AIImageVerifier();
    
    // Essential domain filtering - Keep strict on watermarked sites
    this.watermarkedDomains = [
      'alamy.com', 'alamyimages.fr', 'alamy.de', 'alamy.es',
      'gettyimages.com', 'gettyimages.ca', 'gettyimages.co.uk',
      'shutterstock.com', 'istockphoto.com', 'depositphotos.com',
      'bigstock.com', 'dreamstime.com', 'stockphoto.com',
      'photobucket.com', 'imageshack.us', '123rf.com',
      'canstockphoto.com', 'fotolia.com', 'stockvault.net'
    ];
    
    // TINY RELAXATION: Only removed the most restrictive exclusions
    this.contentExclusions = [
      '-signed', '-autograph', '-auction', '-ebay', '-memorabilia',
      '-"comic con"', '-convention', '-podcast', '-vhs', '-dvd',
      '-"red carpet"', '-vs', '-versus', '-meme',
      '-watermark', '-fanart', '-"fan art"', '-drawing', '-sketch'
      // TINY CHANGE: Only removed '-premiere' - premieres often have good character photos
    ];
    
    // Preferred sources for quality
    this.preferredDomains = [
      'imdb.com', 'themoviedb.org', 'rottentomatoes.com',
      'variety.com', 'hollywoodreporter.com', 'entertainment.com',
      'disney.com', 'marvel.com', 'starwars.com', 'paramount.com',
      'fandom.com', 'wikia.org', 'wikipedia.org' // Added Wikipedia
    ];
  }
  
  /**
   * Main entry point - fetch images with AI verification (maintains compatibility)
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      logger.info(`🖼️ Fetching and verifying images for ${celebrityName} in ${role.name}...`);
      
      const fetcher = new ImageFetcher();
      const maxImages = config.image.maxImagesPerRole || 70; // Increased from 60 to 70
      
      // Generate streamlined search queries
      const searchQueries = fetcher.generateSearchQueries(celebrityName, role);
      let allImages = [];
      
      // Execute searches
      for (const query of searchQueries) {
        try {
          logger.info(`Search: "${query}"`);
          const images = await fetcher.searchSerpAPI(query, Math.ceil(maxImages / searchQueries.length));
          const filteredImages = fetcher.applyWatermarkFiltering(images);
          allImages.push(...filteredImages);
          
          if (allImages.length >= maxImages * 1.2) break; // Search for slightly more than we need
        } catch (error) {
          logger.warn(`Query failed: ${query} - ${error.message}`);
        }
      }
      
      // OPTIMIZATION: Prepare high-quality batch for AI verification
      const uniqueImages = fetcher.removeDuplicates(allImages);
      const validImages = fetcher.validateImages(uniqueImages, celebrityName, role);
      const qualityImages = fetcher.prioritizeImageQuality(validImages); // NEW: Quality prioritization
      const diversifiedImages = fetcher.diversifyContentTypesRelaxed(qualityImages);
      
      logger.info(`${diversifiedImages.length} quality images prepared for AI verification`);
      
      // Download more images for AI to review
      const downloadedImages = await fetcher.downloadImages(
        diversifiedImages.slice(0, maxImages), 
        workDir, 
        celebrityName, 
        role
      );
      
      logger.info(`📥 Downloaded ${downloadedImages.length} images`);
      
      // Check if AI verification is enabled
      const enableAIVerification = process.env.ENABLE_AI_VERIFICATION !== 'false';
      
      if (enableAIVerification) {
        // AI VERIFICATION STEP
        logger.info(`🤖 Starting AI verification of downloaded images...`);
        try {
          const verificationResults = await fetcher.aiVerifier.verifyImages(
            downloadedImages,
            celebrityName,
            role.character || role.characterName || 'Unknown',
            role.title || role.name,
            role.medium || role.media_type || 'unknown'
          );
          
          // DEBUG: Log what Claude rejected and why
          if (verificationResults.invalid && verificationResults.invalid.length > 0) {
            logger.info(`🔍 CLAUDE REJECTIONS DEBUG:`);
            verificationResults.invalid.forEach((invalid, index) => {
              logger.info(`❌ ${index + 1}. ${invalid.filename}`);
              logger.info(`   Title: ${invalid.title || 'No title'}`);
              logger.info(`   Source: ${invalid.sourceUrl || 'No source'}`);
              logger.info(`   Reason: ${invalid.reason || 'No reason given'}`);
              logger.info(`   ---`);
            });
          }
          
          // Keep only verified valid images
          const finalValidImages = verificationResults.valid;
          
          // DEBUG: Log what Claude approved
          logger.info(`✅ CLAUDE APPROVED ${finalValidImages.length} images:`);
          finalValidImages.forEach((valid, index) => {
            logger.info(`✅ ${index + 1}. ${valid.filename} - ${valid.title || 'No title'}`);
          });
          
          // Clean up invalid images
          await fetcher.cleanupInvalidImages(verificationResults.invalid);
          
          logger.info(`✅ Final result: ${finalValidImages.length} AI-verified images`);
          logger.info(`💰 Verification cost: $${verificationResults.totalCost.toFixed(4)}`);
          logger.info(`📊 Services used:`, verificationResults.serviceUsage);
          
          // Return the verified images (maintains compatibility)
          return finalValidImages;
          
        } catch (verificationError) {
          logger.warn(`⚠️ AI verification failed: ${verificationError.message}`);
          logger.info(`📦 Returning ${downloadedImages.length} unverified images`);
          return downloadedImages;
        }
      } else {
        logger.info(`📦 AI verification disabled, returning ${downloadedImages.length} images`);
        return downloadedImages;
      }
      
    } catch (error) {
      logger.error(`Error fetching images for ${role.name}:`, error.message);
      return [];
    }
  }
  
  /**
   * Generate search queries using your optimized search terms
   */
  generateSearchQueries(celebrityName, role) {
    // PRIORITY 1: Use the optimized character image search terms if available
    if (role.finalSearchTerms && role.finalSearchTerms.length > 0) {
      logger.info(`🎯 Using AI-optimized character image search terms (${role.finalSearchTerms.length} terms)`);
      return role.finalSearchTerms;
    }
    
    // PRIORITY 2: Use character_images from search optimization (object format)
    if (role.searchTerms && role.searchTerms.character_images && role.searchTerms.character_images.length > 0) {
      logger.info(`🎯 Using ChatGPT character image search terms (${role.searchTerms.character_images.length} terms)`);
      return role.searchTerms.character_images;
    }
    
    // PRIORITY 3: Use searchTerms as array (handles your current format!)
    if (role.searchTerms && Array.isArray(role.searchTerms) && role.searchTerms.length > 0) {
      logger.info(`🎯 Using optimized search terms array (${role.searchTerms.length} terms)`);
      return role.searchTerms;
    }
    
    // PRIORITY 4: Use any AI-generated terms
    if (role.searchTerms && role.searchTerms.ai && role.searchTerms.ai.length > 0) {
      logger.info(`🎯 Using AI-generated search terms (${role.searchTerms.ai.length} terms)`);
      return role.searchTerms.ai;
    }
    
    // FALLBACK: Generate basic queries (should NOT hit this now)
    const roleName = role.name || role.title || role.character || 'Unknown Role';
    logger.warn(`⚠️ No optimized search terms found, using basic fallback for ${roleName}`);
    
    const watermarkExclusions = this.watermarkedDomains.map(d => `-site:${d}`).join(' ');
    const contentExclusions = this.contentExclusions.join(' ');
    const allExclusions = `${watermarkExclusions} ${contentExclusions}`;
    
    const queries = [];
    
    // Check if it's a voice role - use multiple possible field names
    const isVoiceRole = role.isVoiceRole || 
                       role.medium?.includes('voice') || 
                       role.media_type?.includes('voice') ||
                       role.medium?.includes('animation');
    
    if (isVoiceRole) {
      logger.info(`🎭 Voice role fallback: targeting CHARACTER images for ${roleName}`);
      
      const characterName = role.character || role.characterName;
      const showTitle = role.title || role.name;
      
      if (characterName && characterName !== 'Unknown Character') {
        // PURE CHARACTER FOCUS: No actor name - just character and show
        queries.push(`"${characterName}" "${showTitle}" character image anime ${allExclusions}`);
        queries.push(`"${characterName}" "${showTitle}" scene still screenshot ${allExclusions}`);
        queries.push(`"${characterName}" character "${showTitle}" official art ${allExclusions}`);
      } else {
        // If no character name, focus on show with character keywords
        queries.push(`"${showTitle}" characters official art ${allExclusions}`);
        queries.push(`"${showTitle}" anime character images ${allExclusions}`);
      }
      
    } else {
      logger.info(`🎬 Live action fallback: targeting actor images for ${roleName}`);
      
      queries.push(`"${celebrityName}" "${roleName}" scene still ${allExclusions}`);
      
      const characterName = role.character || role.characterName;
      if (characterName && characterName !== 'Unknown role') {
        queries.push(`"${celebrityName}" "${characterName}" "${roleName}" scene ${allExclusions}`);
      }
      
      queries.push(`"${celebrityName}" "${roleName}" promotional photo ${allExclusions}`);
    }

    return queries.slice(0, 3);
  }
  
  /**
   * Search SerpAPI with optimized parameters for quality + older content leniency
   */
  async searchSerpAPI(query, maxResults = 22) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query,
        num: Math.min(maxResults, 100),
        ijn: 0,
        safe: 'active',
        imgsz: 'l', // Large images - but we'll be lenient for older content
        imgtype: 'photo',
        // OPTIMIZATION: Add these for better quality
        imgc: 'color', // Color images tend to be higher quality
        rights: 'cc_publicdomain,cc_attribute,cc_sharealike,cc_noncommercial,cc_nonderived' // Better sources
      };

      const response = await axios.get(config.api.serpEndpoint, { 
        params,
        timeout: 30000
      });

      if (!response.data?.images_results) {
        logger.warn(`No images found for: ${query}`);
        return [];
      }

      const images = response.data.images_results.map((img, index) => ({
        url: img.original || img.thumbnail,
        thumbnail: img.thumbnail,
        title: img.title || `Image ${index + 1}`,
        source: img.source || 'Unknown',
        sourceUrl: img.link || '',
        searchQuery: query,
        // OPTIMIZATION: Track image dimensions if available
        width: img.original_width,
        height: img.original_height
      }));

      // OPTIMIZATION: Prioritize images but be lenient with older content
      const sortedImages = images.sort((a, b) => {
        const aSize = (a.width || 0) * (a.height || 0);
        const bSize = (b.width || 0) * (b.height || 0);
        
        // Boost remastered/HD content
        const aIsHD = this.detectHDContent(a);
        const bIsHD = this.detectHDContent(b);
        
        if (aIsHD !== bIsHD) {
          return bIsHD ? 1 : -1; // HD content first
        }
        
        return bSize - aSize; // Then by size
      });

      logger.info(`Found ${sortedImages.length} images for: ${query} (sorted by quality)`);
      return sortedImages;

    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid SerpAPI key. Check your SERP_API_KEY in .env file');
      }
      if (error.response?.status === 403) {
        throw new Error('SerpAPI quota exceeded or access denied');
      }
      
      logger.error(`SerpAPI error: ${error.message}`);
      return [];
    }
  }

  /**
   * NEW: Detect HD/remastered content for prioritization
   */
  detectHDContent(image) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    const hdIndicators = [
      'hd', '1080p', '4k', 'uhd', 'blu-ray', 'bluray', 'remastered', 
      'restored', 'digital', 'high resolution', 'high quality'
    ];
    
    return hdIndicators.some(indicator => 
      title.includes(indicator) || url.includes(indicator)
    );
  }
  
  /**
   * Apply smart filtering - keep quality sources, block obvious problems
   */
  applyWatermarkFiltering(images) {
    return images.filter(image => {
      const url = (image.sourceUrl || '').toLowerCase();
      const imageUrl = (image.url || '').toLowerCase();
      const title = (image.title || '').toLowerCase();
      
      // STRICT: Block watermarked stock photo sites
      for (const domain of this.watermarkedDomains) {
        if (url.includes(domain) || imageUrl.includes(domain)) {
          return false;
        }
      }

      // STRICT: Block watermark patterns
      const watermarkPatterns = ['/comp/', '/preview/', '/sample/', '/watermark/', '/thumb/'];
      for (const pattern of watermarkPatterns) {
        if (url.includes(pattern) || imageUrl.includes(pattern)) {
          return false;
        }
      }

      // SMART: Prioritize good sources
      const hasGoodSource = this.preferredDomains.some(domain => url.includes(domain));
      if (hasGoodSource) {
        return true; // Always keep images from good sources
      }

      // SELECTIVE: Only block obvious fan art
      const strictFanKeywords = ['fanart', 'fan art', 'deviantart', 'drawing', 'sketch'];
      for (const keyword of strictFanKeywords) {
        if (title.includes(keyword)) {
          return false;
        }
      }

      return true;
    });
  }
  
  /**
   * Remove duplicate images
   */
  removeDuplicates(images) {
    const seen = new Set();
    
    return images.filter(img => {
      const urlKey = (img.url || '').split('?')[0].toLowerCase();
      
      if (seen.has(urlKey)) {
        return false;
      }
      seen.add(urlKey);
      return true;
    });
  }
  
  /**
   * Validate images
   */
  validateImages(images, celebrityName, role) {
    return images.filter(image => {
      const validation = this.simpleValidation(image, celebrityName, role);
      
      if (!validation.isValid) {
        logger.warn(`❌ ${image.title}: ${validation.reason}`);
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * Simple validation
   */
  simpleValidation(image, celebrityName, role) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    const strictRejects = [
      'comic con', 'convention', 'podcast', 'interview graphic',
      'promotional graphic', 'vhs', 'dvd', 'blu ray', 'box art',
      'vs', 'versus', 'side by side', 'comparison', 'meme', 'parody'
    ];
    
    for (const reject of strictRejects) {
      if (title.includes(reject) || url.includes(reject)) {
        return { isValid: false, reason: `Rejected content: ${reject}` };
      }
    }
    
    const wrongActors = [
      'sandra bullock', 'benjamin bratt', 'michael caine', 'candice bergen'
    ];
    
    const targetActor = celebrityName.toLowerCase();
    const hasTargetActor = title.includes(targetActor);
    let hasWrongActor = false;
    
    for (const wrongActor of wrongActors) {
      if (title.includes(wrongActor)) {
        hasWrongActor = true;
        if (!hasTargetActor) {
          return { isValid: false, reason: `Wrong actor only: ${wrongActor}` };
        }
      }
    }
    
    if (role.isVoiceRole) {
      return this.validateVoiceRole(image, role);
    } else {
      return this.validateLiveAction(image, celebrityName, role);
    }
  }
  
  /**
   * Voice role validation - UPDATED for character-focused searches
   */
  validateVoiceRole(image, role) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    // Enhanced character keywords for anime/animation
    const characterKeywords = [
      'character', 'animated', 'animation', 'scene', 'still', 'anime', 
      'screenshot', 'episode', 'manga', 'art', 'official'
    ];
    const hasCharacterContext = characterKeywords.some(k => title.includes(k) || url.includes(k));
    
    // Check for character name match
    if (role.character && role.character !== 'Unknown Character') {
      const character = role.character.toLowerCase();
      if (title.includes(character)) {
        return { isValid: true, reason: 'Character name match' };
      }
    }
    
    // Check for show/series name
    const showTitle = role.title || role.name;
    if (showTitle) {
      const showWords = showTitle.toLowerCase().split(' ').filter(w => w.length > 3);
      const hasShowContext = showWords.some(word => title.includes(word));
      
      if (hasShowContext && hasCharacterContext) {
        return { isValid: true, reason: 'Show and character context found' };
      }
    }
    
    // Accept if has strong character/animation indicators
    if (hasCharacterContext) {
      return { isValid: true, reason: 'Animation/character context found' };
    }
    
    return { isValid: false, reason: 'No character/animation context' };
  }
  
  /**
   * Live action validation
   */
  validateLiveAction(image, celebrityName, role) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    const groupIndicators = [
      'cast', 'crew', 'ensemble', 'group', 'team', 'together', 
      'with', 'co-star', 'behind the scenes', 'on set'
    ];
    
    const roleWords = role.name.toLowerCase().split(' ').filter(w => w.length > 3);
    
    const actorName = celebrityName.toLowerCase();
    const actorWords = actorName.split(' ');
    const lastName = actorWords[actorWords.length - 1];
    
    const hasFullName = title.includes(actorName);
    const hasLastName = title.includes(lastName);
    
    const hasGroupContext = groupIndicators.some(indicator => title.includes(indicator));
    const hasRoleContext = roleWords.some(word => title.includes(word));
    
    if (hasFullName || hasLastName) {
      return { isValid: true, reason: 'Actor name match' };
    }
    
    if (hasGroupContext && hasRoleContext) {
      return { isValid: true, reason: 'Group shot with role context' };
    }
    
    if (hasRoleContext) {
      return { isValid: true, reason: 'Role context present' };
    }
    
    return { isValid: false, reason: 'No actor or role context' };
  }

  /**
   * NEW: Prioritize image quality for better upscaling potential
   */
  prioritizeImageQuality(images) {
    return images
      .map(image => ({
        ...image,
        qualityScore: this.calculateQualityScore(image)
      }))
      .sort((a, b) => b.qualityScore - a.qualityScore); // Higher quality first
  }

  /**
   * Calculate quality score for image prioritization - BALANCED approach
   */
  calculateQualityScore(image) {
    let score = 0;
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    // SIZE BONUS: Larger images get higher scores (better for upscaling)
    const estimatedSize = (image.width || 400) * (image.height || 300);
    score += Math.min(estimatedSize / 100000, 40); // Reduced cap from 50 to 40
    
    // SOURCE BONUS: Preferred domains get boost but not huge
    if (this.preferredDomains.some(domain => url.includes(domain))) {
      score += 25; // Reduced from 30
    }
    
    // HD/REMASTERED BONUS: Nice to have but not essential
    if (this.detectHDContent(image)) {
      score += 20; // Reduced from 40 - don't over-prioritize HD
    }
    
    // CONTENT BONUS: Scene stills and promotional photos are good
    if (title.includes('still') || title.includes('scene')) score += 15; // Reduced from 20
    if (title.includes('promotional') || title.includes('press')) score += 12; // Reduced from 15
    if (title.includes('official')) score += 12; // Reduced from 15
    if (title.includes('hd') || title.includes('high res')) score += 8; // Reduced from 10
    
    // LENIENCY: Don't penalize older content OR smaller images too harshly
    const olderContentIndicators = ['vhs', 'dvd', 'tv rip', '80s', '90s', 'vintage'];
    const isOlderContent = olderContentIndicators.some(indicator => 
      title.includes(indicator) || url.includes(indicator)
    );
    
    if (isOlderContent) {
      score += 15; // Increased bonus for older content
    }
    
    // REDUCED PENALTIES: Don't be too harsh on lower quality
    if (title.includes('thumbnail') || title.includes('small')) score -= 10; // Reduced from 20
    if (title.includes('low res') || title.includes('pixelated')) score -= 8; // Reduced from 15
    
    return score;
  }
  
  /**
   * BALANCED: Content diversification - more inclusive limits
   */
  diversifyContentTypesRelaxed(images) {
    const contentTypeLimits = {
      poster: 8,         // Increased from 6
      behind_scenes: 12, // Increased from 10
      press: 22,         // Increased from 18
      movie_still: 30,   // Increased from 25 - Joseph has lots of movie stills
      cast_group: 22,    // Increased from 18
      portrait: 12,      // Increased from 10
      general: 35        // Increased from 30
    };

    const contentTypeCounts = {};
    const diversifiedImages = [];

    for (const image of images) {
      const contentType = this.detectContentType(image);
      const currentCount = contentTypeCounts[contentType] || 0;
      const limit = contentTypeLimits[contentType] || 20; // Increased default limit

      if (currentCount < limit) {
        diversifiedImages.push({
          ...image,
          contentType: contentType
        });
        contentTypeCounts[contentType] = currentCount + 1;
        
        logger.info(`✅ Added ${contentType}: ${currentCount + 1}/${limit}`);
      } else {
        logger.info(`⏭️ Skipped ${contentType}: limit reached (${limit})`);
      }

      if (diversifiedImages.length >= 90) break; // Increased from 80
    }

    logger.info(`Content distribution: ${Object.entries(contentTypeCounts)
      .map(([type, count]) => `${type}:${count}`)
      .join(', ')}`);

    return diversifiedImages;
  }
  
  /**
   * Detect content type
   */
  detectContentType(image) {
    const title = (image.title || '').toLowerCase();
    
    if (title.includes('poster')) return 'poster';
    if (title.includes('behind the scenes') || title.includes('on set')) return 'behind_scenes';
    if (title.includes('press') || title.includes('promotional')) return 'press';
    if (title.includes('still') || title.includes('scene')) return 'movie_still';
    if (title.includes('cast') || title.includes('group')) return 'cast_group';
    if (title.includes('portrait') || title.includes('headshot')) return 'portrait';
    
    return 'general';
  }
  
  /**
   * Download images
   */
  async downloadImages(images, workDir, celebrityName, role) {
    const downloadDir = path.join(workDir, 'downloaded');
    await fs.mkdir(downloadDir, { recursive: true });
    
    const downloadedImages = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        const filename = this.generateSafeFilename(role.name, i + 1, image.url);
        const filepath = path.join(downloadDir, filename);
        
        const success = await this.downloadSingleImage(image.url, filepath);
        
        if (success) {
          downloadedImages.push({
            filename: filename,
            filepath: filepath,
            originalUrl: image.url,
            role: role.name,
            character: role.character || role.characterName,
            title: image.title,
            source: image.source,
            sourceUrl: image.sourceUrl,
            contentType: image.contentType || 'general',
            tags: [
              role.media_type || 'unknown', 
              'serpapi',
              role.isVoiceRole ? 'voice_role' : 'live_action'
            ]
          });
          
          logger.info(`✅ Downloaded: ${filename}`);
        }
        
      } catch (error) {
        logger.warn(`❌ Failed to download image ${i + 1}:`, error.message);
      }
    }
    
    return downloadedImages;
  }
  
  /**
   * Clean up invalid images
   */
  async cleanupInvalidImages(invalidImages) {
    for (const invalidImage of invalidImages) {
      try {
        await fs.unlink(invalidImage.filepath);
        logger.info(`🗑️ Removed invalid image: ${invalidImage.filename} (${invalidImage.reason})`);
      } catch (error) {
        logger.warn(`⚠️ Failed to remove ${invalidImage.filename}: ${error.message}`);
      }
    }
  }
  
  /**
   * Download single image
   */
  async downloadSingleImage(url, filepath, retries = 3) {
    if (!this.isValidImageUrl(url)) {
      logger.warn(`Invalid image URL: ${url}`);
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const contentType = response.headers['content-type'];
        if (!contentType?.startsWith('image/')) {
          throw new Error(`Invalid content type: ${contentType}`);
        }

        const writer = require('fs').createWriteStream(filepath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on('finish', () => resolve(true));
          writer.on('error', reject);
        });
        
      } catch (error) {
        logger.warn(`Download attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === retries) {
          return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  }

  /**
   * Validate image URL
   */
  isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    const lowerUrl = url.toLowerCase();
    
    const badPatterns = [
      '/search?', '/login', 'javascript:', 'data:', 'mailto:',
      '.html', '.php', '.asp', 'facebook.com', 'twitter.com'
    ];
    
    if (badPatterns.some(pattern => lowerUrl.includes(pattern))) {
      return false;
    }
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const imageHosts = ['imgur.com', 'flickr.com'];
    
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
