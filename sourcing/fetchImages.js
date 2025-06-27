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
    
    this.bannedDomains = [
      'alamy.com', 'gettyimages.com', 'shutterstock.com', 
      'istockphoto.com', 'depositphotos.com', 'bigstock.com',
      'dreamstime.com', 'deviantart.com', 'tumblr.com', 
      'pinterest.com', 'reddit.com', 'fandom.com', 'wikia.com'
    ];
    
    this.watermarkPatterns = [
      '/comp/', '/preview/', '/sample/', '/watermark/',
      'watermarked', 'preview', 'sample', 'comp-'
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
   * Generate enhanced search queries based on role type
   */
  generateEnhancedQueries(celebrityName, role) {
    const queries = [];
    
    if (role.isVoiceRole) {
      // Voice acting - focus on character images
      logger.info(`🎭 Voice role detected for ${role.name}, focusing on character images`);
      
      if (role.characterName) {
        queries.push({
          text: `"${role.characterName}" "${role.name}" character official`,
          priority: 'high'
        });
        queries.push({
          text: `"${role.characterName}" ${role.name} animated character`,
          priority: 'high'
        });
        queries.push({
          text: `${role.name} ${role.characterName} movie stills`,
          priority: 'medium'
        });
      }
      
      queries.push({
        text: `${role.name} character images official -fanart -deviantart`,
        priority: 'medium'
      });
      queries.push({
        text: `${role.name} animated movie characters -pinterest`,
        priority: 'low'
      });
    } else {
      // Live action - focus on actor in role
      logger.info(`🎬 Live action role detected for ${role.name}, focusing on actor images`);
      
      queries.push({
        text: `"${celebrityName}" "${role.name}" official promotional`,
        priority: 'high'
      });
      queries.push({
        text: `"${celebrityName}" "${role.name}" movie stills press photos`,
        priority: 'high'
      });
      
      if (role.character && role.character !== 'Unknown role') {
        queries.push({
          text: `"${celebrityName}" "${role.character}" "${role.name}" cast`,
          priority: 'medium'
        });
      }
      
      queries.push({
        text: `"${celebrityName}" ${role.name} behind scenes cast`,
        priority: 'medium'
      });
      
      // Franchise-specific queries
      if (role.franchiseName) {
        queries.push({
          text: `"${celebrityName}" "${role.franchiseName}" official photos`,
          priority: 'medium'
        });
      }
    }

    // Sort by priority
    return queries.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
  
  /**
   * Search SerpAPI with enhanced parameters
   */
  async searchSerpAPI(query, maxResults = 20) {
    try {
      // Add exclusions to query to filter out banned domains
      const enhancedQuery = `${query} ${this.bannedDomains.map(d => `-site:${d}`).join(' ')}`;
      
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: enhancedQuery,
        num: Math.min(maxResults, 100),
        ijn: 0,
        safe: 'active',
        // Add image size filters for better quality
        imgsz: 'l', // Large images
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

      // Convert to enhanced format
      const images = response.data.images_results.map((img, index) => ({
        original: img.original || img.thumbnail,
        thumbnail: img.thumbnail,
        title: img.title || `Image ${index + 1}`,
        source: img.source || 'Unknown',
        link: img.link || '',
        position: img.position || index + 1,
        // Keep original format for compatibility
        url: img.original || img.thumbnail,
        thumbnailUrl: img.thumbnail,
        sourceUrl: img.link || '',
        width: img.original_width || null,
        height: img.original_height || null,
        searchQuery: query
      }));

      logger.info(`Found ${images.length} images for: ${query}`);
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
   * Filter image sources to remove watermarked, banned, and unwanted content
   */
  filterImageSources(images, role) {
    return images.filter(image => {
      // Skip if from banned domains
      if (this.isBannedDomain(image.sourceUrl)) {
        logger.warn(`Skipping banned domain: ${image.sourceUrl}`);
        return false;
      }

      // Skip watermarked content by URL patterns
      if (this.hasWatermarkPatterns(image.sourceUrl)) {
        logger.warn(`Skipping watermarked content: ${image.sourceUrl}`);
        return false;
      }

      // Skip already signed items or auction content
      if (this.isSignedOrAuctionContent(image)) {
        logger.warn(`Skipping signed/auction content: ${image.title}`);
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
   * Check if domain is banned
   */
  isBannedDomain(url) {
    if (!url) return false;
    return this.bannedDomains.some(domain => url.toLowerCase().includes(domain));
  }
  
  /**
   * Check for watermark patterns in URL
   */
  hasWatermarkPatterns(url) {
    if (!url) return false;
    return this.watermarkPatterns.some(pattern => url.toLowerCase().includes(pattern));
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
    const url = image.sourceUrl.toLowerCase();
    
    // Prefer official and entertainment industry sources
    if (this.preferredDomains.some(domain => url.includes(domain))) {
      return true;
    }

    // Avoid fan sites and social media
    const fanSitePatterns = [
      'fan', 'blog', 'wordpress', 'blogspot', 'social', 'forum'
    ];
    
    if (fanSitePatterns.some(pattern => url.includes(pattern))) {
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
   * Enhanced person verification with voice role support
   */
  validatePersonInImage(imageData, celebrityName, role) {
    const title = (imageData.title || '').toLowerCase();
    const source = (imageData.source || '').toLowerCase();
    
    const name = celebrityName.toLowerCase();
    const nameWords = name.split(' ');
    const lastName = nameWords[nameWords.length - 1];
    const firstName = nameWords[0];
    
    let confidence = 0;
    
    // VOICE ROLE SPECIFIC VALIDATION
    if (role.isVoiceRole) {
      // For voice roles, character name is more important than actor name
      if (role.characterName) {
        const character = role.characterName.toLowerCase();
        if (title.includes(character)) confidence += 8;
      }
      
      // Animation context indicators
      const animationKeywords = ['character', 'animated', 'animation', 'cartoon'];
      animationKeywords.forEach(keyword => {
        if (title.includes(keyword)) confidence += 3;
      });
      
      // Penalize actor photos for voice roles
      if (title.includes(name) && !title.includes('character') && !title.includes('animated')) {
        confidence -= 3;
      }
    } else {
      // LIVE ACTION VALIDATION
      
      // Strong name matches
      if (title.includes(name)) confidence += 10;
      
      // Partial name matches
      if (title.includes(lastName)) confidence += 4;
      if (title.includes(firstName) && firstName.length > 3) confidence += 3;
      
      // Character context
      if (role.character && role.character !== 'Unknown role') {
        const character = role.character.toLowerCase();
        if (title.includes(character)) confidence += 4;
      }
    }
    
    // COMMON VALIDATION (both voice and live action)
    
    // Role/franchise context
    const roleWords = role.name.toLowerCase().split(' ').slice(0, 2);
    roleWords.forEach(word => {
      if (word.length > 3 && title.includes(word)) confidence += 2;
    });
    
    // Professional indicators
    const professionalTerms = ['actor', 'star', 'celebrity', 'cast', 'portrait'];
    professionalTerms.forEach(term => {
      if (title.includes(term)) confidence += 1;
    });
    
    // Group shot bonuses (for live action)
    if (!role.isVoiceRole) {
      const groupIndicators = [
        'cast', 'crew', 'ensemble', 'group', 'team', 'together', 
        'with', 'and', 'co-star', 'co-stars', 'behind the scenes'
      ];
      groupIndicators.forEach(indicator => {
        if (title.includes(indicator)) confidence += 3;
      });
    }
    
    // Franchise bonuses
    if (role.franchiseName) {
      const franchiseWords = role.franchiseName.toLowerCase().split(' ');
      franchiseWords.forEach(word => {
        if (word.length > 3 && title.includes(word)) confidence += 2;
      });
    }
    
    // Good source bonus
    const goodSources = ['imdb', 'themoviedb', 'rottentomatoes'];
    goodSources.forEach(goodSource => {
      if (source.includes(goodSource)) confidence += 2;
    });
    
    // NEGATIVE INDICATORS
    let penalties = 0;
    
    // Definitely wrong content
    const definitelyWrong = ['cartoon', 'drawing', 'painting', 'sketch', 'artwork'];
    if (!role.isVoiceRole) { // Only penalize non-animated for live action
      definitelyWrong.forEach(wrong => {
        if (title.includes(wrong)) penalties += 5;
      });
    }
    
    const finalScore = confidence - penalties;
    const threshold = role.isVoiceRole ? 3 : 1; // Higher threshold for voice roles
    
    return {
      isValid: finalScore >= threshold,
      confidence: finalScore,
      reasons: {
        nameMatch: title.includes(name) || title.includes(lastName),
        characterMatch: role.characterName && title.includes(role.characterName.toLowerCase()),
        roleContext: roleWords.some(word => word.length > 3 && title.includes(word)),
        isVoiceRole: role.isVoiceRole,
        penalties: penalties,
        details: `Score: ${finalScore} (confidence: ${confidence}, penalties: ${penalties}, threshold: ${threshold})`
      }
    };
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
   * Download single image with retry logic
   */
  async downloadSingleImage(url, filepath, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios({
          method: 'GET',
          url: url,
          responseType: 'stream',
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        // Check content type
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
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
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
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
