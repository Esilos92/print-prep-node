const OpenAI = require('openai');
const { PROMPTS, PROMPT_CONFIG } = require('../config/prompts.js');

class AIRoleFetcher {
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
        console.log('✅ OpenAI initialized for role discovery');
      } else {
        console.log('ℹ️ OpenAI not configured, using fallback methods');
      }
    } catch (error) {
      console.log('⚠️ OpenAI initialization failed, using fallback methods');
      this.hasOpenAI = false;
    }
  }

  /**
   * SIMPLIFIED: Basic role discovery - trust OpenAI to do its job
   */
  async fetchRoles(celebrityName) {
    try {
      console.log(`🎯 Role discovery for: ${celebrityName}`);
      
      // Single simple AI call
      const roles = await this.performSimpleDiscovery(celebrityName);
      
      if (!roles || roles.length === 0) {
        console.log(`⚠️ No roles found, trying broader search...`);
        const broadRoles = await this.performBroadDiscovery(celebrityName);
        return broadRoles || [];
      }

      console.log(`✅ Discovery complete: ${roles.length} roles for ${celebrityName}`);
      return roles;

    } catch (error) {
      console.error(`❌ Role discovery failed for ${celebrityName}:`, error.message);
      return [];
    }
  }

  /**
   * SIMPLIFIED: Simple discovery - let OpenAI do what it does best
   */
  async performSimpleDiscovery(celebrityName) {
    if (!this.hasOpenAI) return null;

    try {
      // FIXED: Simple, clear prompt
      const simplePrompt = `List the 5 most notable acting roles for "${celebrityName}". Include any level of fame - main roles, supporting roles, voice acting, recent work, indie films, etc.

Use exact character names from official sources.

Format as JSON:
[
  {
    "character": "Exact Character Name",
    "title": "Show/Movie Title", 
    "medium": "live_action_movie",
    "year": "YYYY",
    "popularity": "high"
  }
]`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an entertainment expert. Always use exact character names from official sources. Include roles from any level of production - major films, indie films, TV shows, voice acting, etc."
          },
          {
            role: "user", 
            content: simplePrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 800
      });

      const response = completion.choices[0].message.content;
      return this.parseAndValidateResponse(response, celebrityName);
      
    } catch (error) {
      console.log(`Simple discovery failed: ${error.message}`);
      return null;
    }
  }

  /**
   * SIMPLIFIED: Broad discovery for difficult cases
   */
  async performBroadDiscovery(celebrityName) {
    if (!this.hasOpenAI) return null;

    try {
      const broadPrompt = `Find ANY notable acting work for "${celebrityName}" - include small roles, indie films, streaming content, voice work, or recent performances.

Return what you can find:
[{"character": "Character Name", "title": "Project Title", "medium": "live_action_movie", "year": "YYYY", "popularity": "medium"}]`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are researching performers. Find any acting work, no matter how small."
          },
          {
            role: "user", 
            content: broadPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 400
      });

      const response = completion.choices[0].message.content;
      return this.parseAndValidateResponse(response, celebrityName);
      
    } catch (error) {
      console.log(`Broad discovery failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse and validate JSON responses
   */
  parseAndValidateResponse(response, celebrityName) {
    try {
      let parsed = this.parseJSONResponse(response);
      
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('No valid roles extracted from AI response');
      }

      const validRoles = parsed
        .filter(role => role.character && role.title)
        .map(role => this.normalizeRole(role))
        .slice(0, 8);

      return validRoles;
      
    } catch (error) {
      console.error(`Response parsing failed for ${celebrityName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Robust JSON parsing
   */
  parseJSONResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      try {
        // Extract from markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          return JSON.parse(jsonMatch[1]);
        }
        
        // Extract array pattern
        const arrayMatch = response.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          return JSON.parse(arrayMatch[0]);
        }
        
        throw new Error('No valid JSON found');
      } catch (parseError) {
        console.log(`JSON parsing failed: ${response.substring(0, 200)}...`);
        return null;
      }
    }
  }

  /**
   * Normalize role data
   */
  normalizeRole(role) {
    return {
      character: (role.character || '').trim(),
      title: (role.title || '').trim(),
      medium: role.medium || 'live_action_movie',
      year: role.year || 'unknown',
      popularity: role.popularity || 'medium'
    };
  }

  /**
   * System diagnostics
   */
  async testConnection() {
    if (this.hasOpenAI) {
      try {
        await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Test" }],
          max_tokens: 5
        });
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  getSystemStatus() {
    return {
      openaiAPI: this.hasOpenAI,
      primaryEngine: this.hasOpenAI ? 'OpenAI GPT-4o-mini' : 'None',
      approach: 'Simple Discovery - Trust OpenAI'
    };
  }
}

module.exports = AIRoleFetcher;
