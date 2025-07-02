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
   * ENHANCED: Generate SMART CHARACTER-FIRST search terms with multi-actor awareness
   */
  generateCharacterFirstTerms(celebrityName, character, title, medium, strategy) {
    const characterName = character || 'Unknown Character';
    const showTitle = title || 'Unknown Title';
    
    // CRITICAL: Check if this is a multi-actor character role
    const isMultiActorCharacter = await this.detectMultiActorCharacter(characterName, showTitle);
    
    let terms = [];
    
    if (isMultiActorCharacter) {
      // ACTOR-SPECIFIC searches for multi-actor characters
      terms = this.generateActorSpecificTerms(celebrityName, characterName, showTitle, strategy);
    } else {
      // Standard character-first approach for single-actor characters
      switch (strategy) {
        case 'character_pure':
          // CLEAN character focus for voice/animation - like manual search
          terms = [
            `"${characterName}"`,
            `"${characterName}" "${showTitle}"`,
            `"${characterName}" ${showTitle.split(' ').slice(0, 2).join(' ')}`,
            `"${showTitle}" "${characterName}"`,
            `"${characterName}" anime`,
            `"${showTitle}" character`
          ];
          break;
          
        case 'character_iconic':
          // Clean character-first for iconic roles
          terms = [
            `"${characterName}"`,
            `"${characterName}" "${showTitle}"`,
            `"${showTitle}" "${characterName}"`,
            `"${characterName}" character`,
            `"${characterName}" official`,
            `"${celebrityName}" "${characterName}"`
          ];
          break;
          
        case 'character_modern':
          // Clean character-first for modern content
          terms = [
            `"${characterName}" "${showTitle}"`,
            `"${characterName}" HD`,
            `"${showTitle}" "${characterName}"`,
            `"${characterName}" character`,
            `"${celebrityName}" "${characterName}"`,
            `"${characterName}" official`
          ];
          break;
          
        case 'balanced_classic':
          // Clean balanced approach
          terms = [
            `"${characterName}" "${showTitle}"`,
            `"${celebrityName}" "${characterName}"`,
            `"${showTitle}" "${characterName}"`,
            `"${characterName}" character`,
            `"${celebrityName}" "${showTitle}"`,
            `"${characterName}"`
          ];
          break;
          
        default:
          // Clean fallback
          terms = [
            `"${characterName}" "${showTitle}"`,
            `"${characterName}"`,
            `"${showTitle}" "${characterName}"`,
            `"${celebrityName}" "${characterName}"`,
            `"${characterName}" character`,
            `"${showTitle}" character`
          ];
      }
    }
    
    // Filter out malformed terms and keep clean
    return terms
      .filter(term => term.length > 5 && term.length < 80) // Reasonable length
      .filter(term => !term.includes('Unknown')); // Remove unknown placeholders
  }

  /**
   * SMART: AI-powered detection of multi-actor characters
   */
  async detectMultiActorCharacter(characterName, showTitle) {
    // Quick hardcoded check for common cases (fast path)
    const quickCheck = this.quickMultiActorCheck(characterName, showTitle);
    if (quickCheck !== null) return quickCheck;
    
    // AI detection for unknown cases
    if (this.hasOpenAI) {
      return await this.aiDetectMultiActor(characterName, showTitle);
    }
    
    // Fallback: assume single actor
    return false;
  }

  /**
   * Quick hardcoded check for most common multi-actor characters (performance optimization)
   */
  quickMultiActorCheck(characterName, showTitle) {
    const character = characterName.toLowerCase();
    const title = showTitle.toLowerCase();
    
    // Only the most common cases for speed
    const quickChecks = [
      { chars: ['the doctor', 'doctor'], shows: ['doctor who'], hasMultiple: true },
      { chars: ['james bond', 'bond', '007'], shows: ['bond', 'james bond'], hasMultiple: true },
      { chars: ['batman', 'bruce wayne'], shows: ['batman'], hasMultiple: true },
      { chars: ['spider-man', 'spiderman', 'peter parker'], shows: ['spider', 'spiderman'], hasMultiple: true },
      { chars: ['sherlock'], shows: ['sherlock'], hasMultiple: true }
    ];
    
    for (const check of quickChecks) {
      const charMatch = check.chars.some(c => character.includes(c));
      const showMatch = check.shows.some(s => title.includes(s));
      
      if (charMatch && showMatch) {
        console.log(`🎭 Quick multi-actor detection: ${characterName} in ${showTitle}`);
        return check.hasMultiple;
      }
    }
    
    return null; // Unknown, need AI detection
  }

  /**
   * AI-powered multi-actor detection
   */
  async aiDetectMultiActor(characterName, showTitle) {
    try {
      const prompt = `Has the character "${characterName}" from "${showTitle}" been played by multiple different actors across different movies, TV shows, or reboots?

Consider:
- Different actors in reboots/remakes
- Recasting across film series
- Different TV vs movie versions
- Voice actors vs live-action actors for same character

Answer with just "YES" if multiple actors have played this character, or "NO" if it's typically one actor.

Examples:
- The Doctor (Doctor Who) = YES (14+ actors)
- James Bond = YES (6+ actors) 
- Tyrion Lannister (Game of Thrones) = NO (only Peter Dinklage)
- Tony Stark/Iron Man (MCU) = NO (only Robert Downey Jr in MCU)

Answer:`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 10
      });

      const response = completion.choices[0].message.content.trim().toUpperCase();
      const isMultiActor = response.includes('YES');
      
      if (isMultiActor) {
        console.log(`🤖 AI detected multi-actor character: ${characterName} in ${showTitle}`);
      } else {
        console.log(`🤖 AI confirmed single-actor character: ${characterName} in ${showTitle}`);
      }
      
      return isMultiActor;
      
    } catch (error) {
      console.log(`⚠️ AI multi-actor detection failed: ${error.message}`);
      return false; // Safe fallback
    }
  }

  /**
   * NEW: Generate actor-specific search terms for multi-actor characters
   */
  generateActorSpecificTerms(celebrityName, characterName, showTitle, strategy) {
    console.log(`🎯 Generating ACTOR-SPECIFIC terms for ${celebrityName} as ${characterName}`);
    
    // PRIORITY: Actor name comes FIRST to avoid other actors
    const terms = [
      `"${celebrityName}" "${showTitle}"`,           // Jodie Whittaker Doctor Who
      `"${celebrityName}" "${characterName}"`,       // Jodie Whittaker The Doctor
      `"${celebrityName}" as "${characterName}"`,    // Jodie Whittaker as The Doctor
      `"${celebrityName}" "${showTitle}" "${characterName}"`, // Jodie Whittaker Doctor Who The Doctor
      `"${showTitle}" "${celebrityName}"`,           // Doctor Who Jodie Whittaker
      `"${celebrityName}" ${showTitle.split(' ').slice(0, 2).join(' ')}` // Jodie Whittaker Doctor Who (shortened)
    ];
    
    // Add specific terms based on known multi-actor characters
    const specificTerms = this.generateSpecificActorTerms(celebrityName, characterName, showTitle);
    terms.push(...specificTerms);
    
    return terms;
  }

  /**
   * NEW: Generate highly specific terms for known multi-actor characters
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
        specificTerms.push('"13th Doctor" "Jodie Whittaker"');
      } else if (actor.includes('david tennant')) {
        specificTerms.push('"David Tennant" "10th Doctor"');
        specificTerms.push('"David Tennant" "Tenth Doctor"');
      } else if (actor.includes('matt smith')) {
        specificTerms.push('"Matt Smith" "11th Doctor"');
        specificTerms.push('"Matt Smith" "Eleventh Doctor"');
      } else if (actor.includes('peter capaldi')) {
        specificTerms.push('"Peter Capaldi" "12th Doctor"');
        specificTerms.push('"Peter Capaldi" "Twelfth Doctor"');
      }
    }
    
    // James Bond specific terms
    if (character.includes('bond') || character.includes('007')) {
      if (actor.includes('daniel craig')) {
        specificTerms.push('"Daniel Craig" "Bond"');
        specificTerms.push('"Daniel Craig" "007"');
      } else if (actor.includes('pierce brosnan')) {
        specificTerms.push('"Pierce Brosnan" "Bond"');
      } else if (actor.includes('sean connery')) {
        specificTerms.push('"Sean Connery" "Bond"');
      }
    }
    
    // Batman specific terms
    if (character.includes('batman') || character.includes('bruce wayne')) {
      if (actor.includes('christian bale')) {
        specificTerms.push('"Christian Bale" "Batman"');
        specificTerms.push('"Christian Bale" "Dark Knight"');
      } else if (actor.includes('michael keaton')) {
        specificTerms.push('"Michael Keaton" "Batman"');
      } else if (actor.includes('ben affleck')) {
        specificTerms.push('"Ben Affleck" "Batman"');
      }
    }
    
    return specificTerms;
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

      const prompt = `Generate 6 CLEAN CHARACTER-FIRST image search terms for finding images of "${characterName}" from "${showTitle}".

STRATEGY: Simple, clean searches like a human would do manually.

REQUIREMENTS:
- Focus on "${characterName}" as the primary search element
- Include "${showTitle}" for context
- Keep terms SHORT and CLEAN (like manual Google searches)
- ${medium.includes('voice') || medium.includes('anime') ? 'Pure character focus for anime/voice content' : 'Character-first but actor context OK'}
- NO exclusions or negative terms (AI will filter content)
- Make searches that would find content on fandom wikis, Reddit, Game Rant, etc.

Example clean terms:
- "Shoto Todoroki"
- "Shoto Todoroki My Hero Academia"  
- "My Hero Academia Shoto Todoroki"

Return exactly 6 CLEAN search terms as JSON array:
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
   * ENHANCED: Parse JSON response handling markdown code blocks and partial responses
   */
  parseJSONResponse(response) {
    try {
      // Remove any leading/trailing whitespace
      response = response.trim();
      
      // First try direct JSON parsing
      return JSON.parse(response);
    } catch (error) {
      try {
        // Try extracting from markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          return JSON.parse(jsonMatch[1].trim());
        }
        
        // Try extracting any array pattern
        const arrayMatch = response.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          return JSON.parse(arrayMatch[0]);
        }
        
        // Try to handle truncated JSON responses
        const truncatedMatch = response.match(/\[[\s\S]*/);
        if (truncatedMatch) {
          let truncatedJson = truncatedMatch[0];
          
          // Try to close incomplete arrays/objects
          if (!truncatedJson.endsWith(']') && !truncatedJson.endsWith('}')) {
            // Count unclosed brackets and quotes
            const openBrackets = (truncatedJson.match(/\[/g) || []).length;
            const closeBrackets = (truncatedJson.match(/\]/g) || []).length;
            const openBraces = (truncatedJson.match(/\{/g) || []).length;
            const closeBraces = (truncatedJson.match(/\}/g) || []).length;
            
            // Add missing closing brackets
            for (let i = 0; i < (openBraces - closeBraces); i++) {
              truncatedJson += '}';
            }
            for (let i = 0; i < (openBrackets - closeBrackets); i++) {
              truncatedJson += ']';
            }
            
            try {
              return JSON.parse(truncatedJson);
            } catch (e) {
              // If still invalid, try to extract just the completed items
              console.log(`Attempting to extract partial data from truncated JSON`);
            }
          }
        }
        
        throw new Error('No valid JSON found');
      } catch (parseError) {
        console.log(`⚠️ JSON parsing failed for response: ${response.substring(0, 200)}...`);
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
