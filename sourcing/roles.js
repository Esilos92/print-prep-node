const AIRoleFetcher = require('./ai-services/AIRoleFetcher');
const TmdbCredits = require('./ai-services/TmdbCredits');
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

module.exports = { fetchCelebrityRoles };
