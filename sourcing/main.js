const AIRoleFetcher = require('./ai-services/AIRoleFetcher.js');
const SearchOptimizer = require('./ai-services/SearchOptimizer.js');
const SimpleRoleVerifier = require('./ai-services/SimpleRoleVerifier.js');
const RedFlagRoleDetector = require('./ai-services/RedFlagRoleDetector.js');
const { PROMPTS, PROMPT_CONFIG } = require('./config/prompts.js');

class CelebrityRoleOrchestrator {
  constructor() {
    this.roleFetcher = new AIRoleFetcher();
    this.searchOptimizer = new SearchOptimizer();
    this.roleVerifier = new SimpleRoleVerifier();
    this.redFlagDetector = new RedFlagRoleDetector();
    this.cache = new Map();
  }

  /**
   * ENHANCED: Celebrity role discovery with advanced red flag detection and recovery
   */
  async getCelebrityRoles(celebrityName) {
    try {
      console.log(`\n🎬 Starting enhanced role discovery for: ${celebrityName}`);
      
      // Check cache first
      if (this.cache.has(celebrityName)) {
        console.log(`💾 Using cached results for ${celebrityName}`);
        return this.cache.get(celebrityName);
      }

      // Step 1: AI discovers roles with universal approach
      const roles = await this.roleFetcher.fetchRoles(celebrityName);
      
      if (!roles || roles.length === 0) {
        throw new Error(`No roles found for ${celebrityName}`);
      }

      // Step 2: SIMPLIFIED character name validation (only obvious errors)
      const rolesWithValidatedNames = await this.validateCharacterNames(roles, celebrityName);

      // Step 3: Role verification (essential for accuracy)
      console.log(`🔍 Verifying ${rolesWithValidatedNames.length} discovered roles...`);
      const verifiedRoles = await this.roleVerifier.verifyRoles(celebrityName, rolesWithValidatedNames);
      
      // Step 4: ENHANCED Red flag detection for AI hallucinations
      const rejectedRoles = rolesWithValidatedNames.filter(role => 
        !verifiedRoles.some(verified => verified.character === role.character && verified.title === role.title)
      );
      
      const redFlagResult = this.redFlagDetector.detectRedFlags(celebrityName, verifiedRoles, rejectedRoles);
      
      // Step 5: ENHANCED Emergency recovery with character name extraction
      if (redFlagResult.triggerEmergency) {
        console.log(`🚨 RED FLAGS DETECTED: ${redFlagResult.redFlags.length} issues found`);
        console.log(`📊 Analysis: ${JSON.stringify(redFlagResult.analysis, null, 2)}`);
        console.log(`🌐 Triggering ENHANCED emergency web search with character extraction...`);
        
        // ENHANCED emergency web search with character name extraction
        const emergencyRoles = await this.redFlagDetector.emergencyFilmographySearch(celebrityName);
        
        if (emergencyRoles && emergencyRoles.length > 0) {
          console.log(`✅ Emergency search found ${emergencyRoles.length} roles with character names`);
          
          // ENHANCED: Re-verify emergency roles with lenient approach
          const emergencyVerifiedRoles = await this.roleVerifier.verifyRoles(celebrityName, emergencyRoles);
          
          // Merge emergency results with any verified roles
          const allVerifiedRoles = [...verifiedRoles, ...emergencyVerifiedRoles];
          
          // Remove duplicates based on title and character
          const uniqueVerifiedRoles = this.removeDuplicateRoles(allVerifiedRoles);
          
          console.log(`🎯 Emergency recovery complete: ${uniqueVerifiedRoles.length} total verified roles`);
          
          if (uniqueVerifiedRoles.length > verifiedRoles.length) {
            console.log(`✅ Emergency search recovered ${uniqueVerifiedRoles.length - verifiedRoles.length} additional roles`);
            return await this.processWithEmergencyResults(celebrityName, uniqueVerifiedRoles, redFlagResult, emergencyRoles);
          } else {
            console.log(`⚠️ Emergency search did not find additional valid roles`);
          }
        } else {
          console.log(`❌ Emergency search found no roles with character names`);
        }
      }
      
      if (verifiedRoles.length === 0) {
        throw new Error(`No valid roles found for ${celebrityName} after verification`);
      }

      if (verifiedRoles.length < rolesWithValidatedNames.length) {
        const rejectedCount = rolesWithValidatedNames.length - verifiedRoles.length;
        console.log(`❌ Rejected ${rejectedCount} invalid roles - saved ~${(rejectedCount * 0.18).toFixed(2)} in wasted searches`);
      }

      // Step 6: Add celebrity metadata and analyze roles
      const rolesWithMetadata = verifiedRoles.map(role => ({ 
        ...role,
        celebrity: celebrityName,
        actorName: celebrityName,
        characterProminent: this.analyzeCharacterProminence(role, celebrityName),
        searchPriority: this.calculateSearchPriority(role, celebrityName),
        originalDiscovery: true
      }));

      console.log(`🔍 Optimizing search terms for ${rolesWithMetadata.length} verified roles`);

      // Step 7: Generate optimized search terms
      const optimizedRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithMetadata);

      // Step 8: Add smart search strategies
      const rolesWithStrategies = await this.addSmartSearchStrategies(optimizedRoles, celebrityName);

      // Step 9: Generate final results
      const optimizationStats = this.searchOptimizer.getOptimizationStats(rolesWithStrategies);
      const finalResults = this.processOptimizedResults(celebrityName, rolesWithStrategies, optimizationStats);

      // Cache results
      this.cache.set(celebrityName, finalResults);

      console.log(`✅ Role discovery complete: ${finalResults.roles.length} optimized roles for ${celebrityName}`);
      console.log(`📊 Expected image volume: ${this.estimateImageVolume(finalResults)} images`);
      
      return finalResults;

    } catch (error) {
      console.error(`❌ Failed to get results for ${celebrityName}:`, error.message);
      return this.handleFailure(celebrityName, error);
    }
  }

  /**
   * ENHANCED: Remove duplicate roles based on title and character similarity
   */
  removeDuplicateRoles(roles) {
    const uniqueRoles = [];
    const seen = new Set();
    
    for (const role of roles) {
      const key = `${role.title.toLowerCase().trim()}_${role.character.toLowerCase().trim()}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRoles.push(role);
      } else {
        console.log(`🔄 Duplicate role removed: ${role.character} in ${role.title}`);
      }
    }
    
    return uniqueRoles;
  }

  /**
   * ENHANCED: Process results after emergency web search with character extraction
   */
  async processWithEmergencyResults(celebrityName, emergencyVerifiedRoles, redFlagResult, rawEmergencyRoles) {
    try {
      console.log(`🚨 Processing enhanced emergency results for ${celebrityName}`);
      
      // Add metadata to emergency results
      const rolesWithMetadata = emergencyVerifiedRoles.map(role => ({ 
        ...role,
        celebrity: celebrityName,
        actorName: celebrityName,
        characterProminent: this.analyzeCharacterProminence(role, celebrityName),
        searchPriority: this.calculateSearchPriority(role, celebrityName),
        emergencyRecovered: true,
        recoveryMethod: role.recoveryMethod || 'web_search_with_character_extraction'
      }));

      // Optimize search terms
      const optimizedRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithMetadata);
      const rolesWithStrategies = await this.addSmartSearchStrategies(optimizedRoles, celebrityName);
      
      // Generate results with emergency context
      const optimizationStats = this.searchOptimizer.getOptimizationStats(rolesWithStrategies);
      const finalResults = this.processOptimizedResults(celebrityName, rolesWithStrategies, optimizationStats);
      
      // Add enhanced emergency context to results
      finalResults.emergencyRecovery = {
        triggered: true,
        redFlags: redFlagResult.redFlags,
        analysis: redFlagResult.analysis,
        recoveredRoles: emergencyVerifiedRoles.length,
        emergencyMethod: 'enhanced_web_search_with_character_extraction',
        characterExtractionSuccess: rawEmergencyRoles.filter(r => r.character !== 'Character').length,
        totalEmergencyRoles: rawEmergencyRoles.length,
        verificationSuccess: emergencyVerifiedRoles.length,
        recoveryStats: {
          titlesFound: rawEmergencyRoles.length,
          charactersExtracted: rawEmergencyRoles.filter(r => r.character !== 'Character').length,
          rolesVerified: emergencyVerifiedRoles.length,
          successRate: rawEmergencyRoles.length > 0 ? (emergencyVerifiedRoles.length / rawEmergencyRoles.length * 100).toFixed(1) : 0
        }
      };
      
      // Cache results
      this.cache.set(celebrityName, finalResults);
      
      console.log(`✅ Enhanced emergency recovery complete: ${finalResults.roles.length} roles for ${celebrityName}`);
      console.log(`📊 Recovery stats: ${finalResults.emergencyRecovery.recoveryStats.successRate}% success rate`);
      
      return finalResults;
      
    } catch (error) {
      console.error(`❌ Emergency processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * SIMPLIFIED: Character name validation - only fix obvious errors
   */
  async validateCharacterNames(roles, celebrityName) {
    if (!this.roleFetcher.hasOpenAI) {
      console.log(`⚠️ OpenAI not available, skipping character name validation`);
      return roles;
    }

    try {
      console.log(`🔧 Validating character names for obvious errors...`);
      
      // Only validate if we have suspicious character names
      const suspiciousRoles = roles.filter(role => {
        const char = (role.character || '').toLowerCase();
        return char.includes('character') || char.includes('unknown') || char.includes('various') || char.length < 2;
      });

      if (suspiciousRoles.length === 0) {
        console.log(`✅ No suspicious character names found`);
        return roles;
      }

      console.log(`🔍 Validating ${suspiciousRoles.length} suspicious character names...`);

      const validationPrompt = `Fix only OBVIOUS errors in these character names for ${celebrityName}:
${suspiciousRoles.map(r => `"${r.title}" - character: "${r.character}"`).join('\n')}

ONLY fix:
- "Unknown Character" → provide actual character name if known
- "Various Characters" → provide main character name if known
- Generic terms like "Character" → actual name if obvious

KEEP original names if:
- They seem like real character names (even if unusual)
- You're uncertain about the correct name
- The name is a nickname or partial name

Format: TITLE|CORRECTED_NAME|CONFIDENCE
If no change needed: TITLE|NO_CHANGE|CONFIDENCE`;

      const validation = await this.roleFetcher.openai.chat.completions.create({
        model: "gpt-4o-mini", // Cost-efficient for simple validation
        messages: [{ role: "user", content: validationPrompt }],
        temperature: 0.1,
        max_tokens: 300
      });

      // Parse and apply only high-confidence corrections
      const corrections = validation.choices[0].message.content.split('\n');
      let correctionCount = 0;

      corrections.forEach(line => {
        if (line.includes('|')) {
          const [title, character, confidence] = line.split('|').map(s => s.trim());
          if (confidence === 'HIGH' && character !== 'NO_CHANGE') {
            const role = roles.find(r => r.title && r.title.toLowerCase().includes(title.toLowerCase()));
            if (role && role.character !== character) {
              console.log(`🔧 Fixed character name: "${role.character}" → "${character}" in ${role.title}`);
              role.character = character;
              correctionCount++;
            }
          }
        }
      });

      console.log(`✅ Applied ${correctionCount} high-confidence character name corrections`);
      return roles;

    } catch (error) {
      console.warn(`⚠️ Character name validation failed: ${error.message}`);
      return roles; // Return original roles if validation fails
    }
  }

  /**
   * Add smart search strategies for enhanced image discovery
   */
  async addSmartSearchStrategies(roles, celebrityName) {
    console.log(`🎯 Adding smart search strategies...`);
    
    const rolesWithStrategies = [];
    
    for (const role of roles) {
      try {
        // Get smart search strategy (includes multi-actor detection)
        const searchStrategy = await this.roleVerifier.getSearchStrategy(celebrityName, role);
        
        rolesWithStrategies.push({
          ...role,
          smartSearchStrategy: searchStrategy,
          finalSearchTerms: searchStrategy?.searchTerms || role.finalSearchTerms || this.searchOptimizer.getBestSearchTerms(role, 6),
          isMultiActorCharacter: searchStrategy?.reason?.includes('Multi-actor') || false,
          maxImages: searchStrategy?.maxImages || 20,
          searchApproach: searchStrategy?.reason || 'Standard search'
        });
        
        if (searchStrategy?.reason?.includes('Multi-actor')) {
          console.log(`🎭 Multi-actor strategy: ${role.character} in ${role.title}`);
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to get search strategy for ${role.character}: ${error.message}`);
        rolesWithStrategies.push(role);
      }
    }
    
    return rolesWithStrategies;
  }

  /**
   * Analyze character prominence for search optimization
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
    
    // Recent popular content
    const year = parseInt(role.year) || 0;
    if (year >= 2000 && character !== 'unknown character' && character !== 'character') {
      return 'medium';
    }
    
    // Emergency recovery roles with actual character names
    if (role.source === 'emergency_recovery' && character !== 'character' && character.length > 2) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Calculate search priority for optimization
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
    if (medium.includes('anime') || medium.includes('voice')) priority += 2;
    if (medium.includes('movie')) priority += 1;
    
    // Recent content boost
    const year = parseInt(role.year) || 0;
    if (year >= 2010) priority += 1;
    if (year >= 2020) priority += 1;
    
    // Emergency recovery boost (these are likely real)
    if (role.source === 'emergency_recovery') priority += 2;
    
    // Character name quality boost
    const character = (role.character || '').toLowerCase();
    if (character !== 'character' && character.length > 2 && !character.includes('unknown')) {
      priority += 1;
    }
    
    return priority;
  }

  /**
   * ENHANCED: Process optimized results with emergency recovery context
   */
  processOptimizedResults(celebrityName, optimizedRoles, optimizationStats) {
    return {
      celebrity: celebrityName,
      totalRoles: optimizedRoles.length,
      timestamp: new Date().toISOString(),
      source: 'enhanced_discovery_with_emergency_recovery',
      strategy: 'universal_with_verification_and_character_extraction',
      roles: optimizedRoles.map((role, index) => ({
        ...role,
        priority: index + 1,
        name: role.title, // For compatibility with fetchImages
        characterName: role.character,
        
        // Ensure search data is properly structured
        finalSearchTerms: role.finalSearchTerms || this.searchOptimizer.getBestSearchTerms(role, 6),
        isMultiActorCharacter: role.isMultiActorCharacter || false,
        smartSearchApproach: role.searchApproach || 'Standard',
        maxImages: role.maxImages || 20,
        
        imageSearchReady: true,
        searchMetadata: {
          strategy: role.searchStrategy || 'mixed',
          characterProminent: role.characterProminent,
          searchPriority: role.searchPriority,
          characterFirstTerms: role.searchTerms?.character_images?.length || 0,
          balancedTerms: role.searchTerms?.balanced?.length || 0,
          expectedImageVolume: this.estimateRoleImageVolume(role),
          isMultiActorCharacter: role.isMultiActorCharacter || false,
          smartSearchApproach: role.searchApproach || 'Standard',
          maxImages: role.maxImages || 20,
          verificationConfidence: role.verificationConfidence || 'UNKNOWN',
          emergencyRecovered: role.emergencyRecovered || false,
          recoveryMethod: role.recoveryMethod || 'normal_discovery',
          characterNameQuality: this.assessCharacterNameQuality(role.character)
        }
      })),
      summary: this.generateSummary(optimizedRoles, optimizationStats),
      optimizationReport: this.generateOptimizationReport(optimizedRoles, optimizationStats)
    };
  }

  /**
   * ENHANCED: Assess character name quality
   */
  assessCharacterNameQuality(characterName) {
    const name = (characterName || '').toLowerCase();
    
    if (name === 'character' || name === 'unknown character' || name === 'various characters') {
      return 'poor';
    }
    
    if (name.length < 3) {
      return 'poor';
    }
    
    if (name.includes('unknown') || name.includes('various')) {
      return 'poor';
    }
    
    // Check for proper names (multiple words with capitals)
    if (name.split(' ').length > 1 && name.split(' ').every(word => word.length > 1)) {
      return 'excellent';
    }
    
    if (name.length > 5) {
      return 'good';
    }
    
    return 'fair';
  }

  /**
   * Estimate image volume per role
   */
  estimateRoleImageVolume(role) {
    let baseEstimate = 20;
    
    // Character prominence multiplier
    if (role.characterProminent === 'high') baseEstimate *= 3;
    else if (role.characterProminent === 'medium') baseEstimate *= 2;
    
    // Medium multiplier
    const medium = (role.medium || '').toLowerCase();
    if (medium.includes('anime') || medium.includes('voice')) baseEstimate *= 1.5;
    if (medium.includes('movie')) baseEstimate *= 1.2;
    
    // Popularity multiplier
    if (role.popularity === 'high') baseEstimate *= 1.3;
    
    // Recent content multiplier
    const year = parseInt(role.year) || 0;
    if (year >= 2010) baseEstimate *= 1.2;
    if (year >= 2020) baseEstimate *= 1.1;
    
    // Character name quality multiplier
    const nameQuality = this.assessCharacterNameQuality(role.character);
    if (nameQuality === 'excellent') baseEstimate *= 1.4;
    else if (nameQuality === 'good') baseEstimate *= 1.2;
    else if (nameQuality === 'poor') baseEstimate *= 0.7;
    
    // Emergency recovery multiplier (these are likely real)
    if (role.source === 'emergency_recovery') baseEstimate *= 1.3;
    
    // Optimization quality multiplier
    if ((role.searchTerms?.character_images?.length || 0) === 6) baseEstimate *= 1.3;
    
    return Math.round(baseEstimate);
  }

  /**
   * Estimate total image volume
   */
  estimateImageVolume(results) {
    return results.roles.reduce((total, role) => {
      return total + (role.searchMetadata?.expectedImageVolume || 20);
    }, 0);
  }

  /**
   * ENHANCED: Generate summary with emergency recovery insights
   */
  generateSummary(optimizedRoles, optimizationStats) {
    const mediumCounts = {};
    const strategyCounts = {};
    let totalCharacterFirstTerms = 0;
    let highProminenceRoles = 0;
    let verifiedRoles = 0;
    let emergencyRecoveredRoles = 0;
    let excellentCharacterNames = 0;
    
    optimizedRoles.forEach(role => {
      mediumCounts[role.medium] = (mediumCounts[role.medium] || 0) + 1;
      
      const strategy = role.searchStrategy || 'unknown';
      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
      
      totalCharacterFirstTerms += role.searchTerms?.character_images?.length || 0;
      
      if (role.characterProminent === 'high') highProminenceRoles++;
      if (role.verificationConfidence === 'HIGH') verifiedRoles++;
      if (role.emergencyRecovered) emergencyRecoveredRoles++;
      
      const nameQuality = this.assessCharacterNameQuality(role.character);
      if (nameQuality === 'excellent') excellentCharacterNames++;
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
      verifiedRoles,
      emergencyRecoveredRoles,
      excellentCharacterNames,
      totalCharacterFirstTerms,
      optimizationSuccessRate: optimizationStats.characterFirstSuccessRate || 0,
      averageSearchPriority: Math.round(optimizedRoles.reduce((sum, r) => sum + (r.searchPriority || 0), 0) / optimizedRoles.length),
      characterNameQuality: (excellentCharacterNames / optimizedRoles.length * 100).toFixed(1) + '%',
      emergencyRecoveryRate: emergencyRecoveredRoles > 0 ? (emergencyRecoveredRoles / optimizedRoles.length * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * ENHANCED: Generate optimization report with emergency recovery details
   */
  generateOptimizationReport(optimizedRoles, optimizationStats) {
    const report = {
      optimizationApproach: 'enhanced_universal_with_character_extraction',
      totalSearchTermsGenerated: optimizationStats.characterFirstTerms + optimizationStats.balancedTerms + optimizationStats.fallbackTerms,
      characterFirstTerms: optimizationStats.characterFirstTerms,
      balancedTerms: optimizationStats.balancedTerms,
      fallbackTerms: optimizationStats.fallbackTerms,
      strategiesUsed: optimizationStats.strategies,
      verificationEnabled: true,
      multiActorDetection: optimizedRoles.some(r => r.isMultiActorCharacter),
      emergencyRecoveryEnabled: true,
      characterExtractionEnabled: true,
      expectedPerformanceImprovement: this.calculateExpectedImprovement(optimizedRoles),
      roleAnalysis: optimizedRoles.map(role => ({
        character: role.character,
        title: role.title,
        prominence: role.characterProminent,
        priority: role.searchPriority,
        strategy: role.searchStrategy,
        termsGenerated: role.searchTerms?.character_images?.length || 0,
        expectedImages: role.searchMetadata?.expectedImageVolume || 0,
        verificationConfidence: role.verificationConfidence || 'UNKNOWN',
        isMultiActor: role.isMultiActorCharacter || false,
        emergencyRecovered: role.emergencyRecovered || false,
        recoveryMethod: role.recoveryMethod || 'normal_discovery',
        characterNameQuality: this.assessCharacterNameQuality(role.character)
      })),
      qualityMetrics: {
        excellentCharacterNames: optimizedRoles.filter(r => this.assessCharacterNameQuality(r.character) === 'excellent').length,
        goodCharacterNames: optimizedRoles.filter(r => this.assessCharacterNameQuality(r.character) === 'good').length,
        poorCharacterNames: optimizedRoles.filter(r => this.assessCharacterNameQuality(r.character) === 'poor').length,
        emergencyRecoveredRoles: optimizedRoles.filter(r => r.emergencyRecovered).length,
        highConfidenceRoles: optimizedRoles.filter(r => r.verificationConfidence === 'HIGH').length
      }
    };

    return report;
  }

  /**
   * Calculate expected performance improvement
   */
  calculateExpectedImprovement(roles) {
    const characterFirstRoles = roles.filter(r => (r.searchTerms?.character_images?.length || 0) === 6);
    const verifiedRoles = roles.filter(r => r.verificationConfidence === 'HIGH');
    const excellentCharacterNames = roles.filter(r => this.assessCharacterNameQuality(r.character) === 'excellent');
    
    const improvementFactor = characterFirstRoles.length / roles.length;
    const verificationFactor = verifiedRoles.length / roles.length;
    const characterNameFactor = excellentCharacterNames.length / roles.length;
    
    let expectedMultiplier = 1;
    if (improvementFactor >= 0.8 && verificationFactor >= 0.6 && characterNameFactor >= 0.5) expectedMultiplier = 4.0;
    else if (improvementFactor >= 0.6 && verificationFactor >= 0.4 && characterNameFactor >= 0.3) expectedMultiplier = 3.2;
    else if (improvementFactor >= 0.4 && characterNameFactor >= 0.2) expectedMultiplier = 2.5;
    else expectedMultiplier = 1.8;
    
    return {
      estimatedImageIncreaseMultiplier: expectedMultiplier,
      baselineExpectation: '5-15 images per role',
      optimizedExpectation: `${Math.round(10 * expectedMultiplier)}-${Math.round(30 * expectedMultiplier)} images per role`,
      confidenceLevel: improvementFactor >= 0.8 ? 'high' : improvementFactor >= 0.5 ? 'medium' : 'low',
      verificationQuality: verificationFactor >= 0.6 ? 'high' : verificationFactor >= 0.4 ? 'medium' : 'low',
      characterNameQuality: characterNameFactor >= 0.5 ? 'excellent' : characterNameFactor >= 0.3 ? 'good' : 'fair'
    };
  }

  /**
   * STREAMLINED: Handle failures with simplified fallback
   */
  async handleFailure(celebrityName, originalError) {
    console.log(`🔄 Attempting fallback for ${celebrityName}`);

    try {
      const simplifiedRoles = await this.trySimplifiedFetch(celebrityName);
      if (simplifiedRoles && simplifiedRoles.length > 0) {
        console.log(`✅ Fallback successful with ${simplifiedRoles.length} roles`);
        
        const rolesWithMetadata = simplifiedRoles.map(role => ({
          ...role,
          celebrity: celebrityName,
          actorName: celebrityName,
          characterProminent: this.analyzeCharacterProminence(role, celebrityName),
          searchPriority: this.calculateSearchPriority(role, celebrityName),
          verificationConfidence: 'UNKNOWN',
          fallbackRole: true
        }));
        
        const optimizedRoles = await this.searchOptimizer.optimizeSearchTerms(rolesWithMetadata);
        const optimizationStats = this.searchOptimizer.getOptimizationStats(optimizedRoles);
        
        return this.processOptimizedResults(celebrityName, optimizedRoles, optimizationStats);
      }

      return this.createErrorResponse(celebrityName, originalError);

    } catch (fallbackError) {
      console.error(`❌ Fallback failed:`, fallbackError.message);
      return this.createErrorResponse(celebrityName, originalError);
    }
  }

  /**
   * Simplified fetch for difficult cases
   */
  async trySimplifiedFetch(celebrityName) {
    const simplifiedPrompt = `List 3-5 most famous roles for "${celebrityName}". Use exact character names. Format: [{"character": "Exact Character Name", "title": "Show/Movie", "medium": "type", "year": "YYYY", "popularity": "medium"}]`;

    try {
      if (this.roleFetcher.hasOpenAI) {
        const completion = await this.roleFetcher.openai.chat.completions.create({
          model: "gpt-4o-mini",
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
   * Create error response
   */
  createErrorResponse(celebrityName, error) {
    return {
      celebrity: celebrityName,
      totalRoles: 0,
      timestamp: new Date().toISOString(),
      source: 'error',
      strategy: 'failed',
      error: {
        message: error.message,
        type: 'discovery_failed'
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
        verifiedRoles: 0,
        emergencyRecoveredRoles: 0,
        excellentCharacterNames: 0,
        totalCharacterFirstTerms: 0,
        optimizationSuccessRate: 0,
        averageSearchPriority: 0,
        characterNameQuality: '0%',
        emergencyRecoveryRate: '0%'
      },
      optimizationReport: {
        optimizationApproach: 'failed',
        totalSearchTermsGenerated: 0,
        expectedPerformanceImprovement: {
          estimatedImageIncreaseMultiplier: 1,
          baselineExpectation: 'manual research required',
          optimizedExpectation: 'manual research required',
          confidenceLevel: 'none',
          verificationQuality: 'none',
          characterNameQuality: 'none'
        },
        roleAnalysis: [],
        qualityMetrics: {
          excellentCharacterNames: 0,
          goodCharacterNames: 0,
          poorCharacterNames: 0,
          emergencyRecoveredRoles: 0,
          highConfidenceRoles: 0
        }
      }
    };
  }

  /**
   * Get search terms formatted for image fetcher
   */
  getSearchTermsForImages(results) {
    if (!results.roles || results.roles.length === 0) {
      return [];
    }

    return results.roles.map(role => ({
      character: role.character,
      characterName: role.characterName || role.character,
      title: role.title,
      medium: role.medium,
      celebrity: role.celebrity,
      name: role.name || role.title,
      
      // Critical search properties
      finalSearchTerms: role.finalSearchTerms || [],
      isMultiActorCharacter: role.isMultiActorCharacter || false,
      smartSearchApproach: role.smartSearchApproach || 'Standard',
      maxImages: role.maxImages || 20,
      
      // Search term arrays
      searchTerms: role.searchTerms,
      characterImageTerms: role.searchTerms?.character_images || [],
      balancedTerms: role.searchTerms?.balanced || [],
      
      // Metadata
      searchStrategy: role.searchStrategy || 'mixed',
      characterProminent: role.characterProminent || 'low',
      searchPriority: role.searchPriority || 1,
      expectedImageVolume: role.searchMetadata?.expectedImageVolume || 20,
      verificationConfidence: role.verificationConfidence || 'UNKNOWN',
      
      // Enhanced metadata
      emergencyRecovered: role.emergencyRecovered || false,
      recoveryMethod: role.recoveryMethod || 'normal_discovery',
      characterNameQuality: role.searchMetadata?.characterNameQuality || 'fair',
      
      // Flags
      focusedOnCharacterImages: (role.searchTerms?.character_images?.length || 0) === 6,
      isVoiceRole: role.medium?.includes('voice') || false,
      isHighPriority: (role.searchPriority || 0) >= 5,
      useCharacterFirstApproach: role.characterProminent !== 'low',
      hasExcellentCharacterName: role.searchMetadata?.characterNameQuality === 'excellent',
      
      priority: role.priority
    }));
  }

  /**
   * System health check
   */
  async systemHealthCheck() {
    console.log('🔍 Running enhanced system health check...');
    
    const checks = {
      aiConnection: false,
      roleFetcher: false,
      roleVerifier: false,
      searchOptimizer: false,
      webSearch: false,
      redFlagDetector: false,
      emergencyRecovery: false
    };

    try {
      // Test AI connection
      checks.aiConnection = await this.roleFetcher.testConnection();
      
      // Test role fetcher
      checks.roleFetcher = await this.testRoleFetcher();
      
      // Test role verifier
      checks.roleVerifier = this.roleVerifier.hasOpenAI || this.roleVerifier.hasWebSearch;
      
      // Test search optimizer
      checks.searchOptimizer = await this.searchOptimizer.testEnhancedOptimizer();
      
      // Test web search
      checks.webSearch = this.roleVerifier.hasWebSearch;

      // Test red flag detector
      checks.redFlagDetector = this.redFlagDetector.hasWebSearch || this.redFlagDetector.hasOpenAI;

      // Test emergency recovery
      checks.emergencyRecovery = this.redFlagDetector.hasWebSearch;

      const allPassed = Object.values(checks).every(check => check === true);
      
      console.log('Enhanced Health Check Results:', checks);
      console.log(allPassed ? '✅ All systems operational' : '⚠️ Some systems have issues');
      
      return { 
        passed: allPassed, 
        details: checks,
        recommendations: this.generateHealthRecommendations(checks),
        expectedPerformance: allPassed ? 'Optimal with Emergency Recovery' : 'Degraded'
      };

    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return { 
        passed: false, 
        details: checks, 
        error: error.message,
        recommendations: ['Fix system errors before proceeding'],
        expectedPerformance: 'System repair required'
      };
    }
  }

  /**
   * Generate health recommendations
   */
  generateHealthRecommendations(checks) {
    const recommendations = [];
    
    if (!checks.aiConnection) {
      recommendations.push('Check OpenAI API key and internet connection');
    }
    
    if (!checks.roleVerifier) {
      recommendations.push('Enable role verification (OpenAI or web search) for accuracy');
    }
    
    if (!checks.webSearch) {
      recommendations.push('Enable web search for highest verification accuracy');
    }
    
    if (!checks.redFlagDetector) {
      recommendations.push('Enable red flag detection for hallucination protection');
    }

    if (!checks.emergencyRecovery) {
      recommendations.push('Enable emergency recovery (requires web search) for character extraction');
    }
    
    if (!checks.searchOptimizer) {
      recommendations.push('Search optimization failed - verify system configuration');
    }
    
    if (checks.webSearch && checks.roleVerifier && checks.searchOptimizer && checks.emergencyRecovery) {
      recommendations.push('System fully optimized with emergency recovery and character extraction');
    }
    
    return recommendations;
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
      celebrities: Array.from(this.cache.keys()),
      cacheType: 'enhanced_verified_roles_with_emergency_recovery'
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
 * Initialize system
 */
async function initializeSystem() {
  console.log('🚀 Initializing enhanced celebrity discovery system with emergency recovery...');
  
  const orchestrator = new CelebrityRoleOrchestrator();
  const healthCheck = await orchestrator.systemHealthCheck();
  
  if (!healthCheck.passed) {
    console.warn('⚠️ System initialization completed with warnings');
    console.warn('Recommendations:', healthCheck.recommendations);
  } else {
    console.log('✅ Enhanced celebrity discovery system fully operational');
    console.log(`📈 Expected performance: ${healthCheck.expectedPerformance}`);
  }
  
  return healthCheck;
}

module.exports = { 
  fetchCelebrityRoles, 
  initializeSystem, 
  CelebrityRoleOrchestrator 
};
