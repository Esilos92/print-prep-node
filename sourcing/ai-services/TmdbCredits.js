const axios = require('axios');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

/**
 * Deterministic credit verification against TMDb.
 *
 * Role discovery asks a language model for an actor's notable roles, and the
 * model will occasionally produce a credit the actor does not have. The
 * existing guard only catches literal placeholders — "Unknown Character",
 * "Various", strings under two characters — so a confident, well-formed
 * hallucination like "Yoda" for George Takei sails through and the run logs
 * "No suspicious character names found".
 *
 * TMDb already holds the cast list. Checking a claimed credit against it is a
 * lookup, not a judgement call, so it settles the question without spending
 * another model call on a second opinion.
 */

/**
 * Credits that exist but cannot yield an in-character photograph.
 *
 * A narrator is never on screen; "Himself" on a talk show is the actor out of
 * character, which is exactly the material the print packages are not for.
 * These are rejected at discovery rather than filtered later, because every
 * one that survives costs a full role's worth of searching and vision calls.
 */
const NON_VISUAL_CREDIT = /^(?:the\s+)?(?:narrator|himself|herself|themselves|self|host|presenter|interviewee|announcer|voice\s+of\s+god|archive\s+footage|uncredited|additional\s+voices?)\b/i;

/** TMDb genre id 16 is Animation — the reliable signal for a voice credit. */
const ANIMATION_GENRE_ID = 16;

class TmdbCredits {
  constructor() {
    this.apiKey = config.api.tmdbKey;
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.personCache = new Map();
    this.creditCache = new Map();
  }

  get available() {
    return !!this.apiKey;
  }

  static isNonVisualCredit(character) {
    return NON_VISUAL_CREDIT.test((character || '').trim());
  }

  /** Loose comparison so "Star Trek II: The Wrath of Khan" matches "Star Trek II". */
  static normalize(value) {
    return (value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\b(the|a|an)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static titlesMatch(a, b) {
    const x = TmdbCredits.normalize(a);
    const y = TmdbCredits.normalize(b);
    if (!x || !y) return false;
    return x === y || x.startsWith(y) || y.startsWith(x);
  }

  /**
   * Characters match on any token overlap of a real name part, so
   * "Hikaru Sulu" matches "Sulu" and "Mister Sulu" — TMDb and a model rarely
   * spell a character identically.
   */
  static charactersMatch(a, b) {
    const x = TmdbCredits.normalize(a);
    const y = TmdbCredits.normalize(b);
    if (!x || !y) return false;
    if (x === y || x.includes(y) || y.includes(x)) return true;

    const stop = new Set(['mr', 'mrs', 'ms', 'dr', 'captain', 'commander', 'young', 'old', 'voice']);
    const partsX = x.split(' ').filter(p => p.length > 2 && !stop.has(p));
    const partsY = y.split(' ').filter(p => p.length > 2 && !stop.has(p));

    return partsX.some(p => partsY.includes(p));
  }

  async findPersonId(celebrityName) {
    if (this.personCache.has(celebrityName)) return this.personCache.get(celebrityName);

    const response = await axios.get(`${this.baseUrl}/search/person`, {
      params: { api_key: this.apiKey, query: celebrityName },
      timeout: 15000
    });

    const results = response.data?.results || [];
    if (results.length === 0) {
      this.personCache.set(celebrityName, null);
      return null;
    }

    const exact = results.filter(
      p => TmdbCredits.normalize(p.name) === TmdbCredits.normalize(celebrityName)
    );
    const pool = exact.length > 0 ? exact : results;
    const best = pool.reduce((a, b) => ((b.popularity || 0) > (a.popularity || 0) ? b : a));

    this.personCache.set(celebrityName, best.id);
    return best.id;
  }

  /**
   * Every acting credit TMDb holds for this person, normalised into the shape
   * the pipeline uses. This is also usable as a discovery source in its own
   * right — it cannot invent a credit.
   */
  async getCredits(celebrityName) {
    if (!this.available) return null;
    if (this.creditCache.has(celebrityName)) return this.creditCache.get(celebrityName);

    try {
      const personId = await this.findPersonId(celebrityName);
      if (!personId) {
        logger.warn(`⚠️ TMDb has no person matching "${celebrityName}"`);
        this.creditCache.set(celebrityName, null);
        return null;
      }

      const response = await axios.get(`${this.baseUrl}/person/${personId}/combined_credits`, {
        params: { api_key: this.apiKey },
        timeout: 20000
      });

      const credits = (response.data?.cast || [])
        .filter(c => c.character && (c.title || c.name))
        .map(c => {
          const title = c.title || c.name;
          const date = c.release_date || c.first_air_date || '';
          const isAnimated = (c.genre_ids || []).includes(ANIMATION_GENRE_ID);

          return {
            character: c.character.replace(/\s*\(voice\)\s*/i, '').trim(),
            title,
            year: date ? date.slice(0, 4) : 'unknown',
            mediaType: c.media_type === 'tv' ? 'tv' : 'movie',
            popularity: c.popularity || 0,
            episodeCount: c.episode_count || 0,
            // (voice) in the credit string is TMDb's own marker; genre 16 catches the rest.
            isVoice: /\(voice\)/i.test(c.character) || isAnimated,
            isNonVisual: TmdbCredits.isNonVisualCredit(c.character)
          };
        });

      logger.info(`🎞️ TMDb: ${credits.length} acting credits for ${celebrityName}`);
      this.creditCache.set(celebrityName, credits);
      return credits;

    } catch (error) {
      logger.warn(`⚠️ TMDb credit lookup failed for ${celebrityName}: ${error.message}`);
      this.creditCache.set(celebrityName, null);
      return null;
    }
  }

  /**
   * Check one discovered role against the credit list.
   *
   * Returns a verdict rather than a boolean so the caller can tell
   * "this actor never played that" from "TMDb is unavailable", which must not
   * be treated the same way.
   */
  static checkRole(role, credits) {
    if (!credits) return { status: 'unchecked', reason: 'TMDb unavailable' };

    const inTitle = credits.filter(c => TmdbCredits.titlesMatch(c.title, role.title));

    if (inTitle.length === 0) {
      return {
        status: 'no_such_title',
        reason: `TMDb has no credit for this performer in "${role.title}"`
      };
    }

    const match = inTitle.find(c => TmdbCredits.charactersMatch(c.character, role.character));

    if (!match) {
      return {
        status: 'wrong_character',
        reason: `Credited in "${role.title}" as ${inTitle.map(c => c.character).join(' / ')}, not "${role.character}"`,
        // The real credit for that title, so the caller can correct rather than drop.
        correction: inTitle.sort((a, b) => b.popularity - a.popularity)[0]
      };
    }

    if (match.isNonVisual) {
      return {
        status: 'non_visual',
        reason: `"${match.character}" is a non-visual credit — no in-character images exist`
      };
    }

    return { status: 'confirmed', credit: match };
  }
}

module.exports = TmdbCredits;
