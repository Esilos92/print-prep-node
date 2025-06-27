const sharp = require('sharp');
const imghash = require('imghash');
const fs = require('fs').promises;
const config = require('../utils/config');
const logger = require('../utils/logger');
const { getBestFormat, calculateSimilarity } = require('../utils/helpers');

class ImageValidator {
  
  constructor() {
    this.watermarkKeywords = [
      'alamy', 'getty', 'shutterstock', 'istockphoto', 'depositphotos',
      'bigstock', 'dreamstime', 'stockphoto', 'watermark', 'preview',
      'sample', 'comp', 'stockvault', 'pixabay', 'unsplash'
    ];
    
    this.fanArtKeywords = [
      'fanart', 'fan art', 'deviantart', 'tumblr', 'pinterest',
      'reddit', 'wiki', 'fandom', 'concept art', 'artwork',
      'drawing', 'sketch', 'illustration', 'poster design'
    ];
    
    this.bannedDomains = [
      'alamy.com', 'gettyimages.com', 'shutterstock.com', 
      'istockphoto.com', 'depositphotos.com', 'bigstock.com',
      'dreamstime.com', 'deviantart.com', 'tumblr.com', 
      'pinterest.com', 'reddit.com', 'fandom.com', 'wikia.com'
    ];
    
    // Store hashes per role instead of globally
    this.roleHashes = new Map();
  }
  
  /**
   * Validate and filter images with enhanced filtering
   */
  static async validateImages(images, workDir, roleInfo = {}) {
    try {
      logger.info(`Validating ${images.length} images for role: ${roleInfo.name || 'unknown'}...`);
      
      const validator = new ImageValidator();
      const validatedImages = [];
      
      // Initialize role-specific hash storage
      const roleName = roleInfo.name || 'unknown';
      if (!validator.roleHashes.has(roleName)) {
        validator.roleHashes.set(roleName, new Map());
      }
      
      for (const image of images) {
        try {
          const validation = await validator.validateSingleImage(image, roleInfo);
          
          if (!validation.isValid) {
            logger.warn(`Rejected ${image.filename}: ${validation.reason}`);
            continue;
          }
          
          // Check for duplicates within this role only
          const isDuplicate = await validator.checkForDuplicate(
            image, 
            validator.roleHashes.get(roleName),
            config.image.dedupThreshold,
            roleName
          );
          
          if (isDuplicate) {
            logger.warn(`Rejected ${image.filename}: Duplicate detected within role`);
            continue;
          }
          
          validatedImages.push({
            ...image,
            actualWidth: validation.width,
            actualHeight: validation.height,
            formats: validation.formats,
            tags: validation.tags,
            hash: validation.hash
          });
          
        } catch (error) {
          logger.warn(`Error validating ${image.filename}:`, error.message);
        }
      }
      
      logger.info(`Validation complete: ${validatedImages.length} images passed for ${roleName}`);
      return validatedImages;
      
    } catch (error) {
      logger.error('Error in image validation:', error.message);
      return [];
    }
  }
  
  /**
   * Validate a single image with enhanced checks
   */
  async validateSingleImage(image, roleInfo) {
    try {
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
      
      // Check voice role specific issues
      if (roleInfo.isVoiceRole) {
        const voiceRoleCheck = this.checkVoiceRole(image, roleInfo);
        if (!voiceRoleCheck.isValid) {
          return voiceRoleCheck;
        }
      }
      
      // Check image metadata and quality
      const metadata = await sharp(image.filepath).metadata();
      
      const width = metadata.width;
      const height = metadata.height;
      const formats = getBestFormat(width, height);
      
      if (formats.length === 0) {
        return {
          isValid: false,
          reason: `Resolution too low: ${width}x${height}`
        };
      }
      
      // Check file size (avoid tiny files)
      const stats = await fs.stat(image.filepath);
      if (stats.size < 50000) { // Less than 50KB
        return {
          isValid: false,
          reason: 'File size too small'
        };
      }
      
      // Check image format
      if (!['jpeg', 'jpg', 'png', 'webp'].includes(metadata.format)) {
        return {
          isValid: false,
          reason: `Unsupported format: ${metadata.format}`
        };
      }
      
      // Generate perceptual hash for deduplication
      const hash = await this.generatePerceptualHash(image.filepath);
      
      return {
        isValid: true,
        width,
        height,
        formats,
        hash,
        tags: this.generateTags(width, height, image.filename, roleInfo)
      };
      
    } catch (error) {
      return {
        isValid: false,
        reason: `Processing error: ${error.message}`
      };
    }
  }
  
  /**
   * Check for watermarked content
   */
  checkWatermarks(image) {
    const filename = (image.filename || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    const title = (image.title || '').toLowerCase();
    
    // Check filename and URL for watermark indicators
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
   * Check for fan art content
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

    // Check for non-official domains that host fan content
    const fanArtDomains = [
      'deviantart.com', 'tumblr.com', 'pinterest.com', 'reddit.com',
      'fandom.com', 'wikia.com', 'wordpress.com', 'blogspot.com'
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
   * Check voice role specific requirements
   */
  checkVoiceRole(image, roleInfo) {
    if (!roleInfo.isVoiceRole) {
      return { isValid: true }; // Not a voice role, standard validation applies
    }

    const filename = (image.filename || '').toLowerCase();
    const title = (image.title || '').toLowerCase();
    const url = (image.sourceUrl || '').toLowerCase();
    
    // Look for character names or animated content indicators
    const characterKeywords = [
      roleInfo.characterName?.toLowerCase(),
      'character', 'animated', 'animation', 'cartoon',
      'voice', 'still', 'scene', 'movie still'
    ].filter(Boolean);

    // Actor name in voice role images is usually a red flag
    const actorName = roleInfo.actorName?.toLowerCase();
    if (actorName && (filename.includes(actorName) || title.includes(actorName))) {
      // Unless it's clearly a character image
      const hasCharacterContext = characterKeywords.some(keyword => 
        filename.includes(keyword) || title.includes(keyword)
      );
      
      if (!hasCharacterContext) {
        return {
          isValid: false,
          reason: 'Voice role: Actor image instead of character image'
        };
      }
    }

    // For voice roles, prefer images with character context
    const hasCharacterIndicators = characterKeywords.some(keyword => 
      filename.includes(keyword) || title.includes(keyword) || url.includes(keyword)
    );

    if (!hasCharacterIndicators && roleInfo.characterName) {
      return {
        isValid: false,
        reason: 'Voice role: No character context detected'
      };
    }

    return { isValid: true };
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
    const currentHash = await this.generatePerceptualHash(image.filepath);
    
    for (const [existingHash, existingImage] of roleHashMap) {
      const similarity = calculateSimilarity(currentHash, existingHash);
      
      if (similarity >= threshold) {
        logger.info(`Duplicate detected in ${roleName}: ${similarity.toFixed(2)} similarity with ${existingImage.filename}`);
        return true;
      }
    }
    
    roleHashMap.set(currentHash, image);
    return false;
  }
  
  /**
   * Generate enhanced tags for image
   */
  generateTags(width, height, filename, roleInfo) {
    const tags = [];
    
    // Orientation
    const ratio = width / height;
    if (ratio > 1.2) tags.push('landscape');
    else if (ratio < 0.8) tags.push('portrait');
    else tags.push('square');
    
    // Content detection (enhanced)
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.includes('group') || lowerFilename.includes('cast')) {
      tags.push('group');
    } else {
      tags.push('individual');
    }
    
    // Role-based tags
    if (roleInfo.name) {
      tags.push('role:' + roleInfo.name.replace(/\s+/g, '_'));
    }
    
    // Franchise tags
    if (roleInfo.franchiseName) {
      tags.push('franchise:' + roleInfo.franchiseName.replace(/\s+/g, '_'));
    }
    
    // Voice role tags
    if (roleInfo.isVoiceRole) {
      tags.push('voice_role');
      if (roleInfo.characterName) {
        tags.push('character:' + roleInfo.characterName.replace(/\s+/g, '_'));
      }
    } else {
      tags.push('live_action');
    }
    
    // Quality indicators
    if (width >= 2400 && height >= 3000) {
      tags.push('high_quality');
    } else if (width >= 1600 && height >= 2000) {
      tags.push('medium_quality');
    } else {
      tags.push('standard_quality');
    }
    
    return tags;
  }
}

module.exports = { validateImages: ImageValidator.validateImages.bind(ImageValidator) };
