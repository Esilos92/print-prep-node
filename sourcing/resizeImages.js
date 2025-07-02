const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { sanitizeFilename, generateFilename } = require('../utils/helpers');

class ImageResizer {
  
  /**
   * Resize images to print formats
   */
  static async resizeImages(validatedImages, workDir, celebrityName) {
    try {
      logger.info(`Resizing ${validatedImages.length} validated images...`);
      
      const resizedImages = [];
      const outputDir = path.join(workDir, 'resized');
      await fs.mkdir(outputDir, { recursive: true });
      
      // Group images by role for proper numbering
      const imagesByRole = this.groupImagesByRole(validatedImages);
      
      for (const [roleName, roleImages] of Object.entries(imagesByRole)) {
        for (let i = 0; i < roleImages.length; i++) {
          const image = roleImages[i];
          
          // Add missing data for filename generation
          image.celebrityName = celebrityName;
          image.cleanRoleName = roleName; // Use clean role name
          image.indexInRole = i + 1; // Sequential numbering per role
          
          try {
            const resizeResults = await this.resizeImageToFormats(image, outputDir);
            resizedImages.push(...resizeResults);
            
          } catch (error) {
            logger.warn(`Error resizing ${image.filename}:`, error.message);
          }
        }
      }
      
      logger.info(`Resizing complete: ${resizedImages.length} output files`);
      return resizedImages;
      
    } catch (error) {
      logger.error('Error in image resizing:', error.message);
      return [];
    }
  }
  
  /**
   * NEW: Group images by clean role name for proper numbering
   */
  static groupImagesByRole(images) {
    const groups = {};
    
    for (const image of images) {
      // Get clean role name from the image's role data
      const roleName = this.extractCleanRoleName(image);
      
      if (!groups[roleName]) {
        groups[roleName] = [];
      }
      groups[roleName].push(image);
    }
    
    return groups;
  }
  
  /**
   * NEW: Extract clean role name from image data
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
   * NEW: Check if a title looks like a messy source title
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
   * NEW: Extract show name from AI-generated filename patterns
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
   * FIXED: Resize image to specific print format with clean naming
   */
  static async resizeToFormat(image, format, outputDir) {
    const dimensions = this.getPrintDimensions(format);
    
    // Use clean role name for filename generation
    const cleanRoleName = image.cleanRoleName || 'Unknown';
    
    // DEBUG: Log what we're using (but cleaner message)
    console.log(`🔧 Generating clean filename: ${image.indexInRole} - ${image.celebrityName} - ${cleanRoleName} - ${format}`);
    
    // Generate clean filename: 01 - Jackson Rathbone - Twilight - 8x10.jpg
    const outputFilename = generateFilename(
      image.celebrityName || 'Unknown',
      cleanRoleName,
      image.indexInRole || 1,
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
