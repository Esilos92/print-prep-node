// Updated to use AI-powered celebrity role discovery
const { fetchCelebrityRoles } = require('./sourcing/main.js');
const { sourceRole } = require('./sourcing/images/sourceRole');
const { preparePrints, buildContactSheet } = require('./sourcing/images/print');
const ReferencePortrait = require('./sourcing/ai-services/ReferencePortrait');
const config = require('./utils/config');
const { generateManifest } = require('./sourcing/generateManifest');
const { zipAndUpload } = require('./sourcing/zipAndUpload');
const logger = require('./utils/logger');
const progress = require('./utils/progress');
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
    
    /**
     * Build the working directory from a slug, not from the raw name.
     *
     * This path is created, written to, and at the end of a successful run
     * removed with { recursive: true, force: true }. `replace(/\s+/g, '_')`
     * substituted whitespace only, so a name like "../../etc" walked straight
     * out of temp/. The containment check below is the backstop in case the
     * slug rules ever loosen.
     */
    const slug = celebrityName
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 60);

    if (!slug) {
      logger.error(`❌ Celebrity name produces no usable directory name: ${celebrityName}`);
      process.exit(1);
    }

    const tempRoot = path.join(__dirname, 'temp');
    const workDir = path.join(tempRoot, slug);

    if (path.relative(tempRoot, workDir).startsWith('..') || path.isAbsolute(path.relative(tempRoot, workDir))) {
      logger.error(`❌ Refusing to work outside ${tempRoot}`);
      process.exit(1);
    }

    // Start clean: leftovers from an earlier failed run must not ship in this package.
    await fs.rm(workDir, { recursive: true, force: true });
    await fs.mkdir(workDir, { recursive: true });
    
    // Step 1: AI-powered role discovery (replaces old fetchRoles)
    progress.phase('role_discovery', 5, 'Discovering roles...');
    logger.info('🤖 Step 1: AI discovering top roles...');
    const aiResults = await fetchCelebrityRoles(celebrityName);
    
    if (!aiResults || aiResults.totalRoles === 0) {
      logger.error('❌ AI found no roles for celebrity. Check name spelling or try again.');
      process.exit(1);
    }
    
    // 🎯 CRITICAL FIX: Preserve ALL smart search properties from orchestrator
    const roles = aiResults.roles.map(role => ({
      // Basic role info for compatibility
      name: `${role.character} (${role.title})`,
      character: role.character,
      characterName: role.characterName || role.character, // Alternative property
      title: role.title,
      medium: role.medium,
      year: role.year,
      isVoiceRole: role.medium.includes('voice'),
      source: 'ai_discovery',
      isKnownFor: role.popularity === 'high',
      popularity: role.popularity,
      description: role.description,
      
      // 🎯 CRITICAL: Preserve ALL smart search properties from orchestrator
      finalSearchTerms: role.finalSearchTerms || [], // Smart search terms
      isMultiActorCharacter: role.isMultiActorCharacter || false, // Multi-actor detection
      smartSearchApproach: role.smartSearchApproach || 'Standard', // Search strategy
      maxImages: role.maxImages || 20, // Image limits
      searchTerms: role.searchTerms, // Full search term object
      searchMetadata: role.searchMetadata, // Search metadata
      
      // Additional smart search properties
      characterProminent: role.characterProminent || 'low',
      searchPriority: role.searchPriority || 1,
      smartSearchStrategy: role.smartSearchStrategy,
      
      // Preserve any other orchestrator properties
      ...role // Spread all other properties from orchestrator
    }));
    
    progress.phase('roles_found', 25, `${roles.length} roles discovered`);
    roles.forEach(role => progress.role(role.character, role.title));
    logger.info(`✅ AI discovered ${roles.length} roles:`);
    roles.forEach((role, i) => {
      const voiceMarker = role.isVoiceRole ? ' (VOICE)' : '';
      const mediumMarker = ` [${role.medium}]`;
      const popularityMarker = role.popularity === 'high' ? ' ⭐' : '';
      const multiActorMarker = role.isMultiActorCharacter ? ' 🎭' : '';
      logger.info(`  ${i + 1}. ${role.character} in ${role.title}${voiceMarker}${mediumMarker}${popularityMarker}${multiActorMarker}`);
    });
    
    // Step 2: find, review and select photos for each role
    progress.phase('image_search', 40, 'Finding photos...');
    logger.info('🖼️  Step 2: Sourcing photos (TMDb official images + targeted search, batch review)...');

    const referencePaths = config.verification.useReferenceImage
      ? await new ReferencePortrait().getPortraits(celebrityName, path.join(workDir, 'reference'), 3)
      : [];
    if (referencePaths.length === 0) {
      progress.problem('No reference photo found on TMDb — identity checks are weaker for this run.');
    }

    const context = { referencePaths, seen: [], triedUrls: new Set() };
    const selectedImages = [];
    const roleReports = [];
    const outages = [];

    for (const [i, role] of roles.entries()) {
      progress.phase('image_search', 40 + Math.round((i / roles.length) * 40), `Photos for ${role.character} (${i + 1}/${roles.length})`);
      try {
        const { images, report } = await sourceRole(celebrityName, role, workDir, context);
        selectedImages.push(...images);
        roleReports.push(report);
        const kinds = Object.entries(report.byKind).map(([k, n]) => `${n} ${k}`).join(', ') || 'none';
        logger.info(`📸 ${role.character} (${role.title}): ${report.selected} selected (${kinds}) from ${report.reviewed} reviewed`);
        if (report.selected === 0) {
          const top = Object.entries(report.rejected).sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([why, n]) => `${n} ${why.replace(/_/g, ' ')}`).join(', ');
          const detail = report.reviewed === 0
            ? `no candidate images found${report.error ? ` (${report.error})` : ''}`
            : `none of ${report.reviewed} reviewed were usable${top ? ` — ${top}` : ''}`;
          progress.problem(`${role.character} (${role.title}): ${detail}`);
        }
      } catch (error) {
        logger.warn(`❌ ${role.character}: ${error.message}`);
        outages.push(error.message);
        roleReports.push({ character: role.character, title: role.title, selected: 0, error: error.message });
        progress.problem(`${role.character} (${role.title}): ${error.message}`);
      }
      progress.counts({ verified: selectedImages.length });
    }

    if (selectedImages.length === 0) {
      const why = outages.length === roles.length
        ? `Image review service unavailable: ${outages[0]}`
        : 'No usable photos found for any role (see the per-role notes above).';
      progress.problem(why);
      logger.error(`❌ ${why}`);
      process.exit(1);
    }

    // Step 3: crop/resize to the true print shapes
    progress.phase('resize', 82, 'Preparing print files...');
    logger.info('📐 Step 3: Preparing print files...');
    const { prints: resizedImages, skipped } = await preparePrints(selectedImages, workDir, celebrityName);
    progress.counts({ printable: resizedImages.length });
    logger.info(`✅ ${resizedImages.length} print files from ${selectedImages.length} photos (${skipped.length} size/photo combinations skipped to avoid bad crops or low DPI)`);

    if (resizedImages.length === 0) {
      progress.problem('Photos were found, but none could be printed at the DPI floor without cutting the subject.');
      logger.error('❌ No printable files. Lower MIN_PRINT_DPI or check the sources.');
      process.exit(1);
    }

    try {
      await buildContactSheet(resizedImages, path.join(workDir, 'resized', 'contact_sheet.jpg'));
    } catch (error) {
      logger.warn(`Contact sheet skipped: ${error.message}`);
    }

    const allImages = selectedImages;
    const validImages = selectedImages;

    // Step 5: Generate manifest with AI metadata
    progress.phase('manifest', 90, 'Writing manifest...');
    logger.info('📄 Step 5: Generating AI-enhanced manifest...');
    const manifest = await generateManifest(resizedImages, celebrityName, roles);
    manifest.roleReports = roleReports;
    manifest.skippedPrints = skipped;
    
    // Add AI system metadata to manifest with smart search info
    manifest.system = {
      version: 'AI-POWERED-V2-SMART-SEARCH',
      timestamp: new Date().toISOString(),
      aiProvider: aiResults.source || 'ai_powered',
      primaryMedium: aiResults.summary?.primaryMedium || 'unknown',
      totalRoles: roles.length,
      totalOriginalImages: allImages.length,
      totalValidatedImages: validImages.length,
      totalResizedImages: resizedImages.length,
      voiceRolesFound: aiResults.summary?.hasVoiceRoles ? roles.filter(r => r.isVoiceRole).length : 0,
      liveActionRolesFound: aiResults.summary?.hasLiveActionRoles ? roles.filter(r => !r.isVoiceRole).length : 0,
      // 🎯 ADDED: Smart search statistics
      multiActorRoles: roles.filter(r => r.isMultiActorCharacter).length,
      smartSearchTermsGenerated: roles.reduce((sum, r) => sum + (r.finalSearchTerms?.length || 0), 0),
      averageSearchTermsPerRole: Math.round(roles.reduce((sum, r) => sum + (r.finalSearchTerms?.length || 0), 0) / roles.length),
      aiFeatures: [
        'ai_role_discovery',
        'popularity_ranking',
        'autograph_optimization',
        'search_term_generation',
        'multi_actor_detection', // 🎯 NEW
        'smart_search_integration', // 🎯 NEW
        'actor_specific_precision' // 🎯 NEW
      ],
      roleBreakdown: aiResults.summary?.mediumBreakdown || {},
      // 🎯 ADDED: Smart search breakdown
      smartSearchBreakdown: {
        multiActorCharacters: roles.filter(r => r.isMultiActorCharacter).map(r => `${r.character} (${r.title})`),
        singleActorCharacters: roles.filter(r => !r.isMultiActorCharacter).map(r => `${r.character} (${r.title})`),
        totalSmartSearchTerms: roles.reduce((sum, r) => sum + (r.finalSearchTerms?.length || 0), 0)
      }
    };
    
    await fs.writeFile(
      path.join(workDir, 'manifest.json'), 
      JSON.stringify(manifest, null, 2)
    );
    
    // Step 6: Zip and upload to Google Drive
    progress.phase('upload', 95, 'Uploading to Google Drive...');
    logger.info('📦 Step 6: Zipping and uploading to Google Drive...');
    const uploadResult = await zipAndUpload(workDir, celebrityName);
    progress.download(uploadResult.webViewLink);
    progress.phase('complete', 100, 'Mission Complete!');
    logger.info(`✅ Upload complete: ${uploadResult.webViewLink}`);
    
    // Final success summary with AI insights
    logger.info('\n🎉 AI-POWERED PROCESS COMPLETE - SUMMARY:');
    logger.info(`Celebrity: ${celebrityName}`);
    logger.info(`AI Primary Medium: ${aiResults.summary?.primaryMedium || 'mixed'}`);
    logger.info(`Roles Discovered: ${roles.length}`);
    logger.info(`Multi-Actor Roles: ${manifest.system.multiActorRoles}`); // 🎯 NEW
    logger.info(`Smart Search Terms: ${manifest.system.smartSearchTermsGenerated}`); // 🎯 NEW
    logger.info(`Images Downloaded: ${allImages.length}`);
    logger.info(`Images Validated: ${validImages.length}`);
    logger.info(`Images Resized: ${resizedImages.length}`);
    logger.info(`Voice Roles: ${manifest.system.voiceRolesFound}`);
    logger.info(`Live Action Roles: ${manifest.system.liveActionRolesFound}`);
    logger.info(`AI Features: ${manifest.system.aiFeatures.join(', ')}`);
    logger.info(`Google Drive Link: ${uploadResult.webViewLink}`);
    
    // Show top roles discovered by AI with smart search info
    logger.info('\n🎯 TOP AI-DISCOVERED ROLES WITH SMART SEARCH:');
    roles.slice(0, 3).forEach((role, i) => {
      const multiActorInfo = role.isMultiActorCharacter ? ' [MULTI-ACTOR]' : '';
      const searchTermsInfo = ` (${role.finalSearchTerms?.length || 0} search terms)`;
      logger.info(`  ${i + 1}. ${role.character} in ${role.title}${multiActorInfo}${searchTermsInfo}`);
      if (role.finalSearchTerms?.length > 0) {
        logger.info(`     First search: "${role.finalSearchTerms[0]}"`);
      }
    });
    
    // 🎯 NEW: Show multi-actor detection results
    const multiActorRoles = roles.filter(r => r.isMultiActorCharacter);
    if (multiActorRoles.length > 0) {
      logger.info('\n🎭 MULTI-ACTOR CHARACTER PRECISION:');
      multiActorRoles.forEach(role => {
        logger.info(`  • ${role.character} (${role.title}) - Actor-specific search enabled`);
      });
    }
    
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
    } else if (error.message.includes('smart search')) {
      logger.error('🎯 Smart search error - check multi-actor detection system');
    }
    
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
