const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

class ManifestGenerator {
  
  /**
   * Generate manifest.json for all processed images
   */
  static async generateManifest(resizedImages, celebrityName, roles = []) {
    try {
      logger.info('Generating manifest...');
      
      const manifest = {
        celebrity: celebrityName,
        generated: new Date().toISOString(),
        totalImages: resizedImages.length,
        formats: this.getFormatCounts(resizedImages),
        // index.js has always passed roles as a third argument; the parameter
        // was missing, so the role list was silently dropped from every
        // manifest ever generated.
        roles: roles.map(role => ({
          character: role.character,
          title: role.title,
          medium: role.medium,
          year: role.year
        })),
        printQuality: this.getPrintQualitySummary(resizedImages),
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
      character: image.character,
      format: image.format,
      /**
       * Source is what was downloaded; output is the file in this package.
       * `dimensions` previously reported the SOURCE size under a key that
       * reads like the print size — misleading in a manifest whose whole
       * purpose is telling a print shop what it is receiving.
       */
      dimensions: {
        width: image.outputWidth || image.actualWidth,
        height: image.outputHeight || image.actualHeight
      },
      sourceDimensions: {
        width: image.actualWidth,
        height: image.actualHeight
      },
      printDpi: image.printDpi || null,
      tags: image.tags || [],
      sourceUrl: image.originalUrl,
      orientation: this.getImageOrientation(image.actualWidth, image.actualHeight),
      fileSize: this.getFileSizeSync(image.resizedPath),
      hash: image.hash
    };
  }
  
  /**
   * Print-quality spread, so the weakest file in a package is visible without
   * opening every image.
   */
  static getPrintQualitySummary(images) {
    const dpis = images.map(i => i.printDpi).filter(Number.isFinite);
    if (dpis.length === 0) return null;

    return {
      minDpi: Math.min(...dpis),
      maxDpi: Math.max(...dpis),
      medianDpi: dpis.slice().sort((a, b) => a - b)[Math.floor(dpis.length / 2)],
      atFull300Dpi: dpis.filter(d => d >= 300).length
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
