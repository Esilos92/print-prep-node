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
    
    logger.info(`🚀 Starting STREAMLINED image sourcing for: ${celebrityName}`);
    
    // Create temporary working directory
    const workDir = path.join(__dirname, 'temp', celebrityName.replace(/\s+/g, '_'));
    await fs.mkdir(workDir, { recursive: true });
    
    // Step 1: Fetch top 5 iconic roles (WITH TMDb FALLBACK)
    logger.info('📋 Step 1: Fetching iconic roles with TMDb fallback...');
    const roles = await fetchRoles(celebrityName);
    
    if (roles.length === 0) {
      logger.error('❌ No roles found for celebrity. Check name spelling or try again.');
      process.exit(1);
    }
    
    logger.info(`✅ Found ${roles.length} roles:`);
    roles.forEach((role, i) => {
      const voiceMarker = role.isVoiceRole ? ' (VOICE)' : '';
      const sourceMarker = role.source === 'wikipedia_fallback' ? ' [Wikipedia Fallback]' : '';
      const knownMarker = role.isKnownFor ? ' ⭐' : '';
      logger.info(`  ${i + 1}. ${role.name}${voiceMarker}${sourceMarker}${knownMarker}`);
    });
    
    // Step 2: Fetch images for each role (STREAMLINED VALIDATION)
    logger.info('🖼️  Step 2: Fetching images with streamlined validation...');
    const allImages = [];
    for (const role of roles) {
      try {
        const images = await fetchImages(celebrityName, role, workDir);
        allImages.push(...images);
        logger.info(`📸 ${role.name}: ${images.length} images found`);
      } catch (error) {
        logger.warn(`❌ Failed to fetch images for ${role.name}: ${error.message}`);
      }
    }
    
    if (allImages.length === 0) {
      logger.error('❌ No images found for any roles. Check your SerpAPI configuration.');
      process.exit(1);
    }
    
    // Step 3: Validate and filter images (SIMPLIFIED LOGIC)
    logger.info('🔍 Step 3: Validating images with simplified logic...');
    let validImages = [];
    
    // Group images by role for proper validation context
    const imagesByRole = {};
    allImages.forEach(img => {
      if (!imagesByRole[img.role]) imagesByRole[img.role] = [];
      imagesByRole[img.role].push(img);
    });
    
    // Validate each role's images separately
    for (const [roleName, roleImages] of Object.entries(imagesByRole)) {
      const roleInfo = roles.find(r => r.name === roleName) || {};
      const validated = await validateImages(roleImages, workDir, roleInfo);
      validImages.push(...validated);
    }
    
    logger.info(`✅ ${validImages.length} images passed validation (from ${allImages.length} total)`);
    
    if (validImages.length === 0) {
      logger.error('❌ No images passed validation. Check validation settings.');
      process.exit(1);
    }
    
    // Step 4: Resize images
    logger.info('📐 Step 4: Resizing images for print formats...');
    const resizedImages = await resizeImages(validImages, workDir, celebrityName);
    logger.info(`✅ Resized ${resizedImages.length} images across multiple formats`);
    
    // Step 5: Generate manifest with enhanced metadata
    logger.info('📄 Step 5: Generating enhanced manifest...');
    const manifest = await generateManifest(resizedImages, celebrityName, roles);
    
    // Add system metadata to manifest
    manifest.system = {
      version: 'SERPAPI-ENHANCED-V4-FINAL-FIXED',
      timestamp: new Date().toISOString(),
      totalRoles: roles.length,
      totalOriginalImages: allImages.length,
      totalValidatedImages: validImages.length,
      totalResizedImages: resizedImages.length,
      validationPass: 'streamlined_boolean_validation',
      tmdbFallbackUsed: roles.some(r => r.source === 'wikipedia_fallback'),
      voiceRolesFound: roles.filter(r => r.isVoiceRole).length,
      liveActionRolesFound: roles.filter(r => !r.isVoiceRole).length,
      criticalFixes: [
        'isValidExtractedTitle_function_fixed',
        'preposition_filtering_enabled',
        'garbage_title_prevention_active'
      ]
    };
    
    await fs.writeFile(
      path.join(workDir, 'manifest.json'), 
      JSON.stringify(manifest, null, 2)
    );
    
    // Step 6: Zip and upload to Google Drive
    logger.info('📦 Step 6: Zipping and uploading to Google Drive...');
    const uploadResult = await zipAndUpload(workDir, celebrityName);
    logger.info(`✅ Upload complete: ${uploadResult.webViewLink}`);
    
    // Final success summary
    logger.info('\n🎉 PROCESS COMPLETE - SUMMARY:');
    logger.info(`Celebrity: ${celebrityName}`);
    logger.info(`Roles Found: ${roles.length}`);
    logger.info(`Images Downloaded: ${allImages.length}`);
    logger.info(`Images Validated: ${validImages.length}`);
    logger.info(`Images Resized: ${resizedImages.length}`);
    logger.info(`TMDb Fallback Used: ${manifest.system.tmdbFallbackUsed ? 'YES' : 'NO'}`);
    logger.info(`Voice Roles: ${manifest.system.voiceRolesFound}`);
    logger.info(`Live Action Roles: ${manifest.system.liveActionRolesFound}`);
    logger.info(`Critical Fixes Applied: ${manifest.system.criticalFixes.join(', ')}`);
    logger.info(`Google Drive Link: ${uploadResult.webViewLink}`);
    
    // Cleanup temporary files
    await fs.rm(workDir, { recursive: true, force: true });
    logger.info('🧹 Cleanup complete');
    
  } catch (error) {
    logger.error('❌ Process failed:', error.message);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
