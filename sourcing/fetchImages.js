const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');

// Import all three AI services for optimized pipeline
const GoogleVisionVerifier = require('./ai-services/GoogleVisionVerifier'); // You'll need to create this
const AIImageVerifier = require('./ai-services/AIImageVerifier'); // Your existing Claude verifier
const OpenAIVerifier = require('./ai-services/OpenAIVerifier'); // Extract from AIImageVerifier

class HighResImageFetcher {
  
  constructor() {
    // Initialize optimized AI pipeline: Google → Claude → OpenAI
    this.googleVision = new GoogleVisionVerifier();
    this.claudeVerifier = new AIImageVerifier();
    this.openaiVerifier = new OpenAIVerifier();
    
    // BALANCED resolution requirements - start more lenient
    this.minResolution = {
      width: 400,   // Lowered from 800 - more realistic minimum
      height: 300,  // Lowered from 600 - more realistic minimum
      totalPixels: 120000 // 400x300 minimum
    };
    
    // PRINT-READY quality thresholds
    this.qualityThresholds = {
      preferred: { width: 1200, height: 900 },  // Lowered from 1920x1080
      acceptable: { width: 600, height: 450 },  // Lowered from 1200x900
      minimum: { width: 400, height: 300 }      // Lowered from 800x600
    };
    
    // Essential domain filtering
    this.watermarkedDomains = [
      'alamy.com', 'alamyimages.fr', 'gettyimages.com', 'shutterstock.com',
      'istockphoto.com', 'depositphotos.com', 'bigstock.com', 'dreamstime.com'
    ];
    
    // Minimal exclusions - focus on resolution over content filtering
    this.contentExclusions = [
      '-thumbnail', '-preview', '-small', '-comp', '-watermark',
      '-signed', '-autograph', '-auction', '-ebay'
    ];
    
    // HIGH-RESOLUTION preferred sources
    this.highResSources = [
      'imdb.com', 'themoviedb.org', 'fanart.tv', 'thetvdb.com',
      'disney.com', 'marvel.com', 'starwars.com', 'hbo.com',
      'netflix.com', 'crunchyroll.com', 'funimation.com',
      'wikimedia.org', 'wikipedia.org', 'fandom.com'
    ];
  }
  
  /**
   * MAIN: High-resolution image fetching with optimized AI pipeline
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      logger.info(`🖼️ HIGH-RES fetching for ${celebrityName} in ${role.name}...`);
      
      const fetcher = new HighResImageFetcher();
      const maxImages = config.image.maxImagesPerRole || 60; // Reduced since we're being more selective
      
      // Generate HIGH-RESOLUTION focused search queries
      const searchQueries = fetcher.generateHighResQueries(celebrityName, role);
      let allImages = [];
      
      // Execute searches with HIGH-RESOLUTION parameters
      for (const query of searchQueries) {
        try {
          logger.info(`🔍 HIGH-RES Search: "${query}"`);
          const images = await fetcher.searchHighResSerpAPI(query, 25); // Focused search
          const filteredImages = fetcher.applyResolutionFiltering(images);
          allImages.push(...filteredImages);
          
          if (allImages.length >= maxImages * 1.5) break;
        } catch (error) {
          logger.warn(`Query failed: ${query} - ${error.message}`);
        }
      }
      
      // RESOLUTION-FIRST processing pipeline
      const uniqueImages = fetcher.removeDuplicates(allImages);
      const highResImages = fetcher.enforceMinimumResolution(uniqueImages);
      const qualityRanked = fetcher.rankByPrintQuality(highResImages);
      
      logger.info(`📏 ${qualityRanked.length} high-resolution images found (min ${fetcher.minResolution.width}x${fetcher.minResolution.height})`);
      
      if (qualityRanked.length === 0) {
        logger.warn(`❌ NO SUITABLE IMAGES FOUND - trying broader search strategy`);
        // Try fallback with even more lenient requirements
        const fallbackImages = await fetcher.fallbackBroaderSearch(celebrityName, role, workDir);
        return fallbackImages;
      }
      
      // Download high-res images for AI verification
      const downloadedImages = await fetcher.downloadHighResImages(
        qualityRanked.slice(0, Math.min(maxImages, 45)), // Download fewer but higher quality
        workDir, 
        celebrityName, 
        role
      );
      
      logger.info(`📥 Downloaded ${downloadedImages.length} high-resolution images`);
      
      // OPTIMIZED AI PIPELINE: Google → Claude → OpenAI
      const enableAIVerification = process.env.ENABLE_AI_VERIFICATION !== 'false';
      
      if (enableAIVerification) {
        logger.info(`🤖 Starting OPTIMIZED AI verification pipeline (Google → Claude → OpenAI)...`);
        
        const verificationResults = await fetcher.runOptimizedAIPipeline(
          downloadedImages,
          celebrityName,
          role.character || role.characterName || 'Unknown',
          role.title || role.name,
          role.medium || role.media_type || 'unknown'
        );
        
        const finalValidImages = verificationResults.valid;
        
        logger.info(`✅ FINAL HIGH-RES RESULT: ${finalValidImages.length} verified print-ready images`);
        logger.info(`💰 Total verification cost: $${verificationResults.totalCost.toFixed(4)}`);
        logger.info(`📊 Pipeline efficiency:`, verificationResults.pipelineStats);
        
        // Validate final resolution compliance
        const resolutionCompliant = await fetcher.validateFinalResolution(finalValidImages);
        
        if (resolutionCompliant.failed.length > 0) {
          logger.warn(`⚠️ ${resolutionCompliant.failed.length} images failed final resolution check`);
          await fetcher.cleanupFailedImages(resolutionCompliant.failed);
        }
        
        logger.info(`📐 RESOLUTION VALIDATION: ${resolutionCompliant.passed.length} images meet print standards`);
        
        return resolutionCompliant.passed;
        
      } else {
        logger.info(`📦 AI verification disabled, returning ${downloadedImages.length} high-res images`);
        return downloadedImages;
      }
      
    } catch (error) {
      logger.error(`Error in high-res fetching for ${role.name}:`, error.message);
      return [];
    }
  }
  
  /**
   * HIGH-RESOLUTION search query generation
   */
  generateHighResQueries(celebrityName, role) {
    // Use existing character-first terms but add high-res modifiers
    const baseQueries = this.getCharacterFirstTerms(celebrityName, role);
    
    const watermarkExclusions = this.watermarkedDomains.map(d => `-site:${d}`).join(' ');
    const contentExclusions = this.contentExclusions.join(' ');
    const resolutionBoosts = 'HD 1080p "high resolution" "high quality"';
    const allModifiers = `${watermarkExclusions} ${contentExclusions} ${resolutionBoosts}`;
    
    // Enhance base queries with high-res modifiers
    const highResQueries = baseQueries.map(query => {
      // Remove existing exclusions to avoid duplication
      const cleanQuery = query.replace(/-[^\s]+/g, '').trim();
      return `${cleanQuery} ${allModifiers}`;
    });
    
    // Add resolution-specific variants
    const characterName = role.character || role.characterName;
    const showTitle = role.title || role.name;
    
    if (characterName && characterName !== 'Unknown Character') {
      highResQueries.push(`"${characterName}" "${showTitle}" HD wallpaper 1920x1080 ${allModifiers}`);
      highResQueries.push(`"${characterName}" "${showTitle}" 4K ultra HD ${allModifiers}`);
    }
    
    return highResQueries.slice(0, 6); // Focus on quality over quantity
  }
  
  /**
   * Get character-first terms (compatible with your existing system)
   */
  getCharacterFirstTerms(celebrityName, role) {
    if (role.finalSearchTerms && role.finalSearchTerms.length > 0) {
      return role.finalSearchTerms;
    }
    
    if (role.searchTerms && role.searchTerms.character_images) {
      return role.searchTerms.character_images;
    }
    
    // Fallback character-first generation
    const characterName = role.character || role.characterName;
    const showTitle = role.title || role.name;
    
    return [
      `"${characterName}" "${showTitle}" character scene`,
      `"${characterName}" "${showTitle}" HD screenshot`,
      `"${showTitle}" "${characterName}" official image`
    ];
  }
  
  /**
   * BALANCED SerpAPI search - prioritize quality but allow more results
   */
  async searchHighResSerpAPI(query, maxResults = 25) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query,
        num: Math.min(maxResults, 50),
        ijn: 0,
        safe: 'active',
        // BALANCED parameters - not too restrictive
        imgsz: 'm',        // Medium images (was 'l' large only)
        imgtype: 'photo',
        imgc: 'color',
        // Remove overly restrictive filters
        // as_sitesearch: removed - was too limiting
        // tbs: simplified
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
        // CRITICAL: Resolution data (may be null from SerpAPI)
        width: img.original_width || 0,
        height: img.original_height || 0,
        estimatedFileSize: this.estimateFileSize(img.original_width, img.original_height)
      }));

      // LENIENT pre-filter - only remove obviously tiny images
      const sizedImages = images.filter(img => {
        // If we have dimensions and they're tiny, filter out
        if (img.width > 0 && img.height > 0) {
          return img.width >= 200 && img.height >= 150; // Very lenient pre-filter
        }
        // If no dimensions from SerpAPI, let it through for actual download check
        return true;
      });

      logger.info(`Found ${sizedImages.length}/${images.length} potentially good images for: ${query}`);
      return sizedImages;

    } catch (error) {
      logger.error(`Search failed: ${error.message}`);
      return [];
    }
  }
  
  /**
   * LENIENT resolution filtering - check actual quality after download
   */
  applyResolutionFiltering(images) {
    return images.filter(image => {
      const url = (image.sourceUrl || '').toLowerCase();
      const imageUrl = (image.url || '').toLowerCase();
      const title = (image.title || '').toLowerCase();
      
      // Block watermarked sites
      for (const domain of this.watermarkedDomains) {
        if (url.includes(domain) || imageUrl.includes(domain)) {
          return false;
        }
      }

      // Block obvious low-res indicators in URL
      const lowResIndicators = ['/thumb/', '/small/', '/preview/', '/comp/', '_thumb', '_small', '_tiny'];
      for (const indicator of lowResIndicators) {
        if (url.includes(indicator) || imageUrl.includes(indicator)) {
          return false;
        }
      }
      
      // Block obvious low-res keywords in title
      const lowResKeywords = ['thumbnail', 'preview', 'icon', 'tiny'];
      for (const keyword of lowResKeywords) {
        if (title.includes(keyword)) {
          return false;
        }
      }

      // LENIENT: Only filter if we're SURE it's too small
      const width = image.width || 0;
      const height = image.height || 0;
      
      // Only reject if we have dimensions AND they're really tiny
      if (width > 0 && height > 0 && (width < 200 || height < 150)) {
        logger.debug(`❌ Too small: ${width}x${height}`);
        return false;
      }

      return true;
    });
  }
  
  /**
   * ENFORCE minimum resolution - but check after download for accuracy
   */
  enforceMinimumResolution(images) {
    // CHANGE: Don't pre-filter by SerpAPI dimensions (often inaccurate)
    // Instead, let download process validate actual dimensions
    
    logger.info(`📏 Resolution enforcement: Will validate ${images.length} images after download`);
    return images; // Pass all images to download for actual dimension checking
  }
  
  /**
   * RANK by print quality (resolution + source quality)
   */
  rankByPrintQuality(images) {
    return images
      .map(image => ({
        ...image,
        printQualityScore: this.calculatePrintQualityScore(image)
      }))
      .sort((a, b) => b.printQualityScore - a.printQualityScore);
  }
  
  /**
   * Calculate print quality score prioritizing resolution
   */
  calculatePrintQualityScore(image) {
    let score = 0;
    const width = image.width || 0;
    const height = image.height || 0;
    const url = (image.sourceUrl || '').toLowerCase();
    const title = (image.title || '').toLowerCase();
    
    // RESOLUTION SCORING (70% of total score)
    const totalPixels = width * height;
    
    // Preferred resolution bonus (1920x1080+)
    if (width >= this.qualityThresholds.preferred.width && height >= this.qualityThresholds.preferred.height) {
      score += 70; // Maximum resolution score
    }
    // Acceptable resolution bonus (1200x900+)
    else if (width >= this.qualityThresholds.acceptable.width && height >= this.qualityThresholds.acceptable.height) {
      score += 50;
    }
    // Minimum resolution bonus (800x600+)
    else if (width >= this.qualityThresholds.minimum.width && height >= this.qualityThresholds.minimum.height) {
      score += 30;
    }
    
    // Aspect ratio bonus (16:9, 4:3, etc.)
    const aspectRatio = width / height;
    if (aspectRatio >= 1.3 && aspectRatio <= 1.8) { // Good aspect ratios
      score += 10;
    }
    
    // SOURCE QUALITY SCORING (20% of total score)
    if (this.highResSources.some(domain => url.includes(domain))) {
      score += 15; // High-quality source bonus
    }
    
    // HD/4K content indicators
    const hdIndicators = ['hd', '1080p', '4k', 'uhd', 'high resolution', 'high quality'];
    if (hdIndicators.some(indicator => title.includes(indicator) || url.includes(indicator))) {
      score += 10;
    }
    
    // CONTENT TYPE SCORING (10% of total score)
    if (title.includes('official') || title.includes('promo')) score += 5;
    if (title.includes('still') || title.includes('scene')) score += 5;
    
    return score;
  }
  
  /**
   * OPTIMIZED AI PIPELINE: Google → Claude → OpenAI
   */
  async runOptimizedAIPipeline(images, celebrityName, character, title, medium) {
    const pipelineResults = {
      totalProcessed: images.length,
      googleFiltered: 0,
      claudeVerified: 0,
      openaiValidated: 0,
      totalCost: 0,
      pipelineStats: {
        stage1_google: { processed: 0, passed: 0, cost: 0 },
        stage2_claude: { processed: 0, passed: 0, cost: 0 },
        stage3_openai: { processed: 0, passed: 0, cost: 0 }
      }
    };
    
    logger.info(`🔄 Stage 1: Google Vision pre-filtering ${images.length} images...`);
    
    // STAGE 1: Google Vision (Pre-filter)
    const googleResults = await this.googleVision.batchPreFilter(images, celebrityName, character);
    const googlePassed = googleResults.passed || images; // Fallback if Google unavailable
    
    pipelineResults.pipelineStats.stage1_google = {
      processed: images.length,
      passed: googlePassed.length,
      cost: googleResults.cost || 0
    };
    pipelineResults.totalCost += googleResults.cost || 0;
    
    logger.info(`✅ Stage 1 complete: ${googlePassed.length}/${images.length} passed Google pre-filter`);
    
    if (googlePassed.length === 0) {
      return { valid: [], invalid: images, totalCost: pipelineResults.totalCost, pipelineStats: pipelineResults.pipelineStats };
    }
    
    // STAGE 2: Claude (Character verification)
    logger.info(`🔄 Stage 2: Claude character verification for ${googlePassed.length} images...`);
    
    const claudeResults = await this.claudeVerifier.verifyImages(
      googlePassed, 
      celebrityName, 
      character, 
      title, 
      medium
    );
    
    const claudePassed = claudeResults.valid || [];
    
    pipelineResults.pipelineStats.stage2_claude = {
      processed: googlePassed.length,
      passed: claudePassed.length,
      cost: claudeResults.totalCost || 0
    };
    pipelineResults.totalCost += claudeResults.totalCost || 0;
    
    logger.info(`✅ Stage 2 complete: ${claudePassed.length}/${googlePassed.length} passed Claude verification`);
    
    if (claudePassed.length === 0) {
      return { 
        valid: [], 
        invalid: [...claudeResults.invalid, ...images.filter(img => !googlePassed.includes(img))], 
        totalCost: pipelineResults.totalCost, 
        pipelineStats: pipelineResults.pipelineStats 
      };
    }
    
    // STAGE 3: OpenAI (Final validation)
    logger.info(`🔄 Stage 3: OpenAI final validation for ${claudePassed.length} images...`);
    
    const openaiResults = await this.openaiVerifier.finalValidation(
      claudePassed,
      celebrityName,
      character,
      title,
      medium
    );
    
    const finalValid = openaiResults.valid || claudePassed; // Fallback if OpenAI unavailable
    
    pipelineResults.pipelineStats.stage3_openai = {
      processed: claudePassed.length,
      passed: finalValid.length,
      cost: openaiResults.cost || 0
    };
    pipelineResults.totalCost += openaiResults.cost || 0;
    
    logger.info(`✅ Stage 3 complete: ${finalValid.length}/${claudePassed.length} passed OpenAI validation`);
    
    // Compile all invalid images
    const allInvalid = [
      ...(claudeResults.invalid || []),
      ...(openaiResults.invalid || []),
      ...images.filter(img => !googlePassed.includes(img))
    ];
    
    return {
      valid: finalValid,
      invalid: allInvalid,
      totalCost: pipelineResults.totalCost,
      pipelineStats: pipelineResults.pipelineStats
    };
  }
  
  /**
   * Download high-resolution images with validation
   */
  async downloadHighResImages(images, workDir, celebrityName, role) {
    const downloadDir = path.join(workDir, 'downloaded');
    await fs.mkdir(downloadDir, { recursive: true });
    
    const downloadedImages = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        const filename = this.generateSafeFilename(role.name, i + 1, image.url);
        const filepath = path.join(downloadDir, filename);
        
        const downloadResult = await this.downloadAndValidateImage(image.url, filepath, image.width, image.height);
        
        if (downloadResult.success) {
          downloadedImages.push({
            filename: filename,
            filepath: filepath,
            originalUrl: image.url,
            role: role.name,
            character: role.character || role.characterName,
            title: image.title,
            source: image.source,
            sourceUrl: image.sourceUrl,
            // High-res metadata
            expectedWidth: image.width,
            expectedHeight: image.height,
            actualWidth: downloadResult.actualWidth,
            actualHeight: downloadResult.actualHeight,
            printQualityScore: image.printQualityScore || 0,
            resolutionTier: this.getResolutionTier(downloadResult.actualWidth, downloadResult.actualHeight),
            tags: [
              role.media_type || 'unknown', 
              'high_resolution',
              'serpapi',
              role.isVoiceRole ? 'voice_role' : 'live_action',
              'character_first_search'
            ]
          });
          
          logger.info(`✅ Downloaded HIGH-RES: ${filename} (${downloadResult.actualWidth}x${downloadResult.actualHeight})`);
        } else {
          logger.warn(`❌ Failed HIGH-RES download: ${image.title} - ${downloadResult.error}`);
        }
        
      } catch (error) {
        logger.warn(`❌ Download error for image ${i + 1}:`, error.message);
      }
    }
    
    return downloadedImages;
  }
  
  /**
   * Download and validate actual image resolution
   */
  async downloadAndValidateImage(url, filepath, expectedWidth, expectedHeight) {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 25000,
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

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      // Validate actual resolution after download
      const actualDimensions = await this.getActualImageDimensions(filepath);
      
      // Check if actual resolution meets our LENIENT standards
      if (actualDimensions.width < this.minResolution.width || actualDimensions.height < this.minResolution.height) {
        await fs.unlink(filepath); // Delete low-res image
        throw new Error(`Resolution too low: ${actualDimensions.width}x${actualDimensions.height} (need ${this.minResolution.width}x${this.minResolution.height})`);
      }
      
      return {
        success: true,
        actualWidth: actualDimensions.width,
        actualHeight: actualDimensions.height
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get actual image dimensions after download
   */
  async getActualImageDimensions(filepath) {
    try {
      const sharp = require('sharp'); // You may need: npm install sharp
      const metadata = await sharp(filepath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0
      };
    } catch (error) {
      // Fallback method if sharp isn't available
      logger.warn('Sharp not available for dimension checking, using file size estimation');
      const stats = await fs.stat(filepath);
      // Estimate dimensions based on file size (rough approximation)
      const estimatedPixels = stats.size / 3; // Assume ~3 bytes per pixel
      const estimatedWidth = Math.sqrt(estimatedPixels * 1.5); // Assume ~1.5:1 aspect ratio
      const estimatedHeight = Math.sqrt(estimatedPixels / 1.5);
      
      return {
        width: Math.round(estimatedWidth),
        height: Math.round(estimatedHeight)
      };
    }
  }
  
  /**
   * Get resolution tier for classification
   */
  getResolutionTier(width, height) {
    if (width >= this.qualityThresholds.preferred.width && height >= this.qualityThresholds.preferred.height) {
      return 'premium'; // 1920x1080+
    } else if (width >= this.qualityThresholds.acceptable.width && height >= this.qualityThresholds.acceptable.height) {
      return 'high'; // 1200x900+
    } else if (width >= this.qualityThresholds.minimum.width && height >= this.qualityThresholds.minimum.height) {
      return 'standard'; // 800x600+
    } else {
      return 'low'; // Below standards
    }
  }
  
  /**
   * Final resolution validation for print-ready images
   */
  async validateFinalResolution(images) {
    const passed = [];
    const failed = [];
    
    for (const image of images) {
      const actualWidth = image.actualWidth || 0;
      const actualHeight = image.actualHeight || 0;
      
      if (actualWidth >= this.minResolution.width && actualHeight >= this.minResolution.height) {
        passed.push(image);
        logger.info(`✅ PRINT-READY: ${image.filename} (${actualWidth}x${actualHeight})`);
      } else {
        failed.push(image);
        logger.warn(`❌ PRINT-FAIL: ${image.filename} (${actualWidth}x${actualHeight}) - below ${this.minResolution.width}x${this.minResolution.height}`);
      }
    }
    
    return { passed, failed };
  }
  
  /**
   * BROADER fallback search with minimal restrictions
   */
  async fallbackBroaderSearch(celebrityName, role, workDir) {
    logger.info(`🔄 Attempting BROADER search with minimal restrictions...`);
    
    try {
      // Use simpler, broader search terms
      const broadQueries = [
        `"${role.character}" "${role.title}"`,
        `"${celebrityName}" "${role.title}"`,
        `"${role.title}" character`,
        `"${role.character}" image`,
        `"${celebrityName}" photo`
      ];
      
      let broadImages = [];
      
      for (const query of broadQueries) {
        logger.info(`🔍 BROAD Search: "${query}"`);
        
        // Use basic search parameters
        const params = {
          api_key: config.api.serpApiKey,
          engine: 'google_images',
          q: query,
          num: 20,
          safe: 'active',
          imgtype: 'photo'
          // Remove all size restrictions
        };

        try {
          const response = await axios.get(config.api.serpEndpoint, { params });
          
          if (response.data?.images_results) {
            const images = response.data.images_results.map((img, index) => ({
              url: img.original || img.thumbnail,
              thumbnail: img.thumbnail,
              title: img.title || `Broad Search Image ${index + 1}`,
              source: img.source || 'Unknown',
              sourceUrl: img.link || '',
              searchQuery: query,
              width: img.original_width || 0,
              height: img.original_height || 0
            }));
            
            // Only filter out obvious watermarked sites
            const basicFiltered = images.filter(img => {
              const url = (img.sourceUrl || '').toLowerCase();
              return !this.watermarkedDomains.some(domain => url.includes(domain));
            });
            
            broadImages.push(...basicFiltered);
            logger.info(`Found ${basicFiltered.length} images with broad search`);
          }
          
          if (broadImages.length >= 30) break;
          
        } catch (error) {
          logger.warn(`Broad search failed for "${query}": ${error.message}`);
        }
      }
      
      if (broadImages.length > 0) {
        logger.info(`📸 Broad search found ${broadImages.length} images total`);
        
        // Remove duplicates
        const uniqueImages = this.removeDuplicates(broadImages);
        
        // Download and let the download process filter by actual dimensions
        const downloaded = await this.downloadHighResImages(
          uniqueImages.slice(0, 40),
          workDir,
          celebrityName,
          role
        );
        
        logger.info(`📥 Broad search downloaded ${downloaded.length} images`);
        return downloaded;
      }
      
      logger.warn(`❌ Even broad search found no suitable images`);
      return [];
      
    } catch (error) {
      logger.error(`Broad search failed: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Utility functions
   */
  estimateFileSize(width, height) {
    if (!width || !height) return 0;
    // Rough estimate: width * height * 3 bytes per pixel * compression factor
    return Math.round(width * height * 3 * 0.3); // Assume ~30% compression
  }
  
  removeDuplicates(images) {
    const seen = new Set();
    return images.filter(img => {
      const urlKey = (img.url || '').split('?')[0].toLowerCase();
      if (seen.has(urlKey)) return false;
      seen.add(urlKey);
      return true;
    });
  }
  
  generateSafeFilename(roleName, index, originalUrl) {
    const cleanRoleName = roleName
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
    
    const extension = this.getImageExtension(originalUrl);
    return `${cleanRoleName}_highres_${index}.${extension}`;
  }
  
  getImageExtension(url) {
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    for (const ext of extensions) {
      if (url.toLowerCase().includes(`.${ext}`)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
    return 'jpg';
  }
  
  async cleanupFailedImages(failedImages) {
    for (const image of failedImages) {
      try {
        await fs.unlink(image.filepath);
        logger.info(`🗑️ Cleaned up low-res image: ${image.filename}`);
      } catch (error) {
        logger.warn(`⚠️ Failed to cleanup ${image.filename}: ${error.message}`);
      }
    }
  }
}

module.exports = { fetchImages: HighResImageFetcher.fetchImages.bind(HighResImageFetcher) };
