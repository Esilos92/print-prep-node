#!/usr/bin/env node
/**
 * Shows what the photo reviewer sees and decides for one role, without
 * running a job. For debugging "it rejected photos that are obviously them".
 *
 *   node scripts/check-review.js "David Labrava" "Sons of Anarchy"
 *   node scripts/check-review.js "David Labrava" "Sons of Anarchy" --query '"Happy Lowman" "Sons of Anarchy"'
 *
 * Prints the reference photos (open the links to check they show the right
 * person), runs one image search, and reviews the top 8 results twice: with
 * the reference set a job would use, and with profile photos only. Cost: one
 * SerpApi search plus two batch reviews (a few cents).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const config = require('../utils/config');
const TmdbCredits = require('../sourcing/ai-services/TmdbCredits');
const ReferencePortrait = require('../sourcing/ai-services/ReferencePortrait');
const c = require('../sourcing/images/candidates');
const { downloadCandidates, downloadOne } = require('../sourcing/images/download');
const { reviewImages } = require('../sourcing/images/review');

async function main() {
  const args = process.argv.slice(2);
  const qIndex = args.indexOf('--query');
  const query = qIndex >= 0 ? args[qIndex + 1] : null;
  const queryValueAt = qIndex >= 0 ? qIndex + 1 : -1;
  const [name, title] = args.filter((a, i) => !a.startsWith('--') && i !== queryValueAt);
  if (!name || !title) {
    console.log('Usage: node scripts/check-review.js "Celebrity Name" "Title" [--query "..."]');
    process.exit(1);
  }

  const credits = await new TmdbCredits().getCredits(name);
  const credit = (credits || []).find(cr => TmdbCredits.titlesMatch(cr.title, title));
  if (!credit) {
    console.log(`No TMDb credit for "${name}" in "${title}".`);
    process.exit(1);
  }
  const role = {
    character: credit.character, title: credit.title, year: credit.year,
    tmdbId: credit.tmdbId, mediaType: credit.mediaType, episodes: credit.episodeCount,
    medium: credit.isVoice ? `voice_${credit.mediaType}` : `live_action_${credit.mediaType}`
  };
  role.coStars = await c.titleCast(name, role);
  console.log(`Role: ${role.character} in ${role.title} (${role.year})`);
  console.log(`Models: batch review ${config.models.review}, final check ${config.models.vision}\n`);

  const dir = path.join(__dirname, '..', 'temp', 'check-review');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  // Profile references, with their TMDb links so they can be eyeballed.
  const person = (await axios.get('https://api.themoviedb.org/3/search/person', {
    params: { api_key: config.api.tmdbKey, query: name }, timeout: 15000
  })).data?.results?.[0];
  console.log(`TMDb person: ${person?.name} (id ${person?.id})`);
  const profilePaths = await new ReferencePortrait().getPortraits(name, path.join(dir, 'reference'), 3);
  try {
    const profiles = (await axios.get(`https://api.themoviedb.org/3/person/${person.id}/images`, {
      params: { api_key: config.api.tmdbKey }, timeout: 15000
    })).data?.profiles || [];
    console.log('Profile reference photos:');
    profiles.slice(0, 3).forEach(p => console.log(`   https://image.tmdb.org/t/p/original${p.file_path}`));
  } catch {
    // links are a convenience only
  }

  // Era references, chosen the way a job chooses them.
  const tagged = await c.tmdbTaggedCandidates(name, role);
  const fandom = await c.fandomCandidates(role);
  const nameParts = (role.character || '').toLowerCase().split(/[\s/]+/).filter(w => w.length >= 3);
  const wikiRefs = fandom.filter(f => nameParts.some(w => (f.title || '').toLowerCase().includes(w)));
  const eraPaths = [];
  console.log('Era reference photos (what a job would use):');
  for (const candidate of [...tagged.slice(0, 4), ...wikiRefs.slice(0, 4)]) {
    if (eraPaths.length >= 2) break;
    const image = await downloadOne(candidate, path.join(dir, 'era'), { anySize: true });
    if (image) {
      eraPaths.push(image.filepath);
      console.log(`   ${image.width}x${image.height}  ${candidate.title}  ${candidate.url}`);
    }
  }
  if (!eraPaths.length) console.log('   (none)');

  // One search, top 8 results.
  // Default: the plain search every job now leads with.
  const search = query ? { q: query, aim: 'solo' } : c.plainQuery(role);
  console.log(`\nSearch: ${search.q}`);
  const results = await c.googleCandidates([search]);
  const { images } = await downloadCandidates(results, path.join(dir, 'candidates'), { want: 8 });
  console.log(`Downloaded ${images.length} of ${results.length} results`);

  for (const [label, eraReferencePaths] of [['WITH era references (as a job runs)', eraPaths], ['PROFILE photos only', []]]) {
    console.log(`\n=== Review ${label}`);
    const { reviewed } = await reviewImages(images, {
      celebrityName: name,
      role: { ...role, eraReferencePaths },
      referencePaths: profilePaths
    });
    for (const img of reviewed) {
      const r = img.review;
      console.log(`${img.decision.accepted ? 'ACCEPT' : 'reject'.padEnd(6)}  identity ${String(r.identity_confidence).padStart(2)}/10  ${r.kind.padEnd(5)} ${(img.decision.why || '').padEnd(20)} ${r.reason}`);
      console.log(`        ${img.url}`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
