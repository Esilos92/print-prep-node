const path = require('path');
const config = require('../../utils/config');
const { tmdbCandidates, tmdbTaggedCandidates, fandomCandidates, titleCast, seriesContext, plannedQueries, googleCandidates, isAnimated } = require('./candidates');
const { planCrop } = require('./print');
const { downloadCandidates, downloadOne, isDuplicate } = require('./download');
const { reviewImages, confirmIdentity, finalVerdict, referenceSet } = require('./review');
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
    + (image.source === 'tmdb' ? 1 : 0)
    + ((image.printable || []).includes('8x10') ? 1 : 0);
}

/** Fails every sheet only on resolution, and would pass at twice the size. */
function onlyTooSmall(image) {
  const config = require('../../utils/config');
  const floor = config.print.minDpi;
  return Object.keys(config.print.formats).some(format => {
    const plan = planCrop(image, image.width, image.height, format);
    const dpi = /only (\d+) DPI/.exec(plan.skip || '');
    return dpi && Number(dpi[1]) * 2 >= floor;
  });
}

/** Which sheets this photo can be printed on without cutting anyone or going soft. */
function printableFormats(image) {
  const config = require('../../utils/config');
  return Object.keys(config.print.formats).filter(format => !planCrop(image, image.width, image.height, format).skip);
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
  // Leftover slots go to the best remaining photos, but never pile up
  // posters: one extra at most beyond the poster quota.
  const posterCap = quotas.poster + 1;
  for (const image of ranked) {
    if (chosen.length >= count) break;
    if (chosen.includes(image)) continue;
    if (image.decision.bucket === 'poster' && chosen.filter(i => i.decision.bucket === 'poster').length >= posterCap) continue;
    chosen.push(image);
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
async function officialPoster(official, dir, triedUrls, seen) {
  const fs = require('fs').promises;
  await fs.mkdir(dir, { recursive: true });
  // Among the best-voted posters (English first), try the largest first:
  // the top-voted one is often a small 1000x1500 upload.
  const posters = official.filter(c => c.hint === 'poster');
  const english = posters.filter(c => c.lang === 'en');
  const shortlist = (english.length ? english : posters).slice(0, 5)
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  for (const candidate of shortlist.slice(0, 3)) {
    triedUrls.add(candidate.url);
    const image = await downloadOne(candidate, dir, { anySize: true });
    if (!image || isDuplicate(image, seen)) continue;
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
// Failures an upscale or clean-up could fix. Expression and framing can't be fixed.
const REFINABLE = new Set(['blurry', 'artifacts', 'low_quality_full_size']);

async function selectConfirmed(accepted, count, { celebrityName, role, referencePaths, report, nearMisses = [] }) {
  const needsCheck = (image) => !isAnimated(role) && image.decision.bucket !== 'poster';
  const pool = accepted.slice();
  const confirmed = new Set();
  let checks = 0;
  // A replacement or two per slot; more than that rarely finds a keeper.
  const maxChecks = count * config.sourcing.finalChecksPerSlot;
  // Load and encode the reference photos once, not once per check. Two is
  // enough to judge a face; era stills come first.
  const { references, eraCount } = await referenceSet(role, referencePaths);

  for (;;) {
    const chosen = selectMix(pool, count);
    const pending = chosen.filter(image => needsCheck(image) && !confirmed.has(image));
    if (pending.length === 0 || checks >= maxChecks) {
      return chosen.filter(image => !needsCheck(image) || confirmed.has(image));
    }

    // Several checks at once: each one is a careful, slow call.
    const batch = pending.slice(0, Math.max(1, maxChecks - checks));
    checks += batch.length;
    const results = await mapLimit(batch, 4, image => confirmIdentity(image, { celebrityName, role, references, eraCount }));

    batch.forEach((image, i) => {
      const result = results[i];
      const why = finalVerdict(result);
      if (!why) {
        confirmed.add(image);
        image.finalCheck = result;
      } else {
        pool.splice(pool.indexOf(image), 1);
        report.rejected[why] = (report.rejected[why] || 0) + 1;
        // Confirmed as them, but soft: a candidate for manual refinement.
        if (REFINABLE.has(why)) nearMisses.push({ ...image, finalCheck: result, upscaleReason: why });
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
  const tooSmall = [];
  const nearMisses = [];
  // Co-stars tell the search which "Trespass" we mean, and the reviewer which faces aren't the target.
  role.coStars = role.coStars || await titleCast(celebrityName, role);
  // Other films in the series: which count, which don't, and who the lookalikes are.
  if (!role.series) {
    role.series = await seriesContext(celebrityName, role);
    if (role.series.siblings.length) {
      console.log(`🎬 ${role.title} is part of a series: ${role.series.siblings.map(s => `${s.title} (${s.relation})`).join(', ')}`);
    }
  }

  const runPass = async (candidates) => {
    report.passes++;
    report.candidatesFound += candidates.length;

    const { images } = await downloadCandidates(candidates, dir, { seen, triedUrls, want: perPass });
    report.downloaded += images.length;
    if (images.length === 0) return;

    const { reviewed, reasons } = await reviewImages(images, { celebrityName, role, referencePaths });
    report.reviewed += reviewed.length;
    mergeReasons(report.rejected, reasons);

    for (const image of reviewed) {
      if (!image.decision.accepted) continue;
      // A photo no sheet can take (a wide group shot that can't be cropped
      // without cutting someone out) would only waste a slot.
      image.printable = printableFormats(image);
      if (image.printable.length === 0) {
        report.rejected.unprintable = (report.rejected.unprintable || 0) + 1;
        // Too small by up to half: a 2x upscale would make it printable.
        if (onlyTooSmall(image)) tooSmall.push(image);
        continue;
      }
      accepted.push(image);
    }
  };

  // Pass 1
  const queries = await plannedQueries(celebrityName, role);
  report.queries = queries.map(q => q.q);
  const [official, tagged, fandom, web] = await Promise.all([
    tmdbCandidates(role),
    tmdbTaggedCandidates(celebrityName, role),
    fandomCandidates(role),
    googleCandidates(queries, { animated }).catch(error => {
      report.error = error.message;
      return [];
    })
  ]);
  report.sources = { tmdb: official.length, tmdbTagged: tagged.length, fandom: fandom.filter(f => !f.belowFloor).length, google: web.length };

  // Era references: the top tagged stills from this title show the performer
  // as they looked in this role, which matters most for roles decades old.
  role.eraReferencePaths = [];
  if (!animated) {
    const fs = require('fs').promises;
    const refDir = path.join(dir, 'era-reference');
    await fs.mkdir(refDir, { recursive: true });
    // TMDb's tagged stills first; failing that, the character's own wiki
    // images whose file names name the character (any size will do).
    const nameParts = (role.character || '').toLowerCase().split(/[\s/]+/).filter(w => w.length >= 3);
    const wikiRefs = fandom.filter(f => nameParts.some(w => (f.title || '').toLowerCase().includes(w)));
    for (const candidate of [...tagged.slice(0, 4), ...wikiRefs.slice(0, 4)]) {
      if (role.eraReferencePaths.length >= 2) break;
      const image = await downloadOne(candidate, refDir, { anySize: true });
      if (image) role.eraReferencePaths.push(image.filepath);
    }
    if (role.eraReferencePaths.length) console.log(`🪪 ${role.character}: ${role.eraReferencePaths.length} era reference still(s) from ${role.title}`);
  }
  const poster = config.sourcing.alwaysPoster ? await officialPoster(official, dir, triedUrls, seen) : null;
  report.officialPoster = !!poster;
  // Most reliable first: tagged stills, the character's wiki gallery, TMDb art, then the open web.
  await runPass([...tagged, ...fandom.filter(f => !f.belowFloor), ...official, ...web]);

  // Pass 2, only when the first came up short.
  // A role that found nothing usable in its best sources rarely recovers on
  // page two, so the wider pass only runs when the first found something.
  const worthWidening = accepted.length > 0 || config.sourcing.widenWhenEmpty;
  if (accepted.length < config.sourcing.minPerRole && worthWidening) {
    console.log(`🔁 ${role.character}: ${accepted.length} accepted, widening the search`);
    const more = await googleCandidates(queries, { page: 1, animated }).catch(() => []);
    await runPass(more);
  }

  const slots = config.sourcing.imagesPerRole - (poster ? 1 : 0);
  const selected = await selectConfirmed(accepted, slots, { celebrityName, role, referencePaths, report, nearMisses });

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

  // Potential upscale: confirmed-but-soft photos, then small photos that pass
  // an identity check. Never anything unconfirmed.
  const upscale = [];
  if (config.sourcing.potentialUpscale && !animated) {
    const limit = config.sourcing.upscalePerRole;
    upscale.push(...nearMisses.sort((a, b) => score(b) - score(a)).slice(0, limit));

    const room = limit - upscale.length;
    if (room > 0 && tooSmall.length) {
      const { references, eraCount } = await referenceSet(role, referencePaths);
      const shortlist = tooSmall.sort((a, b) => score(b) - score(a)).slice(0, room * 2);
      const results = await mapLimit(shortlist, 4, image => confirmIdentity(image, { celebrityName, role, references, eraCount }));
      shortlist.forEach((image, i) => {
        const r = results[i];
        const identityOk = r && r.same_person && (r.confidence || 0) >= config.sourcing.confirmConfidence;
        if (identityOk && r.good_expression && r.target_featured && upscale.length < limit) {
          upscale.push({ ...image, finalCheck: r, upscaleReason: 'too_small' });
        }
      });
    }
    seen.push(...upscale);
  }
  report.potentialUpscale = upscale.length;

  report.accepted = accepted.length;
  report.selected = selected.length;
  for (const image of selected) {
    report.byKind[image.decision.bucket] = (report.byKind[image.decision.bucket] || 0) + 1;
  }

  return {
    images: selected.map(image => ({ ...image, role: `${role.character} (${role.title})`, character: role.character, title: role.title, isVoiceRole: animated })),
    upscale: upscale.map(image => ({ ...image, role: `${role.character} (${role.title})`, character: role.character, title: role.title })),
    report
  };
}

module.exports = { sourceRole, selectMix, score };
