const OpenAI = require('openai');
const { PROMPTS, PROMPT_CONFIG } = require('../config/prompts.js');

class SearchOptimizer {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // MINIMAL exclusions - only obvious junk
    this.exclusions = "-funko -toy -figure -collectible -merchandise -convention -comic-con -autograph -signed -auction -ebay -framed -render -fanart -deviantart -vs -versus -meme -watermark";
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI initialized for CHARACTER-FIRST search optimization');
      } else {
        console.log('ℹ️ OpenAI not configured, using character-first template');
      }
    } catch (error) {
      console.log('⚠️ OpenAI initialization failed, using character-first template');
      this.hasOpenAI = false;
    }
  }

  /**
   * ENHANCED: CHARACTER-FIRST search term generation
   */
  async optimizeSearchTerms(roles) {
    try {
      console.log(`🔍 Generating CHARACTER-FIRST search terms for ${roles.length} roles`);
      
      const optimizedRoles = await Promise.all(
        roles.map(role => this.optimizeRoleForCharacterFirst(role))
      );

      console.log(`✅ CHARACTER-FIRST search optimization complete`);
      return optimizedRoles;

    } catch (error) {
      console.error(`❌ Search optimization failed:`, error.message);
      return this.generateFallbackTerms(roles);
    }
  }

  /**
   * ENHANCED: Generate CHARACTER-FIRST search terms for any role type
   */
  async optimizeRoleForCharacterFirst(role) {
    try {
      const celebrityName = this.extractCelebrityName(role);
      
      // Determine search strategy based on role type
      const searchStrategy = this.determineSearchStrategy(role);
      
      const characterFirstTerms = this.generateCharacterFirstTerms(
        celebrityName,
        role.character, 
        role.title, 
        role.medium,
        searchStrategy
      );
      
      const balancedTerms = this.generateBalancedTerms(role, searchStrategy);
      const fallbackTerms = this.generateFallbackTerms([role])[0]?.searchTerms?.basic || [];

      return {
        ...role,
        searchTerms: {
          character_images: characterFirstTerms,     // Primary: CHARACTER-FIRST
          ai: characterFirstTerms,                   // Unified AI field
          balanced: balancedTerms,                   // Balanced character+actor
          basic: fallbackTerms,                      // Fallback
          all: [...characterFirstTerms, ...balancedTerms, ...fallbackTerms]
        },
        searchStrategy: searchStrategy
      };

    } catch (error) {
      console.error(`⚠️ CHARACTER-FIRST optimization failed for ${role.character}, using fallback`);
      return {
        ...role,
        searchTerms: {
          character_images: [],
          ai: [],
          balanced: this.generateBalancedTerms(role, 'mixed'),
          basic: this.generateFallbackTerms([role])[0]?.searchTerms?.basic || [],
          all: []
        }
      };
    }
  }

  /**
   * NEW: Determine optimal search strategy for role
   */
  determineSearchStrategy(role) {
    const medium = (role.medium || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    
    // Voice/Animation roles - pure character focus
    if (medium.includes('voice') || medium.includes('anime') || 
        medium.includes('animation') || medium.includes('cartoon')) {
      return 'character_pure';
    }
    
    // Iconic characters (like Captain Kirk) - character-first even for live action
    const iconicIndicators = ['star trek', 'star wars', 'marvel', 'dc comics', 'batman', 'superman', 'spider-man'];
    if (iconicIndicators.some(indicator => title.includes(indicator))) {
      return 'character_iconic';
    }
    
    // Recent/popular live action - character-first with actor support
    const year = parseInt(role.year) || 0;
    if (year >= 2000) {
      return 'character_modern';
    }
    
    // Older live action - balanced approach
    return 'balanced_classic';
  }

  /**
   * ENHANCED: Generate CHARACTER-FIRST search terms (6 terms)
   */
  generateCharacterFirstTerms(celebrityName, character, title, medium, strategy) {
    const exclusions = this.exclusions;
    const characterName = character || 'Unknown Character';
    const showTitle = title || 'Unknown Title';
    
    let terms = [];
    
    switch (strategy) {
      case 'character_pure':
        // PURE character focus for voice/animation - NO actor name pollution
        terms = [
          `"${characterName}" "${showTitle}" character scene ${exclusions}`,
          `"${characterName}" "${showTitle}" episode screenshot ${exclusions}`,
          `"${characterName}" character "${showTitle}" official ${exclusions}`,
          `"${showTitle}" "${characterName}" anime scene ${exclusions}`,
          `"${characterName}" "${showTitle}" character image ${exclusions}`,
          `"${showTitle}" "${characterName}" official art ${exclusions}`
        ];
        break;
        
      case 'character_iconic':
        // Character-first for iconic roles (Captain Kirk > William Shatner)
        terms = [
          `"${characterName}" "${showTitle}" character scene ${exclusions}`,
          `"${characterName}" "${showTitle}" movie scene ${exclusions}`,
          `"${showTitle}" "${characterName}" character ${exclusions}`,
          `"${characterName}" character "${showTitle}" scene ${exclusions}`,
          `"${characterName}" "${showTitle}" official image ${exclusions}`,
          `"${celebrityName}" "${characterName}" "${showTitle}" scene ${exclusions}` // Actor last
        ];
        break;
        
      case 'character_modern':
        // Character-first with modern production values
        terms = [
          `"${characterName}" "${showTitle}" character HD ${exclusions}`,
          `"${characterName}" "${showTitle}" scene still ${exclusions}`,
          `"${showTitle}" "${characterName}" character ${exclusions}`,
          `"${characterName}" "${showTitle}" promotional ${exclusions}`,
          `"${celebrityName}" "${characterName}" "${showTitle}" ${exclusions}`,
          `"${characterName}" character "${showTitle}" image ${exclusions}`
        ];
        break;
        
      case 'balanced_classic':
        // Balanced approach for older content
        terms = [
          `"${characterName}" "${showTitle}" character ${exclusions}`,
          `"${celebrityName}" "${characterName}" "${showTitle}" ${exclusions}`,
          `"${showTitle}" "${characterName}" scene ${exclusions}`,
          `"${characterName}" "${showTitle}" movie ${exclusions}`,
          `"${celebrityName}" "${showTitle}" character ${exclusions}`,
          `"${characterName}" character "${showTitle}" ${exclusions}`
        ];
        break;
        
      default:
        // Fallback mixed approach
        terms = [
          `"${characterName}" "${showTitle}" character ${exclusions}`,
          `"${characterName}" "${showTitle}" scene ${exclusions}`,
          `"${showTitle}" "${characterName}" ${exclusions}`,
          `"${celebrityName}" "${characterName}" ${exclusions}`,
          `"${characterName}" character image ${exclusions}`,
          `"${showTitle}" character scene ${exclusions}`
        ];
    }
    
    return terms.filter(term => term.length > 20); // Filter out malformed terms
  }

  /**
   * NEW: Generate balanced character+actor terms (3 terms)
   */
  generateBalancedTerms(role, strategy) {
    const celebrityName = this.extractCelebrityName(role);
    const characterName = role.character || 'Unknown Character';
    const showTitle = role.title || 'Unknown Title';
    const exclusions = this.exclusions;
    
    if (strategy === 'character_pure') {
      // For pure character roles, still focus on character but allow some actor context
      return [
        `"${showTitle}" voice cast "${characterName}" ${exclusions}`,
        `"${characterName}" voice actor "${showTitle}" ${exclusions}`,
        `"${celebrityName}" voices "${characterName}" ${exclusions}`
      ];
    }
    
    // Standard balanced terms
    return [
      `"${celebrityName}" "${characterName}" "${showTitle}" scene ${exclusions}`,
      `"${celebrityName}" as "${characterName}" "${showTitle}" ${exclusions}`,
      `"${showTitle}" cast "${celebrityName}" "${characterName}" ${exclusions}`
    ];
  }

  /**
   * ENHANCED: Generate medium-specific optimization
   */
  generateMediumSpecificTerms(role) {
    const { character, title, medium } = role;
    const terms = [];
    const exclusions = this.exclusions;
    const characterName = character || 'Unknown Character';
    const showTitle = title || 'Unknown Title';

    switch (medium) {
      case 'live_action_movie':
        terms.push(`"${characterName}" "${showTitle}" movie scene HD ${exclusions}`);
        terms.push(`"${showTitle}" "${characterName}" film scene ${exclusions}`);
        terms.push(`"${characterName}" character "${showTitle}" movie ${exclusions}`);
        break;

      case 'live_action_tv':
        terms.push(`"${characterName}" "${showTitle}" tv series scene ${exclusions}`);
        terms.push(`"${showTitle}" "${characterName}" episode scene ${exclusions}`);
        terms.push(`"${characterName}" character "${showTitle}" series ${exclusions}`);
        break;

      case 'voice_anime':
      case 'animation_tv':
      case 'animation_movie':
        terms.push(`"${characterName}" "${showTitle}" anime character ${exclusions}`);
        terms.push(`"${showTitle}" "${characterName}" anime scene ${exclusions}`);
        terms.push(`"${characterName}" character "${showTitle}" anime ${exclusions}`);
        break;

      case 'voice_cartoon':
      case 'voice_movie':
        terms.push(`"${characterName}" "${showTitle}" cartoon character ${exclusions}`);
        terms.push(`"${showTitle}" "${characterName}" animated scene ${exclusions}`);
        terms.push(`"${characterName}" character "${showTitle}" animation ${exclusions}`);
        break;

      case 'voice_game':
        terms.push(`"${characterName}" "${showTitle}" game character ${exclusions}`);
        terms.push(`"${showTitle}" "${characterName}" video game ${exclusions}`);
        terms.push(`"${characterName}" character "${showTitle}" game ${exclusions}`);
        break;

      default:
        terms.push(`"${characterName}" "${showTitle}" character scene ${exclusions}`);
        terms.push(`"${showTitle}" "${characterName}" scene ${exclusions}`);
        terms.push(`"${characterName}" character "${showTitle}" ${exclusions}`);
        break;
    }

    return terms.filter(Boolean);
  }

  /**
   * Extract celebrity name from role data
   */
  extractCelebrityName(role) {
    return role.actor || role.actorName || role.performer || role.celebrity || 'ACTOR_NAME';
  }

  /**
   * ENHANCED: Generate fallback terms with CHARACTER-FIRST approach
   */
  generateFallbackTerms(roles) {
    return roles.map(role => ({
      ...role,
      searchTerms: {
        character_images: [],
        ai: [],
        balanced: this.generateBalancedTerms(role, 'mixed'),
        basic: this.generateBasicCharacterTerms(role),
        all: [...this.generateBasicCharacterTerms(role)]
      }
    }));
  }

  /**
   * Generate basic character-focused terms
   */
  generateBasicCharacterTerms(role) {
    const terms = [];
    const exclusions = this.exclusions;
    const characterName = role.character || 'Unknown Character';
    const showTitle = role.title || 'Unknown Title';

    if (characterName !== 'Unknown Character' && showTitle !== 'Unknown Title') {
      terms.push(`"${characterName}" "${showTitle}" character ${exclusions}`);
      terms.push(`"${characterName}" "${showTitle}" scene ${exclusions}`);
      terms.push(`"${showTitle}" "${characterName}" ${exclusions}`);
    }

    if (characterName !== 'Unknown Character') {
      terms.push(`"${characterName}" character image ${exclusions}`);
    }

    if (showTitle !== 'Unknown Title') {
      terms.push(`"${showTitle}" character scene ${exclusions}`);
    }

    return terms.filter(term => term.length > 10);
  }

  /**
   * Get best search terms (prioritizes CHARACTER-FIRST)
   */
  getBestSearchTerms(role, maxTerms = 6) {
    if (!role.searchTerms) {
      const basic = this.generateBasicCharacterTerms(role);
      const mediumSpecific = this.generateMediumSpecificTerms(role);
      return [...basic, ...mediumSpecific].slice(0, maxTerms);
    }

    const { character_images, ai, balanced, basic } = role.searchTerms;
    
    // PRIORITIZE CHARACTER-FIRST terms
    const characterFirstTerms = character_images || ai || [];
    const balancedTerms = balanced || [];
    const basicTerms = (basic || []).slice(0, 2); // Limit fallback terms
    
    const prioritizedTerms = [
      ...characterFirstTerms,      // CHARACTER-FIRST (highest priority)
      ...balancedTerms.slice(0, 2), // Some balanced terms
      ...basicTerms                 // Fallback terms
    ];
    
    const uniqueTerms = [...new Set(prioritizedTerms)];
    return uniqueTerms.slice(0, maxTerms);
  }

  /**
   * ENHANCED: OpenAI-powered CHARACTER-FIRST optimization (if available)
   */
  async enhanceWithOpenAI(role) {
    if (!this.hasOpenAI) return role;

    try {
      const characterName = role.character || 'Unknown Character';
      const showTitle = role.title || 'Unknown Title';
      const celebrityName = this.extractCelebrityName(role);
      const medium = role.medium || 'unknown';

      const prompt = `Generate 6 CHARACTER-FIRST image search terms for finding images of "${characterName}" from "${showTitle}".

STRATEGY: Prioritize character name over actor name "${celebrityName}" to get more character-focused results.

REQUIREMENTS:
- Focus on "${characterName}" as the primary search element
- Include "${showTitle}" for context
- Use terms like "character", "scene", "screenshot", "episode" for better targeting
- ${medium.includes('voice') || medium.includes('anime') ? 'AVOID actor name pollution - pure character focus' : 'Character-first but actor support OK'}
- Include exclusions: ${this.exclusions}

Return exactly 6 search terms as JSON array:
["term1", "term2", "term3", "term4", "term5", "term6"]`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at generating CHARACTER-FIRST image search terms that prioritize character names over actor names for better image targeting."
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 400
      });

      const response = completion.choices[0].message.content;
      const enhancedTerms = this.parseJSONResponse(response);
      
      if (Array.isArray(enhancedTerms) && enhancedTerms.length === 6) {
        console.log(`🎯 OpenAI enhanced CHARACTER-FIRST terms for ${characterName}`);
        
        return {
          ...role,
          searchTerms: {
            ...role.searchTerms,
            character_images: enhancedTerms,
            ai: enhancedTerms,
            openai_enhanced: true
          }
        };
      }
      
    } catch (error) {
      console.log(`⚠️ OpenAI enhancement failed for ${role.character}: ${error.message}`);
    }
    
    return role;
  }

  /**
   * Test the CHARACTER-FIRST optimizer
   */
  async testOptimizer() {
    const testRoles = [
      {
        character: "Shoto Todoroki",
        title: "My Hero Academia", 
        medium: "voice_anime",
        year: "2016",
        celebrity: "David Matranga",
        actorName: "David Matranga"
      },
      {
        character: "Captain Kirk",
        title: "Star Trek",
        medium: "live_action_tv",
        year: "1966", 
        celebrity: "William Shatner",
        actorName: "William Shatner"
      }
    ];

    try {
      const optimized = await Promise.all(
        testRoles.map(role => this.optimizeRoleForCharacterFirst(role))
      );
      
      console.log('CHARACTER-FIRST optimizer test results:');
      optimized.forEach((role, index) => {
        console.log(`${index + 1}. ${role.character} (${role.searchStrategy}):`);
        console.log(`   Character-first terms: ${role.searchTerms?.character_images?.length || 0}`);
        console.log(`   Example: ${role.searchTerms?.character_images?.[0] || 'None'}`);
      });
      
      const success = optimized.every(role => role.searchTerms?.character_images?.length === 6);
      console.log(success ? '✅ CHARACTER-FIRST test successful' : '❌ CHARACTER-FIRST test failed');
      return success;
      
    } catch (error) {
      console.error('CHARACTER-FIRST optimizer test failed:', error.message);
      return false;
    }
  }

  /**
   * NEW: Parse JSON response handling markdown code blocks
   */
  parseJSONResponse(response) {
    try {
      // First try direct JSON parsing
      return JSON.parse(response);
    } catch (error) {
      try {
        // Try extracting from markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          return JSON.parse(jsonMatch[1]);
        }
        
        // Try extracting any array pattern
        const arrayMatch = response.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          return JSON.parse(arrayMatch[0]);
        }
        
        throw new Error('No valid JSON found');
      } catch (parseError) {
        console.log(`JSON parsing failed for response: ${response.substring(0, 200)}...`);
        return null;
      }
    }
  }
  getOptimizationStats(roles) {
    if (!roles || !Array.isArray(roles)) return {};

    const stats = {
      totalRoles: roles.length,
      characterFirstTerms: 0,
      balancedTerms: 0,
      fallbackTerms: 0,
      strategies: {}
    };

    roles.forEach(role => {
      if (role.searchTerms) {
        stats.characterFirstTerms += role.searchTerms.character_images?.length || 0;
        stats.balancedTerms += role.searchTerms.balanced?.length || 0;
        stats.fallbackTerms += role.searchTerms.basic?.length || 0;
      }
      
      if (role.searchStrategy) {
        stats.strategies[role.searchStrategy] = (stats.strategies[role.searchStrategy] || 0) + 1;
      }
    });

    stats.characterFirstSuccessRate = Math.round((stats.characterFirstTerms / (roles.length * 6)) * 100);

    return stats;
  }
}

module.exports = SearchOptimizer;
