const axios = require('axios');
const config = require('../utils/config');
const AIRoleFetcher = require('./ai-services/AIRoleFetcher');
const TmdbCredits = require('./ai-services/TmdbCredits');
const { TMDbFilmography } = require('./ai-services/TMDbFilmography');
const roleCache = require('../utils/roleCache');

/**
 * Role discovery: cache → roles from TMDb credits (AI picks the best-known)
 * → a credit check for any role that came from the AI's memory instead.
 *
 * This replaces a ~1,100-line orchestrator whose web-search verifier, "red
 * flag" detector, emergency recovery and search-term builder were all made
 * redundant once roles came from TMDb and photo search moved to
 * sourcing/images/.
 */

const fetcher = new AIRoleFetcher();
const tmdb = new TmdbCredits();

/**
 * Check roles that did not come from TMDb against the real credit list.
 * Confirmed roles get TMDb's ids; a wrong character name is corrected to the
 * real credit; non-visual credits (narrator, himself) and titles the person
 * was never in are dropped. If TMDb can't be reached, roles are kept.
 */
async function checkCredits(roles, celebrityName) {
  const unchecked = roles.filter(r => r.source !== 'tmdb');
  if (unchecked.length === 0 || !tmdb.available) return roles;

  const credits = await tmdb.getCredits(celebrityName);
  if (!credits) return roles;

  const kept = [];
  for (const role of roles) {
    if (role.source === 'tmdb') {
      kept.push(role);
      continue;
    }

    const verdict = TmdbCredits.checkRole(role, credits);
    const credit = verdict.status === 'confirmed' ? verdict.credit
      : verdict.status === 'wrong_character' && verdict.correction && !TmdbCredits.isNonVisualCredit(verdict.correction.character)
        ? verdict.correction
        : null;

    if (credit) {
      kept.push({
        ...role,
        character: credit.character || role.character,
        year: role.year && role.year !== 'unknown' ? role.year : credit.year,
        tmdbId: credit.tmdbId,
        mediaType: credit.mediaType,
        isVoiceRole: credit.isVoice,
        medium: credit.isVoice ? `voice_${credit.mediaType}` : `live_action_${credit.mediaType}`,
        creditVerified: true
      });
      if (verdict.status === 'wrong_character') {
        console.log(`  🔁 ${role.character} (${role.title}) → ${credit.character}`);
      }
    } else if (verdict.status === 'unchecked') {
      kept.push(role);
    } else {
      console.log(`  ⛔ ${role.character} (${role.title}) — ${verdict.reason}`);
    }
  }

  console.log(`🎬 Credit check: ${kept.length} of ${roles.length} roles kept`);
  return kept;
}

async function fetchCelebrityRoles(celebrityName) {
  const cached = await roleCache.get(celebrityName);
  if (cached) {
    console.log(`💾 Using cached roles for ${celebrityName} (cached ${cached.ageHours}h ago)`);
    return cached.value;
  }

  const discovered = await fetcher.fetchRoles(celebrityName);
  const roles = (await checkCredits(discovered, celebrityName)).map(role => ({
    ...role,
    isVoiceRole: role.isVoiceRole ?? /voice|anim/i.test(role.medium || '')
  }));

  const result = { celebrity: celebrityName, totalRoles: roles.length, roles };
  await roleCache.set(celebrityName, result);
  return result;
}

/** The role shape the photo pipeline expects, from a TMDb credit. */
function roleFromCredit(credit) {
  return {
    character: credit.character,
    title: credit.title,
    year: credit.year || 'unknown',
    tmdbId: credit.tmdbId,
    mediaType: credit.mediaType,
    medium: credit.isVoice ? `voice_${credit.mediaType}` : `live_action_${credit.mediaType}`,
    isVoiceRole: !!credit.isVoice,
    poster: credit.poster || null,
    episodes: credit.episodes || credit.episodeCount || null,
    popularity: 'high',
    source: 'tmdb',
    creditVerified: true
  };
}

/** Select mode: a list of roles to pick from, most popular or newest first. */
async function listRoles(celebrityName, { sort = 'popular', limit = 10 } = {}) {
  const { person, roles } = await new TMDbFilmography().listRoles(celebrityName, { sort, limit });
  return {
    person,
    roles: roles.map(r => ({
      character: r.character,
      title: r.title,
      year: r.year,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      medium: r.medium,
      isVoiceRole: /voice/.test(r.medium),
      poster: r.poster,
      episodes: r.episodes || null,
      recent: r.recent,
      popularity: 'high',
      source: 'tmdb',
      creditVerified: true
    }))
  };
}

/**
 * Custom mode: turn typed titles into roles. Each title is matched against
 * the person's real credits; a loose or misspelled title is looked up in
 * TMDb's own search first. A title they have no credit for comes back as
 * not_found with TMDb's best guess at the title, so the user can supply the
 * character name and search it anyway.
 */
async function resolveTitles(celebrityName, titles) {
  const credits = await tmdb.getCredits(celebrityName);
  if (!credits) return { found: false, results: [] };

  const best = (list) => list
    .filter(c => !c.isNonVisual)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];

  const results = [];
  for (const input of titles.map(t => (t || '').trim()).filter(Boolean)) {
    let credit = best(credits.filter(c => TmdbCredits.titlesMatch(c.title, input)));
    let guess = null;

    if (!credit) {
      try {
        const response = await axios.get('https://api.themoviedb.org/3/search/multi', {
          params: { api_key: config.api.tmdbKey, query: input },
          timeout: 15000
        });
        const hits = (response.data?.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 8);
        const ids = new Set(hits.map(h => h.id));
        credit = best(credits.filter(c => ids.has(c.tmdbId)));
        if (!credit && hits[0]) {
          const h = hits[0];
          guess = {
            title: h.title || h.name,
            year: (h.release_date || h.first_air_date || '').slice(0, 4) || 'unknown',
            tmdbId: h.id,
            mediaType: h.media_type,
            poster: h.poster_path ? `https://image.tmdb.org/t/p/w185${h.poster_path}` : null
          };
        }
      } catch {
        // search unavailable: report as not found
      }
    }

    results.push(credit
      ? { input, status: 'matched', role: roleFromCredit(credit) }
      : { input, status: 'not_found', guess });
  }
  return { found: true, results };
}

/**
 * A role the user typed in by hand (title not in the person's credits).
 * It is searched like any other; identity checks still apply.
 */
function manualRole({ character, title, year, tmdbId, mediaType }) {
  return {
    character: (character || '').trim(),
    title: (title || '').trim(),
    year: year || 'unknown',
    tmdbId: tmdbId || null,
    mediaType: mediaType || null,
    medium: mediaType === 'tv' ? 'live_action_tv' : 'live_action_movie',
    isVoiceRole: false,
    popularity: 'medium',
    source: 'manual'
  };
}

module.exports = { fetchCelebrityRoles, listRoles, resolveTitles, manualRole };
