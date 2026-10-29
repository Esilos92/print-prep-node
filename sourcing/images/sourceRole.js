const path = require('path');
const config = require('../../utils/config');
const { tmdbCandidates, plannedQueries, googleCandidates, isAnimated } = require('./candidates');
const { downloadCandidates, downloadOne } = require('./download');
const { reviewImages, confirmIdentity, loadReferences } = require('./review');
const { mapLimit } = require('../../utils/concurrency');

/**
 * Finds, reviews and selects the photos for one role.
 *
 * Pass 1: TMDb's official images plus the first page of each planned query.
 * Pass 2 (only if pass 1 found fewer than MIN_IMAGES_PER_ROLE): the second
 * results page of every query. A role that comes
 * up empty is retried wider before anyone calls it a failure.
 */

function score(image) {
  const r = image.review;
  const megapixels = (image.width * image.height) / 1e6;
  return r.print_quality * 2
    + (r.identity_confidence || 0) / 2
    + Math.min(2, megapixels / 6)
    + (image.source === 'tmdb' ? 1 : 0);
}

/**
 * Pick up to `count` images aiming for the configured solo/group/poster mix.
 * Slots a kind can't fill go to the best remaining images of any kind.
 */
function selectMix(accepted, count) {
  const mix = config.sourcing.mix;
  const total = (mix.solo + mix.group + mix.poster) || 1;
  const quotas = {
    poster: Math.round(count * mix.poster / total),
    group: Math.round(count * mix.group / total)
  };
  quotas.solo = Math.max(0, count - quotas.poster - quotas.group);

  const ranked = accepted.slice().sort((a, b) => score(b) - score(a));
  const chosen = [];
  for (const bucket of ['solo', 'group', 'poster']) {
    chosen.push(...ranked.filter(i => i.decision.bucket === bucket).slice(0, quotas[bucket]));
  }
  for (const image of ranked) {
    if (chosen.length >= count) break;
    if (!chosen.includes(image)) chosen.push(image);
  }
  return chosen.slice(0, count).sort((a, b) => score(b) - score(a));
}

function mergeReasons(into, from) {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] || 0) + value;
}

/**
 * The title's official poster, taken straight from TMDb: it is the record,
 * so it needs no identity check, and it is always delivered at 11x17.
 */
async function officialPoster(official, dir, triedUrls) {
  const fs = require('fs').promises;
  await fs.mkdir(dir, { recursive: true });
  for (const candidate of official.filter(c => c.hint === 'poster').slice(0, 3)) {
    triedUrls.add(candidate.url);
    const image = await downloadOne(candidate, dir, { anySize: true });
    if (!image) continue;
    return {
      ...image,
      guaranteedPoster: true,
      review: { kind: 'poster', print_quality: 5, identity_confidence: 0, keep_box: null, reason: 'official TMDb poster' },
      decision: { accepted: true, bucket: 'poster' }
    };
  }
  return null;
}

/**
 * Choose the final photos, confirming identity one by one. A photo that
 * fails the stricter check is replaced by the next best, so a lookalike
 * costs a slot only until something better is found.
 */
async function selectConfirmed(accepted, count, { celebrityName, role, referencePaths, report }) {
  const needsCheck = (image) => !isAnimated(role) && image.decision.bucket !== 'poster';
  const pool = accepted.slice();
  const confirmed = new Set();
  let checks = 0;
  const maxChecks = count * 3;
  // Load and encode the reference photos once, not once per check.
  const references = await loadReferences(referencePaths, 1024);

  for (;;) {
    const chosen = selectMix(pool, count);
    const pending = chosen.filter(image => needsCheck(image) && !confirmed.has(image));
    if (pending.length === 0 || checks >= maxChecks) {
      return chosen.filter(image => !needsCheck(image) || confirmed.has(image));
    }

    // Several checks at once: each one is a careful, slow call.
    const batch = pending.slice(0, Math.max(1, maxChecks - checks));
    checks += batch.length;
    const results = await mapLimit(batch, 4, image => confirmIdentity(image, { celebrityName, role, references }));

    batch.forEach((image, i) => {
      const result = results[i];
      const pass = result && result.same_person
        && (result.unchecked || result.confidence >= config.sourcing.confirmConfidence);
      if (pass) {
        confirmed.add(image);
        image.identityCheck = result;
      } else {
        pool.splice(pool.indexOf(image), 1);
        const why = result ? 'failed_identity_check' : 'identity_check_unavailable';
        report.rejected[why] = (report.rejected[why] || 0) + 1;
      }
    });
  }
}

async function sourceRole(celebrityName, role, workDir, context) {
  const { referencePaths, seen, triedUrls } = context;
  const dir = path.join(workDir, 'candidates', `${role.tmdbId || role.title}`.replace(/[^\w-]+/g, '_'));
  const perPass = config.sourcing.candidatesPerPass;
  const animated = isAnimated(role);

  const report = {
    character: role.character,
    title: role.title,
    queries: [],
    candidatesFound: 0,
    downloaded: 0,
    reviewed: 0,
    accepted: 0,
    selected: 0,
    byKind: {},
    rejected: {},
    passes: 0,
    error: null
  };

  const accepted = [];

  const runPass = async (candidates) => {
    report.passes++;
    report.candidatesFound += candidates.length;

    const { images } = await downloadCandidates(candidates.slice(0, perPass), dir, { seen, triedUrls });
    report.downloaded += images.length;
    if (images.length === 0) return;

    const { reviewed, reasons } = await reviewImages(images, { celebrityName, role, referencePaths });
    report.reviewed += reviewed.length;
    mergeReasons(report.rejected, reasons);

    for (const image of reviewed) {
      if (image.decision.accepted) accepted.push(image);
    }
  };

  // Pass 1
  const queries = await plannedQueries(celebrityName, role);
  report.queries = queries.map(q => q.q);
  const [official, web] = await Promise.all([
    tmdbCandidates(role),
    googleCandidates(queries, { animated }).catch(error => {
      report.error = error.message;
      return [];
    })
  ]);
  const poster = config.sourcing.alwaysPoster ? await officialPoster(official, dir, triedUrls) : null;
  report.officialPoster = !!poster;
  await runPass([...official, ...web]);

  // Pass 2, only when the first came up short.
  if (accepted.length < config.sourcing.minPerRole) {
    console.log(`🔁 ${role.character}: ${accepted.length} accepted, widening the search`);
    const more = await googleCandidates(queries, { page: 1, animated }).catch(() => []);
    await runPass(more);
  }

  const slots = config.sourcing.imagesPerRole - (poster ? 1 : 0);
  const selected = await selectConfirmed(accepted, slots, { celebrityName, role, referencePaths, report });

  // A small TMDb poster prints soft; a larger reviewed one from the web wins.
  const posterPixels = (img) => img.width * img.height;
  const biggerPoster = poster && accepted
    .filter(i => i.decision.bucket === 'poster' && posterPixels(i) > posterPixels(poster) * 1.5)
    .sort((a, b) => posterPixels(b) - posterPixels(a))[0];

  if (biggerPoster) {
    biggerPoster.guaranteedPoster = true;
    if (!selected.includes(biggerPoster)) selected.unshift(biggerPoster);
  } else if (poster) {
    selected.unshift(poster);
  } else if (config.sourcing.alwaysPoster) {
    const best = selected.find(i => i.decision.bucket === 'poster');
    if (best) best.guaranteedPoster = true;
    else console.log(`⚠️ ${role.character}: no official poster found for ${role.title}`);
  }
  // Later roles must not reuse these pictures.
  seen.push(...selected);

  report.accepted = accepted.length;
  report.selected = selected.length;
  for (const image of selected) {
    report.byKind[image.decision.bucket] = (report.byKind[image.decision.bucket] || 0) + 1;
  }

  return {
    images: selected.map(image => ({ ...image, role: `${role.character} (${role.title})`, character: role.character, title: role.title, isVoiceRole: animated })),
    report
  };
}

module.exports = { sourceRole, selectMix, score };
