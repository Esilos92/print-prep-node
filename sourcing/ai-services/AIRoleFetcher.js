const OpenAI = require('openai');
const config = require('../../utils/config');
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
      /**
       * Use the shared prompt. This used to be an inline copy that had drifted
       * from PROMPTS.FETCH_ROLES, so the central prompts file was dead code
       * and edits to it silently did nothing.
       */
      const simplePrompt = PROMPTS.FETCH_ROLES(celebrityName, 8);

      const completion = await this.openai.chat.completions.create({
        model: config.models.roleDiscovery,
        messages: [
          {
            role: "system",
            content: "You are an entertainment expert. Always use exact character names from official sources. Every role you list must be a different character, and no two may come from the same film series or franchise."
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

Each entry must be a DIFFERENT character, and no two entries may come from the
same film series or franchise.

Return what you can find:
[{"character": "Character Name", "title": "Project Title", "franchise": "Series name or null", "medium": "live_action_movie", "year": "YYYY", "popularity": "medium"}]`;

      const completion = await this.openai.chat.completions.create({
        model: config.models.roleDiscovery,
        messages: [
          {
            role: "system",
            content: "You are researching performers. Find any acting work, no matter how small. Never list the same character or franchise twice."
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

      const validRoles = this.enforceDistinctRoles(
        parsed
          .filter(role => role.character && role.title)
          .map(role => this.normalizeRole(role)),
        celebrityName
      ).slice(0, 5);

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
   * Collapse a role list to distinct characters and one entry per franchise.
   *
   * The prompt asks for this, but a prompt is a request, not a guarantee —
   * and the failure is expensive and silent: four Lethal Weapon entries
   * become four near-identical image sets sold as four products. Entries
   * arrive best-known first, so keeping the first occurrence keeps the
   * strongest instalment.
   */
  enforceDistinctRoles(roles, celebrityName) {
    const seenCharacters = new Set();
    const seenFranchises = new Set();
    const kept = [];

    for (const role of roles) {
      const characterKey = this.normalizeKey(role.character);
      if (!characterKey) continue;

      if (seenCharacters.has(characterKey)) {
        console.log(`  ↩︎ Dropped duplicate character: ${role.character} (${role.title})`);
        continue;
      }

      const franchiseKey = this.franchiseKey(role);
      if (franchiseKey && seenFranchises.has(franchiseKey)) {
        console.log(`  ↩︎ Dropped same-franchise entry: ${role.character} (${role.title})`);
        continue;
      }

      seenCharacters.add(characterKey);
      if (franchiseKey) seenFranchises.add(franchiseKey);
      kept.push(role);
    }

    if (kept.length < roles.length) {
      console.log(`🎭 ${roles.length} roles -> ${kept.length} distinct for ${celebrityName}`);
    }

    return kept;
  }

  normalizeKey(value) {
    return (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Reduce a title to the series it belongs to, so sequels collide:
   * "Lethal Weapon 4" and "Lethal Weapon II" both key to "lethal weapon".
   */
  franchiseKey(role) {
    if (role.franchise) return this.normalizeKey(role.franchise);

    const base = (role.title || '')
      .replace(/[:\u2013\u2014-].*$/, '')                      // drop subtitles
      .replace(/\b(part|chapter|vol|volume|season)\b.*$/i, '')  // drop "Part Two"
      .replace(/\b[0-9]+\b\s*$/, '')                           // trailing digits
      .replace(/\b(i{1,3}|iv|v|vi{1,3}|ix|x)\b\s*$/i, '');      // roman numerals

    return this.normalizeKey(base);
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
          model: config.models.roleDiscovery,
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
