const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');

class ImageFetcher {
  
  /**
   * Fetch images for a specific celebrity and role
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      logger.info(`🖼️ Fetching images for ${celebrityName} in ${role.name}...`);
      
      const maxImages = config.image.maxImagesPerRole || 50;
      
      // Use your working search approach but with enhanced queries
      const allImages = [];
      
      // Search 1: Specific role query (enhanced)
      const roleQuery = this.buildSpecificQuery(celebrityName, role);
      logger.info(`Search query: "${roleQuery}"`);
      
      const roleImages = await this.searchSerpAPI(roleQuery, 30);
      allImages.push(...roleImages);
      
      // Search 2: General celebrity + headshot (if we need more)
      if (allImages.length < maxImages) {
        const portraitQuery = `${celebrityName} headshot portrait`;
        const portraitImages = await this.searchSerpAPI(portraitQuery, 20);
        allImages.push(...portraitImages);
      }
      
      // Remove duplicates
      const uniqueImages = this.removeDuplicateImages(allImages);
      
      // Apply person verification (NEW)
      const verifiedImages = this.filterAndVerifyImages(uniqueImages, celebrityName, role);
      logger.info(`${verifiedImages.length} images passed verification`);
      
      // Download the verified images
      const downloadedImages = await this.downloadImages(
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
   * Build specific query (same as enhanced version)
   */
  static buildSpecificQuery(celebrityName, role) {
    const name = celebrityName;
    const roleTitle = role.name;
    const character = role.character;
    const year = role.year;
    
    if (character && character !== 'Unknown role') {
      return `${name} ${character} ${roleTitle}`;
    } else if (year) {
      return `${name} ${roleTitle} ${year}`;
    } else {
      return `${name} ${roleTitle}`;
    }
  }
  
  /**
   * Search SerpAPI using YOUR WORKING PARAMETERS
   */
  static async searchSerpAPI(query, maxResults = 20) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query,
        num: Math.min(maxResults, 100),
        ijn: 0,
        // Use your working parameters
        tbs: 'isz:l,sur:fmc', // Large images, free for commercial use
        safe: 'active',
        nfpr: 1
      };

      const response = await axios.get(config.api.serpEndpoint, { 
        params,
        timeout: 30000
      });

      if (!response.data || !response.data.images_results) {
        logger.warn(`No images found in SerpAPI response for: ${query}`);
        return [];
      }

      // Convert to our format
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
   * Remove duplicates (from your working version)
   */
  static removeDuplicateImages(images) {
    const seen = new Set();
    return images.filter(img => {
      const urlKey = (img.url || img.original).split('?')[0].toLowerCase();
      
      if (seen.has(urlKey)) {
        return false;
      }
      seen.add(urlKey);
      return true;
    });
  }
  
  /**
   * Filter and verify images (NEW - person verification)
   */
  static filterAndVerifyImages(images, celebrityName, role) {
    return images
      .map(image => ({
        ...image,
        reliabilityScore: this.scoreImageSource(image, celebrityName),
        personVerification: this.validatePersonInImage(image, celebrityName, role)
      }))
      .filter(image => {
        // Must pass person verification
        if (!image.personVerification.isValid) {
          logger.info(`❌ Rejected: ${image.title} - Failed person verification (score: ${image.personVerification.confidence})`);
          return false;
        }
        
        // Must have reasonable reliability score
        if (image.reliabilityScore < 0) {
          logger.info(`❌ Rejected: ${image.title} - Low reliability source`);
          return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        const scoreA = a.personVerification.confidence + a.reliabilityScore;
        const scoreB = b.personVerification.confidence + b.reliabilityScore;
        return scoreB - scoreA;
      });
  }
  
  /**
   * Score image source reliability (NEW)
   */
  static scoreImageSource(imageData, celebrityName) {
    const url = (imageData.source || '').toLowerCase();
    const title = (imageData.title || '').toLowerCase();
    
    let score = 0;
    
    // High reliability sources
    const highReliabilitySources = [
      'imdb.com', 'wikipedia.org', 'gettyimages.com', 'shutterstock.com'
    ];
    
    // Medium reliability sources
    const mediumReliabilitySources = [
      'fanpop.com', 'flickr.com', 'tvguide.com', 'people.com'
    ];
    
    // Low reliability sources
    const lowReliabilitySources = [
      'tumblr.com', 'reddit.com', 'facebook.com', 'twitter.com'
    ];
    
    highReliabilitySources.forEach(source => {
      if (url.includes(source)) score += 3;
    });
    
    mediumReliabilitySources.forEach(source => {
      if (url.includes(source)) score += 2;
    });
    
    lowReliabilitySources.forEach(source => {
      if (url.includes(source)) score -= 1;
    });
    
    return score;
  }
  
  /**
   * Validate person in image (NEW)
   */
  static validatePersonInImage(imageData, celebrityName, role) {
    const title = (imageData.title || '').toLowerCase();
    const source = (imageData.source || '').toLowerCase();
    
    const name = celebrityName.toLowerCase();
    const nameWords = name.split(' ');
    const lastName = nameWords[nameWords.length - 1];
    const firstName = nameWords[0];
    
    let confidence = 0;
    
    // Strong name matches
    if (title.includes(name)) confidence += 5;
    
    // Partial name matches
    if (title.includes(lastName) && title.includes(firstName)) confidence += 4;
    
    // Character context
    if (role.character && role.character !== 'Unknown role') {
      const character = role.character.toLowerCase();
      if (title.includes(character)) confidence += 3;
    }
    
    // Professional context
    const professionalTerms = ['actor', 'star', 'celebrity'];
    professionalTerms.forEach(term => {
      if (title.includes(term)) confidence += 1;
    });
    
    // Negative indicators
    let penalties = 0;
    const wrongTypes = ['cartoon', 'animation', 'drawing'];
    wrongTypes.forEach(type => {
      if (title.includes(type)) penalties += 2;
    });
    
    const finalScore = confidence - penalties;
    
    return {
      isValid: finalScore >= 2, // Lower threshold since we're more conservative
      confidence: finalScore,
      reasons: {
        nameMatch: title.includes(name),
        characterMatch: role.character && title.includes(role.character.toLowerCase())
      }
    };
  }
  
  /**
   * Download images (adapted from your working version)
   */
  static async downloadImages(images, workDir, celebrityName, role) {
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
            character: role.character,
            title: image.title,
            source: image.source,
            reliabilityScore: image.reliabilityScore || 0,
            verificationScore: image.personVerification?.confidence || 0,
            tags: [role.media_type || 'unknown', 'serpapi']
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
   * Download single image (from your working version)
   */
  static async downloadSingleImage(url, filepath) {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const writer = require('fs').createWriteStream(filepath);
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(true));
        writer.on('error', reject);
      });
      
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Generate safe filename (from your working version)
   */
  static generateSafeFilename(roleName, index, originalUrl) {
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
  static getImageExtension(url) {
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
