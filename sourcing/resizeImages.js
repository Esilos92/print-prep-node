const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { sanitizeFilename } = require('../utils/helpers');

class ImageResizer {
  
  /**
   * Resize images to print formats
   */
  static async resizeImages(validatedImages, workDir) {
    try {
      logger.info(`Resizing ${validatedImages.length} validated images...`);
      
      const resizedImages = [];
      const outputDir = path.join(workDir, 'resized');
      await fs.mkdir(outputDir, { recursive: true });
      
      for (const image of validatedImages) {
        try {
          const resizeResults = await this.resizeImageToFormats(image, outputDir);
          resizedImages.push(...resizeResults);
          
        } catch (error) {
          logger.warn(`Error resizing ${image.filename}:`, error.message);
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
   * Resize image to specific print format
   */
  static async resizeToFormat(image, format, outputDir) {
    const dimensions = this.getPrintDimensions(format);
    const baseName = path.parse(image.filename).name;
    const outputFilename = `${sanitizeFilename(baseName)}_${format.replace('x', 'x')}.jpg`;
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
