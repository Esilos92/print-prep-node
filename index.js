const { fetchRoles } = require('./sourcing/fetchRoles');
const { fetchImages } = require('./sourcing/fetchImages');
const { validateImages } = require('./sourcing/validateImages');
const { resizeImages } = require('./sourcing/resizeImages');
const { generateManifest } = require('./sourcing/generateManifest');
const { zipAndUpload } = require('./sourcing/zipAndUpload');
const logger = require('./utils/logger');
const fs = require('fs').promises;
const path = require('path');

async function main() {
  try {
    const celebrityName = process.argv[2];
    
    if (!celebrityName) {
      logger.error('Please provide a celebrity name as an argument');
      process.exit(1);
    }

    logger.info(`🚀 Starting image sourcing for: ${celebrityName}`);
    
    // Create temporary working directory
    const workDir = path.join(__dirname, 'temp', celebrityName.replace(/\s+/g, '_'));
    await fs.mkdir(workDir, { recursive: true });
    
    // Step 1: Fetch top 5 iconic roles
    logger.info('📋 Step 1: Fetching iconic roles...');
    const roles = await fetchRoles(celebrityName);
    logger.info(`Found ${roles.length} roles: ${roles.map(r => r.name).join(', ')}`);
    
    // Step 2: Fetch images for each role
    logger.info('🖼️  Step 2: Fetching images for each role...');
    const allImages = [];
    for (const role of roles) {
      const images = await fetchImages(celebrityName, role, workDir);
      allImages.push(...images);
      logger.info(`Found ${images.length} images for ${role.name}`);
    }
    
    // Step 3: Validate and filter images
    logger.info('🔍 Step 3: Validating and filtering images...');
    const validImages = await validateImages(allImages, workDir);
    logger.info(`${validImages.length} images passed validation`);
    
    // Step 4: Resize images
    logger.info('📐 Step 4: Resizing images...');
    const resizedImages = await resizeImages(validImages, workDir);
    logger.info(`Resized ${resizedImages.length} images`);
    
    // Step 5: Generate manifest
    logger.info('📄 Step 5: Generating manifest...');
    const manifest = await generateManifest(resizedImages, celebrityName);
    await fs.writeFile(
      path.join(workDir, 'manifest.json'), 
      JSON.stringify(manifest, null, 2)
    );
    
    // Step 6: Zip and upload
    logger.info('📦 Step 6: Zipping and uploading...');
    const uploadResult = await zipAndUpload(workDir, celebrityName);
    logger.info(`✅ Upload complete: ${uploadResult.webViewLink}`);
    
    // Cleanup
    await fs.rm(workDir, { recursive: true, force: true });
    logger.info('🧹 Cleanup complete');
    
  } catch (error) {
    logger.error('❌ Process failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

// ===== utils/config.js =====
require('dotenv').config();

const config = {
  api: {
    bingImageKey: process.env.BING_IMAGE_API_KEY,
    tmdbKey: process.env.TMDB_API_KEY,
  },
  
  googleDrive: {
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    credentialsPath: './credentials/google-drive-creds.json'
  },
  
  image: {
    minDimensions: {
      '8x10': {
        width: parseInt(process.env.MIN_WIDTH_8X10) || 2400,
        height: parseInt(process.env.MIN_HEIGHT_8X10) || 3000
      },
      '11x17': {
        width: parseInt(process.env.MIN_WIDTH_11X17) || 3300,
        height: parseInt(process.env.MIN_HEIGHT_11X17) || 5100
      }
    },
    maxImagesPerRole: parseInt(process.env.MAX_IMAGES_PER_ROLE) || 50,
    dedupThreshold: parseFloat(process.env.DEDUP_THRESHOLD) || 0.85
  }
};
