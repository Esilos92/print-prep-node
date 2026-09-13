const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');
const { sanitizeFilename, generateFilename, getBestFormat, effectiveDpi } = require('../utils/helpers');

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
            
            const result = await this.resizeToFormat(image, format, formatDir);
            const dpi = effectiveDpi(
              image.actualWidth || image.width,
              image.actualHeight || image.height,
              format
            );

            resizedImages.push({
              ...image,
              resizedPath: result.outputPath,
              format: format,
              originalPath: image.filepath,
              formatIndex: counter,
              outputWidth: result.width,
              outputHeight: result.height,
              printDpi: dpi
            });

            logger.info(
              `Resized ${image.filename} to ${format} (#${counter}) ` +
              `- ${result.width}x${result.height} @ ${dpi} DPI`
            );
            
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
      
      const printable = new Set(resizedImages.map(i => i.filename)).size;
      const dropped = validatedImages.length - printable;

      logger.info(`Resizing complete: ${resizedImages.length} output files`);
      logger.info(`- 8x10 images: ${counter8x10 - 1}`);
      logger.info(`- 11x17 images: ${counter11x17 - 1}`);
      if (dropped > 0) {
        logger.warn(
          `- ${dropped} image(s) dropped: below ${config.print.minDpi} DPI at every sheet size`
        );
      }
      
      return resizedImages;
      
    } catch (error) {
      logger.error('Error in image resizing:', error.message);
      return [];
    }
  }
  
  /**
   * Print formats this image can actually be output at.
   *
   * Eligibility is decided by real detail (see helpers.effectiveDpi), not by
   * aspect ratio alone. An image that cannot hold the DPI floor at any sheet
   * size returns [] and is skipped rather than being enlarged to fit.
   */
  static determineFormats(image) {
    const width = image.actualWidth || image.width || 0;
    const height = image.actualHeight || image.height || 0;

    if (width === 0 || height === 0) {
      logger.warn(`Image ${image.filename} has no dimension data, skipping`);
      return [];
    }

    const eligible = getBestFormat(width, height);

    if (eligible.length === 0) {
      const best = effectiveDpi(width, height, '8x10');
      logger.warn(
        `⬇️ Too small to print: ${image.filename} (${width}x${height}) ` +
        `would be ${best} DPI at 8x10, floor is ${config.print.minDpi}`
      );
      return [];
    }

    // Among formats the image can support, prefer the sheet whose proportions
    // are closest to the source so the least is lost to letterboxing.
    const sourceRatio = Math.min(width, height) / Math.max(width, height);
    const mismatch = (format) => {
      const target = config.print.formats[format];
      const targetRatio = target.width / target.height;
      return Math.abs(sourceRatio - targetRatio);
    };

    const ranked = [...eligible].sort((a, b) => mismatch(a) - mismatch(b));
    const formats = [ranked[0]];

    // Include a second sheet size only when it fits the image nearly as well.
    for (const format of ranked.slice(1)) {
      if (mismatch(format) - mismatch(ranked[0]) <= 0.08) {
        formats.push(format);
      }
    }

    const dpiNote = formats
      .map(f => `${f} @ ${effectiveDpi(width, height, f)}dpi`)
      .join(', ');
    logger.info(`Image ${image.filename} (${width}x${height}) -> ${dpiNote}`);

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
   * Resize to a print format. Never enlarges.
   *
   * `fit: 'inside'` keeps the original proportions and caps the output at the
   * sheet size; combined with `withoutEnlargement` a source smaller than the
   * sheet passes through at its native size. That is deliberate — the file
   * carries the detail it really has, and the manifest records the DPI it
   * will print at, instead of shipping an upscaled file that claims 300 DPI
   * and delivers half of it.
   */
  static async resizeToFormat(image, format, formatDir) {
    const dimensions = this.getPrintDimensions(format);
    const cleanRoleName = image.cleanRoleName || 'Unknown';

    const outputFilename = generateFilename(
      image.celebrityName || 'Unknown',
      cleanRoleName,
      image.formatIndex || 1,
      format
    );
    const outputPath = path.join(formatDir, outputFilename);

    const output = await sharp(image.filepath)
      .resize(dimensions.width, dimensions.height, {
        fit: 'inside',
        withoutEnlargement: !config.print.allowUpscale
      })
      .jpeg({
        quality: config.print.jpegQuality,
        progressive: true,
        // Full chroma resolution: skin tones and edges stay clean in print.
        chromaSubsampling: '4:4:4'
      })
      .toFile(outputPath);

    return { outputPath, width: output.width, height: output.height };
  }

  /**
   * Get print dimensions for format
   */
  static getPrintDimensions(format) {
    return config.print.formats[format] || config.print.formats['8x10'];
  }
}

module.exports = { resizeImages: ImageResizer.resizeImages.bind(ImageResizer) };
