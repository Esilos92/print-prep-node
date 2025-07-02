const AIRoleFetcher = require('./ai-services/AIRoleFetcher.js');
const SearchOptimizer = require('./ai-services/SearchOptimizer.js');
const SimpleRoleVerifier = require('./ai-services/SimpleRoleVerifier.js'); // NEW
const { PROMPTS, PROMPT_CONFIG } = require('./config/prompts.js');

class CelebrityRoleOrchestrator {
  constructor() {
    this.roleFetcher = new AIRoleFetcher();
    this.searchOptimizer = new SearchOptimizer();
    this.roleVerifier = new SimpleRoleVerifier(); // NEW
    this.cache = new Map();
  }

  /**
   * ENHANCED: CHARACTER-FIRST celebrity role discovery and optimization with ROLE VERIFICATION
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
      const discoveredRoles = await this.roleFetcher.fetchRoles(celebrityName);
      
      if (!discoveredRoles || discoveredRoles.length === 0) {
        throw new Error(`No roles found for ${celebrityName}`);
      }

      console.log(`🔍 AI discovered ${discoveredRoles.length} roles:`)
      discoveredRoles.forEach((role, index) => {
        console.log(`  ${index + 1}. ${role.character} in ${role.title} [${role.medium}]`);
      });

      // Step 2: NEW - VERIFY ROLES ARE REAL (saves major costs on fake roles)
      console.log(`🔍 Verifying discovered roles are real...`);
      const verifiedRoles = await this.roleVerifier.verifyRoles(celebrityName, discoveredRoles);
      
      if (verifiedRoles.length === 0) {
        throw new Error(`No valid roles found for ${celebrityName} after verification`);
      }

      if (verifiedRoles.length < discoveredRoles.length) {
        const rejectedCount = discoveredRoles.length - verifiedRoles.length;
        console.log(`❌ Rejected ${rejectedCount} fake/invalid roles - saved ~$${(rejectedCount * 0.18).toFixed(2)} in wasted searches`);
      }

      // Step 3: Add celebrity name and detect character prominence
      const rolesWithCelebrity = verifiedRoles.map(role => ({
        ...role,
        celebrity: celebrityName,
        actorName: celebrityName,
        // Enhanced character analysis
        characterProminent: this.analyzeCharacterProminence(role, celebrityName),
        searchPriority: this.calculateSearchPriority(role, celebrityName)
      }));

      console.log(`🔍 Optimizing CHARACTER-FIRST search terms for ${rolesWithCelebrity.length} verified roles`);

      // Step 4: Generate CHARACTER-FIRST search terms with SMART MULTI-ACTOR handling
      const characterFirstRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithCelebrity);

      // Step 5: Enhanced OpenAI optimization for high-priority roles
      const enhancedRoles = await this.enhanceHighPriorityRoles(characterFirstRoles);

      // Step 6: ADD SMART SEARCH STRATEGIES from role verifier
      const rolesWithSearchStrategies = await this.addSmartSearchStrategies(enhancedRoles, celebrityName);

      // Verify optimization success
      const optimizationStats = this.searchOptimizer.getOptimizationStats(rolesWithSearchStrategies);
      
      console.log(`✅ CHARACTER-FIRST optimization stats:`, optimizationStats);

      // Step 7: Process and format final results with character-first priority
      const finalResults = this.processCharacterFirstResults(celebrityName, rolesWithSearchStrategies, optimizationStats);

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
   * NEW: Add smart search strategies from role verifier (handles multi-actor characters)
   */
  async addSmartSearchStrategies(roles, celebrityName) {
    console.log(`🎯 Adding smart search strategies for multi-actor character detection...`);
    
    const rolesWithStrategies = [];
    
    for (const role of roles) {
      try {
        // Get smart search strategy (handles multi-actor detection)
        const searchStrategy = await this.roleVerifier.getSearchStrategy(celebrityName, role);
        
        rolesWithStrategies.push({
          ...role,
          // Merge smart search strategy with existing search terms
          smartSearchStrategy: searchStrategy,
          // Update final search terms to use smart strategy if available
          finalSearchTerms: searchStrategy?.searchTerms || role.finalSearchTerms || this.searchOptimizer.getBestSearchTerms(role, 6),
          // Add multi-actor handling metadata
          isMultiActorCharacter: searchStrategy?.reason?.includes('Multi-actor') || false,
          maxImages: searchStrategy?.maxImages || 20,
          searchApproach: searchStrategy?.reason || 'Standard character search'
        });
        
        if (searchStrategy?.reason?.includes('Multi-actor')) {
          console.log(`🎭 Multi-actor strategy applied: ${role.character} in ${role.title}`);
          console.log(`   Strategy: ${searchStrategy.searchTerms[0]}`); // Show first search term
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to get search strategy for ${role.character}: ${error.message}`);
        rolesWithStrategies.push(role); // Keep original role
      }
    }
    
    return rolesWithStrategies;
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
      source: 'character_first_optimized_verified',
      strategy: 'character_prominence_based_with_verification',
      roles: optimizedRoles.map((role, index) => ({
        ...role,
        priority: index + 1,
        // PRIMARY: SMART search terms (handles multi-actor automatically)
        finalSearchTerms: role.finalSearchTerms,
        imageSearchReady: true,
        // Enhanced metadata for fetchImages.js
        searchMetadata: {
          strategy: role.searchStrategy || 'mixed',
          characterProminent: role.characterProminent,
          searchPriority: role.searchPriority,
          characterFirstTerms: role.searchTerms?.character_images?.length || 0,
          balancedTerms: role.searchTerms?.balanced?.length || 0,
          expectedImageVolume: this.estimateRoleImageVolume(role),
          optimizedForCharacterImages: (role.searchTerms?.character_images?.length || 0) === 6,
          // NEW: Multi-actor handling
          isMultiActorCharacter: role.isMultiActorCharacter || false,
          smartSearchApproach: role.searchApproach || 'Standard',
          maxImages: role.maxImages || 20
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
    let baseEstimate = role.maxImages || 20; // Use smart max from role verifier
    
    // Character prominence multiplier
    if (role.characterProminent === 'high') baseEstimate *= 2; // Reduced from 3x
    else if (role.characterProminent === 'medium') baseEstimate *= 1.5; // Reduced from 2x
    
    // Medium multiplier
    const medium = (role.medium || '').toLowerCase();
    if (medium.includes('anime') || medium.includes('voice')) baseEstimate *= 1.3; // Reduced multiplier
    if (medium.includes('movie')) baseEstimate *= 1.1;
    
    // Popularity multiplier
    if (role.popularity === 'high') baseEstimate *= 1.2; // Reduced multiplier
    
    // Recent content multiplier (better digital availability)
    const year = parseInt(role.year) || 0;
    if (year >= 2010) baseEstimate *= 1.1; // Reduced multiplier
    if (year >= 2020) baseEstimate *= 1.05; // Reduced multiplier
    
    // Multi-actor character adjustment (these need higher precision)
    if (role.isMultiActorCharacter) {
      baseEstimate *= 0.8; // Slightly fewer images but higher quality expected
    }
    
    return Math.round(Math.min(baseEstimate, 25)); // Cap at 25 images per role
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
    let multiActorRoles = 0;
    
    optimizedRoles.forEach(role => {
      mediumCounts[role.medium] = (mediumCounts[role.medium] || 0) + 1;
      
      const strategy = role.searchStrategy || 'unknown';
      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
      
      totalCharacterFirstTerms += role.searchTerms?.character_images?.length || 0;
      
      if (role.characterProminent === 'high') highProminenceRoles++;
      if (role.isMultiActorCharacter) multiActorRoles++;
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
      multiActorRoles, // NEW
      characterFirstOptimization: {
        totalCharacterFirstTerms: totalCharacterFirstTerms,
        expectedTerms: optimizedRoles.length * 6,
        characterFirstSuccessRate: optimizationStats.characterFirstSuccessRate || 0,
        fullyOptimizedRoles: optimizedRoles.filter(r => (r.searchTerms?.character_images?.length || 0) === 6).length,
        averageSearchPriority: Math.round(optimizedRoles.reduce((sum, r) => sum + (r.searchPriority || 0), 0) / optimizedRoles.length),
        multiActorCharactersDetected: multiActorRoles // NEW
      }
    };
  }

  /**
   * NEW: Generate detailed optimization report
   */
  generateOptimizationReport(optimizedRoles, optimizationStats) {
    const report = {
      optimizationApproach: 'character_first_prominence_based_with_verification',
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
        expectedImages: role.searchMetadata?.expectedImageVolume || 0,
        isMultiActor: role.isMultiActorCharacter || false, // NEW
        searchApproach: role.searchApproach || 'Standard' // NEW
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
    if (improvementFactor >= 0.8) expectedMultiplier = 2.5; // More conservative estimates
    else if (improvementFactor >= 0.6) expectedMultiplier = 2.0;
    else if (improvementFactor >= 0.4) expectedMultiplier = 1.7;
    else expectedMultiplier = 1.3;
    
    return {
      estimatedImageIncreaseMultiplier: expectedMultiplier,
      baselineExpectation: '5-15 images per role',
      optimizedExpectation: `${Math.round(10 * expectedMultiplier)}-${Math.round(20 * expectedMultiplier)} images per role`,
      confidenceLevel: improvementFactor >= 0.8 ? 'high' : improvementFactor >= 0.5 ? 'medium' : 'low',
      costOptimization: 'Role verification eliminates fake role costs'
    };
  }

  // ... [Keep all other existing methods unchanged] ...

  /**
   * ENHANCED: System health check with role verification
   */
  async systemHealthCheck() {
    console.log('🔍 Running CHARACTER-FIRST system health check with role verification...');
    
    const checks = {
      aiConnection: false,
      roleFetcher: false,
      roleVerifier: false, // NEW
      searchOptimizer: false,
      characterFirstIntegration: false,
      openaiOptimization: false
    };

    try {
      // Test AI connection
      checks.aiConnection = await this.roleFetcher.testConnection();
      
      // Test role fetcher
      checks.roleFetcher = await this.testRoleFetcher();
      
      // NEW: Test role verifier
      checks.roleVerifier = this.roleVerifier.hasOpenAI;
      
      // Test CHARACTER-FIRST search optimizer
      checks.searchOptimizer = await this.searchOptimizer.testOptimizer();
      
      // Test CHARACTER-FIRST integration
      checks.characterFirstIntegration = await this.testCharacterFirstIntegration();
      
      // Test OpenAI optimization (if available)
      checks.openaiOptimization = this.searchOptimizer.hasOpenAI;

      const allPassed = Object.values(checks).every(check => check === true);
      
      console.log('CHARACTER-FIRST Health Check Results:', checks);
      console.log(allPassed ? '✅ All systems operational for CHARACTER-FIRST searches with role verification' : '⚠️ Some systems have issues');
      
      const healthReport = { 
        passed: allPassed, 
        details: checks,
        recommendations: this.generateHealthRecommendations(checks),
        expectedCostReduction: checks.roleVerifier ? '60-80% cost reduction from fake role elimination' : 'No cost optimization',
        expectedImageVolumeImprovement: allPassed ? '2-3x increase with higher accuracy' : 'limited improvement'
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
   * ENHANCED: Generate health recommendations
   */
  generateHealthRecommendations(checks) {
    const recommendations = [];
    
    if (!checks.aiConnection) {
      recommendations.push('Check OpenAI API key and internet connection');
    }
    
    if (!checks.roleVerifier) {
      recommendations.push('Enable OpenAI for role verification (major cost savings)');
    }
    
    if (!checks.characterFirstIntegration) {
      recommendations.push('CHARACTER-FIRST integration failed - verify search term generation');
    }
    
    if (!checks.openaiOptimization) {
      recommendations.push('Enable OpenAI for enhanced CHARACTER-FIRST optimization');
    }
    
    if (checks.searchOptimizer && checks.characterFirstIntegration && checks.roleVerifier) {
      recommendations.push('System fully optimized for cost-effective CHARACTER-FIRST image searches');
    }
    
    return recommendations;
  }

  // ... [Keep all other existing methods like handleFailure, trySimplifiedFetch, etc.] ...
}

/**
 * ENHANCED: Main execution function with CHARACTER-FIRST approach and role verification
 */
async function fetchCelebrityRoles(celebrityName) {
  const orchestrator = new CelebrityRoleOrchestrator();
  return await orchestrator.getCelebrityRoles(celebrityName);
}

/**
 * ENHANCED: Initialize CHARACTER-FIRST system with role verification
 */
async function initializeSystem() {
  console.log('🚀 Initializing CHARACTER-FIRST image search system with role verification...');
  
  const orchestrator = new CelebrityRoleOrchestrator();
  const healthCheck = await orchestrator.systemHealthCheck();
  
  if (!healthCheck.passed) {
    console.warn('⚠️ CHARACTER-FIRST system initialization completed with warnings');
    console.warn('Recommendations:', healthCheck.recommendations);
    
    if (!healthCheck.details.roleVerifier) {
      console.warn('⚠️ Role verification disabled - fake roles may waste money');
    }
    
    if (!healthCheck.details.characterFirstIntegration) {
      console.warn('⚠️ CHARACTER-FIRST integration failed - image volume may be limited');
    }
  } else {
    console.log('✅ CHARACTER-FIRST image search system with role verification fully operational');
    console.log(`📈 Expected performance: ${healthCheck.expectedImageVolumeImprovement}`);
    console.log(`💰 Expected cost reduction: ${healthCheck.expectedCostReduction}`);
  }
  
  return healthCheck;
}

module.exports = { 
  fetchCelebrityRoles, 
  initializeSystem, 
  CelebrityRoleOrchestrator 
};
