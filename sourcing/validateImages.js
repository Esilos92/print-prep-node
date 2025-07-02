const sharp = require('sharp');
const imghash = require('imghash');
const fs = require('fs').promises;
const config = require('../utils/config');
const logger = require('../utils/logger');
const { getBestFormat, calculateSimilarity } = require('../utils/helpers');

class ImageValidator {
  
  constructor() {
    // Essential filtering keywords - streamlined
    this.watermarkKeywords = [
      'alamy', 'getty', 'shutterstock', 'istockphoto', 'depositphotos',
      'bigstock', 'dreamstime', 'stockphoto', 'watermark', 'preview',
      'sample', 'comp'
    ];
    
    this.fanArtKeywords = [
      'fanart', 'fan art', 'deviantart', 'tumblr', 'pinterest',
      'reddit', 'concept art', 'artwork', 'drawing', 'sketch', 
      'illustration', 'poster design'
    ];
    
    this.bannedDomains = [
      'alamy.com', 'gettyimages.com', 'shutterstock.com', 
      'istockphoto.com', 'depositphotos.com', 'bigstock.com',
      'dreamstime.com', 'deviantart.com', 'pinterest.com'
    ];
    
    // Role-specific hash storage for deduplication
    this.roleHashes = new Map();
  }
  
  /**
   * Main validation entry point - streamlined workflow
   */
  static async validateImages(images, workDir, roleInfo = {}) {
    try {
      logger.info(`🔍 Validating ${images.length} images for role: ${roleInfo.name || 'unknown'}...`);
      
      const validator = new ImageValidator();
      const validatedImages = [];
      const roleName = roleInfo.name || 'unknown';
      
      // Initialize role-specific hash storage
      if (!validator.roleHashes.has(roleName)) {
        validator.roleHashes.set(roleName, new Map());
      }
      
      for (const image of images) {
        try {
          // Quick validation checks first
          const quickValidation = validator.quickValidationChecks(image, roleInfo);
          if (!quickValidation.isValid) {
            logger.warn(`❌ Quick reject ${image.filename}: ${quickValidation.reason}`);
            continue;
          }
          
          // Image metadata validation
          const metadataValidation = await validator.validateImageMetadata(image);
          if (!metadataValidation.isValid) {
            logger.warn(`❌ Metadata reject ${image.filename}: ${metadataValidation.reason}`);
            continue;
          }
          
          // Duplicate check within this role only
          const isDuplicate = await validator.checkForDuplicate(
            image, 
            validator.roleHashes.get(roleName),
            config.image.dedupThreshold || 0.85,
            roleName
          );
          
          if (isDuplicate) {
            logger.warn(`❌ Duplicate ${image.filename}: Similar image already exists in this role`);
            continue;
          }
          
          // Add to validated set
          validatedImages.push({
            ...image,
            actualWidth: metadataValidation.width,
            actualHeight: metadataValidation.height,
            formats: metadataValidation.formats,
            hash: metadataValidation.hash,
            tags: validator.generateTags(metadataValidation.width, metadataValidation.height, image.filename, roleInfo)
          });
          
        } catch (error) {
          logger.warn(`❌ Error validating ${image.filename}:`, error.message);
        }
      }
      
      logger.info(`✅ Validation complete: ${validatedImages.length}/${images.length} images passed for ${roleName}`);
      return validatedImages;
      
    } catch (error) {
      logger.error('Error in image validation:', error.message);
      return [];
    }
  }
  
  /**
   * STREAMLINED: Quick validation checks without complex scoring
   */
  quickValidationChecks(image, roleInfo) {
    // Check watermarks first (fastest check)
    const watermarkCheck = this.checkWatermarks(image);
    if (!watermarkCheck.isValid) {
      return watermarkCheck;
    }
    
    // Check fan art
    const fanArtCheck = this.checkFanArt(image);
    if (!fanArtCheck.isValid) {
      return fanArtCheck;
    }
    
    // Voice role specific checks
    if (roleInfo.isVoiceRole) {
      const voiceRoleCheck = this.checkVoiceRole(image, roleInfo);
      if (!voiceRoleCheck.isValid) {
        return voiceRoleCheck;
      }
    }
    
    return { isValid: true };
  }
  
  /**
   * Check for watermarked content - KEEP THIS LOGIC (works well)
   */
  checkWatermarks(image) {
    const filename = (image.filename || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    const title = (image.title || '').toLowerCase();
    
    // Check filename, URL, and title for watermark indicators
    for (const keyword of this.watermarkKeywords) {
      if (filename.includes(keyword) || url.includes(keyword) || title.includes(keyword)) {
        return {
          isValid: false,
          reason: `Watermarked content detected: ${keyword}`
        };
      }
    }

    // Check for common watermark patterns in URL structure
    const watermarkPatterns = ['/comp/', '/preview/', '/sample/', '/watermark/', 'watermarked'];
    for (const pattern of watermarkPatterns) {
      if (url.includes(pattern)) {
        return {
          isValid: false,
          reason: 'Watermark/preview image detected in URL'
        };
      }
    }

    // Check for banned domains
    for (const domain of this.bannedDomains) {
      if (url.includes(domain)) {
        return {
          isValid: false,
          reason: `Banned domain: ${domain}`
        };
      }
    }

    return { isValid: true };
  }
  
  /**
   * FIXED: Check for fan art content - REMOVED fandom.com from blocking
   */
  checkFanArt(image) {
    const filename = (image.filename || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    const title = (image.title || '').toLowerCase();
    
    for (const keyword of this.fanArtKeywords) {
      if (filename.includes(keyword) || url.includes(keyword) || title.includes(keyword)) {
        return {
          isValid: false,
          reason: `Fan art detected: ${keyword}`
        };
      }
    }

    // FIXED: Check for non-official domains that host fan content
    // REMOVED fandom.com - it contains official content!
    const fanArtDomains = [
      'deviantart.com', 'tumblr.com', 'pinterest.com', 'reddit.com',
      // 'fandom.com', // REMOVED - fandom.com has official content
      'wikia.com', 'wordpress.com', 'blogspot.com'
    ];
    
    for (const domain of fanArtDomains) {
      if (url.includes(domain)) {
        return {
          isValid: false,
          reason: `Fan art source: ${domain}`
        };
      }
    }

    return { isValid: true };
  }
  
  /**
   * SIMPLIFIED: Voice role validation without complex scoring
   */
  checkVoiceRole(image, roleInfo) {
    if (!roleInfo.isVoiceRole) {
      return { isValid: true }; // Not a voice role, standard validation applies
    }

    const filename = (image.filename || '').toLowerCase();
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    // Look for character context in voice roles
    const characterKeywords = [
      roleInfo.characterName?.toLowerCase(),
      'character', 'animated', 'animation', 'cartoon',
      'voice', 'still', 'scene', 'movie still'
    ].filter(Boolean);

    // For voice roles, prefer images with character context
    const hasCharacterIndicators = characterKeywords.some(keyword => 
      filename.includes(keyword) || title.includes(keyword) || url.includes(keyword)
    );

    // Simple check: voice roles should have character context
    if (!hasCharacterIndicators && roleInfo.characterName && roleInfo.characterName !== 'Unknown Character') {
      return {
        isValid: false,
        reason: 'Voice role: No character context detected'
      };
    }

    return { isValid: true };
  }
  
  /**
   * FIXED: Validate image metadata and quality - Now uses ENV settings properly
   */
  async validateImageMetadata(image) {
    try {
      const metadata = await sharp(image.filepath).metadata();
      
      const width = metadata.width;
      const height = metadata.height;
      
      // FIXED: Use ENV settings with proper fallbacks
      const minWidth = parseInt(process.env.MIN_WIDTH_8X10) || 800;
      const minHeight = parseInt(process.env.MIN_HEIGHT_8X10) || 600;
      
      // FIXED: Check minimum resolution - both width AND height must meet minimums
      // This was the bug: 1400x700 failed because 700 < 800, but ENV is 800x600
      if (width < minWidth || height < minHeight) {
        return {
          isValid: false,
          reason: `Resolution too low: ${width}x${height} (requires ${minWidth}x${minHeight})`
        };
      }
      
      // Check file size (avoid tiny files)
      const stats = await fs.stat(image.filepath);
      if (stats.size < 50000) { // Less than 50KB
        return {
          isValid: false,
          reason: 'File size too small (likely thumbnail or corrupted)'
        };
      }
      
      // Check image format
      if (!['jpeg', 'jpg', 'png', 'webp'].includes(metadata.format)) {
        return {
          isValid: false,
          reason: `Unsupported format: ${metadata.format}`
        };
      }
      
      // Get best formats for this resolution
      const formats = getBestFormat(width, height);
      if (formats.length === 0) {
        return {
          isValid: false,
          reason: `No suitable print formats for ${width}x${height}`
        };
      }
      
      // Generate perceptual hash for deduplication
      const hash = await this.generatePerceptualHash(image.filepath);
      
      return {
        isValid: true,
        width,
        height,
        formats,
        hash
      };
      
    } catch (error) {
      return {
        isValid: false,
        reason: `Processing error: ${error.message}`
      };
    }
  }
  
  /**
   * Generate perceptual hash for duplicate detection
   */
  async generatePerceptualHash(filepath) {
    try {
      const hash = await imghash.hash(filepath);
      return hash;
    } catch (error) {
      throw new Error(`Failed to generate hash: ${error.message}`);
    }
  }
  
  /**
   * Check if image is a duplicate within the same role
   */
  async checkForDuplicate(image, roleHashMap, threshold, roleName) {
    try {
      const currentHash = await this.generatePerceptualHash(image.filepath);
      
      for (const [existingHash, existingImage] of roleHashMap) {
        const similarity = calculateSimilarity(currentHash, existingHash);
        
        if (similarity >= threshold) {
          logger.info(`Duplicate detected in ${roleName}: ${similarity.toFixed(2)} similarity with ${existingImage.filename}`);
          return true;
        }
      }
      
      // Add to hash map if not duplicate
      roleHashMap.set(currentHash, image);
      return false;
      
    } catch (error) {
      logger.warn(`Error checking duplicate for ${image.filename}: ${error.message}`);
      return false; // Don't reject on hash errors
    }
  }
  
  /**
   * Generate streamlined tags for images
   */
  generateTags(width, height, filename, roleInfo) {
    const tags = [];
    
    // Basic orientation
    const ratio = width / height;
    if (ratio > 1.2) {
      tags.push('landscape');
    } else if (ratio < 0.8) {
      tags.push('portrait');
    } else {
      tags.push('square');
    }
    
    // Content detection from filename
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.includes('group') || lowerFilename.includes('cast')) {
      tags.push('group');
    } else {
      tags.push('individual');
    }
    
    // Role-based tags
    if (roleInfo.name) {
      tags.push('role:' + roleInfo.name.replace(/[^\w]/g, '_'));
    }
    
    // Franchise tags
    if (roleInfo.franchiseName) {
      tags.push('franchise:' + roleInfo.franchiseName.replace(/[^\w]/g, '_'));
    }
    
    // Voice role specific tags
    if (roleInfo.isVoiceRole) {
      tags.push('voice_role');
      if (roleInfo.characterName && roleInfo.characterName !== 'Unknown Character') {
        tags.push('character:' + roleInfo.characterName.replace(/[^\w]/g, '_'));
      }
    } else {
      tags.push('live_action');
    }
    
    // Quality indicators based on resolution
    if (width >= 2400 && height >= 3000) {
      tags.push('high_quality');
    } else if (width >= 1600 && height >= 2000) {
      tags.push('medium_quality');
    } else {
      tags.push('standard_quality');
    }
    
    // Print format compatibility
    if (width >= 2400 && height >= 3000) {
      tags.push('print_ready');
    }
    
    return tags;
  }
}

module.exports = { 
  validateImages: ImageValidator.validateImages.bind(ImageValidator),
  ImageValidator 
};
