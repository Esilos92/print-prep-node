const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');
const AIImageVerifier = require('./ai-services/AIImageVerifier');

class AIFirstImageFetcher {
  
  constructor() {
    // Initialize AI verifier - this is our smart filter
    this.aiVerifier = new AIImageVerifier();
    
    // ENHANCED: More comprehensive blocked domains
    this.blockedDomains = [
      'gettyimages.com', 'shutterstock.com', 'alamy.com', 'istockphoto.com',
      'dreamstime.com', 'depositphotos.com', 'stockphoto.com', 'bigstockphoto.com'
    ];
    
    // ENHANCED: Higher resolution requirements for print quality
    this.minResolution = {
      width: parseInt(process.env.MIN_WIDTH_8X10) || 800,  // Increased from 600
      height: parseInt(process.env.MIN_HEIGHT_8X10) || 600, // Increased from 400
      totalPixels: (parseInt(process.env.MIN_WIDTH_8X10) || 800) * (parseInt(process.env.MIN_HEIGHT_8X10) || 600)
    };
    
    // ENHANCED: Strict autograph and quality exclusions
    this.autographExclusions = [
      'signed', 'autograph', 'signature', 'inscription', 'COA', 'authenticated',
      'certificate', 'hologram', 'JSA', 'PSA', 'beckett', 'steiner', 'fanatics',
      'meet and greet', 'meet&greet', 'signing', 'autographed', 'signed by'
    ];
    
    // ENHANCED: Quality indicators to prioritize
    this.qualityIndicators = [
      'HD', 'high resolution', 'promo', 'promotional', 'official', 'still',
      'production', 'behind the scenes', 'BTS', 'press', 'publicity'
    ];
  }
  
  /**
   * ENHANCED: AI-First image fetching with smarter search strategies
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      logger.info(`🖼️ ENHANCED AI-FIRST fetching for ${celebrityName} in ${role.name}...`);
      
      const fetcher = new AIFirstImageFetcher();
      const maxImages = config.image.maxImagesPerRole || 50;
      
      // ENHANCED: Use smart search terms with fallback strategies
      const searchQueries = fetcher.generateEnhancedSearchQueries(celebrityName, role);
      let allImages = [];
      
      // Execute searches with strategic prioritization
      for (const query of searchQueries) {
        try {
          logger.info(`🔍 ENHANCED Search: "${query}"`);
          const images = await fetcher.searchWithQualityHints(query, 35);
          const qualityFiltered = fetcher.applyEnhancedFiltering(images); 
          allImages.push(...qualityFiltered);
          
          if (allImages.length >= maxImages * 2) break;
        } catch (error) {
          logger.warn(`Query failed: ${query} - ${error.message}`);
        }
      }
      
      // ENHANCED: Better processing pipeline
      const uniqueImages = fetcher.removeDuplicates(allImages);
      const qualityRanked = fetcher.enhancedQualityRanking(uniqueImages);
      
      logger.info(`📸 Found ${qualityRanked.length} quality-ranked images for AI evaluation`);
      
      // Download more high-quality images for AI to review
      const downloadedImages = await fetcher.downloadImages(
        qualityRanked.slice(0, Math.min(maxImages * 1.5, 80)),
        workDir, 
        celebrityName, 
        role
      );
      
      logger.info(`📥 Downloaded ${downloadedImages.length} images for AI evaluation`);
      
      // AI VERIFICATION
      const enableAIVerification = process.env.ENABLE_AI_VERIFICATION !== 'false';
      
      if (enableAIVerification) {
        logger.info(`🤖 AI taking over - intelligent quality selection...`);
        try {
          const verificationResults = await fetcher.aiVerifier.verifyImages(
            downloadedImages,
            celebrityName,
            role.character || role.characterName || 'Unknown',
            role.title || role.name,
            role.medium || role.media_type || 'unknown'
          );
          
          const finalValidImages = verificationResults.valid;
          
          logger.info(`✅ AI SELECTED: ${finalValidImages.length} premium images`);
          logger.info(`💰 AI decision cost: $${verificationResults.totalCost.toFixed(4)}`);
          
          // Clean up what AI rejected
          await fetcher.cleanupRejectedImages(verificationResults.invalid);
          
          return finalValidImages;
          
        } catch (verificationError) {
          logger.warn(`⚠️ AI verification failed: ${verificationError.message}`);
          logger.info(`📦 Returning ${downloadedImages.length} pre-filtered images`);
          return downloadedImages;
        }
      } else {
        logger.info(`📦 AI verification disabled, returning ${downloadedImages.length} quality-filtered images`);
        return downloadedImages;
      }
      
    } catch (error) {
      logger.error(`Error in enhanced AI-first fetching for ${role.name}:`, error.message);
      return [];
    }
  }
  
  /**
   * ENHANCED: Generate smart search queries with fallback strategies
   */
  generateEnhancedSearchQueries(celebrityName, role) {
    logger.info(`🔧 ENHANCED search strategy for ${celebrityName} - ${role.character || role.name}`);
    
    const queries = [];
    const characterName = role.character || role.characterName || 'Unknown';
    const showTitle = role.title || role.name || 'Unknown';
    const searchStrategy = role.searchStrategy || 'character_first';
    
    // ENHANCED: Strategy-based query generation
    switch (searchStrategy) {
      case 'character_images_only':
        // For voice actors - pure character focus
        queries.push(...this.generateCharacterOnlyQueries(characterName, showTitle));
        break;
        
      case 'character_with_context':
        // For recent/trending roles
        queries.push(...this.generateContextualQueries(celebrityName, characterName, showTitle));
        break;
        
      case 'broad_search':
        // For indie/unknown content
        queries.push(...this.generateBroadQueries(celebrityName, characterName, showTitle));
        break;
        
      case 'actor_headshots':
        // Fallback to actor photos
        queries.push(...this.generateActorPhotoQueries(celebrityName));
        break;
        
      case 'promotional_photos':
        // Recent promotional content
        queries.push(...this.generatePromotionalQueries(celebrityName, showTitle));
        break;
        
      default:
        // Standard character-first approach
        queries.push(...this.generateCharacterFirstQueries(celebrityName, characterName, showTitle));
    }
    
    // ENHANCED: Add quality hints to searches
    const enhancedQueries = queries.map(query => this.addQualityHints(query));
    
    logger.info(`🎯 Generated ${enhancedQueries.length} enhanced search queries`);
    return enhancedQueries.slice(0, 8); // Keep focused
  }
  
  /**
   * ENHANCED: Generate character-only queries (voice actors)
   */
  generateCharacterOnlyQueries(characterName, showTitle) {
    if (characterName === 'Unknown' || showTitle === 'Unknown') {
      return [`"anime character" HD`];
    }
    
    return [
      `"${characterName}" "${showTitle}" HD`,
      `"${characterName}" anime character HD`,
      `"${showTitle}" "${characterName}" official art`,
      `"${characterName}" character design`,
      `"${showTitle}" characters HD`,
      `"${characterName}" official artwork`
    ];
  }
  
  /**
   * ENHANCED: Generate contextual queries (recent/trending)
   */
  generateContextualQueries(celebrityName, characterName, showTitle) {
    return [
      `"${characterName}" "${showTitle}" HD scene`,
      `"${celebrityName}" "${characterName}" promotional`,
      `"${showTitle}" "${characterName}" official`,
      `"${characterName}" "${showTitle}" press photo`,
      `"${celebrityName}" "${showTitle}" behind scenes`,
      `"${characterName}" HD still`
    ];
  }
  
  /**
   * ENHANCED: Generate broad search queries (indie/unknown)
   */
  generateBroadQueries(celebrityName, characterName, showTitle) {
    return [
      `"${celebrityName}" actor photo HD`,
      `"${celebrityName}" "${showTitle}" still`,
      `"${celebrityName}" promotional photo`,
      `"${celebrityName}" headshot HD`,
      `"${celebrityName}" press photo`,
      `"${celebrityName}" behind scenes`
    ];
  }
  
  /**
   * ENHANCED: Generate actor photo queries (fallback)
   */
  generateActorPhotoQueries(celebrityName) {
    return [
      `"${celebrityName}" headshot HD`,
      `"${celebrityName}" promotional photo`,
      `"${celebrityName}" press photo HD`,
      `"${celebrityName}" actor photo`,
      `"${celebrityName}" red carpet HD`,
      `"${celebrityName}" behind scenes`
    ];
  }
  
  /**
   * ENHANCED: Generate promotional queries
   */
  generatePromotionalQueries(celebrityName, showTitle) {
    return [
      `"${celebrityName}" "${showTitle}" promo`,
      `"${celebrityName}" "${showTitle}" press`,
      `"${celebrityName}" "${showTitle}" promotional`,
      `"${celebrityName}" "${showTitle}" official photo`,
      `"${celebrityName}" "${showTitle}" HD still`,
      `"${celebrityName}" "${showTitle}" publicity`
    ];
  }
  
  /**
   * ENHANCED: Generate character-first queries (standard)
   */
  generateCharacterFirstQueries(celebrityName, characterName, showTitle) {
    if (characterName === 'Unknown' || showTitle === 'Unknown') {
      return this.generateActorPhotoQueries(celebrityName);
    }
    
    return [
      `"${characterName}" "${showTitle}" HD`,
      `"${characterName}" "${showTitle}" scene`,
      `"${celebrityName}" "${characterName}" HD`,
      `"${showTitle}" "${characterName}" still`,
      `"${characterName}" character photo`,
      `"${celebrityName}" "${showTitle}" promo`
    ];
  }
  
  /**
   * ENHANCED: Add quality hints to search queries
   */
  addQualityHints(query) {
    // Don't add hints if already present
    if (query.includes('HD') || query.includes('high resolution') || query.includes('promo')) {
      return query;
    }
    
    // Add subtle quality hints
    if (query.includes('character')) {
      return `${query} HD`;
    } else if (query.includes('photo') || query.includes('still')) {
      return `${query} high quality`;
    } else {
      return `${query} HD`;
    }
  }
  
  /**
   * ENHANCED: Search with quality optimization
   */
  async searchWithQualityHints(query, maxResults = 35) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query,
        num: Math.min(maxResults, 100),
        ijn: 0,
        safe: 'active',
        imgtype: 'photo',
        imgsz: 'l', // Large images preferred
        imgc: 'color' // Color images preferred
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
        width: img.original_width || 0,
        height: img.original_height || 0,
        // ENHANCED: Add quality scoring
        qualityScore: this.calculateQualityScore(img)
      }));

      logger.info(`Found ${images.length} images with quality scoring: ${query}`);
      return images;

    } catch (error) {
      logger.error(`Enhanced search failed: ${error.message}`);
      return [];
    }
  }
  
  /**
   * ENHANCED: Calculate quality score for initial ranking
   */
  calculateQualityScore(img) {
    let score = 0;
    
    // Size scoring
    const width = img.original_width || 0;
    const height = img.original_height || 0;
    const pixels = width * height;
    
    if (pixels > 1000000) score += 30; // 1MP+
    else if (pixels > 500000) score += 20; // 500K+
    else if (pixels > 200000) score += 10; // 200K+
    
    // Source quality indicators
    const title = (img.title || '').toLowerCase();
    const source = (img.source || '').toLowerCase();
    
    this.qualityIndicators.forEach(indicator => {
      if (title.includes(indicator) || source.includes(indicator)) {
        score += 10;
      }
    });
    
    // Penalize likely low-quality sources
    if (source.includes('pinterest') || source.includes('tumblr')) {
      score -= 5;
    }
    
    // Penalize autograph indicators
    this.autographExclusions.forEach(exclusion => {
      if (title.includes(exclusion)) {
        score -= 20;
      }
    });
    
    return Math.max(0, score);
  }
  
  /**
   * ENHANCED: Apply comprehensive filtering
   */
  applyEnhancedFiltering(images) {
    return images.filter(image => {
      const url = (image.sourceUrl || '').toLowerCase();
      const imageUrl = (image.url || '').toLowerCase();
      const title = (image.title || '').toLowerCase();
      
      // Block watermarked stock sites
      for (const domain of this.blockedDomains) {
        if (url.includes(domain) || imageUrl.includes(domain)) {
          return false;
        }
      }
      
      // Block watermark URL patterns
      if (url.includes('/watermark/') || url.includes('/preview/') || url.includes('/comp/')) {
        return false;
      }
      
      // ENHANCED: Block autograph indicators
      for (const exclusion of this.autographExclusions) {
        if (title.includes(exclusion) || url.includes(exclusion)) {
          return false;
        }
      }
      
      // ENHANCED: Block obvious low-quality patterns
      const lowQualityPatterns = [
        'thumbnail', 'thumb', 'small', 'icon', 'avatar', 'profile',
        'low res', 'low-res', 'compressed', 'pixelated'
      ];
      
      for (const pattern of lowQualityPatterns) {
        if (title.includes(pattern) || url.includes(pattern)) {
          return false;
        }
      }
      
      // ENHANCED: Basic resolution check
      const width = image.width || 0;
      const height = image.height || 0;
      
      if (width > 0 && height > 0) {
        if (width < this.minResolution.width || height < this.minResolution.height) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * ENHANCED: Quality-based ranking system
   */
  enhancedQualityRanking(images) {
    return images.sort((a, b) => {
      // Primary: Quality score
      const aScore = a.qualityScore || 0;
      const bScore = b.qualityScore || 0;
      
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      // Secondary: Resolution
      const aSize = (a.width || 400) * (a.height || 300);
      const bSize = (b.width || 400) * (b.height || 300);
      
      if (aSize !== bSize) {
        return bSize - aSize;
      }
      
      // Tertiary: Source quality
      const aSource = (a.source || '').toLowerCase();
      const bSource = (b.source || '').toLowerCase();
      
      // Prefer official sources
      const officialSources = ['imdb', 'wikipedia', 'official', 'promo', 'press'];
      const aOfficial = officialSources.some(s => aSource.includes(s));
      const bOfficial = officialSources.some(s => bSource.includes(s));
      
      if (aOfficial && !bOfficial) return -1;
      if (bOfficial && !aOfficial) return 1;
      
      return 0;
    });
  }
  
  /**
   * ENHANCED: Download images with strict quality validation
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
          // ENHANCED: Get actual dimensions and validate quality
          const actualDimensions = await this.getActualImageDimensions(filepath);
          const fileSize = await this.getFileSize(filepath);
          
          // ENHANCED: Strict quality validation
          if (this.validateImageQuality(actualDimensions, fileSize, filepath)) {
            downloadedImages.push({
              filename: filename,
              filepath: filepath,
              originalUrl: image.url,
              role: role.name,
              character: role.character || role.characterName,
              title: image.title,
              source: image.source,
              sourceUrl: image.sourceUrl,
              actualWidth: actualDimensions.width,
              actualHeight: actualDimensions.height,
              fileSize: fileSize,
              qualityScore: image.qualityScore || 0,
              tags: [
                role.media_type || 'unknown', 
                'enhanced_search',
                role.isVoiceRole ? 'voice_role' : 'live_action',
                'quality_filtered'
              ]
            });
            
            logger.info(`✅ Downloaded QUALITY: ${filename} (${actualDimensions.width}x${actualDimensions.height})`);
          } else {
            // Remove low-quality images
            await fs.unlink(filepath);
            logger.info(`❌ Quality rejected: ${filename} (${actualDimensions.width}x${actualDimensions.height})`);
          }
        }
        
      } catch (error) {
        logger.warn(`❌ Download failed: ${image.title} - ${error.message}`);
      }
    }
    
    return downloadedImages;
  }
  
  /**
   * ENHANCED: Validate image quality
   */
  validateImageQuality(dimensions, fileSize, filepath) {
    // Resolution check
    if (dimensions.width < this.minResolution.width || 
        dimensions.height < this.minResolution.height) {
      return false;
    }
    
    // File size check (avoid overly compressed images)
    const pixels = dimensions.width * dimensions.height;
    const expectedMinSize = pixels * 0.1; // Very rough estimate
    
    if (fileSize < expectedMinSize) {
      return false; // Likely over-compressed
    }
    
    // Aspect ratio check (avoid extreme ratios)
    const aspectRatio = dimensions.width / dimensions.height;
    if (aspectRatio > 3 || aspectRatio < 0.3) {
      return false; // Weird aspect ratio
    }
    
    return true;
  }
  
  /**
   * ENHANCED: Get file size
   */
  async getFileSize(filepath) {
    try {
      const stats = await fs.stat(filepath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * Get actual image dimensions after download
   */
  async getActualImageDimensions(filepath) {
    try {
      const sharp = require('sharp');
      const metadata = await sharp(filepath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0
      };
    } catch (error) {
      // Fallback if sharp not available
      const stats = await fs.stat(filepath);
      const estimatedPixels = stats.size / 3;
      const estimatedWidth = Math.sqrt(estimatedPixels * 1.5);
      const estimatedHeight = Math.sqrt(estimatedPixels / 1.5);
      
      return {
        width: Math.round(estimatedWidth),
        height: Math.round(estimatedHeight)
      };
    }
  }
  
  /**
   * Download single image with retry logic
   */
  async downloadSingleImage(url, filepath, retries = 3) {
    if (!this.isValidImageUrl(url)) {
      return false;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios({
          method: 'GET',
          url: url,
          responseType: 'stream',
          timeout: 25000, // Longer timeout for larger images
          maxRedirects: 5,
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
    const badPatterns = ['/search?', '/login', 'javascript:', 'data:', 'mailto:'];
    
    if (badPatterns.some(pattern => lowerUrl.includes(pattern))) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Remove duplicates with enhanced similarity detection
   */
  removeDuplicates(images) {
    const seen = new Set();
    const urlsSeen = new Set();
    
    return images.filter(img => {
      // Check URL similarity
      const baseUrl = (img.url || '').split('?')[0].toLowerCase();
      const urlKey = baseUrl.replace(/\/thumb\/|\/thumbnail\/|\/small\/|\/medium\/|\/large\//, '/');
      
      if (urlsSeen.has(urlKey)) return false;
      urlsSeen.add(urlKey);
      
      // Check title similarity
      const titleKey = (img.title || '').toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
      
      if (titleKey && seen.has(titleKey)) return false;
      if (titleKey) seen.add(titleKey);
      
      return true;
    });
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
    return `${cleanRoleName}_enhanced_${index}.${extension}`;
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
  
  /**
   * Clean up rejected images
   */
  async cleanupRejectedImages(rejectedImages) {
    for (const rejected of rejectedImages) {
      try {
        await fs.unlink(rejected.filepath);
        logger.info(`🗑️ AI rejected: ${rejected.filename} - ${rejected.reason || 'Quality/content issue'}`);
      } catch (error) {
        logger.warn(`⚠️ Failed to cleanup ${rejected.filename}: ${error.message}`);
      }
    }
  }
}

module.exports = { fetchImages: AIFirstImageFetcher.fetchImages.bind(AIFirstImageFetcher) };
