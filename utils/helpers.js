const crypto = require('crypto');
const sharp = require('sharp');

class ImageHelpers {
  
  /**
   * Determine image orientation
   */
  static getOrientation(width, height) {
    const ratio = width / height;
    if (ratio > 1.2) return 'landscape';
    if (ratio < 0.8) return 'portrait';
    return 'square';
  }
  
  /**
   * Check if image meets minimum resolution requirements
   */
  static meetsResolution(width, height, format) {
    const config = require('./config');
    const minDims = config.image.minDimensions[format];
    
    return width >= minDims.width && height >= minDims.height;
  }
  
  /**
   * Determine best print format for image
   */
  static getBestFormat(width, height) {
    if (this.meetsResolution(width, height, '11x17')) {
      return ['11x17', '8x10'];
    } else if (this.meetsResolution(width, height, '8x10')) {
      return ['8x10'];
    }
    return [];
  }
  
  /**
   * Generate simple hash for deduplication
   */
  static generateSimpleHash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }
  
  /**
   * Calculate perceptual hash similarity
   */
  static calculateSimilarity(hash1, hash2) {
    if (hash1.length !== hash2.length) return 0;
    
    let matches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) matches++;
    }
    
    return matches / hash1.length;
  }
  
  /**
   * Clean filename for filesystem
   */
  static sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 100);
  }
  
  /**
   * Extract tags from image analysis
   */
  static extractTags(width, height, filename, role) {
    const tags = [];
    
    // Orientation
    tags.push(this.getOrientation(width, height));
    
    // Group detection (basic)
    if (filename.toLowerCase().includes('group') || 
        filename.toLowerCase().includes('cast') ||
        filename.toLowerCase().includes('ensemble')) {
      tags.push('group');
    } else {
      tags.push('individual');
    }
    
    // Role-specific tags
    if (role && role.tags) {
      tags.push(...role.tags);
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }
}

module.exports = ImageHelpers;
