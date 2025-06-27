const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

class ManifestGenerator {
  
  /**
   * Generate manifest.json for all processed images
   */
  static async generateManifest(resizedImages, celebrityName) {
    try {
      logger.info('Generating manifest...');
      
      const manifest = {
        celebrity: celebrityName,
        generated: new Date().toISOString(),
        totalImages: resizedImages.length,
        formats: this.getFormatCounts(resizedImages),
        images: resizedImages.map(image => this.createImageEntry(image))
      };
      
      logger.info(`Manifest generated with ${manifest.totalImages} images`);
      return manifest;
      
    } catch (error) {
      logger.error('Error generating manifest:', error.message);
      throw error;
    }
  }
  
  /**
   * Create manifest entry for single image
   */
  static createImageEntry(image) {
    return {
      id: this.generateImageId(image),
      filename: path.basename(image.resizedPath),
      originalFilename: image.filename,
      role: image.role,
      format: image.format,
      dimensions: {
        width: image.actualWidth,
        height: image.actualHeight
      },
      tags: image.tags || [],
      sourceUrl: image.originalUrl,
      orientation: this.getImageOrientation(image.actualWidth, image.actualHeight),
      fileSize: this.getFileSizeSync(image.resizedPath),
      hash: image.hash
    };
  }
  
  /**
   * Get counts by format
   */
  static getFormatCounts(images) {
    const counts = {};
    
    images.forEach(image => {
      counts[image.format] = (counts[image.format] || 0) + 1;
    });
    
    return counts;
  }
  
  /**
   * Generate unique ID for image
   */
  static generateImageId(image) {
    const data = `${image.filename}_${image.format}_${image.role}`;
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 8);
  }
  
  /**
   * Determine image orientation
   */
  static getImageOrientation(width, height) {
    const ratio = width / height;
    if (ratio > 1.2) return 'landscape';
    if (ratio < 0.8) return 'portrait';
    return 'square';
  }
  
  /**
   * Get file size synchronously
   */
  static getFileSizeSync(filepath) {
    try {
      const fs = require('fs');
      const stats = fs.statSync(filepath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }
}

module.exports = { generateManifest: ManifestGenerator.generateManifest.bind(ManifestGenerator) };
