const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');
const { sanitizeFilename } = require('../utils/helpers');

class ImageFetcher {
  
  /**
   * Fetch images for a specific role using SerpAPI Google Images
   */
  static async fetchImages(celebrityName, role, workDir) {
    try {
      if (!config.api.serpApiKey) {
        throw new Error('SerpAPI key not configured');
      }
      
      const searchQuery = this.buildSearchQuery(celebrityName, role);
      logger.info(`Searching images for: ${searchQuery}`);
      
      const imageUrls = await this.searchSerpImages(searchQuery);
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
   * Search SerpAPI Google Images
   */
  static async searchSerpImages(query) {
    const url = config.api.serpEndpoint;
    
    const params = {
      api_key: config.api.serpApiKey,
      engine: 'google_images',
      q: query,
      num: config.image.maxImagesPerRole,
      ijn: 0, // Image page number
      tbs: 'isz:l,sur:fmc', // Large images, free for commercial use
      safe: 'active',
      nfpr: 1 // No auto-correction
    };
    
    const headers = {
      'User-Agent': 'PrintPrepNode/1.0',
      'Accept': 'application/json'
    };
    
    try {
      const response = await axios.get(url, { 
        params, 
        headers,
        timeout: 15000
      });
      
      // Handle SerpAPI response format
      const images = response.data.images_results || [];
      
      return images.map(image => ({
        url: image.original || image.thumbnail,
        thumbnailUrl: image.thumbnail,
        width: image.original_width || 0,
        height: image.original_height || 0,
        size: image.original_width && image.original_height ? 
              `${image.original_width}x${image.original_height}` : 0,
        name: image.title || 'untitled',
        hostPageUrl: image.link || '',
        source: image.source || 'Unknown',
        position: image.position || 0,
        serpApiData: {
          relatedContentId: image.related_content_id,
          isProduct: image.is_product || false,
          license: image.license_details_url || null
        }
      }));
      
    } catch (error) {
      logger.error('SerpAPI error:', error.response?.data || error.message);
      
      // Handle specific SerpAPI errors
      if (error.response?.status === 401) {
        logger.error('Invalid SerpAPI key. Check your SERP_API_KEY in config.');
        return [];
      }
      
      if (error.response?.status === 403) {
        logger.error('SerpAPI quota exceeded or access denied.');
        return [];
      }
      
      // If the endpoint fails, try fallback search
      if (error.response?.status === 404 || error.response?.status === 500) {
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
