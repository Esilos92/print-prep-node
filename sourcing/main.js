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
   * ENHANCED: CHARACTER-FIRST celebrity role discovery and optimization
   */
  async getCelebrityRoles(celebrityName) {
    try {
      console.log(`\n🎬 Starting CHARACTER-FIRST image search for: ${celebrityName}`);
      
      // Check cache first
      if (this.cache.has(celebrityName)) {
        console.log(`💾 Using cached results for ${celebrityName}`);
        return this.cache.get(celebrityName);
      }

      // Step 1: AI fetches the top 5 roles with enhanced voice detection
      const roles = await this.roleFetcher.fetchRoles(celebrityName);
      
      if (!roles || roles.length === 0) {
        throw new Error(`No roles found for ${celebrityName}`);
      }

      // Step 2: Add celebrity name and detect character prominence
      const rolesWithCelebrity = roles.map(role => ({
        ...role,
        celebrity: celebrityName,
        actorName: celebrityName,
        // Enhanced character analysis
        characterProminent: this.analyzeCharacterProminence(role, celebrityName),
        searchPriority: this.calculateSearchPriority(role, celebrityName)
      }));

      console.log(`🔍 Optimizing CHARACTER-FIRST search terms for ${rolesWithCelebrity.length} roles`);

      // Step 3: Generate CHARACTER-FIRST search terms
      const characterFirstRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithCelebrity);

      // Step 4: Enhanced OpenAI optimization for high-priority roles
      const enhancedRoles = await this.enhanceHighPriorityRoles(characterFirstRoles);

      // Verify optimization success
      const optimizationStats = this.searchOptimizer.getOptimizationStats(enhancedRoles);
      
      console.log(`✅ CHARACTER-FIRST optimization stats:`, optimizationStats);

      // Step 5: Process and format final results with character-first priority
      const finalResults = this.processCharacterFirstResults(celebrityName, enhancedRoles, optimizationStats);

      // Cache results
      this.cache.set(celebrityName, finalResults);

      console.log(`✅ CHARACTER-FIRST processing complete: ${finalResults.roles.length} optimized roles for ${celebrityName}`);
      console.log(`📊 Expected image volume: ${this.estimateImageVolume(finalResults)} images`);
      
      return finalResults;

    } catch (error) {
      console.error(`❌ Failed to get CHARACTER-FIRST results for ${celebrityName}:`, error.message);
      return this.handleFailure(celebrityName, error);
    }
  }

  /**
   * NEW: Analyze character prominence for search strategy
   */
  analyzeCharacterProminence(role, celebrityName) {
    const character = (role.character || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    const medium = (role.medium || '').toLowerCase();
    
    // Voice roles = character prominent
    if (medium.includes('voice') || medium.includes('anime') || medium.includes('animation')) {
      return 'high';
    }
    
    // Iconic characters
    const iconicShows = ['star trek', 'star wars', 'marvel', 'batman', 'superman', 'spider-man'];
    if (iconicShows.some(show => title.includes(show))) {
      return 'high';
    }
    
    // Recent popular shows where character names are well-known
    const year = parseInt(role.year) || 0;
    if (year >= 2000 && character !== 'unknown character') {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * NEW: Calculate search priority for optimization focus
   */
  calculateSearchPriority(role, celebrityName) {
    let priority = 0;
    
    // Character prominence boost
    const prominence = this.analyzeCharacterProminence(role, celebrityName);
    if (prominence === 'high') priority += 3;
    else if (prominence === 'medium') priority += 2;
    else priority += 1;
    
    // Popularity boost
    if (role.popularity === 'high') priority += 2;
    else if (role.popularity === 'medium') priority += 1;
    
    // Medium-specific boosts
    const medium = (role.medium || '').toLowerCase();
    if (medium.includes('anime') || medium.includes('voice')) priority += 2; // High image potential
    if (medium.includes('movie')) priority += 1;
    
    // Recent content boost (better image availability)
    const year = parseInt(role.year) || 0;
    if (year >= 2010) priority += 1;
    if (year >= 2020) priority += 1;
    
    return priority;
  }

  /**
   * NEW: Enhanced OpenAI optimization for high-priority roles
   */
  async enhanceHighPriorityRoles(roles) {
    const highPriorityRoles = roles.filter(role => role.searchPriority >= 5);
    
    if (highPriorityRoles.length > 0 && this.searchOptimizer.hasOpenAI) {
      console.log(`🚀 Applying OpenAI enhancement to ${highPriorityRoles.length} high-priority roles`);
      
      const enhancedHighPriority = await Promise.all(
        highPriorityRoles.map(role => this.searchOptimizer.enhanceWithOpenAI(role))
      );
      
      // Merge back with other roles
      return roles.map(role => {
        const enhanced = enhancedHighPriority.find(hr => hr.character === role.character && hr.title === role.title);
        return enhanced || role;
      });
    }
    
    return roles;
  }

  /**
   * ENHANCED: Process CHARACTER-FIRST results with detailed analytics
   */
  processCharacterFirstResults(celebrityName, optimizedRoles, optimizationStats) {
    return {
      celebrity: celebrityName,
      totalRoles: optimizedRoles.length,
      timestamp: new Date().toISOString(),
      source: 'character_first_optimized',
      strategy: 'character_prominence_based',
      roles: optimizedRoles.map((role, index) => ({
        ...role,
        priority: index + 1,
        // PRIMARY: CHARACTER-FIRST search terms
        finalSearchTerms: this.searchOptimizer.getBestSearchTerms(role, 6),
        imageSearchReady: true,
        // Enhanced metadata for fetchImages.js
        searchMetadata: {
          strategy: role.searchStrategy || 'mixed',
          characterProminent: role.characterProminent,
          searchPriority: role.searchPriority,
          characterFirstTerms: role.searchTerms?.character_images?.length || 0,
          balancedTerms: role.searchTerms?.balanced?.length || 0,
          expectedImageVolume: this.estimateRoleImageVolume(role),
          optimizedForCharacterImages: (role.searchTerms?.character_images?.length || 0) === 6
        }
      })),
      summary: this.generateCharacterFirstSummary(optimizedRoles, optimizationStats),
      optimizationReport: this.generateOptimizationReport(optimizedRoles, optimizationStats)
    };
  }

  /**
   * NEW: Estimate expected image volume per role
   */
  estimateRoleImageVolume(role) {
    let baseEstimate = 20; // Conservative base
    
    // Character prominence multiplier
    if (role.characterProminent === 'high') baseEstimate *= 3; // 60 images
    else if (role.characterProminent === 'medium') baseEstimate *= 2; // 40 images
    
    // Medium multiplier
    const medium = (role.medium || '').toLowerCase();
    if (medium.includes('anime') || medium.includes('voice')) baseEstimate *= 1.5; // Anime has lots of screenshots
    if (medium.includes('movie')) baseEstimate *= 1.2;
    
    // Popularity multiplier
    if (role.popularity === 'high') baseEstimate *= 1.3;
    
    // Recent content multiplier (better digital availability)
    const year = parseInt(role.year) || 0;
    if (year >= 2010) baseEstimate *= 1.2;
    if (year >= 2020) baseEstimate *= 1.1;
    
    // Optimization quality multiplier
    if ((role.searchTerms?.character_images?.length || 0) === 6) baseEstimate *= 1.3;
    
    return Math.round(baseEstimate);
  }

  /**
   * NEW: Estimate total image volume for celebrity
   */
  estimateImageVolume(results) {
    return results.roles.reduce((total, role) => {
      return total + (role.searchMetadata?.expectedImageVolume || 20);
    }, 0);
  }

  /**
   * ENHANCED: Generate CHARACTER-FIRST summary with detailed insights
   */
  generateCharacterFirstSummary(optimizedRoles, optimizationStats) {
    const mediumCounts = {};
    const strategyCounts = {};
    let totalCharacterFirstTerms = 0;
    let highProminenceRoles = 0;
    
    optimizedRoles.forEach(role => {
      mediumCounts[role.medium] = (mediumCounts[role.medium] || 0) + 1;
      
      const strategy = role.searchStrategy || 'unknown';
      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
      
      totalCharacterFirstTerms += role.searchTerms?.character_images?.length || 0;
      
      if (role.characterProminent === 'high') highProminenceRoles++;
    });

    const primaryMedium = Object.keys(mediumCounts).reduce((a, b) => 
      mediumCounts[a] > mediumCounts[b] ? a : b
    );

    const dominantStrategy = Object.keys(strategyCounts).reduce((a, b) => 
      strategyCounts[a] > strategyCounts[b] ? a : b
    );

    return {
      primaryMedium,
      dominantStrategy,
      mediumBreakdown: mediumCounts,
      strategyBreakdown: strategyCounts,
      hasVoiceRoles: optimizedRoles.some(r => r.medium.includes('voice')),
      hasLiveActionRoles: optimizedRoles.some(r => r.medium.includes('live_action')),
      highProminenceRoles,
      characterFirstOptimization: {
        totalCharacterFirstTerms: totalCharacterFirstTerms,
        expectedTerms: optimizedRoles.length * 6,
        characterFirstSuccessRate: optimizationStats.characterFirstSuccessRate || 0,
        fullyOptimizedRoles: optimizedRoles.filter(r => (r.searchTerms?.character_images?.length || 0) === 6).length,
        averageSearchPriority: Math.round(optimizedRoles.reduce((sum, r) => sum + (r.searchPriority || 0), 0) / optimizedRoles.length)
      }
    };
  }

  /**
   * NEW: Generate detailed optimization report
   */
  generateOptimizationReport(optimizedRoles, optimizationStats) {
    const report = {
      optimizationApproach: 'character_first_prominence_based',
      totalSearchTermsGenerated: optimizationStats.characterFirstTerms + optimizationStats.balancedTerms + optimizationStats.fallbackTerms,
      characterFirstTerms: optimizationStats.characterFirstTerms,
      balancedTerms: optimizationStats.balancedTerms,
      fallbackTerms: optimizationStats.fallbackTerms,
      strategiesUsed: optimizationStats.strategies,
      expectedPerformanceImprovement: this.calculateExpectedImprovement(optimizedRoles),
      roleAnalysis: optimizedRoles.map(role => ({
        character: role.character,
        title: role.title,
        prominence: role.characterProminent,
        priority: role.searchPriority,
        strategy: role.searchStrategy,
        termsGenerated: role.searchTerms?.character_images?.length || 0,
        expectedImages: role.searchMetadata?.expectedImageVolume || 0
      }))
    };

    return report;
  }

  /**
   * NEW: Calculate expected performance improvement
   */
  calculateExpectedImprovement(roles) {
    const characterFirstRoles = roles.filter(r => (r.searchTerms?.character_images?.length || 0) === 6);
    const improvementFactor = characterFirstRoles.length / roles.length;
    
    let expectedMultiplier = 1;
    if (improvementFactor >= 0.8) expectedMultiplier = 3.5; // 3.5x more images expected
    else if (improvementFactor >= 0.6) expectedMultiplier = 2.8;
    else if (improvementFactor >= 0.4) expectedMultiplier = 2.2;
    else expectedMultiplier = 1.5;
    
    return {
      estimatedImageIncreaseMultiplier: expectedMultiplier,
      baselineExpectation: '5-15 images per role',
      optimizedExpectation: `${Math.round(10 * expectedMultiplier)}-${Math.round(30 * expectedMultiplier)} images per role`,
      confidenceLevel: improvementFactor >= 0.8 ? 'high' : improvementFactor >= 0.5 ? 'medium' : 'low'
    };
  }

  /**
   * ENHANCED: Handle failures with CHARACTER-FIRST fallback strategies
   */
  async handleFailure(celebrityName, originalError) {
    console.log(`🔄 Attempting CHARACTER-FIRST fallback strategies for ${celebrityName}`);

    try {
      const simplifiedRoles = await this.trySimplifiedFetch(celebrityName);
      if (simplifiedRoles && simplifiedRoles.length > 0) {
        console.log(`✅ Fallback successful with ${simplifiedRoles.length} roles`);
        
        const rolesWithCelebrity = simplifiedRoles.map(role => ({
          ...role,
          celebrity: celebrityName,
          actorName: celebrityName,
          characterProminent: this.analyzeCharacterProminence(role, celebrityName),
          searchPriority: this.calculateSearchPriority(role, celebrityName)
        }));
        
        // Apply CHARACTER-FIRST optimization to fallback roles
        const optimizedFallbackRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithCelebrity);
        const optimizationStats = this.searchOptimizer.getOptimizationStats(optimizedFallbackRoles);
        
        return this.processCharacterFirstResults(celebrityName, optimizedFallbackRoles, optimizationStats);
      }

      return this.createErrorResponse(celebrityName, originalError);

    } catch (fallbackError) {
      console.error(`❌ All CHARACTER-FIRST fallback strategies failed:`, fallbackError.message);
      return this.createErrorResponse(celebrityName, originalError);
    }
  }

  /**
   * Simplified fetch for difficult cases
   */
  async trySimplifiedFetch(celebrityName) {
    const simplifiedPrompt = `List 3-5 most famous roles for "${celebrityName}". Focus on CHARACTER names and show titles. Format: [{"character": "Character Name", "title": "Show/Movie", "medium": "type"}]`;

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
      strategy: 'character_first_failed',
      error: {
        message: error.message,
        type: 'character_first_fetch_failed'
      },
      roles: [],
      summary: {
        primaryMedium: 'unknown',
        dominantStrategy: 'none',
        mediumBreakdown: {},
        strategyBreakdown: {},
        hasVoiceRoles: false,
        hasLiveActionRoles: false,
        highProminenceRoles: 0,
        characterFirstOptimization: {
          totalCharacterFirstTerms: 0,
          expectedTerms: 0,
          characterFirstSuccessRate: 0,
          fullyOptimizedRoles: 0,
          averageSearchPriority: 0
        }
      },
      optimizationReport: {
        optimizationApproach: 'failed',
        totalSearchTermsGenerated: 0,
        characterFirstTerms: 0,
        balancedTerms: 0,
        fallbackTerms: 0,
        strategiesUsed: {},
        expectedPerformanceImprovement: {
          estimatedImageIncreaseMultiplier: 1,
          baselineExpectation: 'unknown',
          optimizedExpectation: 'manual research required',
          confidenceLevel: 'none'
        },
        roleAnalysis: []
      }
    };
  }

  /**
   * ENHANCED: Get search terms optimized for fetchImages integration
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
      
      // ENHANCED: Priority fields for CHARACTER-FIRST fetchImages.js
      finalSearchTerms: role.finalSearchTerms || [], // Highest priority - CHARACTER-FIRST terms
      searchTerms: role.searchTerms, // Contains character_images array and strategy breakdown
      characterImageTerms: role.searchTerms?.character_images || [], // Pure character terms
      balancedTerms: role.searchTerms?.balanced || [], // Character+actor terms
      
      // Metadata for intelligent processing
      searchStrategy: role.searchStrategy || 'mixed',
      characterProminent: role.characterProminent || 'low',
      searchPriority: role.searchPriority || 1,
      expectedImageVolume: role.searchMetadata?.expectedImageVolume || 20,
      
      // Flags for fetchImages logic
      focusedOnCharacterImages: (role.searchTerms?.character_images?.length || 0) === 6,
      isVoiceRole: role.medium?.includes('voice') || false,
      isHighPriority: (role.searchPriority || 0) >= 5,
      useCharacterFirstApproach: role.characterProminent !== 'low',
      
      // Legacy compatibility
      priority: role.priority
    }));
  }

  /**
   * ENHANCED: Get detailed CHARACTER-FIRST analytics
   */
  getSearchAnalytics(results) {
    if (!results.roles) return null;

    const analytics = {
      // Basic metrics
      totalRoles: results.roles.length,
      totalSearchTerms: 0,
      characterFirstTermsGenerated: 0,
      balancedTermsGenerated: 0,
      fallbackTermsUsed: 0,
      
      // CHARACTER-FIRST specific metrics
      characterFirstSuccessRate: 0,
      fullyOptimizedRoles: 0,
      highProminenceRoles: 0,
      averageSearchPriority: 0,
      expectedTotalImages: 0,
      
      // Strategy breakdown
      strategyDistribution: {},
      prominenceDistribution: {},
      mediumDistribution: {},
      
      // Performance predictions
      expectedPerformanceGain: 'unknown',
      confidenceLevel: 'unknown'
    };

    let totalPriority = 0;
    let totalExpectedImages = 0;

    results.roles.forEach(role => {
      // Count search terms
      if (role.searchTerms) {
        analytics.totalSearchTerms += role.searchTerms.all?.length || 0;
        analytics.characterFirstTermsGenerated += role.searchTerms.character_images?.length || 0;
        analytics.balancedTermsGenerated += role.searchTerms.balanced?.length || 0;
        analytics.fallbackTermsUsed += role.searchTerms.basic?.length || 0;
        
        if ((role.searchTerms.character_images?.length || 0) === 6) {
          analytics.fullyOptimizedRoles++;
        }
      }
      
      // Character prominence analysis
      if (role.characterProminent === 'high') {
        analytics.highProminenceRoles++;
      }
      
      // Strategy tracking
      const strategy = role.searchStrategy || 'unknown';
      analytics.strategyDistribution[strategy] = (analytics.strategyDistribution[strategy] || 0) + 1;
      
      // Prominence tracking
      const prominence = role.characterProminent || 'unknown';
      analytics.prominenceDistribution[prominence] = (analytics.prominenceDistribution[prominence] || 0) + 1;
      
      // Medium tracking
      const medium = role.medium || 'unknown';
      analytics.mediumDistribution[medium] = (analytics.mediumDistribution[medium] || 0) + 1;
      
      // Priority and image expectations
      totalPriority += role.searchPriority || 0;
      totalExpectedImages += role.searchMetadata?.expectedImageVolume || 20;
    });

    // Calculate rates and averages
    analytics.characterFirstSuccessRate = analytics.totalSearchTerms > 0 
      ? Math.round((analytics.characterFirstTermsGenerated / analytics.totalSearchTerms) * 100) 
      : 0;
      
    analytics.averageSearchPriority = Math.round(totalPriority / results.roles.length);
    analytics.expectedTotalImages = totalExpectedImages;
    
    // Performance predictions
    if (analytics.characterFirstSuccessRate >= 80) {
      analytics.expectedPerformanceGain = '3-4x more images';
      analytics.confidenceLevel = 'high';
    } else if (analytics.characterFirstSuccessRate >= 60) {
      analytics.expectedPerformanceGain = '2-3x more images';
      analytics.confidenceLevel = 'medium';
    } else if (analytics.characterFirstSuccessRate >= 40) {
      analytics.expectedPerformanceGain = '1.5-2x more images';
      analytics.confidenceLevel = 'medium';
    } else {
      analytics.expectedPerformanceGain = 'minimal improvement';
      analytics.confidenceLevel = 'low';
    }

    return analytics;
  }

  /**
   * ENHANCED: System health check with CHARACTER-FIRST focus
   */
  async systemHealthCheck() {
    console.log('🔍 Running CHARACTER-FIRST system health check...');
    
    const checks = {
      aiConnection: false,
      roleFetcher: false,
      searchOptimizer: false,
      characterFirstIntegration: false,
      openaiOptimization: false
    };

    try {
      // Test AI connection
      checks.aiConnection = await this.roleFetcher.testConnection();
      
      // Test role fetcher
      checks.roleFetcher = await this.testRoleFetcher();
      
      // Test CHARACTER-FIRST search optimizer
      checks.searchOptimizer = await this.searchOptimizer.testOptimizer();
      
      // Test CHARACTER-FIRST integration
      checks.characterFirstIntegration = await this.testCharacterFirstIntegration();
      
      // Test OpenAI optimization (if available)
      checks.openaiOptimization = this.searchOptimizer.hasOpenAI;

      const allPassed = Object.values(checks).every(check => check === true);
      
      console.log('CHARACTER-FIRST Health Check Results:', checks);
      console.log(allPassed ? '✅ All systems operational for CHARACTER-FIRST searches' : '⚠️ Some systems have issues');
      
      const healthReport = { 
        passed: allPassed, 
        details: checks,
        recommendations: this.generateHealthRecommendations(checks),
        expectedImageVolumeImprovement: allPassed ? '3-5x increase' : 'limited improvement'
      };
      
      return healthReport;

    } catch (error) {
      console.error('❌ CHARACTER-FIRST health check failed:', error.message);
      return { 
        passed: false, 
        details: checks, 
        error: error.message,
        recommendations: ['Fix system errors before proceeding'],
        expectedImageVolumeImprovement: 'system repair required'
      };
    }
  }

  /**
   * NEW: Generate health recommendations
   */
  generateHealthRecommendations(checks) {
    const recommendations = [];
    
    if (!checks.aiConnection) {
      recommendations.push('Check OpenAI API key and internet connection');
    }
    
    if (!checks.characterFirstIntegration) {
      recommendations.push('CHARACTER-FIRST integration failed - verify search term generation');
    }
    
    if (!checks.openaiOptimization) {
      recommendations.push('Enable OpenAI for enhanced CHARACTER-FIRST optimization');
    }
    
    if (checks.searchOptimizer && checks.characterFirstIntegration) {
      recommendations.push('System ready for high-volume CHARACTER-FIRST image searches');
    }
    
    return recommendations;
  }

  /**
   * Test CHARACTER-FIRST integration specifically
   */
  async testCharacterFirstIntegration() {
    try {
      const testRole = {
        character: "Test Character",
        title: "Test Show",
        medium: "voice_anime",
        celebrity: "Test Actor",
        actorName: "Test Actor"
      };
      
      const optimized = await this.searchOptimizer.optimizeRoleForCharacterFirst(testRole);
      const hasCharacterFirst = optimized.searchTerms?.character_images?.length === 6;
      const hasCorrectStrategy = optimized.searchStrategy === 'character_pure';
      
      if (hasCharacterFirst && hasCorrectStrategy) {
        console.log('✅ CHARACTER-FIRST integration test passed');
        return true;
      } else {
        console.log('❌ CHARACTER-FIRST integration test failed');
        console.log(`- Character-first terms: ${optimized.searchTerms?.character_images?.length || 0}/6`);
        console.log(`- Strategy: ${optimized.searchStrategy || 'none'}`);
        return false;
      }
      
    } catch (error) {
      console.error('CHARACTER-FIRST integration test failed:', error.message);
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
    console.log('🗑️ CHARACTER-FIRST cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      celebrities: Array.from(this.cache.keys()),
      cacheType: 'character_first_optimized'
    };
  }

  /**
   * NEW: Bulk process multiple celebrities with CHARACTER-FIRST approach
   */
  async bulkProcessCelebrities(celebrityNames, options = {}) {
    const { 
      maxConcurrent = 3, 
      prioritizeVoiceActors = true,
      enhanceHighPriority = true 
    } = options;
    
    console.log(`🚀 Starting bulk CHARACTER-FIRST processing for ${celebrityNames.length} celebrities`);
    
    const results = [];
    const errors = [];
    
    // Process in batches to avoid overwhelming APIs
    for (let i = 0; i < celebrityNames.length; i += maxConcurrent) {
      const batch = celebrityNames.slice(i, i + maxConcurrent);
      
      console.log(`Processing batch ${Math.floor(i/maxConcurrent) + 1}: ${batch.join(', ')}`);
      
      const batchPromises = batch.map(async (name) => {
        try {
          const result = await this.getCelebrityRoles(name);
          return { name, result, success: true };
        } catch (error) {
          return { name, error: error.message, success: false };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach(item => {
        if (item.success) {
          results.push(item.result);
        } else {
          errors.push({ celebrity: item.name, error: item.error });
        }
      });
      
      // Brief pause between batches
      if (i + maxConcurrent < celebrityNames.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const summary = this.generateBulkSummary(results, errors);
    
    console.log(`✅ Bulk processing complete: ${results.length} successful, ${errors.length} failed`);
    console.log(`📊 Estimated total images: ${summary.estimatedTotalImages}`);
    
    return {
      results,
      errors,
      summary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * NEW: Generate bulk processing summary
   */
  generateBulkSummary(results, errors) {
    let totalRoles = 0;
    let totalCharacterFirstTerms = 0;
    let totalExpectedImages = 0;
    let voiceActors = 0;
    let liveActionActors = 0;
    
    results.forEach(result => {
      totalRoles += result.totalRoles;
      totalCharacterFirstTerms += result.summary?.characterFirstOptimization?.totalCharacterFirstTerms || 0;
      totalExpectedImages += result.roles?.reduce((sum, role) => sum + (role.searchMetadata?.expectedImageVolume || 20), 0) || 0;
      
      if (result.summary?.hasVoiceRoles) voiceActors++;
      if (result.summary?.hasLiveActionRoles) liveActionActors++;
    });
    
    return {
      totalCelebrities: results.length,
      totalRoles,
      totalCharacterFirstTerms,
      estimatedTotalImages: totalExpectedImages,
      voiceActors,
      liveActionActors,
      failedProcessing: errors.length,
      characterFirstSuccessRate: totalRoles > 0 ? Math.round((totalCharacterFirstTerms / (totalRoles * 6)) * 100) : 0,
      averageImagesPerCelebrity: results.length > 0 ? Math.round(totalExpectedImages / results.length) : 0
    };
  }
}

/**
 * ENHANCED: Main execution function with CHARACTER-FIRST approach
 */
async function fetchCelebrityRoles(celebrityName) {
  const orchestrator = new CelebrityRoleOrchestrator();
  return await orchestrator.getCelebrityRoles(celebrityName);
}

/**
 * ENHANCED: Initialize CHARACTER-FIRST system
 */
async function initializeSystem() {
  console.log('🚀 Initializing CHARACTER-FIRST image search system...');
  
  const orchestrator = new CelebrityRoleOrchestrator();
  const healthCheck = await orchestrator.systemHealthCheck();
  
  if (!healthCheck.passed) {
    console.warn('⚠️ CHARACTER-FIRST system initialization completed with warnings');
    console.warn('Recommendations:', healthCheck.recommendations);
    
    if (!healthCheck.details.characterFirstIntegration) {
      console.warn('⚠️ CHARACTER-FIRST integration failed - image volume may be limited');
    }
  } else {
    console.log('✅ CHARACTER-FIRST image search system fully operational');
    console.log(`📈 Expected performance: ${healthCheck.expectedImageVolumeImprovement}`);
  }
  
  return healthCheck;
}

module.exports = { 
  fetchCelebrityRoles, 
  initializeSystem, 
  CelebrityRoleOrchestrator 
};
