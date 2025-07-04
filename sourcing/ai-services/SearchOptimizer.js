const OpenAI = require('openai');
const { PROMPTS, PROMPT_CONFIG } = require('../config/prompts.js');

class SearchOptimizer {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // NO exclusions - let AI handle all filtering
    this.exclusions = ""; // EMPTY - AI will filter everything
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI initialized for ENHANCED search optimization');
      } else {
        console.log('ℹ️ OpenAI not configured, using enhanced template generation');
      }
    } catch (error) {
      console.log('⚠️ OpenAI initialization failed, using enhanced template generation');
      this.hasOpenAI = false;
    }
  }

  /**
   * ENHANCED: Universal search term generation for all celebrity types
   */
  async optimizeSearchTerms(roles) {
    try {
      console.log(`🔍 Generating ENHANCED search terms for ${roles.length} roles`);
      
      const optimizedRoles = await Promise.all(
        roles.map(role => this.optimizeRoleForUniversalSearch(role))
      );

      console.log(`✅ ENHANCED search optimization complete`);
      return optimizedRoles;

    } catch (error) {
      console.error(`❌ Enhanced search optimization failed:`, error.message);
      return this.generateEnhancedFallbackTerms(roles);
    }
  }

  /**
   * ENHANCED: Generate search terms based on role characteristics
   */
  async optimizeRoleForUniversalSearch(role) {
    try {
      const celebrityName = this.extractCelebrityName(role);
      const searchStrategy = role.searchStrategy || this.determineSearchStrategy(role);
      
      // Generate strategy-specific terms
      let primaryTerms = [];
      let fallbackTerms = [];
      
      switch (searchStrategy) {
        case 'character_images_only':
          primaryTerms = this.generateCharacterOnlyTerms(role);
          fallbackTerms = this.generateVoiceActorFallbacks(celebrityName, role);
          break;
          
        case 'character_with_context':
          primaryTerms = this.generateContextualTerms(celebrityName, role);
          fallbackTerms = this.generateRecentContentFallbacks(celebrityName, role);
          break;
          
        case 'broad_search':
          primaryTerms = this.generateBroadSearchTerms(celebrityName, role);
          fallbackTerms = this.generateIndieActorFallbacks(celebrityName, role);
          break;
          
        case 'actor_headshots':
          primaryTerms = this.generateHeadshotTerms(celebrityName, role);
          fallbackTerms = this.generatePromotionalFallbacks(celebrityName, role);
          break;
          
        case 'promotional_photos':
          primaryTerms = this.generatePromotionalTerms(celebrityName, role);
          fallbackTerms = this.generateOfficialPhotoFallbacks(celebrityName, role);
          break;
          
        default:
          primaryTerms = this.generateCharacterFirstTerms(celebrityName, role);
          fallbackTerms = this.generateStandardFallbacks(celebrityName, role);
      }
      
      // Check for multi-actor situations
      const isMultiActorCharacter = await this.detectMultiActorCharacter(
        role.character || role.characterName || 'Unknown', 
        role.title || role.name || 'Unknown'
      );
      
      if (isMultiActorCharacter) {
        primaryTerms = this.generateActorSpecificTerms(celebrityName, role);
        role.isMultiActorCharacter = true;
        role.smartSearchApproach = 'actor_specific';
      }
      
      const allTerms = [...primaryTerms, ...fallbackTerms];
      
      return {
        ...role,
        finalSearchTerms: primaryTerms, // Main terms for fetcher
        searchTerms: {
          character_images: primaryTerms,
          balanced: fallbackTerms,
          all: allTerms
        },
        searchStrategy: searchStrategy,
        isMultiActorCharacter: isMultiActorCharacter || false,
        smartSearchApproach: isMultiActorCharacter ? 'actor_specific' : 'character_first'
      };

    } catch (error) {
      console.error(`⚠️ Enhanced optimization failed for ${role.character || role.name}, using fallback`);
      return this.createEnhancedFallbackRole(role);
    }
  }

  /**
   * ENHANCED: Generate character-only search terms (voice actors)
   */
  generateCharacterOnlyTerms(role) {
    const characterName = role.character || role.characterName || 'Unknown';
    const showTitle = role.title || role.name || 'Unknown';
    
    if (characterName === 'Unknown' || showTitle === 'Unknown') {
      return [`"anime character" HD`, `"animation character" HD`];
    }
    
    return [
      `"${characterName}"`,
      `"${characterName}" "${showTitle}"`,
      `"${characterName}" anime`,
      `"${showTitle}" "${characterName}"`,
      `"${characterName}" character`,
      `"${showTitle}" character`
    ];
  }

  /**
   * ENHANCED: Generate contextual search terms (recent/trending)
   */
  generateContextualTerms(celebrityName, role) {
    const characterName = role.character || role.characterName || 'Unknown';
    const showTitle = role.title || role.name || 'Unknown';
    
    return [
      `"${characterName}" "${showTitle}"`,
      `"${celebrityName}" "${characterName}"`,
      `"${showTitle}" "${characterName}"`,
      `"${characterName}" scene`,
      `"${celebrityName}" "${showTitle}"`,
      `"${characterName}" official`
    ];
  }

  /**
   * ENHANCED: Generate broad search terms (indie/unknown)
   */
  generateBroadSearchTerms(celebrityName, role) {
    const showTitle = role.title || role.name || 'Unknown';
    
    return [
      `"${celebrityName}" actor`,
      `"${celebrityName}" "${showTitle}"`,
      `"${celebrityName}" headshot`,
      `"${celebrityName}" photo`,
      `"${celebrityName}" promotional`,
      `"${celebrityName}" press`
    ];
  }

  /**
   * ENHANCED: Generate headshot terms (fallback)
   */
  generateHeadshotTerms(celebrityName, role) {
    return [
      `"${celebrityName}" headshot`,
      `"${celebrityName}" actor photo`,
      `"${celebrityName}" promotional photo`,
      `"${celebrityName}" press photo`,
      `"${celebrityName}" portrait`,
      `"${celebrityName}" professional photo`
    ];
  }

  /**
   * ENHANCED: Generate promotional terms
   */
  generatePromotionalTerms(celebrityName, role) {
    const showTitle = role.title || role.name || 'Unknown';
    
    return [
      `"${celebrityName}" "${showTitle}" promo`,
      `"${celebrityName}" promotional`,
      `"${celebrityName}" press photo`,
      `"${celebrityName}" "${showTitle}" press`,
      `"${celebrityName}" official photo`,
      `"${celebrityName}" publicity`
    ];
  }

  /**
   * ENHANCED: Generate character-first terms (standard)
   */
  generateCharacterFirstTerms(celebrityName, role) {
    const characterName = role.character || role.characterName || 'Unknown';
    const showTitle = role.title || role.name || 'Unknown';
    
    if (characterName === 'Unknown' || showTitle === 'Unknown') {
      return this.generateHeadshotTerms(celebrityName, role);
    }
    
    return [
      `"${characterName}" "${showTitle}"`,
      `"${characterName}"`,
      `"${showTitle}" "${characterName}"`,
      `"${celebrityName}" "${characterName}"`,
      `"${characterName}" character`,
      `"${celebrityName}" "${showTitle}"`
    ];
  }

  /**
   * ENHANCED: Smart multi-actor detection
   */
  async detectMultiActorCharacter(characterName, showTitle) {
    const character = characterName.toLowerCase();
    const title = showTitle.toLowerCase();
    
    // GUARANTEED multi-actor cases
    const definiteMultiActor = [
      { char: 'doctor', show: 'doctor who', reason: 'The Doctor has 14+ actors' },
      { char: 'bond', show: 'bond', reason: 'James Bond has 6+ actors' },
      { char: '007', show: 'bond', reason: 'James Bond has 6+ actors' },
      { char: 'batman', show: 'batman', reason: 'Batman has 8+ actors' },
      { char: 'bruce wayne', show: 'batman', reason: 'Batman has 8+ actors' },
      { char: 'spider', show: 'spider', reason: 'Spider-Man has 3+ actors' },
      { char: 'peter parker', show: 'spider', reason: 'Spider-Man has 3+ actors' },
      { char: 'sherlock', show: 'sherlock', reason: 'Sherlock has 10+ actors' },
      { char: 'superman', show: 'superman', reason: 'Superman has 6+ actors' },
      { char: 'clark kent', show: 'superman', reason: 'Superman has 6+ actors' },
      { char: 'joker', show: 'batman', reason: 'Joker has 10+ actors' },
      { char: 'wolverine', show: 'x-men', reason: 'Multiple Wolverine actors' }
    ];
    
    // Check guaranteed cases first
    for (const check of definiteMultiActor) {
      if (character.includes(check.char) && title.includes(check.show)) {
        console.log(`🎭 GUARANTEED multi-actor: ${characterName} in ${showTitle} (${check.reason})`);
        return true;
      }
    }
    
    // Safe fallback: assume single actor for cost efficiency
    console.log(`🤖 Assuming single-actor character: ${characterName} in ${showTitle}`);
    return false;
  }

  /**
   * ENHANCED: Generate actor-specific search terms for multi-actor characters
   */
  generateActorSpecificTerms(celebrityName, role) {
    const characterName = role.character || role.characterName || 'Unknown';
    const showTitle = role.title || role.name || 'Unknown';
    
    console.log(`🎯 Generating ACTOR-SPECIFIC terms for ${celebrityName} as ${characterName}`);
    
    // PRIORITY: Actor name comes FIRST to avoid other actors
    const terms = [
      `"${celebrityName}" "${showTitle}"`,
      `"${celebrityName}" "${characterName}"`,
      `"${celebrityName}" as "${characterName}"`,
      `"${celebrityName}" "${showTitle}" "${characterName}"`,
      `"${showTitle}" "${celebrityName}"`,
      `"${celebrityName}" ${showTitle.split(' ').slice(0, 2).join(' ')}`
    ];
    
    // Add specific terms for known multi-actor characters
    const specificTerms = this.generateSpecificActorTerms(celebrityName, characterName, showTitle);
    terms.push(...specificTerms);
    
    return terms;
  }

  /**
   * ENHANCED: Generate highly specific terms for known multi-actor characters
   */
  generateSpecificActorTerms(celebrityName, characterName, showTitle) {
    const character = characterName.toLowerCase();
    const title = showTitle.toLowerCase();
    const actor = celebrityName.toLowerCase();
    
    const specificTerms = [];
    
    // Doctor Who specific terms
    if (title.includes('doctor who') || character.includes('doctor')) {
      if (actor.includes('jodie whittaker')) {
        specificTerms.push('"Jodie Whittaker" "13th Doctor"');
        specificTerms.push('"Jodie Whittaker" "Thirteenth Doctor"');
      } else if (actor.includes('david tennant')) {
        specificTerms.push('"David Tennant" "10th Doctor"');
        specificTerms.push('"David Tennant" "Tenth Doctor"');
      } else if (actor.includes('matt smith')) {
        specificTerms.push('"Matt Smith" "11th Doctor"');
        specificTerms.push('"Matt Smith" "Eleventh Doctor"');
      }
    }
    
    // James Bond specific terms
    if (character.includes('bond') || character.includes('007')) {
      if (actor.includes('daniel craig')) {
        specificTerms.push('"Daniel Craig" "Bond"');
        specificTerms.push('"Daniel Craig" "007"');
      } else if (actor.includes('pierce brosnan')) {
        specificTerms.push('"Pierce Brosnan" "Bond"');
      }
    }
    
    // Batman specific terms
    if (character.includes('batman') || character.includes('bruce wayne')) {
      if (actor.includes('christian bale')) {
        specificTerms.push('"Christian Bale" "Batman"');
        specificTerms.push('"Christian Bale" "Dark Knight"');
      } else if (actor.includes('michael keaton')) {
        specificTerms.push('"Michael Keaton" "Batman"');
      }
    }
    
    return specificTerms;
  }

  /**
   * ENHANCED: Generate various fallback terms
   */
  generateVoiceActorFallbacks(celebrityName, role) {
    const characterName = role.character || role.characterName || 'Unknown';
    const showTitle = role.title || role.name || 'Unknown';
    
    return [
      `"${showTitle}" voice cast`,
      `"${characterName}" voice actor`,
      `"${celebrityName}" voice`,
      `"${showTitle}" anime`,
      `"${characterName}" anime character`,
      `"${showTitle}" characters`
    ];
  }

  generateRecentContentFallbacks(celebrityName, role) {
    const showTitle = role.title || role.name || 'Unknown';
    
    return [
      `"${celebrityName}" 2024`,
      `"${celebrityName}" recent`,
      `"${showTitle}" cast`,
      `"${celebrityName}" latest`,
      `"${showTitle}" 2024`,
      `"${celebrityName}" new`
    ];
  }

  generateIndieActorFallbacks(celebrityName, role) {
    return [
      `"${celebrityName}" indie`,
      `"${celebrityName}" film`,
      `"${celebrityName}" actor`,
      `"${celebrityName}" casting`,
      `"${celebrityName}" behind scenes`,
      `"${celebrityName}" set`
    ];
  }

  generatePromotionalFallbacks(celebrityName, role) {
    return [
      `"${celebrityName}" red carpet`,
      `"${celebrityName}" event`,
      `"${celebrityName}" interview`,
      `"${celebrityName}" premiere`,
      `"${celebrityName}" appearance`,
      `"${celebrityName}" photo shoot`
    ];
  }

  generateOfficialPhotoFallbacks(celebrityName, role) {
    return [
      `"${celebrityName}" official`,
      `"${celebrityName}" press kit`,
      `"${celebrityName}" publicity`,
      `"${celebrityName}" professional`,
      `"${celebrityName}" studio`,
      `"${celebrityName}" portrait`
    ];
  }

  generateStandardFallbacks(celebrityName, role) {
    const showTitle = role.title || role.name || 'Unknown';
    
    return [
      `"${celebrityName}" actor photo`,
      `"${celebrityName}" "${showTitle}" cast`,
      `"${celebrityName}" headshot`,
      `"${celebrityName}" promotional`,
      `"${showTitle}" behind scenes`,
      `"${celebrityName}" press photo`
    ];
  }

  /**
   * ENHANCED: Determine search strategy based on role characteristics
   */
  determineSearchStrategy(role) {
    const medium = (role.medium || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    const year = parseInt(role.year) || 0;
    const note = (role.note || '').toLowerCase();
    
    // Voice/Animation roles - pure character focus
    if (medium.includes('voice') || medium.includes('anime') || 
        medium.includes('animation') || medium.includes('cartoon')) {
      return 'character_images_only';
    }
    
    // Breakout/trending roles - character with context
    if (note.includes('breakout') || note.includes('trending') || 
        note.includes('recent') || year >= 2022) {
      return 'character_with_context';
    }
    
    // Indie/low popularity - broad search
    if (note.includes('indie') || role.popularity === 'low' || 
        note.includes('festival') || note.includes('small')) {
      return 'broad_search';
    }
    
    // Fallback indicators
    if (note.includes('fallback') || role.character === 'Research Required') {
      return 'actor_headshots';
    }
    
    // Recent content - promotional focus
    if (year >= 2020 && role.popularity !== 'low') {
      return 'promotional_photos';
    }
    
    // Standard approach
    return 'character_first';
  }

  /**
   * Extract celebrity name from role data
   */
  extractCelebrityName(role) {
    return role.actor || role.actorName || role.performer || role.celebrity || 'ACTOR_NAME';
  }

  /**
   * ENHANCED: Generate comprehensive fallback terms
   */
  generateEnhancedFallbackTerms(roles) {
    return roles.map(role => ({
      ...role,
      finalSearchTerms: this.generateBasicTerms(role),
      searchTerms: {
        character_images: this.generateBasicTerms(role),
        balanced: this.generateBasicTerms(role),
        all: this.generateBasicTerms(role)
      },
      searchStrategy: 'fallback'
    }));
  }

  /**
   * Generate basic search terms for any role
   */
  generateBasicTerms(role) {
    const celebrityName = this.extractCelebrityName(role);
    const characterName = role.character || role.characterName || 'Unknown';
    const showTitle = role.title || role.name || 'Unknown';
    
    const terms = [];
    
    if (characterName !== 'Unknown' && showTitle !== 'Unknown') {
      terms.push(`"${characterName}" "${showTitle}"`);
      terms.push(`"${characterName}"`);
      terms.push(`"${showTitle}" "${characterName}"`);
    }
    
    if (celebrityName !== 'ACTOR_NAME') {
      terms.push(`"${celebrityName}" headshot`);
      terms.push(`"${celebrityName}" actor`);
      terms.push(`"${celebrityName}" photo`);
    }
    
    return terms.length > 0 ? terms : [`"${celebrityName}" actor photo`];
  }

  /**
   * ENHANCED: Create comprehensive fallback role
   */
  createEnhancedFallbackRole(role) {
    const celebrityName = this.extractCelebrityName(role);
    const basicTerms = this.generateBasicTerms(role);
    
    return {
      ...role,
      finalSearchTerms: basicTerms,
      searchTerms: {
        character_images: basicTerms,
        balanced: basicTerms,
        all: basicTerms
      },
      searchStrategy: 'fallback',
      isMultiActorCharacter: false,
      smartSearchApproach: 'basic'
    };
  }

  /**
   * Get best search terms (prioritizes finalSearchTerms)
   */
  getBestSearchTerms(role, maxTerms = 6) {
    // Use finalSearchTerms if available (preferred)
    if (role.finalSearchTerms && role.finalSearchTerms.length > 0) {
      return role.finalSearchTerms.slice(0, maxTerms);
    }
    
    if (!role.searchTerms) {
      return this.generateBasicTerms(role).slice(0, maxTerms);
    }

    const { character_images, balanced, all } = role.searchTerms;
    
    // Prioritize character_images
    const characterTerms = character_images || [];
    const balancedTerms = balanced || [];
    const allTerms = all || [];
    
    const prioritizedTerms = [
      ...characterTerms,
      ...balancedTerms.filter(term => !characterTerms.includes(term)),
      ...allTerms.filter(term => !characterTerms.includes(term) && !balancedTerms.includes(term))
    ];
    
    return prioritizedTerms.slice(0, maxTerms);
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(roles) {
    if (!roles || !Array.isArray(roles)) return {};

    const stats = {
      totalRoles: roles.length,
      strategiesUsed: {},
      multiActorCount: 0,
      averageTermsPerRole: 0,
      enhancedOptimization: true
    };

    let totalTerms = 0;

    roles.forEach(role => {
      // Count strategies
      if (role.searchStrategy) {
        stats.strategiesUsed[role.searchStrategy] = (stats.strategiesUsed[role.searchStrategy] || 0) + 1;
      }
      
      // Count multi-actor characters
      if (role.isMultiActorCharacter) {
        stats.multiActorCount++;
      }
      
      // Count terms
      if (role.finalSearchTerms) {
        totalTerms += role.finalSearchTerms.length;
      }
    });

    stats.averageTermsPerRole = Math.round(totalTerms / roles.length);
    stats.multiActorPercentage = Math.round((stats.multiActorCount / roles.length) * 100);

    return stats;
  }

  /**
   * Test the enhanced optimizer
   */
  async testEnhancedOptimizer() {
    const testRoles = [
      {
        character: "Shoto Todoroki",
        title: "My Hero Academia", 
        medium: "voice_anime_tv",
        year: "2016",
        celebrity: "David Matranga",
        popularity: "high"
      },
      {
        character: "Recent Character",
        title: "New Show 2024",
        medium: "live_action_tv",
        year: "2024", 
        celebrity: "Unknown Actor",
        popularity: "medium",
        note: "breakout role"
      },
      {
        character: "Indie Character",
        title: "Small Film",
        medium: "live_action_movie",
        year: "2023", 
        celebrity: "Indie Actor",
        popularity: "low",
        note: "indie film"
      }
    ];

    try {
      const optimized = await Promise.all(
        testRoles.map(role => this.optimizeRoleForUniversalSearch(role))
      );
      
      console.log('Enhanced optimizer test results:');
      optimized.forEach((role, index) => {
        console.log(`${index + 1}. ${role.character} (${role.searchStrategy}):`);
        console.log(`   Primary terms: ${role.finalSearchTerms?.length || 0}`);
        console.log(`   Example: ${role.finalSearchTerms?.[0] || 'None'}`);
        console.log(`   Multi-actor: ${role.isMultiActorCharacter || false}`);
      });
      
      const success = optimized.every(role => role.finalSearchTerms?.length > 0);
      console.log(success ? '✅ Enhanced optimizer test successful' : '❌ Enhanced optimizer test failed');
      return success;
      
    } catch (error) {
      console.error('Enhanced optimizer test failed:', error.message);
      return false;
    }
  }

  /**
   * System status for enhanced optimizer
   */
  getSystemStatus() {
    return {
      openaiAPI: this.hasOpenAI,
      enhancedOptimization: true,
      universalStrategies: true,
      multiActorDetection: true,
      costOptimized: true,
      fallbackSupport: true,
      supportedStrategies: [
        'character_images_only',
        'character_with_context', 
        'broad_search',
        'actor_headshots',
        'promotional_photos',
        'character_first'
      ]
    };
  }
}

module.exports = SearchOptimizer;
