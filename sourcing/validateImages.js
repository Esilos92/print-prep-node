const sharp = require('sharp');
const imghash = require('imghash');
const fs = require('fs').promises;
const config = require('../utils/config');
const logger = require('../utils/logger');
const { getBestFormat, calculateSimilarity } = require('../utils/helpers');

class ImageValidator {
  
  /**
   * Validate and filter images
   */
  static async validateImages(images, workDir) {
    try {
      logger.info(`Validating ${images.length} images...`);
      
      const validatedImages = [];
      const processedHashes = new Map();
      
      for (const image of images) {
        try {
          const validation = await this.validateSingleImage(image);
          
          if (!validation.isValid) {
            logger.warn(`Rejected ${image.filename}: ${validation.reason}`);
            continue;
          }
          
          // Check for duplicates
          const isDuplicate = await this.checkForDuplicate(
            image, 
            processedHashes, 
            config.image.dedupThreshold
          );
          
          if (isDuplicate) {
            logger.warn(`Rejected ${image.filename}: Duplicate detected`);
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
      
      logger.info(`Validation complete: ${validatedImages.length} images passed`);
      return validatedImages;
      
    } catch (error) {
      logger.error('Error in image validation:', error.message);
      return [];
    }
  }
  
  /**
   * Validate a single image
   */
  static async validateSingleImage(image) {
    try {
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
      
      // Generate perceptual hash for deduplication
      const hash = await this.generatePerceptualHash(image.filepath);
      
      return {
        isValid: true,
        width,
        height,
        formats,
        hash,
        tags: this.generateTags(width, height, image.filename, image.role)
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
  static async generatePerceptualHash(filepath) {
    try {
      const hash = await imghash.hash(filepath);
      return hash;
    } catch (error) {
      throw new Error(`Failed to generate hash: ${error.message}`);
    }
  }
  
  /**
   * Check if image is a duplicate
   */
  static async checkForDuplicate(image, processedHashes, threshold) {
    const currentHash = await this.generatePerceptualHash(image.filepath);
    
    for (const [existingHash, existingImage] of processedHashes) {
      const similarity = calculateSimilarity(currentHash, existingHash);
      
      if (similarity >= threshold) {
        logger.info(`Duplicate detected: ${similarity.toFixed(2)} similarity with ${existingImage.filename}`);
        return true;
      }
    }
    
    processedHashes.set(currentHash, image);
    return false;
  }
  
  /**
   * Generate tags for image
   */
  static generateTags(width, height, filename, role) {
    const tags = [];
    
    // Orientation
    const ratio = width / height;
    if (ratio > 1.2) tags.push('landscape');
    else if (ratio < 0.8) tags.push('portrait');
    else tags.push('square');
    
    // Content detection (basic)
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.includes('group') || lowerFilename.includes('cast')) {
      tags.push('group');
    } else {
      tags.push('individual');
    }
    
    // Role-based tags
    if (role) {
      tags.push('role:' + role.replace(/\s+/g, '_'));
    }
    
    return tags;
  }
}

module.exports = { validateImages: ImageValidator.validateImages.bind(ImageValidator) };
