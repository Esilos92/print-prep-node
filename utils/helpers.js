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
    if (ImageHelpers.meetsResolution(width, height, '11x17')) {
      return ['11x17', '8x10'];
    } else if (ImageHelpers.meetsResolution(width, height, '8x10')) {
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
    tags.push(ImageHelpers.getOrientation(width, height));
    
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

  /**
   * NEW: Generate filename with celebrity last name
   * Format: LastName-Role-Index-Format.jpg
   */
  static generateFilename(celebrityName, roleName, index, format) {
    // Extract last name from celebrity name
    const lastName = ImageHelpers.extractLastName(celebrityName);
    
    // Clean up role name (remove special characters, spaces to dashes)
    const cleanRole = ImageHelpers.cleanRoleName(roleName);
    
    // Generate filename: Shatner-Star_Trek_II-1-8x10.jpg
    return `${lastName}-${cleanRole}-${index}-${format}.jpg`;
  }

  /**
   * NEW: Extract last name from full celebrity name
   */
  static extractLastName(fullName) {
    if (!fullName) return 'Unknown';
    
    // Split by spaces and take the last part
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1]
      .replace(/[^a-zA-Z0-9]/g, '') // Remove special characters
      .trim();
  }

  /**
   * NEW: Clean role name for filename use
   */
  static cleanRoleName(roleName) {
    if (!roleName) return 'Unknown';
    
    return roleName
      .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and dashes
      .replace(/\s+/g, '_')     // Spaces to underscores
      .replace(/-+/g, '_')      // Dashes to underscores
      .replace(/_+/g, '_')      // Multiple underscores to single
      .replace(/^_|_$/g, '')    // Remove leading/trailing underscores
      .substring(0, 30);        // Limit length
  }
}

// Export individual functions for backward compatibility
module.exports = {
  getOrientation: ImageHelpers.getOrientation.bind(ImageHelpers),
  meetsResolution: ImageHelpers.meetsResolution.bind(ImageHelpers),
  getBestFormat: ImageHelpers.getBestFormat.bind(ImageHelpers),
  generateSimpleHash: ImageHelpers.generateSimpleHash.bind(ImageHelpers),
  calculateSimilarity: ImageHelpers.calculateSimilarity.bind(ImageHelpers),
  sanitizeFilename: ImageHelpers.sanitizeFilename.bind(ImageHelpers),
  extractTags: ImageHelpers.extractTags.bind(ImageHelpers),
  // NEW EXPORTS
  generateFilename: ImageHelpers.generateFilename.bind(ImageHelpers),
  extractLastName: ImageHelpers.extractLastName.bind(ImageHelpers),
  cleanRoleName: ImageHelpers.cleanRoleName.bind(ImageHelpers)
};
