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
   * NOW PASSES CELEBRITY NAME TO SEARCH OPTIMIZER
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

      // Step 2: UPDATED - Add celebrity name to each role for ChatGPT
      const rolesWithCelebrity = roles.map(role => ({
        ...role,
        celebrity: celebrityName,  // Add celebrity name to each role
        actorName: celebrityName   // Also add as actorName for compatibility
      }));

      // Step 3: AI optimizes search terms for each role using ChatGPT template
      const optimizedRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithCelebrity);

      // Step 4: Add metadata and final processing
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
   * Process and format final results - UPDATED to show ChatGPT terms
   */
  processResults(celebrityName, roles) {
    return {
      celebrity: celebrityName,
      totalRoles: roles.length,
      timestamp: new Date().toISOString(),
      source: 'ai_powered_with_chatgpt_template',  // Updated source indicator
      roles: roles.map((role, index) => ({
        ...role,
        priority: index + 1, // 1 = highest priority
        finalSearchTerms: this.searchOptimizer.getBestSearchTerms(role, 6), // Get all 6 ChatGPT terms
        imageSearchReady: true,
        searchOptimization: {
          chatgptTemplateTerms: role.searchTerms?.chatgpt_template?.length || 0,
          chatgptTerms: role.searchTerms?.chatgpt?.length || 0,
          fallbackTerms: role.searchTerms?.basic?.length || 0,
          totalTerms: role.searchTerms?.all?.length || 0
        }
      })),
      summary: this.generateSummary(roles)
    };
  }

  /**
   * Generate summary of role types found - UPDATED
   */
  generateSummary(roles) {
    const mediumCounts = {};
    let totalChatGPTTerms = 0;
    
    roles.forEach(role => {
      mediumCounts[role.medium] = (mediumCounts[role.medium] || 0) + 1;
      totalChatGPTTerms += role.searchTerms?.chatgpt?.length || 0;
    });

    const primaryMedium = Object.keys(mediumCounts).reduce((a, b) => 
      mediumCounts[a] > mediumCounts[b] ? a : b
    );

    return {
      primaryMedium,
      mediumBreakdown: mediumCounts,
      hasVoiceRoles: roles.some(r => r.medium.includes('voice')),
      hasLiveActionRoles: roles.some(r => r.medium.includes('live_action')),
      chatgptOptimization: {
        totalTemplateTermsGenerated: totalChatGPTTerms,
        averageTermsPerRole: Math.round(totalChatGPTTerms / roles.length),
        templateOptimizationSuccess: totalChatGPTTerms > 0
      }
    };
  }

  /**
   * Handle failures with fallback strategies - UNCHANGED
   */
  async handleFailure(celebrityName, originalError) {
    console.log(`🔄 Attempting fallback strategies for ${celebrityName}`);

    try {
      // Fallback 1: Try with simplified prompt
      const simplifiedRoles = await this.trySimplifiedFetch(celebrityName);
      if (simplifiedRoles && simplifiedRoles.length > 0) {
        console.log(`✅ Fallback successful with ${simplifiedRoles.length} roles`);
        
        // Add celebrity name to fallback roles too
        const rolesWithCelebrity = simplifiedRoles.map(role => ({
          ...role,
          celebrity: celebrityName,
          actorName: celebrityName
        }));
        
        // Optimize fallback roles with ChatGPT template too
        const optimizedFallbackRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithCelebrity);
        
        return this.processResults(celebrityName, optimizedFallbackRoles);
      }

      // Fallback 2: Return basic structure with error info
      return this.createErrorResponse(celebrityName, originalError);

    } catch (fallbackError) {
      console.error(`❌ All fallback strategies failed:`, fallbackError.message);
      return this.createErrorResponse(celebrityName, originalError);
    }
  }

  /**
   * Simplified fetch for difficult cases - UNCHANGED
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
      return this.roleFetcher.parseAndValidateResponse(response, celebrityName);
    } catch (error) {
      console.error('Simplified fetch failed:', error.message);
      return null;
    }
  }

  /**
   * Create error response structure - UNCHANGED
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
        hasLiveActionRoles: false,
        chatgptOptimization: {
          totalTemplateTermsGenerated: 0,
          averageTermsPerRole: 0,
          templateOptimizationSuccess: false
        }
      }
    };
  }

  /**
   * Get search terms for your existing fetchImages.js - UPDATED for ChatGPT
   */
  getSearchTermsForImages(results) {
    if (!results.roles || results.roles.length === 0) {
      return [];
    }

    return results.roles.map(role => ({
      character: role.character,
      title: role.title,
      medium: role.medium,
      celebrity: role.celebrity,                    // Include celebrity name
      searchTerms: role.finalSearchTerms || [],     // These now use ChatGPT template
      chatgptTemplateTerms: role.searchTerms?.chatgpt_template || [], // NEW: Direct access to template terms
      chatgptTerms: role.searchTerms?.chatgpt || [], // Keep for compatibility
      priority: role.priority
    }));
  }

  /**
   * NEW: Get detailed search analytics
   */
  getSearchAnalytics(results) {
    if (!results.roles) return null;

    const analytics = {
      totalRoles: results.roles.length,
      totalSearchTerms: 0,
      chatgptTemplateTermsGenerated: 0,
      chatgptTermsGenerated: 0,
      fallbackTermsUsed: 0,
      templateOptimizationRate: 0
    };

    results.roles.forEach(role => {
      if (role.searchTerms) {
        analytics.totalSearchTerms += role.searchTerms.all?.length || 0;
        analytics.chatgptTemplateTermsGenerated += role.searchTerms.chatgpt_template?.length || 0;
        analytics.chatgptTermsGenerated += role.searchTerms.chatgpt?.length || 0;
        analytics.fallbackTermsUsed += role.searchTerms.basic?.length || 0;
      }
    });

    analytics.templateOptimizationRate = analytics.totalSearchTerms > 0 
      ? Math.round((analytics.chatgptTemplateTermsGenerated / analytics.totalSearchTerms) * 100) 
      : 0;

    return analytics;
  }

  /**
   * System health check - UPDATED for ChatGPT
   */
  async systemHealthCheck() {
    console.log('🔍 Running AI system health check...');
    
    const checks = {
      aiConnection: false,
      roleFetcher: false,
      searchOptimizer: false,
      chatgptIntegration: false
    };

    try {
      // Test AI connection
      checks.aiConnection = await this.roleFetcher.testConnection();
      
      // Test role fetcher
      checks.roleFetcher = await this.testRoleFetcher();
      
      // Test search optimizer
      checks.searchOptimizer = await this.searchOptimizer.testOptimizer();
      
      // NEW: Test ChatGPT integration specifically
      checks.chatgptIntegration = await this.testChatGPTIntegration();

      const allPassed = Object.values(checks).every(check => check === true);
      
      console.log('Health Check Results:', checks);
      console.log(allPassed ? '✅ All systems operational including ChatGPT' : '⚠️ Some systems have issues');
      
      return { passed: allPassed, details: checks };

    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return { passed: false, details: checks, error: error.message };
    }
  }

  /**
   * NEW: Test ChatGPT integration specifically
   */
  async testChatGPTIntegration() {
    try {
      const testRole = {
        character: "Captain Kirk",
        title: "Star Trek",
        medium: "live_action_tv",
        celebrity: "William Shatner",
        actorName: "William Shatner"
      };
      
      const optimized = await this.searchOptimizer.optimizeRoleWithChatGPTTemplate(testRole);
      return optimized.searchTerms?.chatgpt_template?.length === 6;
    } catch (error) {
      console.error('ChatGPT integration test failed:', error.message);
      return false;
    }
  }

  /**
   * Test role fetcher with known celebrity - UNCHANGED
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
   * Clear cache - UNCHANGED
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️ Cache cleared');
  }

  /**
   * Get cache statistics - UNCHANGED
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
 * Initialize and test the system - UPDATED
 */
async function initializeSystem() {
      console.log('🚀 Initializing AI-powered celebrity role system with ChatGPT template...');
  
  const orchestrator = new CelebrityRoleOrchestrator();
  const healthCheck = await orchestrator.systemHealthCheck();
  
  if (!healthCheck.passed) {
    console.warn('⚠️ System initialization completed with warnings');
    console.warn('Check your OpenAI API key and internet connection');
    
    if (!healthCheck.details.chatgptIntegration) {
      console.warn('⚠️ ChatGPT template integration failed - search terms will use fallback methods');
    }
  } else {
    console.log('✅ AI system fully operational with ChatGPT template integration');
  }
  
  return healthCheck;
}

module.exports = { 
  fetchCelebrityRoles, 
  initializeSystem, 
  CelebrityRoleOrchestrator 
};
