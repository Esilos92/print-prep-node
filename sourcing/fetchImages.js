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
    
    // Essential domain filtering - WORKING, keep this
    this.watermarkedDomains = [
      'alamy.com', 'alamyimages.fr', 'alamy.de', 'alamy.es',
      'gettyimages.com', 'gettyimages.ca', 'gettyimages.co.uk',
      'shutterstock.com', 'istockphoto.com', 'depositphotos.com',
      'bigstock.com', 'dreamstime.com', 'stockphoto.com',
      'photobucket.com', 'imageshack.us', '123rf.com',
      'canstockphoto.com', 'fotolia.com', 'stockvault.net'
    ];
    
    // Content exclusions - WORKING, keep this
    this.contentExclusions = [
      '-signed', '-autograph', '-auction', '-ebay', '-memorabilia',
      '-"comic con"', '-convention', '-podcast', '-vhs', '-dvd',
      '-"red carpet"', '-premiere', '-vs', '-versus', '-meme',
      '-watermark', '-fanart', '-"fan art"', '-drawing', '-sketch'
    ];
    
    // Preferred sources for quality
    this.preferredDomains = [
      'imdb.com', 'themoviedb.org', 'rottentomatoes.com',
      'variety.com', 'hollywoodreporter.com', 'entertainment.com',
      'disney.com', 'marvel.com', 'starwars.com', 'paramount.com',
      'fandom.com', 'wikia.org' // Character wikis with official images
    ];
  }
  
  /**
   * Main entry point - fetch images with AI verification (maintains compatibility)
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      logger.info(`🖼️ Fetching and verifying images for ${celebrityName} in ${role.name}...`);
      
      const fetcher = new ImageFetcher();
      const maxImages = config.image.maxImagesPerRole || 50;
      
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
          
          if (allImages.length >= maxImages) break;
        } catch (error) {
          logger.warn(`Query failed: ${query} - ${error.message}`);
        }
      }
      
      // Remove duplicates and apply basic validation
      const uniqueImages = fetcher.removeDuplicates(allImages);
      const validImages = fetcher.validateImages(uniqueImages, celebrityName, role);
      const diversifiedImages = fetcher.diversifyContentTypes(validImages);
      
      logger.info(`${diversifiedImages.length} images passed basic filters`);
      
      // Download the images first
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
          
          // Keep only verified valid images
          const finalValidImages = verificationResults.valid;
          
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
    const queries = [];
    
    // Use the optimized search terms if available
    if (role.searchTerms && role.searchTerms.character_images && role.searchTerms.character_images.length > 0) {
      logger.info(`🎯 Using optimized character image search terms`);
      return role.searchTerms.character_images.slice(0, 6); // Use all 6 optimized terms
    }
    
    // Fallback to basic queries if no optimized terms
    const watermarkExclusions = this.watermarkedDomains.map(d => `-site:${d}`).join(' ');
    const contentExclusions = this.contentExclusions.join(' ');
    const allExclusions = `${watermarkExclusions} ${contentExclusions}`;
    
    if (role.isVoiceRole) {
      logger.info(`🎭 Voice role: targeting character images for ${role.name}`);
      
      if (role.characterName && role.characterName !== 'Unknown Character') {
        queries.push(`"${role.characterName}" "${role.name}" character image ${allExclusions}`);
        queries.push(`"${role.characterName}" "${role.name}" scene still ${allExclusions}`);
      }
      queries.push(`"${role.name}" character images official ${allExclusions}`);
      
    } else {
      logger.info(`🎬 Live action: targeting actor images for ${role.name}`);
      
      queries.push(`"${celebrityName}" "${role.name}" scene still ${allExclusions}`);
      
      if (role.character && role.character !== 'Unknown role') {
        queries.push(`"${celebrityName}" "${role.character}" "${role.name}" scene ${allExclusions}`);
      }
      
      queries.push(`"${celebrityName}" "${role.name}" promotional photo ${allExclusions}`);
    }

    return queries.slice(0, 3);
  }
  
  /**
   * Search SerpAPI with streamlined parameters
   */
  async searchSerpAPI(query, maxResults = 20) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query,
        num: Math.min(maxResults, 100),
        ijn: 0,
        safe: 'active',
        imgsz: 'l', // Back to large - but we'll be more lenient in validation
        imgtype: 'photo'
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
        searchQuery: query
      }));

      logger.info(`Found ${images.length} images for: ${query}`);
      return images;

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
   * Apply watermark filtering
   */
  applyWatermarkFiltering(images) {
    return images.filter(image => {
      const url = (image.sourceUrl || '').toLowerCase();
      const imageUrl = (image.url || '').toLowerCase();
      const title = (image.title || '').toLowerCase();
      
      for (const domain of this.watermarkedDomains) {
        if (url.includes(domain) || imageUrl.includes(domain)) {
          logger.warn(`❌ Blocked watermarked domain: ${domain}`);
          return false;
        }
      }

      const watermarkPatterns = ['/comp/', '/preview/', '/sample/', '/watermark/', '/thumb/'];
      for (const pattern of watermarkPatterns) {
        if (url.includes(pattern) || imageUrl.includes(pattern)) {
          logger.warn(`❌ Blocked watermark pattern: ${pattern}`);
          return false;
        }
      }

      const fanKeywords = ['fanart', 'fan art', 'drawing', 'sketch', 'artwork'];
      for (const keyword of fanKeywords) {
        if (title.includes(keyword)) {
          logger.warn(`❌ Blocked fan content: ${keyword}`);
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
   * Voice role validation
   */
  validateVoiceRole(image, role) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    const characterKeywords = ['character', 'animated', 'animation', 'scene', 'still'];
    const hasCharacterContext = characterKeywords.some(k => title.includes(k) || url.includes(k));
    
    if (role.characterName && role.characterName !== 'Unknown Character') {
      const character = role.characterName.toLowerCase();
      if (title.includes(character)) {
        return { isValid: true, reason: 'Character name match' };
      }
    }
    
    const roleWords = role.name.toLowerCase().split(' ').filter(w => w.length > 3);
    const hasRoleContext = roleWords.some(word => title.includes(word));
    
    if (hasCharacterContext || hasRoleContext) {
      return { isValid: true, reason: 'Voice role context found' };
    }
    
    return { isValid: false, reason: 'No voice role context' };
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
   * Content diversification
   */
  diversifyContentTypes(images) {
    const contentTypeLimits = {
      poster: 5,
      behind_scenes: 8,
      press: 15,
      movie_still: 20,
      cast_group: 15,
      portrait: 8,
      general: 25
    };

    const contentTypeCounts = {};
    const diversifiedImages = [];

    for (const image of images) {
      const contentType = this.detectContentType(image);
      const currentCount = contentTypeCounts[contentType] || 0;
      const limit = contentTypeLimits[contentType] || 10;

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

      if (diversifiedImages.length >= 75) break;
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
