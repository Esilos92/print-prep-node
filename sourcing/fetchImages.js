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
      
      // Search 1: Specific role query (enhanced for group shots)
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
      
      // Apply person verification (GROUP SHOT FRIENDLY)
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
   * Build specific query (ENHANCED for group shots)
   */
  static buildSpecificQuery(celebrityName, role) {
    const name = celebrityName;
    const roleTitle = role.name;
    const character = role.character;
    
    // Try different query strategies to find group shots
    if (character && character !== 'Unknown role') {
      // Include cast/group terms for better group shots
      return `${name} ${character} ${roleTitle} cast`;
    } else {
      // Add terms that help find group/promotional photos
      return `${name} ${roleTitle} behind scenes cast`;
    }
  }
  
  /**
   * Search SerpAPI using YOUR WORKING PARAMETERS (simplified)
   */
  static async searchSerpAPI(query, maxResults = 20) {
    try {
      const params = {
        api_key: config.api.serpApiKey,
        engine: 'google_images',
        q: query,
        num: Math.min(maxResults, 100),
        ijn: 0,
        // Simplified - removed restrictive filters
        safe: 'active'
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
   * Filter and verify images (GROUP SHOT FRIENDLY)
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
        
        // Must have reasonable reliability score (very lenient)
        if (image.reliabilityScore < -2) {
          logger.info(`❌ Rejected: ${image.title} - Very low reliability source`);
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
   * Score image source reliability
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
    
    // Low reliability sources (less penalty now)
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
      if (url.includes(source)) score -= 0.5; // Reduced penalty
    });
    
    return score;
  }
  
  /**
   * GROUP SHOT FRIENDLY person verification
   */
  static validatePersonInImage(imageData, celebrityName, role) {
    const title = (imageData.title || '').toLowerCase();
    const source = (imageData.source || '').toLowerCase();
    
    const name = celebrityName.toLowerCase();
    const nameWords = name.split(' ');
    const lastName = nameWords[nameWords.length - 1];
    const firstName = nameWords[0];
    
    let confidence = 0;
    
    // POSITIVE INDICATORS
    
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
    
    // Role/franchise context
    const roleWords = role.name.toLowerCase().split(' ').slice(0, 2);
    roleWords.forEach(word => {
      if (word.length > 3 && title.includes(word)) confidence += 2;
    });
    
    // Professional indicators
    const professionalTerms = ['actor', 'star', 'celebrity', 'cast', 'portrait', 'headshot'];
    professionalTerms.forEach(term => {
      if (title.includes(term)) confidence += 2;
    });
    
    // GROUP SHOT BONUSES (NEW!)
    const groupIndicators = [
      'cast', 'crew', 'ensemble', 'group', 'team', 'together', 
      'with', 'and', 'co-star', 'co-stars', 'behind the scenes'
    ];
    groupIndicators.forEach(indicator => {
      if (title.includes(indicator)) confidence += 3;  // BONUS for group shots!
    });
    
    // STAR TREK SPECIFIC BONUSES (since that's his main franchise)
    const trekTerms = ['trek', 'enterprise', 'kirk', 'spock', 'bridge', 'starfleet'];
    trekTerms.forEach(term => {
      if (title.includes(term)) confidence += 3;
    });
    
    // Good source bonus
    const goodSources = ['imdb', 'wikipedia', 'getty', 'fanpop', 'startrek'];
    goodSources.forEach(goodSource => {
      if (source.includes(goodSource)) confidence += 3;
    });
    
    // NEGATIVE INDICATORS (Much more selective now)
    let penalties = 0;
    
    // Only penalize if it's DEFINITELY not a real photo
    const definitelyWrong = ['cartoon', 'animation', 'drawing', 'painting', 'sketch', 'artwork'];
    definitelyWrong.forEach(wrong => {
      if (title.includes(wrong)) penalties += 5;
    });
    
    // REMOVED: Penalties for other actor names - we WANT group shots!
    
    // Only penalize if it's clearly about someone else INSTEAD of William
    const exclusivelyOtherPerson = [
      'elvis presley', 'james dean', 'marilyn monroe', 'audrey hepburn'
    ];
    exclusivelyOtherPerson.forEach(other => {
      if (title.includes(other) && !title.includes(name) && !title.includes(lastName)) {
        penalties += 4;
      }
    });
    
    // Penalize if it's clearly the wrong profession
    if (title.includes('musician') && !title.includes('actor')) penalties += 2;
    if (title.includes('politician') && !title.includes('actor')) penalties += 2;
    
    const finalScore = confidence - penalties;
    
    return {
      isValid: finalScore >= 1,  // Very low threshold - just needs to be plausibly related
      confidence: finalScore,
      reasons: {
        nameMatch: title.includes(name) || title.includes(lastName),
        characterMatch: role.character && title.includes(role.character.toLowerCase()),
        groupShot: groupIndicators.some(indicator => title.includes(indicator)),
        trekContext: trekTerms.some(term => title.includes(term)),
        professionalContext: professionalTerms.some(term => title.includes(term)),
        penalties: penalties,
        details: `Score: ${finalScore} (confidence: ${confidence}, penalties: ${penalties})`
      }
    };
  }
  
  /**
   * Download verified images
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
