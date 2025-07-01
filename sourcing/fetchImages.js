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
    
    // ESSENTIAL watermarked domains - Keep strict on these
    this.watermarkedDomains = [
      'alamy.com', 'alamyimages.fr', 'alamy.de', 'alamy.es',
      'gettyimages.com', 'gettyimages.ca', 'gettyimages.co.uk',
      'shutterstock.com', 'istockphoto.com', 'depositphotos.com',
      'bigstock.com', 'dreamstime.com', 'stockphoto.com',
      'photobucket.com', 'imageshack.us', '123rf.com',
      'canstockphoto.com', 'fotolia.com', 'stockvault.net'
    ];
    
    // SIMPLIFIED exclusions - Focus on obvious junk only
    this.contentExclusions = [
      '-signed', '-autograph', '-auction', '-ebay', '-memorabilia',
      '-"comic con"', '-convention', '-podcast', '-vhs', '-dvd',
      '-watermark', '-vs', '-versus', '-meme'
      // REMOVED: Most restrictive exclusions that were killing valid results
    ];
    
    // Preferred sources for quality boosting
    this.preferredDomains = [
      'imdb.com', 'themoviedb.org', 'rottentomatoes.com',
      'variety.com', 'hollywoodreporter.com', 'entertainment.com',
      'disney.com', 'marvel.com', 'starwars.com', 'paramount.com',
      'fandom.com', 'wikia.org', 'wikipedia.org', 'crunchyroll.com',
      'funimation.com', 'myanimelist.net', 'anidb.net'
    ];
  }
  
  /**
   * Main entry point - CHARACTER-FIRST strategy
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      logger.info(`🖼️ Fetching images for ${celebrityName} in ${role.name} (CHARACTER-FIRST strategy)...`);
      
      const fetcher = new ImageFetcher();
      const maxImages = config.image.maxImagesPerRole || 80; // Increased from 70
      
      // Generate CHARACTER-FOCUSED search queries
      const searchQueries = fetcher.generateCharacterFirstQueries(celebrityName, role);
      let allImages = [];
      
      // Execute searches with higher volume
      for (const query of searchQueries) {
        try {
          logger.info(`Search: "${query}"`);
          const images = await fetcher.searchSerpAPI(query, 35); // Increased from 22
          const filteredImages = fetcher.applyMinimalFiltering(images);
          allImages.push(...filteredImages);
          
          if (allImages.length >= maxImages * 1.5) break; // Get more images for AI to review
        } catch (error) {
          logger.warn(`Query failed: ${query} - ${error.message}`);
        }
      }
      
      // Process with VOLUME-FIRST approach
      const uniqueImages = fetcher.removeDuplicates(allImages);
      const validImages = fetcher.validateImagesLenient(uniqueImages, celebrityName, role);
      const qualityImages = fetcher.prioritizeImageQualityBalanced(validImages);
      const diversifiedImages = fetcher.diversifyContentTypesGenerous(qualityImages);
      
      logger.info(`${diversifiedImages.length} images prepared for AI verification (VOLUME-FIRST approach)`);
      
      // Download MORE images for AI to review
      const downloadedImages = await fetcher.downloadImages(
        diversifiedImages.slice(0, Math.min(maxImages * 1.2, 100)), // Download more for AI review
        workDir, 
        celebrityName, 
        role
      );
      
      logger.info(`📥 Downloaded ${downloadedImages.length} images`);
      
      // AI VERIFICATION - Let AI do the heavy filtering
      const enableAIVerification = process.env.ENABLE_AI_VERIFICATION !== 'false';
      
      if (enableAIVerification) {
        logger.info(`🤖 Starting AI verification (CHARACTER-FIRST mode)...`);
        try {
          const verificationResults = await fetcher.aiVerifier.verifyImages(
            downloadedImages,
            celebrityName,
            role.character || role.characterName || 'Unknown',
            role.title || role.name,
            role.medium || role.media_type || 'unknown'
          );
          
          // Log detailed results
          if (verificationResults.invalid && verificationResults.invalid.length > 0) {
            logger.info(`🔍 AI REJECTIONS (${verificationResults.invalid.length}):`);
            verificationResults.invalid.slice(0, 5).forEach((invalid, index) => {
              logger.info(`❌ ${index + 1}. ${invalid.filename} - ${invalid.reason || 'No reason'}`);
            });
            if (verificationResults.invalid.length > 5) {
              logger.info(`... and ${verificationResults.invalid.length - 5} more rejections`);
            }
          }
          
          const finalValidImages = verificationResults.valid;
          
          logger.info(`✅ AI APPROVED ${finalValidImages.length} images:`);
          finalValidImages.slice(0, 5).forEach((valid, index) => {
            logger.info(`✅ ${index + 1}. ${valid.filename} - ${valid.title || 'No title'}`);
          });
          if (finalValidImages.length > 5) {
            logger.info(`... and ${finalValidImages.length - 5} more approved images`);
          }
          
          // Clean up invalid images
          await fetcher.cleanupInvalidImages(verificationResults.invalid);
          
          logger.info(`✅ FINAL RESULT: ${finalValidImages.length} AI-verified images`);
          logger.info(`💰 Verification cost: $${verificationResults.totalCost.toFixed(4)}`);
          logger.info(`📊 Services used:`, verificationResults.serviceUsage);
          
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
   * CHARACTER-FIRST query generation - prioritizes character over actor
   */
  generateCharacterFirstQueries(celebrityName, role) {
    // PRIORITY 1: Use optimized search terms if available
    if (role.finalSearchTerms && role.finalSearchTerms.length > 0) {
      logger.info(`🎯 Using AI-optimized search terms (${role.finalSearchTerms.length} terms)`);
      return role.finalSearchTerms;
    }
    
    if (role.searchTerms && role.searchTerms.character_images && role.searchTerms.character_images.length > 0) {
      logger.info(`🎯 Using character image search terms (${role.searchTerms.character_images.length} terms)`);
      return role.searchTerms.character_images;
    }
    
    if (role.searchTerms && Array.isArray(role.searchTerms) && role.searchTerms.length > 0) {
      logger.info(`🎯 Using search terms array (${role.searchTerms.length} terms)`);
      return role.searchTerms;
    }
    
    // FALLBACK: Generate CHARACTER-FIRST queries
    const roleName = role.name || role.title || role.character || 'Unknown Role';
    logger.info(`🎯 Generating CHARACTER-FIRST fallback queries for ${roleName}`);
    
    const watermarkExclusions = this.watermarkedDomains.map(d => `-site:${d}`).join(' ');
    const contentExclusions = this.contentExclusions.join(' ');
    const allExclusions = `${watermarkExclusions} ${contentExclusions}`;
    
    const queries = [];
    
    // Determine if character-focused search should be used
    const characterName = role.character || role.characterName;
    const showTitle = role.title || role.name;
    const isVoiceRole = role.isVoiceRole || 
                       role.medium?.includes('voice') || 
                       role.media_type?.includes('voice') ||
                       role.medium?.includes('animation') ||
                       role.medium?.includes('anime');
    
    // CHARACTER-FIRST approach for ALL roles (not just voice)
    if (characterName && characterName !== 'Unknown Character' && characterName !== 'Unknown role') {
      
      if (isVoiceRole) {
        logger.info(`🎭 VOICE ROLE: Pure character focus for ${characterName}`);
        
        // PURE CHARACTER FOCUS - NO actor name pollution
        queries.push(`"${characterName}" "${showTitle}" character anime scene ${allExclusions}`);
        queries.push(`"${characterName}" "${showTitle}" episode screenshot ${allExclusions}`);
        queries.push(`"${characterName}" character "${showTitle}" official art ${allExclusions}`);
        queries.push(`"${showTitle}" "${characterName}" anime character ${allExclusions}`);
        
      } else {
        logger.info(`🎬 LIVE ACTION: Character-first with balanced actor approach for ${characterName}`);
        
        // CHARACTER-FIRST even for live action (like Captain Kirk vs William Shatner)
        queries.push(`"${characterName}" "${showTitle}" character scene ${allExclusions}`);
        queries.push(`"${characterName}" "${showTitle}" movie scene ${allExclusions}`);
        queries.push(`"${showTitle}" "${characterName}" character ${allExclusions}`);
        
        // THEN add actor-specific terms
        queries.push(`"${celebrityName}" "${characterName}" "${showTitle}" scene ${allExclusions}`);
      }
      
    } else {
      // Fallback when no clear character name
      logger.info(`🔄 FALLBACK: Show-focused search for ${showTitle}`);
      
      if (isVoiceRole) {
        queries.push(`"${showTitle}" characters anime scene ${allExclusions}`);
        queries.push(`"${showTitle}" anime character images ${allExclusions}`);
      } else {
        queries.push(`"${celebrityName}" "${showTitle}" scene ${allExclusions}`);
        queries.push(`"${showTitle}" "${celebrityName}" promotional ${allExclusions}`);
      }
    }

    return queries.slice(0, 4); // Increased from 3 to 4
  }
  
  /**
   * MINIMAL filtering - let AI do the heavy work
   */
  applyMinimalFiltering(images) {
    return images.filter(image => {
      const url = (image.sourceUrl || '').toLowerCase();
      const imageUrl = (image.url || '').toLowerCase();
      
      // ONLY block obvious watermarked stock sites
      for (const domain of this.watermarkedDomains) {
        if (url.includes(domain) || imageUrl.includes(domain)) {
          return false;
        }
      }

      // ONLY block obvious watermark URL patterns
      const obviousWatermarkPatterns = ['/comp/', '/preview/', '/watermark/'];
      for (const pattern of obviousWatermarkPatterns) {
        if (url.includes(pattern) || imageUrl.includes(pattern)) {
          return false;
        }
      }

      return true; // Let everything else through for AI verification
    });
  }
  
  /**
   * LENIENT validation - reduced pre-filtering
   */
  validateImagesLenient(images, celebrityName, role) {
    return images.filter(image => {
      const validation = this.lenientValidation(image, celebrityName, role);
      
      if (!validation.isValid) {
        // Only log obvious rejections
        if (validation.severity === 'high') {
          logger.warn(`❌ ${image.title}: ${validation.reason}`);
        }
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * LENIENT validation logic
   */
  lenientValidation(image, celebrityName, role) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    // ONLY reject obvious junk with HIGH severity
    const highSeverityRejects = [
      'comic con', 'convention center', 'autograph signing',
      'blu ray box', 'dvd box', 'toy package', 'funko pop'
    ];
    
    for (const reject of highSeverityRejects) {
      if (title.includes(reject) || url.includes(reject)) {
        return { isValid: false, reason: `High severity rejection: ${reject}`, severity: 'high' };
      }
    }
    
    // REMOVED most medium/low severity rejections - let AI handle them
    
    return { isValid: true, reason: 'Passed lenient validation' };
  }
  
  /**
   * BALANCED quality prioritization
   */
  prioritizeImageQualityBalanced(images) {
    return images
      .map(image => ({
        ...image,
        qualityScore: this.calculateBalancedQualityScore(image)
      }))
      .sort((a, b) => b.qualityScore - a.qualityScore);
  }

  /**
   * BALANCED quality scoring - don't over-prioritize HD
   */
  calculateBalancedQualityScore(image) {
    let score = 0;
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    // SIZE BONUS: More balanced approach
    const estimatedSize = (image.width || 400) * (image.height || 300);
    score += Math.min(estimatedSize / 150000, 25); // Reduced weight
    
    // SOURCE BONUS: Good sources get modest boost
    if (this.preferredDomains.some(domain => url.includes(domain))) {
      score += 20; // Balanced bonus
    }
    
    // HD CONTENT: Nice to have but not dominating
    if (this.detectHDContent(image)) {
      score += 15; // Reduced from 20
    }
    
    // CONTENT TYPE BONUSES: Balanced across types
    if (title.includes('scene') || title.includes('still')) score += 12;
    if (title.includes('character') || title.includes('official')) score += 12;
    if (title.includes('episode') || title.includes('screenshot')) score += 10;
    
    // OLDER CONTENT SUPPORT: Don't penalize older shows
    const olderContentIndicators = ['vintage', 'classic', 'original', '80s', '90s', '2000s'];
    const isOlderContent = olderContentIndicators.some(indicator => 
      title.includes(indicator) || url.includes(indicator)
    );
    
    if (isOlderContent) {
      score += 18; // Good bonus for older content
    }
    
    // MINIMAL PENALTIES: Only for obviously bad content
    if (title.includes('thumbnail')) score -= 5;
    if (title.includes('very small')) score -= 5;
    
    return score;
  }
  
  /**
   * GENEROUS content diversification - higher limits for popular characters
   */
  diversifyContentTypesGenerous(images) {
    const contentTypeLimits = {
      poster: 12,         // Increased
      behind_scenes: 18,  // Increased  
      press: 35,          // Increased significantly
      movie_still: 50,    // Increased significantly - most valuable content
      cast_group: 30,     // Increased
      portrait: 18,       // Increased
      character: 60,      // NEW: High limit for character-focused content
      general: 50         // Increased
    };

    const contentTypeCounts = {};
    const diversifiedImages = [];

    for (const image of images) {
      const contentType = this.detectContentTypeEnhanced(image);
      const currentCount = contentTypeCounts[contentType] || 0;
      const limit = contentTypeLimits[contentType] || 30;

      if (currentCount < limit) {
        diversifiedImages.push({
          ...image,
          contentType: contentType
        });
        contentTypeCounts[contentType] = currentCount + 1;
      } else if (diversifiedImages.length < 120) { // Allow overflow if under total limit
        diversifiedImages.push({
          ...image,
          contentType: 'overflow'
        });
      }

      if (diversifiedImages.length >= 120) break; // Increased total limit
    }

    logger.info(`Content distribution: ${Object.entries(contentTypeCounts)
      .map(([type, count]) => `${type}:${count}`)
      .join(', ')}`);

    return diversifiedImages;
  }
  
  /**
   * ENHANCED content type detection
   */
  detectContentTypeEnhanced(image) {
    const title = (image.title || '').toLowerCase();
    
    // CHARACTER-FOCUSED detection
    if (title.includes('character') || title.includes('anime character') || 
        title.includes('character design')) return 'character';
    if (title.includes('scene') || title.includes('still') || 
        title.includes('screenshot') || title.includes('episode')) return 'movie_still';
    if (title.includes('poster') || title.includes('artwork')) return 'poster';
    if (title.includes('behind the scenes') || title.includes('on set')) return 'behind_scenes';
    if (title.includes('press') || title.includes('promotional')) return 'press';
    if (title.includes('cast') || title.includes('group') || title.includes('ensemble')) return 'cast_group';
    if (title.includes('portrait') || title.includes('headshot')) return 'portrait';
    
    return 'general';
  }

  /**
   * Search SerpAPI with optimized parameters for HIGHER VOLUME
   */
  async searchSerpAPI(query, maxResults = 35) { // Increased default
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query,
        num: Math.min(maxResults, 100),
        ijn: 0,
        safe: 'active',
        imgsz: 'm', // Changed from 'l' to 'm' - more inclusive sizing
        imgtype: 'photo',
        imgc: 'color',
        // REMOVED restrictive rights filter to get more results
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
        width: img.original_width,
        height: img.original_height
      }));

      // LIGHT sorting - don't over-optimize here
      const sortedImages = images.sort((a, b) => {
        const aSize = (a.width || 0) * (a.height || 0);
        const bSize = (b.width || 0) * (b.height || 0);
        
        // Light preference for larger images
        return bSize - aSize;
      });

      logger.info(`Found ${sortedImages.length} images for: ${query}`);
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
   * Detect HD/remastered content
   */
  detectHDContent(image) {
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    const hdIndicators = [
      'hd', '1080p', '4k', 'uhd', 'blu-ray', 'bluray', 'remastered', 
      'restored', 'digital', 'high resolution'
    ];
    
    return hdIndicators.some(indicator => 
      title.includes(indicator) || url.includes(indicator)
    );
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
   * Download images with improved error handling
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
            qualityScore: image.qualityScore || 0,
            tags: [
              role.media_type || 'unknown', 
              'serpapi',
              role.isVoiceRole ? 'voice_role' : 'live_action',
              'character_first_search'
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
   * Download single image with retries
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
          timeout: 20000, // Increased timeout
          maxRedirects: 5, // Increased redirects
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
      '.html', '.php', '.asp'
    ];
    
    if (badPatterns.some(pattern => lowerUrl.includes(pattern))) {
      return false;
    }
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const imageHosts = ['imgur.com', 'flickr.com', 'i.redd.it'];
    
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
