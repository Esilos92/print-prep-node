const OpenAI = require('openai');
const { PROMPTS, PROMPT_CONFIG } = require('../config/prompts.js');

class SearchOptimizer {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // Comprehensive exclusions - no merchandise, events, fan content, or framed images
    this.exclusions = "-funko -toy -figure -doll -collectible -merchandise -convention -comic-con -autograph -signed -signature -event -premiere -red -carpet -interview -behind -scenes -fan -art -drawing -sketch -graphic -compilation -meme -wallpaper -poster -dvd -cover -packaging -box -framed -frame -wall -hanging -mounted -display -render -fanart -deviantart -tumblr -reddit -pinterest -random -vs -versus -comparison -friends -game -thrones -wrong";
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI initialized for character image search optimization');
      } else {
        console.log('ℹ️ OpenAI not configured, using character image template');
      }
    } catch (error) {
      console.log('⚠️ OpenAI initialization failed, using character image template');
      this.hasOpenAI = false;
    }
  }

  /**
   * Main function - generates search terms for character images
   */
  async optimizeSearchTerms(roles) {
    try {
      console.log(`🔍 Generating character image search terms for ${roles.length} roles`);
      
      const optimizedRoles = await Promise.all(
        roles.map(role => this.optimizeRoleForCharacterImages(role))
      );

      console.log(`✅ Character image search optimization complete`);
      return optimizedRoles;

    } catch (error) {
      console.error(`❌ Search optimization failed:`, error.message);
      return this.generateFallbackTerms(roles);
    }
  }

  /**
   * Generate search terms focused on character images from shows/movies
   */
  async optimizeRoleForCharacterImages(role) {
    try {
      const celebrityName = this.extractCelebrityName(role);
      
      const characterImageTerms = this.generateCharacterImageTerms(
        celebrityName,
        role.character, 
        role.title, 
        role.medium
      );
      
      const basicTerms = this.generateBasicTerms(role);
      const mediumSpecificTerms = this.generateMediumSpecificTerms(role);

      return {
        ...role,
        searchTerms: {
          character_images: characterImageTerms,     // Primary: Character image focused
          ai: characterImageTerms,                   // Unified AI field
          basic: basicTerms,                         // Fallback basic terms
          specific: mediumSpecificTerms,             // Medium-specific terms
          all: [...characterImageTerms, ...basicTerms, ...mediumSpecificTerms]
        }
      };

    } catch (error) {
      console.error(`⚠️ Character image optimization failed for ${role.character}, using fallback`);
      return {
        ...role,
        searchTerms: {
          character_images: [],
          ai: [],
          basic: this.generateBasicTerms(role),
          specific: this.generateMediumSpecificTerms(role),
          all: [...this.generateBasicTerms(role), ...this.generateMediumSpecificTerms(role)]
        }
      };
    }
  }

  /**
   * Generate 6 search terms focused on high-quality character images (solo AND group)
   */
  generateCharacterImageTerms(celebrityName, character, title, medium) {
    const exclusions = this.exclusions;
    const mediumAdjustments = this.getMediumAdjustments(medium);
    
    // Highly specific terms to avoid wrong characters and fan content
    const term1 = `"${celebrityName}" "${character}" "${title}" ${mediumAdjustments.imageType} screenshot original ${exclusions}`;
    
    const term2 = `"${title}" "${celebrityName}" "${character}" ${mediumAdjustments.sourceType} scene official ${exclusions}`;
    
    const term3 = `"${celebrityName}" "${character}" from "${title}" ${mediumAdjustments.sceneType} still ${exclusions}`;
    
    const term4 = `"${title}" show "${character}" "${celebrityName}" ${mediumAdjustments.episodeType} capture ${exclusions}`;
    
    const term5 = `"${celebrityName}" playing "${character}" "${title}" ${mediumAdjustments.costumeType} scene ${exclusions}`;
    
    const term6 = `"${title}" series "${celebrityName}" "${character}" ${mediumAdjustments.characterType} original ${exclusions}`;
    
    return [term1, term2, term3, term4, term5, term6];
  }

  /**
   * Medium-specific adjustments for character image searches
   */
  getMediumAdjustments(medium) {
    const adjustments = {
      imageType: "",
      sourceType: "",
      sceneType: "", 
      episodeType: "",
      costumeType: "",
      characterType: ""
    };

    switch (medium) {
      case 'live_action_movie':
        adjustments.imageType = "movie";
        adjustments.sourceType = "film";
        adjustments.sceneType = "movie scene";
        adjustments.episodeType = "film";
        adjustments.costumeType = "movie";
        adjustments.characterType = "movie character";
        break;

      case 'live_action_tv':
        adjustments.imageType = "tv show";
        adjustments.sourceType = "series";
        adjustments.sceneType = "episode scene";
        adjustments.episodeType = "episode";
        adjustments.costumeType = "tv series";
        adjustments.characterType = "tv character";
        break;

      case 'voice_anime':
      case 'animation_tv':
      case 'animation_movie':
        adjustments.imageType = "anime";
        adjustments.sourceType = "animation";
        adjustments.sceneType = "anime scene";
        adjustments.episodeType = "episode";
        adjustments.costumeType = "character design";
        adjustments.characterType = "anime character";
        break;

      case 'voice_cartoon':
      case 'voice_movie':
        adjustments.imageType = "cartoon";
        adjustments.sourceType = "animated";
        adjustments.sceneType = "cartoon scene";
        adjustments.episodeType = "episode";
        adjustments.costumeType = "character design";
        adjustments.characterType = "cartoon character";
        break;

      case 'voice_game':
        adjustments.imageType = "game";
        adjustments.sourceType = "video game";
        adjustments.sceneType = "game scene";
        adjustments.episodeType = "cutscene";
        adjustments.costumeType = "character model";
        adjustments.characterType = "game character";
        break;

      default:
        adjustments.imageType = "scene";
        adjustments.sourceType = "show";
        adjustments.sceneType = "scene";
        adjustments.episodeType = "episode";
        adjustments.costumeType = "character";
        adjustments.characterType = "character";
        break;
    }

    return adjustments;
  }

  /**
   * Extract celebrity name from role data
   */
  extractCelebrityName(role) {
    return role.actor || role.actorName || role.performer || role.celebrity || 'ACTOR_NAME';
  }

  /**
   * Generate basic search terms (fallback)
   */
  generateBasicTerms(role) {
    const terms = [];
    const exclusions = this.exclusions;

    if (role.character && role.title) {
      terms.push(`"${role.character}" "${role.title}" scene ${exclusions}`);
      terms.push(`"${role.title}" "${role.character}" episode ${exclusions}`);
    }

    if (role.character) {
      terms.push(`"${role.character}" high quality image ${exclusions}`);
    }

    if (role.title) {
      terms.push(`"${role.title}" character scene ${exclusions}`);
    }

    return terms.filter(term => term.length > 3);
  }

  /**
   * Generate medium-specific search terms (fallback) - includes group shots
   */
  generateMediumSpecificTerms(role) {
    const { character, title, medium } = role;
    const terms = [];
    const exclusions = this.exclusions;

    switch (medium) {
      case 'live_action_movie':
        terms.push(`"${title}" movie scene "${character}" cast group ${exclusions}`);
        terms.push(`"${title}" film screenshot ensemble cast ${exclusions}`);
        break;

      case 'live_action_tv':
        terms.push(`"${title}" tv series scene "${character}" cast ${exclusions}`);
        terms.push(`"${title}" episode main characters group ${exclusions}`);
        break;

      case 'voice_anime':
      case 'animation_tv':
      case 'animation_movie':
        terms.push(`"${title}" anime scene "${character}" main characters ${exclusions}`);
        terms.push(`"${title}" animation group characters scene ${exclusions}`);
        break;

      case 'voice_cartoon':
      case 'voice_movie':
        terms.push(`"${title}" cartoon scene "${character}" cast ${exclusions}`);
        terms.push(`"${title}" animated characters group scene ${exclusions}`);
        break;

      case 'voice_game':
        terms.push(`"${title}" game scene "${character}" party characters ${exclusions}`);
        terms.push(`"${title}" video game characters group ${exclusions}`);
        break;

      default:
        terms.push(`"${title}" scene "${character}" cast group ${exclusions}`);
        terms.push(`"${title}" characters ensemble scene ${exclusions}`);
        break;
    }

    return terms.filter(Boolean);
  }

  /**
   * Generate fallback terms when optimization fails
   */
  generateFallbackTerms(roles) {
    return roles.map(role => ({
      ...role,
      searchTerms: {
        character_images: [],
        ai: [],
        basic: this.generateBasicTerms(role),
        specific: this.generateMediumSpecificTerms(role),
        all: [...this.generateBasicTerms(role), ...this.generateMediumSpecificTerms(role)]
      }
    }));
  }

  /**
   * Get best search terms (prioritizes character images)
   */
  getBestSearchTerms(role, maxTerms = 6) {
    if (!role.searchTerms) {
      const basic = this.generateBasicTerms(role);
      const specific = this.generateMediumSpecificTerms(role);
      return [...specific, ...basic].slice(0, maxTerms);
    }

    const { character_images, ai, specific, basic } = role.searchTerms;
    
    // Prioritize character image terms first
    const characterTerms = character_images || ai || [];
    const prioritizedTerms = [
      ...characterTerms,
      ...(specific || []),
      ...(basic || []).slice(0, 1)
    ];
    
    const uniqueTerms = [...new Set(prioritizedTerms)];
    return uniqueTerms.slice(0, maxTerms);
  }

  /**
   * Test the search optimizer
   */
  async testOptimizer() {
    const testRole = {
      character: "Test Character",
      title: "Test Show",
      medium: "live_action_tv",
      year: "2020",
      celebrity: "Test Actor",
      actorName: "Test Actor"
    };

    try {
      const optimized = await this.optimizeRoleForCharacterImages(testRole);
      console.log('Character image optimizer test successful:', optimized.searchTerms);
      return optimized.searchTerms?.character_images?.length === 6;
    } catch (error) {
      console.error('Character image optimizer test failed:', error.message);
      return false;
    }
  }
}

module.exports = SearchOptimizer;
