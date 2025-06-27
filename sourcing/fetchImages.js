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
      const query = this.buildSpecificQuery(celebrityName, role);
      
      logger.info(`Search query: "${query}"`);
      
      const serpAPIParams = this.getEnhancedSerpAPIParams(query);
      const response = await this.callSerpAPI(serpAPIParams);
      
      if (!response.images_results || response.images_results.length === 0) {
        logger.warn(`No images found for query: ${query}`);
        return [];
      }
      
      logger.info(`Found ${response.images_results.length} potential images`);
      
      // Filter by person verification and source reliability
      const verifiedImages = this.filterAndVerifyImages(
        response.images_results, 
        celebrityName, 
        role
      );
      
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
   * Build highly specific search queries for better person targeting
   */
  static buildSpecificQuery(celebrityName, role) {
    const name = celebrityName;
    const roleTitle = role.name;
    const character = role.character;
    const year = role.year;
    
    // Build increasingly specific search terms
    let query;
    
    if (character && character !== 'Unknown role') {
      // Most specific: Name + Character + Title
      query = `"${name}" "${character}" "${roleTitle}"`;
    } else if (year) {
      // Very specific: Name + Title + Year
      query = `"${name}" "${roleTitle}" ${year}`;
    } else {
      // Good specificity: Name + Title + "actor"
      query = `"${name}" "${roleTitle}" actor`;
    }
    
    return query;
  }
  
  /**
   * Enhanced SerpAPI parameters for better person identification
   */
  static getEnhancedSerpAPIParams(query) {
    return {
      api_key: config.api.serpKey,
      engine: "google_images",
      q: query,
      
      // PERSON-SPECIFIC FILTERS
      imgtype: "face",           // Focus on faces/people
      imgsz: "medium,large,xlarge", // Larger images = better face detail
      // Removed imgc: "color" to allow B&W photos for older celebrities
      
      // CONTENT QUALITY FILTERS
      safe: "active",            // Family-safe content
      
      // Better quality images
      tbs: "isz:m",             // Medium+ size images
      
      num: 50,                  // Maximum results
      start: 0
    };
  }
  
  /**
   * Call SerpAPI with enhanced parameters
   */
  static async callSerpAPI(params) {
    const url = config.api.serpEndpoint || 'https://serpapi.com/search.json';
    
    try {
      const response = await axios.get(url, {
        params: params,
        timeout: 30000
      });
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('SerpAPI rate limit exceeded');
      } else if (error.response?.status === 401) {
        throw new Error('SerpAPI authentication failed - check API key');
      } else {
        throw new Error(`SerpAPI request failed: ${error.message}`);
      }
    }
  }
  
  /**
   * Filter and verify images to ensure correct person
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
        // Sort by combined score: person verification + source reliability
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
    const snippet = (imageData.snippet || '').toLowerCase();
    
    let score = 0;
    
    // HIGH RELIABILITY SOURCES (+3 points each)
    const highReliabilitySources = [
      'imdb.com',           // Internet Movie Database
      'wikipedia.org',      // Wikipedia
      'gettyimages.com',    // Getty Images
      'shutterstock.com',   // Shutterstock
      'alamyimages.com',    // Alamy
      'rottentomatoes.com', // Rotten Tomatoes
      'themoviedb.org'      // The Movie Database
    ];
    
    // MEDIUM RELIABILITY SOURCES (+2 points each)
    const mediumReliabilitySources = [
      'fanpop.com',         // Fan sites with moderation
      'flickr.com',         // Flickr
      'fandom.com',         // Fandom wikis
      'tvguide.com',        // TV Guide
      'eonline.com',        // E! Online
      'people.com',         // People Magazine
      'variety.com',        // Variety
      'hollywoodreporter.com' // Hollywood Reporter
    ];
    
    // LOW RELIABILITY SOURCES (-1 point each)
    const lowReliabilitySources = [
      'tumblr.com',         // User-generated, unmoderated
      'reddit.com',         // Reddit posts
      'facebook.com',       // Facebook posts
      'twitter.com',        // Twitter posts
      'instagram.com',      // Instagram posts
      'tiktok.com',         // TikTok
      'pinterest.com'       // Pinterest (mixed quality)
    ];
    
    // Score based on source
    highReliabilitySources.forEach(source => {
      if (url.includes(source)) score += 3;
    });
    
    mediumReliabilitySources.forEach(source => {
      if (url.includes(source)) score += 2;
    });
    
    lowReliabilitySources.forEach(source => {
      if (url.includes(source)) score -= 1;
    });
    
    // Bonus for professional photo indicators
    const professionalIndicators = [
      'headshot', 'portrait', 'professional', 'official', 
      'premiere', 'red carpet', 'getty', 'wireimage', 'press'
    ];
    
    professionalIndicators.forEach(indicator => {
      if (title.includes(indicator) || snippet.includes(indicator)) {
        score += 1;
      }
    });
    
    return score;
  }
  
  /**
   * Validate that the image contains the correct person
   */
  static validatePersonInImage(imageData, celebrityName, role) {
    const title = (imageData.title || '').toLowerCase();
    const snippet = (imageData.snippet || '').toLowerCase();
    const source = (imageData.source || '').toLowerCase();
    
    const name = celebrityName.toLowerCase();
    const nameWords = name.split(' ');
    const lastName = nameWords[nameWords.length - 1];
    const firstName = nameWords[0];
    
    // POSITIVE INDICATORS
    let confidence = 0;
    
    // Strong name matches
    if (title.includes(name)) confidence += 5;
    if (snippet.includes(name)) confidence += 3;
    
    // Partial name matches (first + last name)
    if (title.includes(lastName) && title.includes(firstName)) confidence += 4;
    if (snippet.includes(lastName) && snippet.includes(firstName)) confidence += 2;
    
    // Character context
    if (role.character && role.character !== 'Unknown role') {
      const character = role.character.toLowerCase();
      if (title.includes(character) || snippet.includes(character)) confidence += 3;
    }
    
    // Role/title context
    const roleWords = role.name.toLowerCase().split(' ').slice(0, 3); // First 3 words
    roleWords.forEach(word => {
      if (word.length > 3 && (title.includes(word) || snippet.includes(word))) {
        confidence += 1;
      }
    });
    
    // Professional context
    const professionalTerms = ['actor', 'star', 'celebrity', 'portrait', 'headshot'];
    professionalTerms.forEach(term => {
      if (title.includes(term) || snippet.includes(term)) confidence += 1;
    });
    
    // NEGATIVE INDICATORS (likely wrong person)
    let penalties = 0;
    
    // Common name confusions
    const confusionNames = this.getNameConfusions(celebrityName);
    confusionNames.forEach(confusionName => {
      if (title.includes(confusionName) || snippet.includes(confusionName)) {
        penalties += 3;
      }
    });
    
    // Wrong media type indicators
    const wrongMediaTypes = ['cartoon', 'animation', 'drawing', 'painting', 'artwork', 'sketch'];
    wrongMediaTypes.forEach(type => {
      if (title.includes(type)) penalties += 2;
    });
    
    // Wrong profession indicators
    const wrongProfessions = ['musician', 'singer', 'athlete', 'politician'];
    wrongProfessions.forEach(profession => {
      if (title.includes(profession) && !title.includes('actor')) penalties += 1;
    });
    
    const finalScore = confidence - penalties;
    
    return {
      isValid: finalScore >= 3,
      confidence: finalScore,
      reasons: {
        nameMatch: title.includes(name) || snippet.includes(name),
        characterMatch: role.character && title.includes(role.character.toLowerCase()),
        professionalContext: confidence > 2,
        penalties: penalties,
        details: `Title: "${title.substring(0, 50)}..."`
      }
    };
  }
  
  /**
   * Get common name confusions for specific celebrities
   */
  static getNameConfusions(celebrityName) {
    const name = celebrityName.toLowerCase();
    
    // Common confusions by celebrity
    const confusionMap = {
      'william shatner': ['william shakespeare', 'bill gates', 'will smith', 'billy crystal'],
      'chris evans': ['chris pratt', 'chris pine', 'chris hemsworth', 'evans blue'],
      'harrison ford': ['harrison wells', 'gerald ford', 'ford motor'],
      'robert downey': ['robert downey sr', 'robert de niro'],
      'mark hamill': ['mark wahlberg', 'mark ruffalo'],
      'carrie fisher': ['carrie underwood', 'fisher price']
    };
    
    return confusionMap[name] || [];
  }
  
  /**
   * Download verified images
   */
  static async downloadImages(images, workDir, celebrityName, role) {
    const downloadDir = path.join(workDir, 'downloaded');
    await fs.mkdir(downloadDir, { recursive: true });
    
    const downloadedImages = [];
    let successCount = 0;
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        const filename = this.generateSafeFilename(role.name, i + 1, image.original);
        const filepath = path.join(downloadDir, filename);
        
        const success = await this.downloadSingleImage(image.original, filepath);
        
        if (success) {
          downloadedImages.push({
            filename: filename,
            filepath: filepath,
            originalUrl: image.original,
            role: role.name,
            character: role.character,
            title: image.title,
            source: image.source,
            reliabilityScore: image.reliabilityScore,
            verificationScore: image.personVerification.confidence,
            tags: [role.media_type || 'unknown', 'serpapi']
          });
          
          successCount++;
          logger.info(`✅ Downloaded: ${filename} (verification: ${image.personVerification.confidence}, reliability: ${image.reliabilityScore})`);
        }
        
      } catch (error) {
        logger.warn(`❌ Failed to download image ${i + 1}:`, error.message);
      }
    }
    
    logger.info(`Successfully downloaded ${successCount}/${images.length} images for ${role.name}`);
    return downloadedImages;
  }
  
  /**
   * Download a single image file
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
      logger.warn(`Failed to download ${url}:`, error.message);
      return false;
    }
  }
  
  /**
   * Generate safe filename for downloaded image
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
   * Extract file extension from URL
   */
  static getImageExtension(url) {
    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    
    for (const ext of extensions) {
      if (url.toLowerCase().includes(`.${ext}`)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
    
    return 'jpg'; // Default fallback
  }
}

module.exports = { fetchImages: ImageFetcher.fetchImages.bind(ImageFetcher) };
