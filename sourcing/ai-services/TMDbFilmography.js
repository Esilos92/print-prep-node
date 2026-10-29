const axios = require('axios');
const config = require('../../utils/config');
const { chat } = require('../../utils/openai');

const BASE_URL = 'https://api.themoviedb.org/3';

// TMDb genre ids for work that isn't an acting role.
const NON_ACTING_GENRES = new Set([
  99,    // Documentary
  10763, // News
  10764, // Reality
  10767  // Talk
]);
const ANIMATION_GENRE = 16;

const SELF_CHARACTER = /\b(self|himself|herself|themselves|themself|host|guest|presenter|contestant|judge|archive footage)\b/i;

/**
 * Pick the TMDb person for a name: exact name match where possible, then the
 * most popular. Exact matters — "Chris Evans" is several working actors.
 * Shared with ReferencePortrait so roles and the reference photo always come
 * from the same person.
 */
async function findPerson(name, { requireProfile = false } = {}) {
  const apiKey = config.api.tmdbKey;
  if (!apiKey) return null;

  const response = await axios.get(`${BASE_URL}/search/person`, {
    params: { api_key: apiKey, query: name },
    timeout: 15000
  });

  let results = response.data?.results || [];
  if (requireProfile) results = results.filter(p => p.profile_path);
  if (results.length === 0) return null;

  const normalize = (value) => (value || '').toLowerCase().trim();
  const exact = results.filter(p => normalize(p.name) === normalize(name));
  const pool = exact.length > 0 ? exact : results;

  return pool.reduce((a, b) => ((b.popularity || 0) > (a.popularity || 0) ? b : a));
}

/**
 * Builds a role list from a performer's actual TMDb credits.
 *
 * Role discovery used to ask a language model to recall a filmography from
 * memory. That works for the very famous and quietly drops or garbles roles
 * for everyone else. TMDb is the record; the model is only used to choose
 * which of the real credits fans would most recognise.
 */
class TMDbFilmography {
  get available() {
    return !!config.api.tmdbKey;
  }

  async getRoles(celebrityName, maxRoles) {
    if (!this.available) return [];

    const person = await findPerson(celebrityName);
    if (!person) {
      console.log(`⚠️ TMDb has no person named ${celebrityName}`);
      return [];
    }
    console.log(`🎞️ TMDb match: ${person.name} (id ${person.id}, known for ${person.known_for_department || 'unknown'})`);

    const response = await axios.get(`${BASE_URL}/person/${person.id}/combined_credits`, {
      params: { api_key: config.api.tmdbKey },
      timeout: 15000
    });

    const candidates = this.rankCredits(response.data?.cast || []);
    console.log(`🎞️ ${candidates.length} acting credits after filtering`);
    if (candidates.length === 0) return [];

    const shortlist = candidates.slice(0, 25);
    const picked = await this.pickWithAI(celebrityName, shortlist, maxRoles);
    return picked || shortlist.slice(0, maxRoles);
  }

  /** Drop non-acting and bit-part credits, then rank by how well known each role is. */
  rankCredits(cast) {
    const roles = [];

    for (const credit of cast) {
      const isTv = credit.media_type === 'tv';
      const title = (isTv ? credit.name : credit.title) || '';
      const character = this.cleanCharacter(credit.character);
      const genres = credit.genre_ids || [];

      if (!title || !character) continue;
      if (SELF_CHARACTER.test(credit.character || '')) continue;
      if (genres.some(g => NON_ACTING_GENRES.has(g))) continue;
      if (isTv && (credit.episode_count || 0) < 3) continue;   // guest spots
      if (!isTv && (credit.order ?? 99) > 15) continue;        // background parts

      const isVoice = genres.includes(ANIMATION_GENRE) || /\(voice\)/i.test(credit.character || '');
      const date = isTv ? credit.first_air_date : credit.release_date;

      // Lasting reach (votes), how central the part was, and current interest.
      const reach = Math.log10((credit.vote_count || 0) + 10);
      const billing = isTv
        ? Math.min(1, 0.3 + (credit.episode_count || 0) / 25)
        : (credit.order ?? 99) <= 2 ? 1 : (credit.order ?? 99) <= 6 ? 0.8 : 0.6;
      const buzz = 1 + Math.min(credit.popularity || 0, 100) / 100;

      roles.push({
        character,
        title,
        year: date ? date.slice(0, 4) : 'unknown',
        medium: isVoice ? (isTv ? 'voice_tv' : 'voice_movie') : (isTv ? 'live_action_tv' : 'live_action_movie'),
        episodes: isTv ? credit.episode_count : undefined,
        billing: isTv ? undefined : credit.order,
        votes: credit.vote_count || 0,
        score: reach * billing * buzz,
        source: 'tmdb'
      });
    }

    roles.sort((a, b) => b.score - a.score);
    roles.forEach((role, i) => {
      role.popularity = i < 3 ? 'high' : 'medium';
    });
    return roles;
  }

  /** "Josh / Joshua (voice)" -> "Josh". */
  cleanCharacter(raw) {
    return (raw || '')
      .replace(/\(.*?\)/g, '')
      .split(/\s+\/\s+|;/)[0]
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Let the model choose the roles fans would recognise, from real credits
   * only. Returns null on any failure so the caller falls back to the ranking.
   */
  async pickWithAI(celebrityName, shortlist, maxRoles) {
    if (!process.env.OPENAI_API_KEY) return null;

    const lines = shortlist.map((r, i) => {
      const detail = r.medium.includes('tv') ? `${r.episodes} episodes` : `billed #${(r.billing ?? 0) + 1}`;
      return `${i + 1}. ${r.character} — ${r.title} (${r.year}, ${r.medium}, ${detail}, ${r.votes} votes)`;
    });

    const prompt = `These are ${celebrityName}'s acting credits from TMDb:

${lines.join('\n')}

Pick up to ${maxRoles} roles that fans would most recognise and want an autographed photo from.

Rules:
- Only pick from the list above, by number.
- Every pick must be a different character, and at most one per film series or franchise.
- Prefer major, recognisable parts over minor ones.
- You may tidy a character name (e.g. add a surname the list leaves out) but it must be the same character.

Reply with JSON only:
{"picks": [{"n": 1, "character": "Character Name", "franchise": "series name or null"}]}`;

    try {
      const reply = await chat({
        model: config.models.roleDiscovery,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 800
      });

      const json = reply.match(/\{[\s\S]*\}/);
      const picks = JSON.parse(json ? json[0] : reply).picks || [];

      const roles = [];
      for (const pick of picks) {
        const base = shortlist[(pick.n || 0) - 1];
        if (!base) continue;
        roles.push({
          ...base,
          character: (pick.character || base.character).trim(),
          franchise: pick.franchise && pick.franchise !== 'null' ? pick.franchise : null
        });
      }

      if (roles.length === 0) return null;
      console.log(`🤖 ${config.models.roleDiscovery} picked ${roles.length} roles from ${shortlist.length} TMDb credits`);
      return roles;
    } catch (error) {
      console.log(`⚠️ AI role picking failed, using TMDb ranking: ${error.message}`);
      return null;
    }
  }
}

module.exports = { TMDbFilmography, findPerson };
