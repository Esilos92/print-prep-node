const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { sanitizeFilename, generateFilename } = require('../utils/helpers');

class ImageResizer {
  
  /**
   * FIXED: Resize images with continuous numbering across all roles
   */
  static async resizeImages(validatedImages, workDir, celebrityName) {
    try {
      logger.info(`Resizing ${validatedImages.length} validated images...`);
      
      const resizedImages = [];
      const outputDir = path.join(workDir, 'resized');
      await fs.mkdir(outputDir, { recursive: true });
      
      // FIXED: Use continuous counter instead of grouping by role
      let globalCounter = 1; // Start at 1 and keep incrementing
      
      for (const image of validatedImages) {
        // Add missing data for filename generation
        image.celebrityName = celebrityName;
        image.cleanRoleName = this.extractCleanRoleName(image);
        image.globalIndex = globalCounter; // Use global counter instead of role-specific
        
        try {
          const resizeResults = await this.resizeImageToFormats(image, outputDir);
          resizedImages.push(...resizeResults);
          
          globalCounter++; // Increment for next image regardless of role
          
        } catch (error) {
          logger.warn(`Error resizing ${image.filename}:`, error.message);
          globalCounter++; // Still increment counter even on error
        }
      }
      
      logger.info(`Resizing complete: ${resizedImages.length} output files with continuous numbering`);
      return resizedImages;
      
    } catch (error) {
      logger.error('Error in image resizing:', error.message);
      return [];
    }
  }
  
  /**
   * REMOVED: No longer group by role - we want continuous numbering
   */
  
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
   * Resize single image to all supported formats
   */
  static async resizeImageToFormats(image, outputDir) {
    const results = [];
    
    for (const format of image.formats) {
      try {
        const outputPath = await this.resizeToFormat(image, format, outputDir);
        
        results.push({
          ...image,
          resizedPath: outputPath,
          format: format,
          originalPath: image.filepath
        });
        
        logger.info(`Resized ${image.filename} to ${format}`);
        
      } catch (error) {
        logger.warn(`Failed to resize ${image.filename} to ${format}:`, error.message);
      }
    }
    
    return results;
  }
  
  /**
   * FIXED: Resize image to specific print format with continuous numbering
   */
  static async resizeToFormat(image, format, outputDir) {
    const dimensions = this.getPrintDimensions(format);
    
    // Use clean role name for filename generation
    const cleanRoleName = image.cleanRoleName || 'Unknown';
    
    // DEBUG: Log what we're using (but cleaner message)
    console.log(`🔧 Generating clean filename: ${image.globalIndex} - ${image.celebrityName} - ${cleanRoleName} - ${format}`);
    
    // FIXED: Generate clean filename with GLOBAL counter: 01 - Jackson Rathbone - Twilight - 8x10.jpg
    const outputFilename = generateFilename(
      image.celebrityName || 'Unknown',
      cleanRoleName,
      image.globalIndex || 1, // Use globalIndex instead of indexInRole
      format
    );
    const outputPath = path.join(outputDir, outputFilename);
    
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
