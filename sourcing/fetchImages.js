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
    
    // ONLY essential watermarked domains - can't let these through even to AI
    this.blockedDomains = [
      'gettyimages.com', 'shutterstock.com', 'alamy.com'
    ];
    
    // Reasonable resolution requirements (based on your manual findings)
    this.minResolution = {
      width: parseInt(process.env.MIN_WIDTH_8X10) || 600,
      height: parseInt(process.env.MIN_HEIGHT_8X10) || 400,
      totalPixels: (parseInt(process.env.MIN_WIDTH_8X10) || 600) * (parseInt(process.env.MIN_HEIGHT_8X10) || 400)
    };
    
    // No content exclusions - let AI handle it all
    this.contentExclusions = []; // EMPTY - AI will filter content
  }
  
  /**
   * MAIN: AI-First image fetching - simple search, smart AI filtering
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      logger.info(`🖼️ AI-FIRST fetching for ${celebrityName} in ${role.name}...`);
      
      const fetcher = new AIFirstImageFetcher();
      const maxImages = config.image.maxImagesPerRole || 50;
      
      // 🎯 FIXED: Use smart search terms correctly
      const searchQueries = fetcher.generateOptimalSearchQueries(celebrityName, role);
      let allImages = [];
      
      // Execute searches with NO filtering - get everything
      for (const query of searchQueries) {
        try {
          logger.info(`🔍 SMART Search: "${query}"`);
          const images = await fetcher.searchEverything(query, 35);
          const minimalFiltered = fetcher.applyMinimalFiltering(images); // Only block obvious watermarks
          allImages.push(...minimalFiltered);
          
          if (allImages.length >= maxImages * 2) break; // Get plenty for AI to choose from
        } catch (error) {
          logger.warn(`Query failed: ${query} - ${error.message}`);
        }
      }
      
      // Minimal processing - let AI do the heavy lifting
      const uniqueImages = fetcher.removeDuplicates(allImages);
      const basicQuality = fetcher.basicQualitySort(uniqueImages);
      
      logger.info(`📸 Found ${basicQuality.length} images for AI to evaluate`);
      
      // Download more images for AI to review
      const downloadedImages = await fetcher.downloadImages(
        basicQuality.slice(0, Math.min(maxImages * 1.5, 80)), // More images for AI
        workDir, 
        celebrityName, 
        role
      );
      
      logger.info(`📥 Downloaded ${downloadedImages.length} images for AI evaluation`);
      
      // AI DOES ALL THE SMART WORK
      const enableAIVerification = process.env.ENABLE_AI_VERIFICATION !== 'false';
      
      if (enableAIVerification) {
        logger.info(`🤖 AI taking over - let intelligence decide...`);
        try {
          const verificationResults = await fetcher.aiVerifier.verifyImages(
            downloadedImages,
            celebrityName,
            role.character || role.characterName || 'Unknown',
            role.title || role.name,
            role.medium || role.media_type || 'unknown'
          );
          
          const finalValidImages = verificationResults.valid;
          
          logger.info(`✅ AI SELECTED: ${finalValidImages.length} high-quality images`);
          logger.info(`💰 AI decision cost: $${verificationResults.totalCost.toFixed(4)}`);
          
          // Clean up what AI rejected
          await fetcher.cleanupRejectedImages(verificationResults.invalid);
          
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
      logger.error(`Error in AI-first fetching for ${role.name}:`, error.message);
      return [];
    }
  }
  
  /**
   * 🎯 FIXED: Generate OPTIMAL search queries using smart search integration
   */
  generateOptimalSearchQueries(celebrityName, role) {
    // DEBUG: Log what we're getting
    logger.info(`🔧 DEBUG role.finalSearchTerms:`, role.finalSearchTerms);
    logger.info(`🔧 DEBUG role.isMultiActorCharacter:`, role.isMultiActorCharacter);
    logger.info(`🔧 DEBUG role.smartSearchApproach:`, role.smartSearchApproach);
    
    // 🎯 CRITICAL FIX: Use smart search terms WITHOUT cleaning quotes
    if (role.finalSearchTerms && role.finalSearchTerms.length > 0) {
      logger.info(`✅ Using SMART search terms: ${role.finalSearchTerms.slice(0, 2).join(', ')}...`);
      
      // 🔥 KEY FIX: Don't clean the smart terms - preserve quotes for precision
      if (role.isMultiActorCharacter) {
        logger.info(`🎭 Multi-actor precision mode: preserving exact quote structure`);
        return role.finalSearchTerms; // Use them exactly as generated
      } else {
        // For single-actor characters, can clean lightly but preserve structure
        return role.finalSearchTerms.map(term => this.lightCleanSearchTerm(term));
      }
    }
    
    if (role.searchTerms && role.searchTerms.character_images && role.searchTerms.character_images.length > 0) {
      logger.info(`✅ Using character_images terms: ${role.searchTerms.character_images.slice(0, 2).join(', ')}...`);
      return role.searchTerms.character_images.map(term => this.lightCleanSearchTerm(term));
    }
    
    logger.warn(`⚠️ No smart search terms found, generating fallback terms`);
    
    // Generate clean, simple queries like your manual approach
    const characterName = role.character || role.characterName;
    const showTitle = role.title || role.name;
    const queries = [];
    
    if (characterName && characterName !== 'Unknown Character') {
      // EXACTLY like your manual searches
      queries.push(`"${characterName}"`);
      
      if (showTitle && showTitle !== 'Unknown Title') {
        queries.push(`"${characterName}" "${showTitle}"`);
        queries.push(`"${characterName}" ${showTitle.split(' ').slice(0, 2).join(' ')}`); // Shorter version
      }
    }
    
    // Add some variety but keep it clean
    if (showTitle && showTitle !== 'Unknown Title') {
      queries.push(`"${showTitle}" character`);
      if (characterName) {
        queries.push(`"${showTitle}" "${characterName}"`);
      }
    }
    
    // Voice role specific clean terms
    const isVoiceRole = role.isVoiceRole || 
                       role.medium?.includes('voice') || 
                       role.medium?.includes('anime');
    
    if (isVoiceRole && characterName) {
      queries.push(`"${characterName}" anime`);
    }
    
    logger.info(`🎯 Generated ${queries.length} fallback search queries`);
    return queries.slice(0, 6); // Keep it focused
  }
  
  /**
   * 🎯 NEW: Light cleaning that preserves quote structure for precision
   */
  lightCleanSearchTerm(term) {
    // Only remove obvious junk, preserve quotes for search precision
    return term
      .replace(/\s+/g, ' ') // Clean up spaces
      .trim();
    // DON'T remove quotes - they're critical for multi-actor precision!
  }
  
  /**
   * Clean search terms of all exclusions - let AI handle filtering
   * 🎯 KEPT for fallback cases only
   */
  cleanSearchTerm(term) {
    // Remove all exclusions and extra modifiers
    return term
      .replace(/-[^\s]+/g, '') // Remove all -exclusions
      .replace(/\s+/g, ' ') // Clean up spaces
      .trim();
  }
  
  /**
   * Search everything - no restrictions, let AI choose
   */
  async searchEverything(query, maxResults = 35) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query,
        num: Math.min(maxResults, 100),
        ijn: 0,
        safe: 'active',
        imgtype: 'photo'
        // NO size restrictions - let AI see everything
        // NO site restrictions - find content everywhere
        // NO exclusions - AI will filter
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
        height: img.original_height || 0
      }));

      logger.info(`Found ${images.length} images for AI evaluation: ${query}`);
      return images;

    } catch (error) {
      logger.error(`Search failed: ${error.message}`);
      return [];
    }
  }
  
  /**
   * MINIMAL filtering - only block what we absolutely cannot let through
   */
  applyMinimalFiltering(images) {
    return images.filter(image => {
      const url = (image.sourceUrl || '').toLowerCase();
      const imageUrl = (image.url || '').toLowerCase();
      
      // ONLY block the big watermarked stock sites
      for (const domain of this.blockedDomains) {
        if (url.includes(domain) || imageUrl.includes(domain)) {
          return false;
        }
      }
      
      // Block obvious watermark URL patterns
      if (url.includes('/watermark/') || url.includes('/preview/') || url.includes('/comp/')) {
        return false;
      }
      
      // Everything else goes through - let AI decide
      return true;
    });
  }
  
  /**
   * Basic quality sort - prefer larger images but don't exclude smaller ones
   */
  basicQualitySort(images) {
    return images.sort((a, b) => {
      const aSize = (a.width || 400) * (a.height || 300);
      const bSize = (b.width || 400) * (b.height || 300);
      return bSize - aSize; // Larger first, but we'll download many sizes
    });
  }
  
  /**
   * Download images with basic validation
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
          // Get actual dimensions after download
          const actualDimensions = await this.getActualImageDimensions(filepath);
          
          // Only check basic minimum - let AI handle quality decisions
          if (actualDimensions.width >= this.minResolution.width && 
              actualDimensions.height >= this.minResolution.height) {
            
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
              tags: [
                role.media_type || 'unknown', 
                'ai_first_search',
                role.isVoiceRole ? 'voice_role' : 'live_action'
              ]
            });
            
            logger.info(`✅ Downloaded for AI: ${filename} (${actualDimensions.width}x${actualDimensions.height})`);
          } else {
            // Remove images that are too small
            await fs.unlink(filepath);
            logger.info(`❌ Too small: ${filename} (${actualDimensions.width}x${actualDimensions.height})`);
          }
        }
        
      } catch (error) {
        logger.warn(`❌ Download failed: ${image.title} - ${error.message}`);
      }
    }
    
    return downloadedImages;
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
   * Download single image
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
          timeout: 20000,
          maxRedirects: 5,
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
   * Remove duplicates
   */
  removeDuplicates(images) {
    const seen = new Set();
    return images.filter(img => {
      const urlKey = (img.url || '').split('?')[0].toLowerCase();
      if (seen.has(urlKey)) return false;
      seen.add(urlKey);
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
    return `${cleanRoleName}_ai_${index}.${extension}`;
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
