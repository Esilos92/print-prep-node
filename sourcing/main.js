const AIRoleFetcher = require('./ai-services/AIRoleFetcher.js');
const SearchOptimizer = require('./ai-services/SearchOptimizer.js');
const { PROMPTS, PROMPT_CONFIG } = require('./config/prompts.js');

class CelebrityRoleOrchestrator {
  constructor() {
    this.roleFetcher = new AIRoleFetcher();
    this.searchOptimizer = new SearchOptimizer();
    this.cache = new Map();
  }

  /**
   * Main function - gets celebrity roles and character image search terms
   */
  async getCelebrityRoles(celebrityName) {
    try {
      console.log(`\n🎬 Starting character image search for: ${celebrityName}`);
      
      // Check cache first
      if (this.cache.has(celebrityName)) {
        console.log(`💾 Using cached results for ${celebrityName}`);
        return this.cache.get(celebrityName);
      }

      // Step 1: AI fetches the top 5 roles
      const roles = await this.roleFetcher.fetchRoles(celebrityName);
      
      if (!roles || roles.length === 0) {
        throw new Error(`No roles found for ${celebrityName}`);
      }

      // Step 2: Add celebrity name to each role for search optimization
      const rolesWithCelebrity = roles.map(role => ({
        ...role,
        celebrity: celebrityName,
        actorName: celebrityName
      }));

      console.log(`🔍 Optimizing search terms using ChatGPT template for ${rolesWithCelebrity.length} roles`);

      // Step 3: Generate character image search terms for each role
      const optimizedRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithCelebrity);

      // Verify optimization worked
      const successfulOptimizations = optimizedRoles.filter(role => 
        role.searchTerms?.character_images?.length === 6
      ).length;
      
      console.log(`✅ Successfully optimized ${successfulOptimizations}/${optimizedRoles.length} roles for character images`);

      // Step 4: Process and format final results - FIXED: Use optimizedRoles
      const finalResults = this.processResults(celebrityName, optimizedRoles);

      // Cache results
      this.cache.set(celebrityName, finalResults);

      console.log(`✅ Successfully processed ${finalResults.roles.length} character image searches for ${celebrityName}`);
      return finalResults;

    } catch (error) {
      console.error(`❌ Failed to get character images for ${celebrityName}:`, error.message);
      return this.handleFailure(celebrityName, error);
    }
  }

  /**
   * Process and format final results - FIXED: Use optimized roles
   */
  processResults(celebrityName, optimizedRoles) {
    return {
      celebrity: celebrityName,
      totalRoles: optimizedRoles.length,
      timestamp: new Date().toISOString(),
      source: 'character_image_focused',
      roles: optimizedRoles.map((role, index) => ({
        ...role,
        priority: index + 1,
        // FIXED: Use the optimized role object that already has searchTerms
        finalSearchTerms: this.searchOptimizer.getBestSearchTerms(role, 6), // Now using optimized role
        imageSearchReady: true,
        searchOptimization: {
          characterImageTerms: role.searchTerms?.character_images?.length || 0,
          fallbackTerms: role.searchTerms?.basic?.length || 0,
          totalTerms: role.searchTerms?.all?.length || 0,
          focusedOnCharacterImages: (role.searchTerms?.character_images?.length || 0) === 6
        }
      })),
      summary: this.generateSummary(optimizedRoles) // FIXED: Use optimized roles
    };
  }

  /**
   * Generate summary with character image stats - FIXED: Use optimized roles
   */
  generateSummary(optimizedRoles) {
    const mediumCounts = {};
    let totalCharacterImageTerms = 0;
    
    optimizedRoles.forEach(role => {
      mediumCounts[role.medium] = (mediumCounts[role.medium] || 0) + 1;
      totalCharacterImageTerms += role.searchTerms?.character_images?.length || 0;
    });

    const primaryMedium = Object.keys(mediumCounts).reduce((a, b) => 
      mediumCounts[a] > mediumCounts[b] ? a : b
    );

    return {
      primaryMedium,
      mediumBreakdown: mediumCounts,
      hasVoiceRoles: optimizedRoles.some(r => r.medium.includes('voice')),
      hasLiveActionRoles: optimizedRoles.some(r => r.medium.includes('live_action')),
      characterImageOptimization: {
        totalCharacterImageTerms: totalCharacterImageTerms,
        expectedTerms: optimizedRoles.length * 6,
        characterImageSuccessRate: Math.round((totalCharacterImageTerms / (optimizedRoles.length * 6)) * 100),
        fullyOptimizedRoles: optimizedRoles.filter(r => (r.searchTerms?.character_images?.length || 0) === 6).length
      }
    };
  }

  /**
   * Handle failures with fallback strategies - FIXED: Pass optimized roles through
   */
  async handleFailure(celebrityName, originalError) {
    console.log(`🔄 Attempting fallback strategies for ${celebrityName}`);

    try {
      const simplifiedRoles = await this.trySimplifiedFetch(celebrityName);
      if (simplifiedRoles && simplifiedRoles.length > 0) {
        console.log(`✅ Fallback successful with ${simplifiedRoles.length} roles`);
        
        const rolesWithCelebrity = simplifiedRoles.map(role => ({
          ...role,
          celebrity: celebrityName,
          actorName: celebrityName
        }));
        
        // Still try to optimize for character images - FIXED: Use optimized results
        const optimizedFallbackRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithCelebrity);
        return this.processResults(celebrityName, optimizedFallbackRoles);
      }

      return this.createErrorResponse(celebrityName, originalError);

    } catch (fallbackError) {
      console.error(`❌ All fallback strategies failed:`, fallbackError.message);
      return this.createErrorResponse(celebrityName, originalError);
    }
  }

  /**
   * Simplified fetch for difficult cases
   */
  async trySimplifiedFetch(celebrityName) {
    const simplifiedPrompt = `List 3-5 most famous roles for "${celebrityName}". Format: [{"character": "Name", "title": "Show/Movie", "medium": "type"}]`;

    try {
      if (this.roleFetcher.hasOpenAI) {
        const completion = await this.roleFetcher.openai.chat.completions.create({
          model: PROMPT_CONFIG.MODELS.FALLBACK || "gpt-3.5-turbo",
          messages: [{ role: "user", content: simplifiedPrompt }],
          temperature: 0.5,
          max_tokens: 500
        });

        const response = completion.choices[0].message.content;
        return this.roleFetcher.parseAndValidateResponse(response, celebrityName);
      }
      return null;
    } catch (error) {
      console.error('Simplified fetch failed:', error.message);
      return null;
    }
  }

  /**
   * Create error response structure
   */
  createErrorResponse(celebrityName, error) {
    return {
      celebrity: celebrityName,
      totalRoles: 0,
      timestamp: new Date().toISOString(),
      source: 'error',
      error: {
        message: error.message,
        type: 'character_image_fetch_failed'
      },
      roles: [],
      summary: {
        primaryMedium: 'unknown',
        mediumBreakdown: {},
        hasVoiceRoles: false,
        hasLiveActionRoles: false,
        characterImageOptimization: {
          totalCharacterImageTerms: 0,
          expectedTerms: 0,
          characterImageSuccessRate: 0,
          fullyOptimizedRoles: 0
        }
      }
    };
  }

  /**
   * Get search terms for image fetching integration - FIXED: Improved data structure
   */
  getSearchTermsForImages(results) {
    if (!results.roles || results.roles.length === 0) {
      return [];
    }

    return results.roles.map(role => ({
      character: role.character,
      title: role.title,
      medium: role.medium,
      celebrity: role.celebrity,
      name: role.title, // For compatibility with fetchImages
      // PRIORITY FIELDS for fetchImages.js:
      finalSearchTerms: role.finalSearchTerms || [], // Highest priority
      searchTerms: role.searchTerms, // Contains character_images array
      characterImageTerms: role.searchTerms?.character_images || [],
      priority: role.priority,
      focusedOnCharacterImages: (role.searchTerms?.character_images?.length || 0) === 6,
      isVoiceRole: role.medium?.includes('voice') || false
    }));
  }

  /**
   * Get detailed search analytics
   */
  getSearchAnalytics(results) {
    if (!results.roles) return null;

    const analytics = {
      totalRoles: results.roles.length,
      totalSearchTerms: 0,
      characterImageTermsGenerated: 0,
      fallbackTermsUsed: 0,
      characterImageOptimizationRate: 0,
      fullyOptimizedRoles: 0
    };

    results.roles.forEach(role => {
      if (role.searchTerms) {
        analytics.totalSearchTerms += role.searchTerms.all?.length || 0;
        analytics.characterImageTermsGenerated += role.searchTerms.character_images?.length || 0;
        analytics.fallbackTermsUsed += role.searchTerms.basic?.length || 0;
        
        if ((role.searchTerms.character_images?.length || 0) === 6) {
          analytics.fullyOptimizedRoles++;
        }
      }
    });

    analytics.characterImageOptimizationRate = analytics.totalSearchTerms > 0 
      ? Math.round((analytics.characterImageTermsGenerated / analytics.totalSearchTerms) * 100) 
      : 0;

    return analytics;
  }

  /**
   * System health check with character image focus
   */
  async systemHealthCheck() {
    console.log('🔍 Running character image system health check...');
    
    const checks = {
      aiConnection: false,
      roleFetcher: false,
      searchOptimizer: false,
      characterImageIntegration: false
    };

    try {
      // Test AI connection
      checks.aiConnection = await this.roleFetcher.testConnection();
      
      // Test role fetcher
      checks.roleFetcher = await this.testRoleFetcher();
      
      // Test search optimizer
      checks.searchOptimizer = await this.searchOptimizer.testOptimizer();
      
      // Test character image integration
      checks.characterImageIntegration = await this.testCharacterImageIntegration();

      const allPassed = Object.values(checks).every(check => check === true);
      
      console.log('Health Check Results:', checks);
      console.log(allPassed ? '✅ All systems operational for character image searches' : '⚠️ Some systems have issues');
      
      return { passed: allPassed, details: checks };

    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return { passed: false, details: checks, error: error.message };
    }
  }

  /**
   * Test character image integration specifically
   */
  async testCharacterImageIntegration() {
    try {
      const testRole = {
        character: "Test Character",
        title: "Test Show",
        medium: "live_action_tv",
        celebrity: "Test Actor",
        actorName: "Test Actor"
      };
      
      const optimized = await this.searchOptimizer.optimizeRoleForCharacterImages(testRole);
      const success = optimized.searchTerms?.character_images?.length === 6;
      
      if (success) {
        console.log('✅ Character image integration test passed');
      } else {
        console.log('❌ Character image integration test failed - not generating 6 terms');
      }
      
      return success;
    } catch (error) {
      console.error('Character image integration test failed:', error.message);
      return false;
    }
  }

  /**
   * Test role fetcher
   */
  async testRoleFetcher() {
    try {
      const testResult = await this.roleFetcher.fetchRoles("Test Celebrity");
      return testResult && testResult.length > 0;
    } catch (error) {
      console.error('Role fetcher test failed:', error.message);
      return false;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️ Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      celebrities: Array.from(this.cache.keys())
    };
  }
}

/**
 * Main execution function
 */
async function fetchCelebrityRoles(celebrityName) {
  const orchestrator = new CelebrityRoleOrchestrator();
  return await orchestrator.getCelebrityRoles(celebrityName);
}

/**
 * Initialize and test the system
 */
async function initializeSystem() {
  console.log('🚀 Initializing character image search system...');
  
  const orchestrator = new CelebrityRoleOrchestrator();
  const healthCheck = await orchestrator.systemHealthCheck();
  
  if (!healthCheck.passed) {
    console.warn('⚠️ System initialization completed with warnings');
    console.warn('Check your OpenAI API key and internet connection');
    
    if (!healthCheck.details.characterImageIntegration) {
      console.warn('⚠️ Character image integration failed - search terms will use fallback methods');
    }
  } else {
    console.log('✅ Character image search system fully operational');
  }
  
  return healthCheck;
}

module.exports = { 
  fetchCelebrityRoles, 
  initializeSystem, 
  CelebrityRoleOrchestrator 
};
