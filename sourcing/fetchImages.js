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
   * Search Azure AI Services Image API (new format)
   */
  static async searchBingImages(query) {
    // Use configured endpoint (Azure AI Services format)
    const url = config.api.bingEndpoint;
    
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
      'User-Agent': 'PrintPrepNode/1.0',
      'Accept': 'application/json'
    };
    
    try {
      const response = await axios.get(url, { 
        params, 
        headers,
        timeout: 15000
      });
      
      // Handle both old v7 and new AI Services response formats
      const images = response.data.value || response.data.images || [];
      
      return images.map(image => ({
        url: image.contentUrl || image.url,
        thumbnailUrl: image.thumbnailUrl || image.thumbnail?.url,
        width: image.width || 0,
        height: image.height || 0,
        size: image.contentSize || 0,
        name: image.name || 'untitled',
        hostPageUrl: image.hostPageUrl || image.webSearchUrl
      }));
      
    } catch (error) {
      logger.error('Azure AI Services Image API error:', error.response?.data || error.message);
      
      // If the endpoint fails, try fallback search
      if (error.response?.status === 404 || error.response?.status === 403) {
        logger.warn('Primary endpoint failed, trying fallback...');
        return await this.fallbackImageSearch(query);
      }
      
      return [];
    }
  }
  
  /**
   * Fallback image search using alternative approach
   */
  static async fallbackImageSearch(query) {
    try {
      // You can implement alternative image sources here
      // For now, return empty array and log the need for manual intervention
      logger.warn('Fallback search not implemented. Consider adding alternative image sources.');
      return [];
      
    } catch (error) {
      logger.error('Fallback search failed:', error.message);
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
