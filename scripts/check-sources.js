#!/usr/bin/env node
/**
 * Shows what each photo source finds for one role, without running a job.
 *
 *   node scripts/check-sources.js "Nico Tortorella" "Scream 4"
 *   node scripts/check-sources.js "Nico Tortorella" "Scream 4" --google
 *
 * No AI calls. Fandom costs one SerpApi search; --google also runs the
 * fallback Google queries (about five more SerpApi searches).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');
const config = require('../utils/config');
const TmdbCredits = require('../sourcing/ai-services/TmdbCredits');
const c = require('../sourcing/images/candidates');

async function main() {
  const [name, title] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const withGoogle = process.argv.includes('--google');
  if (!name || !title) {
    console.log('Usage: node scripts/check-sources.js "Celebrity Name" "Title" [--google]');
    process.exit(1);
  }

  const credits = await new TmdbCredits().getCredits(name);
  if (!credits) {
    console.log(`TMDb: no person found for "${name}" (or TMDB_API_KEY missing)`);
    process.exit(1);
  }
  const credit = credits.find(cr => TmdbCredits.titlesMatch(cr.title, title));
  if (!credit) {
    console.log(`TMDb: "${name}" has no credit matching "${title}". Closest titles:`);
    credits.slice(0, 15).forEach(cr => console.log(`  - ${cr.title} (${cr.year}) as ${cr.character}`));
    process.exit(1);
  }

  const role = {
    character: credit.character,
    title: credit.title,
    year: credit.year,
    tmdbId: credit.tmdbId,
    mediaType: credit.mediaType,
    medium: credit.isVoice ? `voice_${credit.mediaType}` : `live_action_${credit.mediaType}`
  };
  console.log(`Role: ${role.character} in ${role.title} (${role.year}) — TMDb ${role.mediaType} ${role.tmdbId}`);
  console.log(`Print floor at ${config.print.minDpi} DPI: at least ${c.minimumSize().short}x${c.minimumSize().long}px\n`);

  const show = (label, list) => {
    console.log(`${label}: ${list.length}`);
    list.slice(0, 5).forEach(x => console.log(`   ${x.width || '?'}x${x.height || '?'}  ${x.hint || ''}  ${x.url}`));
  };

  role.coStars = await c.titleCast(name, role);
  console.log(`Co-stars: ${role.coStars.join(', ') || '(none found)'}\n`);

  show('TMDb posters + stills', await c.tmdbCandidates(role));

  // Raw tagged-image totals, to tell "TMDb has none" from "filter dropped them".
  try {
    const search = await axios.get('https://api.themoviedb.org/3/search/person', {
      params: { api_key: config.api.tmdbKey, query: name }, timeout: 15000
    });
    const person = search.data?.results?.[0];
    const tagged = await axios.get(`https://api.themoviedb.org/3/person/${person.id}/tagged_images`, {
      params: { api_key: config.api.tmdbKey }, timeout: 15000
    });
    const all = tagged.data?.results || [];
    const forTitle = all.filter(i => i.media?.id === role.tmdbId);
    console.log(`TMDb tagged images: ${tagged.data?.total_results ?? all.length} in total for ${person.name}, ${forTitle.length} on page 1 for this title`);
  } catch (error) {
    console.log(`TMDb tagged images: request failed — ${error.response?.status || ''} ${error.message}`);
  }
  show('TMDb tagged (usable size)', await c.tmdbTaggedCandidates(name, role));

  show('Fandom gallery', await c.fandomCandidates(role));

  if (withGoogle) {
    show('Google (fallback queries)', await c.googleCandidates(c.templateQueries(name, role)));
  } else {
    console.log('Google: skipped (add --google to include it)');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
