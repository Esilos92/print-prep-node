const path = require('path');
const config = require('../../utils/config');
const { tmdbCandidates, plannedQueries, googleCandidates, isAnimated } = require('./candidates');
const { downloadCandidates } = require('./download');
const { reviewImages } = require('./review');

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

async function sourceRole(celebrityName, role, workDir, context) {
  const { referencePath, seen, triedUrls } = context;
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

    const { reviewed, reasons } = await reviewImages(images, { celebrityName, role, referencePath });
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
  await runPass([...official, ...web]);

  // Pass 2, only when the first came up short.
  if (accepted.length < config.sourcing.minPerRole) {
    console.log(`🔁 ${role.character}: ${accepted.length} accepted, widening the search`);
    const more = await googleCandidates(queries, { page: 1, animated }).catch(() => []);
    await runPass(more);
  }

  const selected = selectMix(accepted, config.sourcing.imagesPerRole);
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
