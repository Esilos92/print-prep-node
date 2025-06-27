const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');
const { sanitizeFilename } = require('../utils/helpers');

class ImageFetcher {
  
  /**
   * Fetch images for a specific role using Bing Image Search API
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      if (!config.api.bingImageKey) {
        throw new Error('Bing Image Search API key not configured');
      }
      
      const searchQuery = this.buildSearchQuery(celebrityName, role);
      logger.info(`Searching images for: ${searchQuery}`);
      
      const imageUrls = await this.searchBingImages(searchQuery);
      logger.info(`Found ${imageUrls.length} image URLs`);
      
      const downloadedImages = await this.downloadImages(imageUrls, role, workDir);
      logger.info(`Successfully downloaded ${downloadedImages.length} images`);
      
      return downloadedImages;
      
    } catch (error) {
      logger.error(`Error fetching images for ${role.name}:`, error.message);
      return [];
    }
  }
  
  /**
   * Build optimized search query
   */
  static buildSearchQuery(celebrityName, role) {
    const terms = [celebrityName];
    
    if (role.character) {
      terms.push(role.character);
    }
    
    if (role.name && role.name !== `${celebrityName} - Professional Photos`) {
      terms.push(role.name);
    }
    
    // Add quality modifiers
    terms.push('high resolution', 'professional photo');
    
    return terms.join(' ');
  }
  
  /**
   * Search Bing Image API
   */
  static async searchBingImages(query) {
    const url = 'https://api.bing.microsoft.com/v7.0/images/search';
    const params = {
      q: query,
      count: config.image.maxImagesPerRole,
      offset: 0,
      mkt: 'en-US',
      safeSearch: 'Moderate',
      imageType: 'Photo',
      size: 'Large', // Large or Wallpaper for high-res
      aspect: 'All',
      color: 'All',
      freshness: 'All'
    };
    
    const headers = {
      'Ocp-Apim-Subscription-Key': config.api.bingImageKey,
      'User-Agent': 'PrintPrepNode/1.0'
    };
    
    try {
      const response = await axios.get(url, { params, headers });
      
      return response.data.value.map(image => ({
        url: image.contentUrl,
        thumbnailUrl: image.thumbnailUrl,
        width: image.width,
        height: image.height,
        size: image.contentSize,
        name: image.name,
        hostPageUrl: image.hostPageUrl
      }));
      
    } catch (error) {
      logger.error('Bing Image API error:', error.response?.data || error.message);
      return [];
    }
  }
  
  /**
   * Download images from URLs
   */
  static async downloadImages(imageUrls, role, workDir) {
    const downloadedImages = [];
    const roleDir = path.join(workDir, 'downloads', sanitizeFilename(role.name));
    await fs.mkdir(roleDir, { recursive: true });
    
    const downloadPromises = imageUrls.map(async (imageData, index) => {
      try {
        const response = await axios.get(imageData.url, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const buffer = Buffer.from(response.data);
        const extension = this.getImageExtension(response.headers['content-type'] || '');
        const filename = `${sanitizeFilename(role.name)}_${index + 1}.${extension}`;
        const filepath = path.join(roleDir, filename);
        
        await fs.writeFile(filepath, buffer);
        
        return {
          filepath,
          filename,
          role: role.name,
          originalUrl: imageData.url,
          sourceWidth: imageData.width,
          sourceHeight: imageData.height,
          buffer,
          metadata: imageData
        };
        
      } catch (error) {
        logger.warn(`Failed to download image ${index + 1} for ${role.name}:`, error.message);
        return null;
      }
    });
    
    const results = await Promise.allSettled(downloadPromises);
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        downloadedImages.push(result.value);
      }
    });
    
    return downloadedImages;
  }
  
  /**
   * Determine file extension from content type
   */
  static getImageExtension(contentType) {
    const extensions = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    
    return extensions[contentType.toLowerCase()] || 'jpg';
  }
}

module.exports = { fetchImages: ImageFetcher.fetchImages.bind(ImageFetcher) };
