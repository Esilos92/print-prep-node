const AIRoleFetcher = require('./ai-services/AIRoleFetcher.js');
const SearchOptimizer = require('./ai-services/SearchOptimizer.js');
const { PROMPTS, PROMPT_CONFIG } = require('./config/prompts.js');

class CelebrityRoleOrchestrator {
  constructor() {
    this.roleFetcher = new AIRoleFetcher();
    this.searchOptimizer = new SearchOptimizer();
    this.cache = new Map(); // Simple in-memory cache
  }

  /**
   * Main function - replaces your old fetchRoles.js entirely
   * Gets celebrity roles and optimized search terms using AI
   */
  async getCelebrityRoles(celebrityName) {
    try {
      console.log(`\n🎬 Starting AI-powered role fetch for: ${celebrityName}`);
      
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

      // Step 2: AI optimizes search terms for each role
      const optimizedRoles = await this.searchOptimizer.optimizeSearchTerms(roles);

      // Step 3: Add metadata and final processing
      const finalResults = this.processResults(celebrityName, optimizedRoles);

      // Cache results
      this.cache.set(celebrityName, finalResults);

      console.log(`✅ Successfully processed ${finalResults.roles.length} roles for ${celebrityName}`);
      return finalResults;

    } catch (error) {
      console.error(`❌ Failed to get roles for ${celebrityName}:`, error.message);
      
      // Try fallback approach
      return this.handleFailure(celebrityName, error);
    }
  }

  /**
   * Process and format final results
   */
  processResults(celebrityName, roles) {
    return {
      celebrity: celebrityName,
      totalRoles: roles.length,
      timestamp: new Date().toISOString(),
      source: 'ai_powered',
      roles: roles.map((role, index) => ({
        ...role,
        priority: index + 1, // 1 = highest priority
        finalSearchTerms: this.searchOptimizer.getBestSearchTerms(role, 3),
        imageSearchReady: true
      })),
      summary: this.generateSummary(roles)
    };
  }

  /**
   * Generate summary of role types found
   */
  generateSummary(roles) {
    const mediumCounts = {};
    roles.forEach(role => {
      mediumCounts[role.medium] = (mediumCounts[role.medium] || 0) + 1;
    });

    const primaryMedium = Object.keys(mediumCounts).reduce((a, b) => 
      mediumCounts[a] > mediumCounts[b] ? a : b
    );

    return {
      primaryMedium,
      mediumBreakdown: mediumCounts,
      hasVoiceRoles: roles.some(r => r.medium.includes('voice')),
      hasLiveActionRoles: roles.some(r => r.medium.includes('live_action'))
    };
  }

  /**
   * Handle failures with fallback strategies
   */
  async handleFailure(celebrityName, originalError) {
    console.log(`🔄 Attempting fallback strategies for ${celebrityName}`);

    try {
      // Fallback 1: Try with simplified prompt
      const simplifiedRoles = await this.trySimplifiedFetch(celebrityName);
      if (simplifiedRoles && simplifiedRoles.length > 0) {
        console.log(`✅ Fallback successful with ${simplifiedRoles.length} roles`);
        return this.processResults(celebrityName, simplifiedRoles);
      }

      // Fallback 2: Return basic structure with error info
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
    const simplifiedPrompt = `List 3-5 most famous roles for "${celebrityName}". 
    
    Format: [{"character": "Name", "title": "Show/Movie", "medium": "type"}]`;

    try {
      const completion = await this.roleFetcher.openai.chat.completions.create({
        model: PROMPT_CONFIG.MODELS.FALLBACK,
        messages: [{ role: "user", content: simplifiedPrompt }],
        temperature: 0.5,
        max_tokens: 500
      });

      const response = completion.choices[0].message.content;
      return this.roleFetcher.parseAIResponse(response);
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
        type: 'ai_fetch_failed'
      },
      roles: [],
      summary: {
        primaryMedium: 'unknown',
        mediumBreakdown: {},
        hasVoiceRoles: false,
        hasLiveActionRoles: false
      }
    };
  }

  /**
   * Get search terms for your existing fetchImages.js
   * This integrates with your current image fetching system
   */
  getSearchTermsForImages(results) {
    if (!results.roles || results.roles.length === 0) {
      return [];
    }

    return results.roles.map(role => ({
      character: role.character,
      title: role.title,
      medium: role.medium,
      searchTerms: role.finalSearchTerms || [],
      priority: role.priority
    }));
  }

  /**
   * System health check
   */
  async systemHealthCheck() {
    console.log('🔍 Running AI system health check...');
    
    const checks = {
      aiConnection: false,
      roleFetcher: false,
      searchOptimizer: false
    };

    try {
      // Test AI connection
      checks.aiConnection = await this.roleFetcher.testConnection();
      
      // Test role fetcher
      checks.roleFetcher = await this.testRoleFetcher();
      
      // Test search optimizer
      checks.searchOptimizer = await this.searchOptimizer.testOptimizer();

      const allPassed = Object.values(checks).every(check => check === true);
      
      console.log('Health Check Results:', checks);
      console.log(allPassed ? '✅ All systems operational' : '⚠️ Some systems have issues');
      
      return { passed: allPassed, details: checks };

    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return { passed: false, details: checks, error: error.message };
    }
  }

  /**
   * Test role fetcher with known celebrity
   */
  async testRoleFetcher() {
    try {
      const testResult = await this.roleFetcher.fetchRoles("Robert Downey Jr");
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
 * Main execution function - replaces your old fetchRoles.js
 * This is what gets called from your index.js or main application
 */
async function fetchCelebrityRoles(celebrityName) {
  const orchestrator = new CelebrityRoleOrchestrator();
  return await orchestrator.getCelebrityRoles(celebrityName);
}

/**
 * Initialize and test the system
 */
async function initializeSystem() {
  console.log('🚀 Initializing AI-powered celebrity role system...');
  
  const orchestrator = new CelebrityRoleOrchestrator();
  const healthCheck = await orchestrator.systemHealthCheck();
  
  if (!healthCheck.passed) {
    console.warn('⚠️ System initialization completed with warnings');
    console.warn('Check your OpenAI API key and internet connection');
  } else {
    console.log('✅ AI system fully operational');
  }
  
  return healthCheck;
}

module.exports = { 
  fetchCelebrityRoles, 
  initializeSystem, 
  CelebrityRoleOrchestrator 
};
