const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { sanitizeFilename, generateFilename } = require('../utils/helpers');

class ImageResizer {
  
  /**
   * FIXED: Resize images with separate numbering for 8x10 and 11x17
   */
  static async resizeImages(validatedImages, workDir, celebrityName) {
    try {
      logger.info(`Resizing ${validatedImages.length} validated images...`);
      
      const resizedImages = [];
      const outputDir = path.join(workDir, 'resized');
      await fs.mkdir(outputDir, { recursive: true });
      
      // Create separate subdirectories for each format
      const format8x10Dir = path.join(outputDir, '8x10');
      const format11x17Dir = path.join(outputDir, '11x17');
      await fs.mkdir(format8x10Dir, { recursive: true });
      await fs.mkdir(format11x17Dir, { recursive: true });
      
      // Separate counters for each format
      let counter8x10 = 1;
      let counter11x17 = 1;
      
      for (const image of validatedImages) {
        // Add missing data for filename generation
        image.celebrityName = celebrityName;
        image.cleanRoleName = this.extractCleanRoleName(image);
        
        try {
          // Determine which formats this image should be resized to
          const formats = this.determineFormats(image);
          
          for (const format of formats) {
            const counter = format === '8x10' ? counter8x10 : counter11x17;
            const formatDir = format === '8x10' ? format8x10Dir : format11x17Dir;
            
            // Add format-specific counter to image data
            image.formatIndex = counter;
            image.currentFormat = format;
            
            const outputPath = await this.resizeToFormat(image, format, formatDir);
            
            resizedImages.push({
              ...image,
              resizedPath: outputPath,
              format: format,
              originalPath: image.filepath,
              formatIndex: counter
            });
            
            logger.info(`Resized ${image.filename} to ${format} (#${counter})`);
            
            // Increment the appropriate counter
            if (format === '8x10') {
              counter8x10++;
            } else {
              counter11x17++;
            }
          }
          
        } catch (error) {
          logger.warn(`Error resizing ${image.filename}:`, error.message);
        }
      }
      
      logger.info(`Resizing complete: ${resizedImages.length} output files`);
      logger.info(`- 8x10 images: ${counter8x10 - 1}`);
      logger.info(`- 11x17 images: ${counter11x17 - 1}`);
      
      return resizedImages;
      
    } catch (error) {
      logger.error('Error in image resizing:', error.message);
      return [];
    }
  }
  
  /**
   * NEW: Determine which formats an image should be resized to based on dimensions
   */
  static determineFormats(image) {
    const width = image.actualWidth || image.width || 0;
    const height = image.actualHeight || image.height || 0;
    
    if (width === 0 || height === 0) {
      logger.warn(`Image ${image.filename} has no dimension data, defaulting to 8x10`);
      return ['8x10'];
    }
    
    const aspectRatio = width / height;
    const formats = [];
    
    // 8x10 aspect ratio is 0.8 (4:5)
    // 11x17 aspect ratio is ~0.647 (roughly 2:3)
    
    // For portrait images (height > width)
    if (aspectRatio <= 1.0) {
      if (aspectRatio >= 0.75 && aspectRatio <= 0.85) {
        // Close to 8x10 ratio (0.8)
        formats.push('8x10');
      } else if (aspectRatio >= 0.55 && aspectRatio <= 0.75) {
        // Close to 11x17 ratio (0.647)
        formats.push('11x17');
      } else {
        // Default for portrait: try both if very tall/wide, otherwise 8x10
        formats.push('8x10');
        if (aspectRatio < 0.6) {
          formats.push('11x17'); // Very tall images work better as 11x17
        }
      }
    } 
    // For landscape images (width > height)
    else {
      const landscapeRatio = height / width; // Flip for landscape
      
      if (landscapeRatio >= 0.75 && landscapeRatio <= 0.85) {
        // Close to 8x10 ratio when flipped
        formats.push('8x10');
      } else if (landscapeRatio >= 0.55 && landscapeRatio <= 0.75) {
        // Close to 11x17 ratio when flipped  
        formats.push('11x17');
      } else {
        // Default for landscape
        formats.push('8x10');
        if (landscapeRatio < 0.6) {
          formats.push('11x17'); // Very wide images work better as 11x17
        }
      }
    }
    
    // Ensure we always have at least one format
    if (formats.length === 0) {
      formats.push('8x10');
    }
    
    logger.debug(`Image ${image.filename} (${width}x${height}, ratio: ${aspectRatio.toFixed(3)}) -> formats: ${formats.join(', ')}`);
    
    return formats;
  }
  
  /**
   * Extract clean role name from image data
   */
  static extractCleanRoleName(image) {
    // Priority order for finding the clean role name
    let roleName = 'Unknown';
    
    // 1. Check if we have role character + title data (best option)
    if (image.character && image.role) {
      roleName = image.role; // This should be clean like "Twilight", "Clannad"
    }
    // 2. Check role field
    else if (image.role && !this.isMessySourceTitle(image.role)) {
      roleName = image.role;
    }
    // 3. Check title field if it's clean
    else if (image.title && !this.isMessySourceTitle(image.title)) {
      roleName = image.title;
    }
    // 4. Try to extract from character info
    else if (image.character) {
      // If we have character info, try to get show from filename pattern
      roleName = this.extractShowFromFilename(image.filename) || 'Unknown';
    }
    
    return roleName;
  }
  
  /**
   * Check if a title looks like a messy source title
   */
  static isMessySourceTitle(title) {
    if (!title) return true;
    
    const messyIndicators = [
      'ebay', 'amazon', 'etsy', '|', 'wallpaper', 'download', 
      'tcg', 'holo', 'poster', 'decorative', 'canvas', 'wall art'
    ];
    
    const lowerTitle = title.toLowerCase();
    return messyIndicators.some(indicator => lowerTitle.includes(indicator));
  }
  
  /**
   * Extract show name from AI-generated filename patterns
   */
  static extractShowFromFilename(filename) {
    // AI-generated filenames often have patterns like:
    // "Tomoya_Okazaki_Clannad_ai_1.jpg" -> "Clannad"
    // "Jasper_Hale_Twilight_ai_5.jpg" -> "Twilight"
    
    const parts = filename.split('_');
    
    // Look for common show patterns in filename
    const showPatterns = [
      'clannad', 'twilight', 'attack', 'titan', 'hero', 'academia',
      'airbender', 'angel', 'beats', 'naruto', 'piece', 'ball'
    ];
    
    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      for (const pattern of showPatterns) {
        if (lowerPart.includes(pattern)) {
          // Return cleaned version
          if (pattern === 'clannad') return 'Clannad';
          if (pattern === 'twilight') return 'Twilight';
          if (pattern === 'attack' || pattern === 'titan') return 'Attack on Titan';
          if (pattern === 'hero' || pattern === 'academia') return 'My Hero Academia';
          if (pattern === 'airbender') return 'Last Airbender';
          if (pattern === 'angel' || pattern === 'beats') return 'Angel Beats';
          if (pattern === 'naruto') return 'Naruto';
          if (pattern === 'piece') return 'One Piece';
          if (pattern === 'ball') return 'Dragon Ball';
        }
      }
    }
    
    return null;
  }
  
  /**
   * FIXED: Resize image to specific print format with format-specific numbering
   */
  static async resizeToFormat(image, format, formatDir) {
    const dimensions = this.getPrintDimensions(format);
    
    // Use clean role name for filename generation
    const cleanRoleName = image.cleanRoleName || 'Unknown';
    
    // FIXED: Generate clean filename with FORMAT-SPECIFIC counter
    const outputFilename = generateFilename(
      image.celebrityName || 'Unknown',
      cleanRoleName,
      image.formatIndex || 1, // Use format-specific counter
      format
    );
    const outputPath = path.join(formatDir, outputFilename);
    
    await sharp(image.filepath)
      .resize(dimensions.width, dimensions.height, {
        fit: 'inside',
        withoutEnlargement: false,
        background: { r: 255, g: 255, b: 255 }
      })
      .jpeg({
        quality: 95,
        progressive: true
      })
      .toFile(outputPath);
    
    return outputPath;
  }
  
  /**
   * Get print dimensions for format
   */
  static getPrintDimensions(format) {
    const dimensions = {
      '8x10': { width: 2400, height: 3000 },   // 300 DPI
      '11x17': { width: 3300, height: 5100 }   // 300 DPI
    };
    
    return dimensions[format] || dimensions['8x10'];
  }
}

module.exports = { resizeImages: ImageResizer.resizeImages.bind(ImageResizer) };
