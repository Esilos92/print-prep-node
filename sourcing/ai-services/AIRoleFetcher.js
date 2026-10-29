const { PROMPTS } = require('../config/prompts.js');
const config = require('../../utils/config');
const { chat, getClient } = require('../../utils/openai');
const { TMDbFilmography } = require('./TMDbFilmography');

class AIRoleFetcher {
  constructor() {
    this.filmography = new TMDbFilmography();
    // Kept for callers in main.js that check `roleFetcher.hasOpenAI`.
    this.openai = getClient();
    this.hasOpenAI = !!this.openai;
    console.log(this.filmography.available
      ? '✅ Role discovery: TMDb credits' + (this.hasOpenAI ? ` + ${config.models.roleDiscovery}` : '')
      : (this.hasOpenAI ? `ℹ️ No TMDB_API_KEY — role discovery falls back to ${config.models.roleDiscovery} memory` : 'ℹ️ No role discovery configured'));
  }

  /**
   * Real credits from TMDb first. A model recalling a filmography from memory
   * is the fallback, for performers TMDb doesn't know.
   */
  async fetchRoles(celebrityName) {
    const maxRoles = config.roles.maxRoles;
    console.log(`🎯 Role discovery for: ${celebrityName}`);

    try {
      const tmdbRoles = await this.filmography.getRoles(celebrityName, maxRoles);
      if (tmdbRoles.length > 0) {
        const roles = this.enforceDistinctRoles(tmdbRoles.map(r => this.normalizeRole(r)), celebrityName).slice(0, maxRoles);
        console.log(`✅ Discovery complete (TMDb): ${roles.length} roles for ${celebrityName}`);
        return roles;
      }
    } catch (error) {
      console.log(`⚠️ TMDb role lookup failed: ${error.message}`);
    }

    try {
      const roles = await this.discoverFromMemory(celebrityName, maxRoles);
      console.log(`✅ Discovery complete (AI memory): ${roles.length} roles for ${celebrityName}`);
      return roles;
    } catch (error) {
      console.error(`❌ Role discovery failed for ${celebrityName}:`, error.message);
      return [];
    }
  }

  async discoverFromMemory(celebrityName, maxRoles) {
    if (!this.hasOpenAI) return [];

    // Over-request: duplicates are stripped afterwards.
    const reply = await chat({
      model: config.models.roleDiscovery,
      messages: [
        {
          role: 'system',
          content: 'You are an entertainment expert. Use exact character names from official sources. Every role must be a different character, and no two may come from the same film series or franchise. Never invent roles.'
        },
        { role: 'user', content: PROMPTS.FETCH_ROLES(celebrityName, maxRoles + 3) }
      ],
      maxTokens: 1200
    });

    return this.parseAndValidateResponse(reply, celebrityName) || [];
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
      ).slice(0, config.roles.maxRoles);

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
      popularity: role.popularity || 'medium',
      franchise: role.franchise || null,
      tmdbId: role.tmdbId || null,
      mediaType: role.mediaType || null,
      episodes: role.episodes || null,
      source: role.source || 'ai_memory'
    };
  }

  async testConnection() {
    if (!this.hasOpenAI) return false;
    try {
      await chat({ model: config.models.roleDiscovery, messages: [{ role: 'user', content: 'Reply OK' }], maxTokens: 5 });
      return true;
    } catch (e) {
      return false;
    }
  }

  getSystemStatus() {
    return {
      openaiAPI: this.hasOpenAI,
      tmdb: this.filmography.available,
      primaryEngine: this.filmography.available ? 'TMDb credits' : (this.hasOpenAI ? config.models.roleDiscovery : 'None'),
      approach: 'TMDb filmography, AI picks the best-known roles'
    };
  }
}

module.exports = AIRoleFetcher;
