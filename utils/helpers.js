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
   * FIXED: Generate clean filename - Number - Actor - Show - Size
   * Format: 01 - Jackson Rathbone - Twilight - 8x10.jpg
   */
  static generateFilename(celebrityName, roleName, index, format) {
    // Pad index to 2 digits
    const paddedIndex = String(index).padStart(2, '0');
    
    // Clean celebrity name (full name, not just last name)
    const cleanCelebrity = ImageHelpers.cleanCelebrityName(celebrityName);
    
    // Clean show name (extract clean show title, not source title)
    const cleanShow = ImageHelpers.cleanShowName(roleName);
    
    // Generate clean filename: 01 - Jackson Rathbone - Twilight - 8x10.jpg
    return `${paddedIndex} - ${cleanCelebrity} - ${cleanShow} - ${format}.jpg`;
  }

  /**
   * NEW: Clean celebrity name for filename
   */
  static cleanCelebrityName(fullName) {
    if (!fullName) return 'Unknown';
    
    return fullName
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters, keep spaces
      .replace(/\s+/g, ' ')    // Normalize multiple spaces to single space
      .trim();
  }

  /**
   * NEW: Clean show name from role/title data
   */
  static cleanShowName(roleName) {
    if (!roleName) return 'Unknown';
    
    // Handle different role name formats that might come through
    let cleanName = roleName;
    
    // If it looks like a source title (contains URLs, "eBay", etc.), try to extract show name
    if (this.isSourceTitle(roleName)) {
      cleanName = this.extractShowFromSourceTitle(roleName);
    }
    
    // Clean up the name
    return cleanName
      .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and dashes
      .replace(/\s+/g, ' ')     // Normalize spaces
      .replace(/\bthe\b/gi, '') // Remove "the" articles
      .replace(/\bsaga\b/gi, '') // Remove "saga"
      .replace(/\bseries\b/gi, '') // Remove "series"
      .replace(/\bmovie\b/gi, '') // Remove "movie"
      .replace(/\btv\b/gi, '') // Remove "tv"
      .trim()
      .replace(/\s+/g, ' ')     // Final space cleanup
      .substring(0, 30);        // Limit length
  }

  /**
   * NEW: Check if this looks like a source title rather than clean show name
   */
  static isSourceTitle(title) {
    const sourceIndicators = [
      'ebay', 'amazon', 'etsy', 'wallpaper', 'download', 'hd', '|', 
      'tcg', 'holo', 'sr ver', 'poster', 'decorative', 'canvas', 
      'wall art', 'painting', 'gifts', 'bedroom', 'living room'
    ];
    
    const lowerTitle = title.toLowerCase();
    return sourceIndicators.some(indicator => lowerTitle.includes(indicator));
  }

  /**
   * NEW: Extract show name from messy source titles
   */
  static extractShowFromSourceTitle(sourceTitle) {
    // Try to extract show names from common patterns
    const showPatterns = [
      /clannad/i,
      /twilight/i, 
      /attack on titan/i,
      /my hero academia/i,
      /last airbender/i,
      /angel beats/i,
      /naruto/i,
      /one piece/i,
      /dragon ball/i
    ];
    
    for (const pattern of showPatterns) {
      const match = sourceTitle.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    // Fallback: try to extract first meaningful words before common junk
    const junkMarkers = ['|', 'ebay', 'amazon', 'hd wallpaper', 'poster', 'tcg'];
    let cleanTitle = sourceTitle;
    
    for (const marker of junkMarkers) {
      const index = cleanTitle.toLowerCase().indexOf(marker.toLowerCase());
      if (index !== -1) {
        cleanTitle = cleanTitle.substring(0, index).trim();
      }
    }
    
    // Take first few meaningful words
    const words = cleanTitle.split(/\s+/).filter(word => 
      word.length > 2 && 
      !['the', 'and', 'of', 'in', 'to', 'for'].includes(word.toLowerCase())
    );
    
    return words.slice(0, 3).join(' ') || 'Unknown';
  }

  /**
   * LEGACY: Keep old functions for backward compatibility
   */
  static extractLastName(fullName) {
    if (!fullName) return 'Unknown';
    
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1]
      .replace(/[^a-zA-Z0-9]/g, '')
      .trim();
  }

  /**
   * LEGACY: Clean role name for filename use
   */
  static cleanRoleName(roleName) {
    if (!roleName) return 'Unknown';
    
    return roleName
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 30);
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
  // UPDATED EXPORTS
  generateFilename: ImageHelpers.generateFilename.bind(ImageHelpers),
  extractLastName: ImageHelpers.extractLastName.bind(ImageHelpers),
  cleanRoleName: ImageHelpers.cleanRoleName.bind(ImageHelpers)
};
