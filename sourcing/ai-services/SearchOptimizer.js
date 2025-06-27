const OpenAI = require('openai');
const { PROMPTS, PROMPT_CONFIG } = require('../config/prompts.js');

class SearchOptimizer {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI initialized for search optimization');
      } else {
        console.log('ℹ️ OpenAI not configured for search optimization, using basic terms');
      }
    } catch (error) {
      console.log('⚠️ OpenAI initialization failed for search optimization, using basic terms');
      this.hasOpenAI = false;
    }
  }

  /**
   * Main function to optimize search terms for any role type
   * Enhances your existing fetchImages.js with AI-generated terms
   */
  async optimizeSearchTerms(roles) {
    try {
      console.log(`🔍 AI optimizing search terms for ${roles.length} roles`);
      
      const optimizedRoles = await Promise.all(
        roles.map(role => this.optimizeRole(role))
      );

      console.log(`✅ Search optimization complete`);
      return optimizedRoles;

    } catch (error) {
      console.error(`❌ Search optimization failed:`, error.message);
      // Return roles with basic search terms as fallback
      return this.generateFallbackTerms(roles);
    }
  }

  /**
   * Optimize search terms for a single role
   */
  async optimizeRole(role) {
    try {
      const aiTerms = await this.generateAISearchTerms(role);
      const basicTerms = this.generateBasicTerms(role);
      const mediumSpecificTerms = this.generateMediumSpecificTerms(role);

      return {
        ...role,
        searchTerms: {
          ai: aiTerms,           // AI-generated optimal terms
          basic: basicTerms,     // Fallback basic terms
          specific: mediumSpecificTerms, // Medium-specific terms
          all: [...aiTerms, ...basicTerms, ...mediumSpecificTerms] // Combined
        }
      };

    } catch (error) {
      console.error(`⚠️ AI optimization failed for ${role.character}, using fallback`);
      return {
        ...role,
        searchTerms: {
          ai: [],
          basic: this.generateBasicTerms(role),
          specific: this.generateMediumSpecificTerms(role),
          all: [...this.generateBasicTerms(role), ...this.generateMediumSpecificTerms(role)]
        }
      };
    }
  }

  /**
   * Generate AI-powered search terms (only if OpenAI available)
   */
  async generateAISearchTerms(role) {
    if (!this.hasOpenAI) {
      console.log(`⚠️ No OpenAI for AI search terms, using basic terms for ${role.character}`);
      return [];
    }

    try {
      const prompt = PROMPTS.OPTIMIZE_SEARCH(role.character, role.title, role.medium);
      
      const completion = await this.openai.chat.completions.create({
        model: PROMPT_CONFIG.MODELS.PRIMARY,
        messages: [{ role: "user", content: prompt }],
        temperature: PROMPT_CONFIG.TEMPERATURE.SEARCH_OPTIMIZATION,
        max_tokens: PROMPT_CONFIG.MAX_TOKENS.SEARCH_OPTIMIZATION
      });

      const response = completion.choices[0].message.content;
      return this.parseSearchTerms(response);

    } catch (error) {
      console.error(`AI search term generation failed for ${role.character}:`, error.message);
      return [];
    }
  }

  /**
   * Generate basic search terms (fallback)
   */
  generateBasicTerms(role) {
    const terms = [];

    // Character + Title combination
    if (role.character && role.title) {
      terms.push(`${role.character} ${role.title}`);
      terms.push(`${role.title} ${role.character}`);
    }

    // Character alone (for well-known characters)
    if (role.character) {
      terms.push(role.character);
    }

    // Title alone (for less character-specific searches)
    if (role.title) {
      terms.push(role.title);
    }

    return terms.filter(term => term.length > 3); // Remove very short terms
  }

  /**
   * Generate medium-specific search terms with STRICT exclusions
   */
  generateMediumSpecificTerms(role) {
    const { character, title, medium } = role;
    const terms = [];
    
    // Universal exclusions for all search terms
    const exclusions = "-funko -pop -action -figure -toy -merchandise -convention -signed -autograph -dvd -cover -poster -fan -art -edit -meme";

    switch (medium) {
      case 'live_action_movie':
        terms.push(`"${title}" cast production photo ${exclusions}`);
        terms.push(`"William Shatner" "${character}" "${title}" promotional ${exclusions}`);
        terms.push(`"${title}" behind scenes cast photo ${exclusions}`);
        break;

      case 'live_action_tv':
        terms.push(`"${title}" main cast promotional photo ${exclusions}`);
        terms.push(`"William Shatner" "${character}" production still ${exclusions}`);
        terms.push(`"${title}" cast group press photo ${exclusions}`);
        break;

      case 'voice_anime':
        terms.push(`"${title}" main characters official artwork ${exclusions}`);
        terms.push(`"${character}" "${title}" official anime art ${exclusions}`);
        terms.push(`"${title}" character group promotional ${exclusions}`);
        break;

      case 'voice_cartoon':
        terms.push(`"${title}" main characters official art ${exclusions}`);
        terms.push(`"${character}" "${title}" official character ${exclusions}`);
        terms.push(`"${title}" character ensemble official ${exclusions}`);
        break;

      case 'voice_game':
        terms.push(`"${title}" main characters official game art ${exclusions}`);
        terms.push(`"${character}" "${title}" official character art ${exclusions}`);
        break;

      case 'voice_movie':
        terms.push(`"${title}" animated characters promotional ${exclusions}`);
        terms.push(`"${character}" "${title}" official animation art ${exclusions}`);
        break;

      default:
        terms.push(`"${title}" cast promotional photo ${exclusions}`);
        terms.push(`"${character}" "${title}" official image ${exclusions}`);
        break;
    }

    return terms.filter(Boolean);
  }

  /**
   * Parse AI search terms response
   */
  parseSearchTerms(response) {
    try {
      // Extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        console.warn('No JSON array found in search term response');
        return [];
      }

      const terms = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(terms)) {
        console.warn('Search terms response is not an array');
        return [];
      }

      // Clean and validate terms
      return terms
        .filter(term => typeof term === 'string' && term.length > 3)
        .map(term => term.trim())
        .slice(0, 5); // Limit to 5 terms max

    } catch (error) {
      console.error('Failed to parse AI search terms:', error.message);
      return [];
    }
  }

  /**
   * Generate fallback terms when AI fails completely
   */
  generateFallbackTerms(roles) {
    return roles.map(role => ({
      ...role,
      searchTerms: {
        ai: [],
        basic: this.generateBasicTerms(role),
        specific: this.generateMediumSpecificTerms(role),
        all: [...this.generateBasicTerms(role), ...this.generateMediumSpecificTerms(role)]
      }
    }));
  }

  /**
   * Get best search terms for a role (AI-PRIORITIZED)
   */
  getBestSearchTerms(role, maxTerms = 5) {
    if (!role.searchTerms) {
      // If no search terms exist, generate basic ones
      const basic = this.generateBasicTerms(role);
      const specific = this.generateMediumSpecificTerms(role);
      return [...specific, ...basic].slice(0, maxTerms); // Prioritize specific over basic
    }

    // HEAVILY PRIORITIZE AI TERMS
    const { ai, specific, basic } = role.searchTerms;
    
    // Use more AI terms, fewer basic terms
    const prioritizedTerms = [
      ...(ai || []),           // AI terms first (group-focused)
      ...(specific || []),     // Medium-specific terms second (also group-focused)
      ...(basic || []).slice(0, 1) // Only 1 basic term as fallback
    ];
    
    // Remove duplicates and return top terms
    const uniqueTerms = [...new Set(prioritizedTerms)];
    return uniqueTerms.slice(0, maxTerms);
  }

  /**
   * Validate search term quality
   */
  validateSearchTerms(terms) {
    return terms.filter(term => {
      // Remove terms that are too short, too long, or contain problematic characters
      if (term.length < 3 || term.length > 100) return false;
      if (term.includes('undefined') || term.includes('null')) return false;
      if (/^[0-9]+$/.test(term)) return false; // Pure numbers
      return true;
    });
  }

  /**
   * Test the search optimizer (works without OpenAI)
   */
  async testOptimizer() {
    const testRole = {
      character: "Iron Man",
      title: "Avengers",
      medium: "live_action_movie",
      year: "2012"
    };

    try {
      const optimized = await this.optimizeRole(testRole);
      console.log('Search optimizer test successful:', optimized.searchTerms);
      return true;
    } catch (error) {
      console.error('Search optimizer test failed:', error.message);
      return false;
    }
  }
}

module.exports = SearchOptimizer;
