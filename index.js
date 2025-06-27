// Updated to use AI-powered celebrity role discovery
const { fetchCelebrityRoles } = require('./sourcing/main.js');
const { fetchImages } = require('./sourcing/fetchImages');
const { validateImages } = require('./sourcing/validateImages');
const { resizeImages } = require('./sourcing/resizeImages');
const { generateManifest } = require('./sourcing/generateManifest');
const { zipAndUpload } = require('./sourcing/zipAndUpload');
const logger = require('./utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
require('dotenv').config();

async function main() {
  try {
    const celebrityName = process.argv[2];
    
    if (!celebrityName) {
      logger.error('Please provide a celebrity name as an argument');
      logger.info('Usage: npm start "Celebrity Name"');
      process.exit(1);
    }
    
    logger.info(`🚀 Starting AI-POWERED image sourcing for: ${celebrityName}`);
    
    // Create temporary working directory
    const workDir = path.join(__dirname, 'temp', celebrityName.replace(/\s+/g, '_'));
    await fs.mkdir(workDir, { recursive: true });
    
    // Step 1: AI-powered role discovery (replaces old fetchRoles)
    logger.info('🤖 Step 1: AI discovering top roles...');
    const aiResults = await fetchCelebrityRoles(celebrityName);
    
    if (!aiResults || aiResults.totalRoles === 0) {
      logger.error('❌ AI found no roles for celebrity. Check name spelling or try again.');
      process.exit(1);
    }
    
    // Convert AI results to format expected by your existing pipeline
    const roles = aiResults.roles.map(role => ({
      name: `${role.character} (${role.title})`,
      character: role.character,
      title: role.title,
      medium: role.medium,
      year: role.year,
      isVoiceRole: role.medium.includes('voice'),
      source: 'ai_discovery',
      isKnownFor: role.popularity === 'high',
      searchTerms: role.finalSearchTerms || [],
      popularity: role.popularity,
      description: role.description
    }));
    
    logger.info(`✅ AI discovered ${roles.length} roles:`);
    roles.forEach((role, i) => {
      const voiceMarker = role.isVoiceRole ? ' (VOICE)' : '';
      const mediumMarker = ` [${role.medium}]`;
      const popularityMarker = role.popularity === 'high' ? ' ⭐' : '';
      logger.info(`  ${i + 1}. ${role.character} in ${role.title}${voiceMarker}${mediumMarker}${popularityMarker}`);
    });
    
    // Step 2: Fetch images for each role (enhanced with AI search terms)
    logger.info('🖼️  Step 2: Fetching images with AI-optimized search terms...');
    const allImages = [];
    for (const role of roles) {
      try {
        // Use AI-generated search terms if available, otherwise use traditional method
        const images = await fetchImages(celebrityName, role, workDir);
        allImages.push(...images);
        logger.info(`📸 ${role.character}: ${images.length} images found`);
      } catch (error) {
        logger.warn(`❌ Failed to fetch images for ${role.character}: ${error.message}`);
      }
    }
    
    if (allImages.length === 0) {
      logger.error('❌ No images found for any roles. Check your SerpAPI configuration.');
      process.exit(1);
    }
    
    // Step 3: Validate and filter images
    logger.info('🔍 Step 3: Validating images...');
    let validImages = [];
    
    // Group images by role for proper validation context
    const imagesByRole = {};
    allImages.forEach(img => {
      const roleKey = img.role || `${img.character || 'unknown'} (${img.title || 'unknown'})`;
      if (!imagesByRole[roleKey]) imagesByRole[roleKey] = [];
      imagesByRole[roleKey].push(img);
    });
    
    // Validate each role's images separately
    for (const [roleName, roleImages] of Object.entries(imagesByRole)) {
      const roleInfo = roles.find(r => 
        r.name === roleName || 
        roleName.includes(r.character) || 
        roleName.includes(r.title)
      ) || {};
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
    
    // Step 5: Generate manifest with AI metadata
    logger.info('📄 Step 5: Generating AI-enhanced manifest...');
    const manifest = await generateManifest(resizedImages, celebrityName, roles);
    
    // Add AI system metadata to manifest
    manifest.system = {
      version: 'AI-POWERED-V1',
      timestamp: new Date().toISOString(),
      aiProvider: aiResults.source || 'ai_powered',
      primaryMedium: aiResults.summary?.primaryMedium || 'unknown',
      totalRoles: roles.length,
      totalOriginalImages: allImages.length,
      totalValidatedImages: validImages.length,
      totalResizedImages: resizedImages.length,
      voiceRolesFound: aiResults.summary?.hasVoiceRoles ? roles.filter(r => r.isVoiceRole).length : 0,
      liveActionRolesFound: aiResults.summary?.hasLiveActionRoles ? roles.filter(r => !r.isVoiceRole).length : 0,
      aiFeatures: [
        'ai_role_discovery',
        'popularity_ranking',
        'autograph_optimization',
        'search_term_generation'
      ],
      roleBreakdown: aiResults.summary?.mediumBreakdown || {}
    };
    
    await fs.writeFile(
      path.join(workDir, 'manifest.json'), 
      JSON.stringify(manifest, null, 2)
    );
    
    // Step 6: Zip and upload to Google Drive
    logger.info('📦 Step 6: Zipping and uploading to Google Drive...');
    const uploadResult = await zipAndUpload(workDir, celebrityName);
    logger.info(`✅ Upload complete: ${uploadResult.webViewLink}`);
    
    // Final success summary with AI insights
    logger.info('\n🎉 AI-POWERED PROCESS COMPLETE - SUMMARY:');
    logger.info(`Celebrity: ${celebrityName}`);
    logger.info(`AI Primary Medium: ${aiResults.summary?.primaryMedium || 'mixed'}`);
    logger.info(`Roles Discovered: ${roles.length}`);
    logger.info(`Images Downloaded: ${allImages.length}`);
    logger.info(`Images Validated: ${validImages.length}`);
    logger.info(`Images Resized: ${resizedImages.length}`);
    logger.info(`Voice Roles: ${manifest.system.voiceRolesFound}`);
    logger.info(`Live Action Roles: ${manifest.system.liveActionRolesFound}`);
    logger.info(`AI Features: ${manifest.system.aiFeatures.join(', ')}`);
    logger.info(`Google Drive Link: ${uploadResult.webViewLink}`);
    
    // Show top roles discovered by AI
    logger.info('\n🎯 TOP AI-DISCOVERED ROLES:');
    roles.slice(0, 3).forEach((role, i) => {
      logger.info(`  ${i + 1}. ${role.character} in ${role.title} (${role.popularity} popularity)`);
    });
    
    // Cleanup temporary files
    await fs.rm(workDir, { recursive: true, force: true });
    logger.info('🧹 Cleanup complete');
    
  } catch (error) {
    logger.error('❌ AI-powered process failed:', error.message);
    
    // Enhanced error logging for AI system
    if (error.message.includes('AI discovery')) {
      logger.error('🤖 AI system error - check your API keys and internet connection');
    } else if (error.message.includes('API')) {
      logger.error('🔑 API error - verify your Claude/OpenAI API keys in .env file');
    }
    
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
