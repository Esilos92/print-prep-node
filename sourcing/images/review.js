const sharp = require('sharp');
const config = require('../../utils/config');
const { chat } = require('../../utils/openai');
const { isAnimated } = require('./candidates');
const { mapLimit } = require('../../utils/concurrency');

/**
 * Batch image review.
 *
 * The old verifier made one vision call per image and asked for a one-word
 * verdict. Every call re-sent the reference photo, nothing explained a
 * rejection, and an API error was recorded as a rejection — so an outage and
 * "every photo was wrong" looked identical.
 *
 * Here one call reviews a batch against one reference and returns structured
 * facts per image: what kind of photo it is, whether the target is in it,
 * whether it comes from the production, how well it will print, and the
 * region a crop must keep. Code, not the model, decides what is accepted, so
 * the rules are visible and adjustable.
 */

const PROBLEMS = [
  'none', 'wrong_person', 'not_from_production', 'other_project', 'merchandise_or_packaging',
  'fan_art', 'watermark', 'collage_or_text_overlay', 'low_quality', 'unrelated'
];

const REVIEW_SCHEMA = {
  name: 'image_review',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['images'],
    properties: {
      images: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'kind', 'target_present', 'identity_confidence', 'clearly_unofficial',
            'clearly_other_project', 'problem', 'print_quality', 'keep_box', 'reason'],
          properties: {
            index: { type: 'integer' },
            kind: { type: 'string', enum: ['solo', 'group', 'poster', 'official_art', 'other'] },
            target_present: { type: 'boolean' },
            identity_confidence: { type: 'integer' },
            clearly_unofficial: { type: 'boolean' },
            clearly_other_project: { type: 'boolean' },
            problem: { type: 'string', enum: PROBLEMS },
            print_quality: { type: 'integer' },
            keep_box: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'w', 'h'],
              properties: {
                x: { type: 'number' }, y: { type: 'number' },
                w: { type: 'number' }, h: { type: 'number' }
              }
            },
            reason: { type: 'string' }
          }
        }
      }
    }
  }
};

/** "This role is from 2011; the reference photos are more recent." */
function eraNote(celebrityName, role) {
  const year = parseInt(role.year, 10);
  const gap = Number.isFinite(year) ? new Date().getFullYear() - year : 0;
  const era = gap >= 4
    ? `This role is from ${year}, about ${gap} years ago. ${role.eraReferencePaths?.length ? 'The profile photos' : 'The reference photos'} are likely more recent, so expect ${celebrityName} to look younger, with different hair, facial hair, weight or styling. Match bone structure, not current look.\n`
    : '';
  const cast = role.coStars?.length
    ? `Other cast members of "${role.title}": ${role.coStars.join(', ')}. They are NOT the target, but their presence is good evidence the photo is from this title.\n`
    : '';
  return era + cast + seriesNote(celebrityName, role);
}

/**
 * Sequels look alike. Spell out which other films in the series count for
 * this role (same character) and which don't, and name the lookalikes.
 */
function seriesNote(celebrityName, role) {
  const siblings = role.series?.siblings || [];
  if (siblings.length === 0) return '';
  const list = (items) => items.map(s => `${s.title} (${s.year})`).join(', ');
  const same = siblings.filter(s => s.relation === 'same');
  const different = siblings.filter(s => s.relation === 'different');
  const absent = siblings.filter(s => s.relation === 'absent');

  let note = `"${role.title}" is part of a film series, and the films look alike.\n`;
  if (same.length) note += `${celebrityName} also plays ${role.character} in ${list(same)}: photos of them as ${role.character} from ${same.length === 1 ? 'that film' : 'those films'} are fine — do NOT mark them clearly_other_project.\n`;
  if (different.length) note += `${celebrityName} plays a different character in ${list(different)}: photos from ${different.length === 1 ? 'that film' : 'those films'} are other projects for this role.\n`;
  if (absent.length) note += `${celebrityName} is NOT in ${list(absent)}: photos from ${absent.length === 1 ? 'that film' : 'those films'} are other projects, and anyone in them is not ${celebrityName}.\n`;
  if (role.series?.lookalikes?.length) note += `Actors from those films who may look similar and are NOT the target: ${role.series.lookalikes.join(', ')}.\n`;
  return note;
}

/**
 * Describe the reference photos. Era references are TMDb stills from this
 * very title tagged as containing the performer — the best possible match
 * for a role from decades ago. Recent references are profile photos.
 */
function referenceIntro(celebrityName, role, eraCount, total) {
  if (total === 0) return '';
  const recent = total - eraCount;
  const parts = [];
  if (eraCount > 0) {
    parts.push(`REFERENCE ${eraCount === 1 ? '1 is a still' : `1-${eraCount} are stills`} from "${role.title}" itself${role.year ? ` (${role.year})` : ''}, recorded (by TMDb or the title's wiki) as showing ${celebrityName} as ${role.character} — the best guide to how they looked in this role. Other people may also be in ${eraCount === 1 ? 'it' : 'them'}; ${celebrityName} is the one who also matches the other references.`);
  }
  if (recent > 0) {
    const first = eraCount + 1;
    parts.push(`REFERENCE ${recent === 1 ? `${first} is a profile photo` : `${first}-${total} are profile photos`} of ${celebrityName}, probably more recent.`);
  }
  return parts.join(' ') + ` Judge identity by facial structure — eyes, nose, jaw, ears, face shape — not hair, clothing, age or lighting.\n`;
}

function buildPrompt(celebrityName, role, count, referenceCount, eraCount = 0) {
  const hasReference = referenceCount > 0;
  const animated = isAnimated(role);
  const target = animated
    ? `the animated character ${role.character} from "${role.title}" (voiced by ${celebrityName})`
    : `${celebrityName} as ${role.character} in "${role.title}"`;

  return `You are selecting photos for autograph prints of ${target}.
${hasReference ? referenceIntro(celebrityName, role, eraCount, referenceCount) + 'Lookalike co-stars are common; the careful check later decides uncertain cases.\n' : ''}
${animated ? '' : eraNote(celebrityName, role)}Then come ${count} candidate images, labelled Image 1 to Image ${count}. Each label gives where the image was found.

For EACH candidate report:
- kind: ${animated
    ? '"official_art" for studio artwork, key visuals or official promo art of the character; "solo" for a screenshot featuring the character alone; "group" for official art or screenshots with several characters; "poster" for an official poster or cover; "other" otherwise.'
    : '"solo" when the target is the only or clearly main person; "group" for two or more people where the target is clearly identifiable; "poster" for an official poster, key art or title card; "other" otherwise.'}
- target_present: ${animated ? `${role.character} is clearly depicted` : `the REFERENCE person appears and can be identified`}. For posters, whether ${animated ? 'the character' : 'they'} appear on it.
- identity_confidence: 1-10, how likely it is that the target is in the image: 1-3 clearly someone else or absent, 4-6 unsure (a careful second check will decide), 7-10 clearly them.
- clearly_unofficial: ${animated
    ? 'TRUE only when the image is clearly NOT official material: fan art, fan edits, cosplay, AI-generated art, merchandise photos. Studio art, official promotion and real screenshots are FALSE.'
    : `TRUE only on clear visible evidence the photo is NOT from the production or its promotion: red carpet or press wall, premiere, interview or talk-show set, podcast, convention panel or signing, fan photo, selfie, paparazzi, or an obvious personal headshot / modelling shoot (photographer's seamless backdrop, posed fashion styling). Many roles are set in the present day in ordinary clothes, and most scene stills give no sign of which production they are from — that is normal and is FALSE. When in doubt, FALSE.`}
- clearly_other_project: TRUE only when there is clear evidence the image belongs to a different film or show than "${role.title}" (another title's poster or logo, a costume or setting that unmistakably belongs elsewhere, or the source label names another title). Not being able to tell which project it is from is FALSE.
- problem: the single main reason it is unusable, or "none". Use not_from_production / other_project only when the matching clearly_ field is TRUE, and wrong_person only when the target is clearly absent (identity_confidence 1-3) — never just because you are unsure. merchandise_or_packaging covers DVD/Blu-ray/VHS cases, toys, shop listings and photos of physical posters for sale. collage_or_text_overlay covers memes, collages, article screenshots and heavy captions (a real poster's own text is fine).
- print_quality: 1-5 for a large print — sharpness, noise, lighting, composition. 1 = unusable, 3 = fine, 5 = excellent. Horror, blood and violent scenes are acceptable content; judge only the photo's quality.
- keep_box: the smallest box (x, y, w, h as fractions 0-1 of the image width/height, origin top-left) that a crop must not cut: it must contain EVERY face in the image (forehead to chin, ear to ear) and the target's whole head and hair. Faces only, not bodies — the crop adds its own margin. For posters, the whole artwork including the title.
- reason: at most 12 words.

Return one entry per candidate, using its Image number as index.`;
}

async function toJpegBase64(filepath, maxSide = 768) {
  const buffer = await sharp(filepath, { failOn: 'none' })
    .rotate()
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buffer.toString('base64');
}

function describeSource(image) {
  if (image.source === 'closeup') return 'full-resolution close-up of the faces in Image 1';
  if (image.source === 'tmdb') return `TMDb official ${image.hint}`;
  let host = '';
  try { host = new URL(image.pageUrl || image.url).hostname; } catch { /* ignore */ }
  return `web: "${(image.title || '').slice(0, 80)}" (${host})`;
}

async function callOpenAI(prompt, references, images, { maxTokens, schema = REVIEW_SCHEMA, effort } = {}) {
  const detail = config.verification.visionDetail;
  const content = [{ type: 'text', text: prompt }];

  for (const [i, ref] of references.entries()) {
    content.push({ type: 'text', text: references.length > 1 ? `REFERENCE ${i + 1}:` : 'REFERENCE:' });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${ref}`, detail } });
  }
  for (const [i, image] of images.entries()) {
    content.push({ type: 'text', text: `Image ${i + 1} — ${describeSource(image)}:` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.b64}`, detail } });
  }

  const reply = await chat({
    model: config.models.vision,
    messages: [{ role: 'user', content }],
    maxTokens: maxTokens || 250 * images.length,
    schema,
    effort
  });
  return schema === REVIEW_SCHEMA ? (reply.images || []) : reply;
}

/** Claude fallback with the same schema, forced through a tool call. */
async function callClaude(prompt, references, images, { schema = REVIEW_SCHEMA } = {}) {
  const content = [{ type: 'text', text: prompt }];
  for (const [i, ref] of references.entries()) {
    content.push({ type: 'text', text: references.length > 1 ? `REFERENCE ${i + 1}:` : 'REFERENCE:' });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: ref } });
  }
  for (const [i, image] of images.entries()) {
    content.push({ type: 'text', text: `Image ${i + 1} — ${describeSource(image)}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.b64 } });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.models.visionFallback,
      max_tokens: 300 * images.length,
      tools: [{ name: 'report', description: 'Report the review', input_schema: schema.schema }],
      tool_choice: { type: 'tool', name: 'report' },
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Claude ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const tool = (data.content || []).find(c => c.type === 'tool_use');
  return schema === REVIEW_SCHEMA ? (tool?.input?.images || []) : (tool?.input || {});
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Review one batch. Retries transient failures, then tries Claude. Throws
 * only when no service could review it — the caller reports that as an
 * outage, never as "rejected".
 */
async function reviewBatch(prompt, references, images, options = {}) {
  const errors = [];

  if (process.env.OPENAI_API_KEY) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return { results: await callOpenAI(prompt, references, images, options), service: 'openai' };
      } catch (error) {
        errors.push(error.message);
        if (attempt < 3) await sleep(2000 * attempt * attempt);
      }
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { results: await callClaude(prompt, references, images, options), service: 'claude' };
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(`Image review unavailable: ${errors[errors.length - 1] || 'no vision API key set'}`);
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

function normaliseBox(box) {
  if (!box) return null;
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const w = Math.min(1 - x, clamp01(box.w));
  const h = Math.min(1 - y, clamp01(box.h));
  return w > 0.01 && h > 0.01 ? { x, y, w, h } : null;
}

/** The acceptance rules, in one place. */
function decide(review, role) {
  const animated = isAnimated(role);
  const minConfidence = config.verification.minConfidence;
  const kind = review.kind === 'official_art' ? 'solo' : review.kind;

  const identityDoubt = review.problem === 'wrong_person' && (review.identity_confidence || 0) > 3 && !animated;
  if (review.problem && review.problem !== 'none' && !identityDoubt) return { accepted: false, why: review.problem };
  if (kind === 'other') return { accepted: false, why: 'not_a_usable_kind' };
  // Context checks reject only on evidence; identity is where the strictness lives.
  if (review.clearly_unofficial) return { accepted: false, why: animated ? 'not_official' : 'not_from_production' };
  if (review.clearly_other_project) return { accepted: false, why: 'other_project' };
  if ((review.print_quality || 0) < config.sourcing.minPrintQuality) return { accepted: false, why: 'low_quality' };

  // A poster qualifies on being the official poster; the person need not be on it.
  if (kind !== 'poster') {
    if (animated) {
      if (!review.target_present) return { accepted: false, why: 'character_not_shown' };
      if ((review.identity_confidence || 0) < minConfidence) return { accepted: false, why: 'uncertain_identity' };
    } else if ((review.identity_confidence || 0) <= 3) {
      // Only clear mismatches stop here. "Unsure" goes on to the careful
      // one-photo identity check, which sees a larger image and decides.
      return { accepted: false, why: 'wrong_person' };
    }
  }

  return { accepted: true, bucket: kind };
}

/**
 * Review downloaded images for one role. Returns each image annotated with
 * `review` and `decision`, plus counts of why images were rejected.
 */
async function loadReferences(referencePaths, maxSide) {
  const refs = [];
  for (const p of referencePaths || []) {
    try { refs.push(await toJpegBase64(p, maxSide)); } catch { /* skip */ }
  }
  return refs;
}

async function reviewImages(images, { celebrityName, role, referencePaths }) {
  const animated = isAnimated(role);
  // A face photo of the performer says nothing about an animated character.
  const era = animated ? [] : await loadReferences(role.eraReferencePaths, 768);
  const references = animated ? [] : [...era, ...await loadReferences(referencePaths, 768)];

  const batchSize = Math.max(1, config.sourcing.reviewBatchSize);
  const reviewed = [];
  const reasons = {};
  let outageError = null;

  const batches = [];
  for (let start = 0; start < images.length; start += batchSize) batches.push(images.slice(start, start + batchSize));

  // Two batches at a time: faster, without tripping per-minute rate limits.
  const batchResults = await mapLimit(batches, 2, async (slice) => {
    const batch = [];
    for (const image of slice) {
      try {
        batch.push({ ...image, b64: await toJpegBase64(image.filepath) });
      } catch {
        reasons.unreadable = (reasons.unreadable || 0) + 1;
      }
    }
    if (batch.length === 0) return [];

    const prompt = buildPrompt(celebrityName, role, batch.length, references.length, era.length);
    let outcome;
    try {
      outcome = await reviewBatch(prompt, references, batch);
    } catch (error) {
      outageError = error;
      reasons.review_unavailable = (reasons.review_unavailable || 0) + batch.length;
      console.log(`⚠️ ${error.message}`);
      return [];
    }

    const out = [];
    for (const [i, image] of batch.entries()) {
      const { b64, ...rest } = image;
      const review = outcome.results.find(r => r.index === i + 1);
      if (!review) {
        reasons.no_answer = (reasons.no_answer || 0) + 1;
        continue;
      }
      const decision = decide(review, role);
      if (!decision.accepted) reasons[decision.why] = (reasons[decision.why] || 0) + 1;
      out.push({ ...rest, review: { ...review, keep_box: normaliseBox(review.keep_box) }, decision, reviewedBy: outcome.service });
    }
    return out;
  });
  reviewed.push(...batchResults.flat());

  // Every batch failed: this is an outage, and must not look like a rejection.
  if (reviewed.length === 0 && outageError) throw outageError;

  return { reviewed, reasons };
}

const CONFIRM_SCHEMA = {
  name: 'final_check',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['same_person', 'confidence', 'face_sharp', 'clean_image', 'good_expression',
      'target_featured', 'print_quality', 'reason'],
    properties: {
      same_person: { type: 'boolean' },
      confidence: { type: 'integer' },
      face_sharp: { type: 'boolean' },
      clean_image: { type: 'boolean' },
      good_expression: { type: 'boolean' },
      target_featured: { type: 'boolean' },
      print_quality: { type: 'integer' },
      reason: { type: 'string' }
    }
  }
};

/** Full-resolution close-up around the faces, so blur and artifacts are visible. */
async function faceCloseup(image) {
  const box = image.review?.keep_box;
  if (!box) return null;
  const meta = await sharp(image.filepath, { failOn: 'none' }).rotate().metadata();
  const sideways = (meta.orientation || 1) >= 5;
  const W = sideways ? meta.height : meta.width;
  const H = sideways ? meta.width : meta.height;
  const pad = 0.25;
  const left = Math.max(0, Math.floor((box.x - box.w * pad) * W));
  const top = Math.max(0, Math.floor((box.y - box.h * pad) * H));
  const width = Math.min(W - left, Math.ceil(box.w * (1 + 2 * pad) * W));
  const height = Math.min(H - top, Math.ceil(box.h * (1 + 2 * pad) * H));
  if (width < 32 || height < 32) return null;
  const buffer = await sharp(image.filepath, { failOn: 'none' })
    .rotate()
    .extract({ left, top, width, height })
    // Never enlarge: the point is to show the real pixels.
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  return buffer.toString('base64');
}

/**
 * Final check on one photo before it can be delivered: identity, and whether
 * it is a photo the performer would be happy to sign. The batch review sees
 * small copies, where blur, compression artifacts and an awkward expression
 * barely show, so this looks at the whole photo at high resolution plus a
 * full-resolution close-up of the face. Returns null on an API failure; the
 * caller then does not deliver the photo.
 */
async function confirmIdentity(image, { celebrityName, role, references, eraCount = 0 }) {
  const group = image.decision?.bucket === 'group';
  const candidate = { ...image, b64: await toJpegBase64(image.filepath, 1280) };
  const closeup = await faceCloseup(image).catch(() => null);
  const images = closeup ? [candidate, { ...image, source: 'closeup', b64: closeup }] : [candidate];

  const prompt = `${references.length ? referenceIntro(celebrityName, role, eraCount, references.length) : ''}
${closeup ? 'After the references come the candidate (Image 1) and a full-resolution close-up of its faces (Image 2) so you can judge sharpness.' : 'After the references comes the candidate (Image 1).'}
It is a candidate for an autograph print that ${celebrityName} will personally sign, as ${role.character} in "${role.title}"${group ? ' — a group photo' : ''}.
${eraNote(celebrityName, role)}
Answer:
- same_person: is ${celebrityName} in the candidate? Compare facial structure — eye shape and spacing, nose, mouth, jaw and chin, ears, hairline — allowing for age, makeup, lighting and hair. Co-stars and lookalikes are common; if any feature clearly differs, false.${references.length ? '' : ' (No reference photos are available: judge from your own knowledge, and be conservative.)'}
- confidence: 1-10 for same_person.
- face_sharp: ${celebrityName}'s face is in focus at full size — no motion blur, no focus miss, no smeared detail.
- clean_image: free of heavy JPEG blocking, banding, noise, visible upscaling smear, watermarks or burned-in captions/logos.
- good_expression: a strong moment — eyes open, a natural or in-character expression. Dramatic in-character expressions are good: a scream in a horror film, fear, anger, tears. Blood, gore and death scenes are fine too. False for an accidental, unflattering moment: mid-blink, caught mid-word with mouth hanging open, chewing, a blank gape, or a badly unflattering angle.
- target_featured: ${group ? `${celebrityName} is a clear, prominent part of the photo — not tiny, cut off, turned away or half hidden behind someone.` : 'true unless the face is tiny, cut off or turned away.'}
- print_quality: 1-5 for an 8x10 print a fan would frame. 3 = fine, 4 = good, 5 = excellent.
- reason: at most 12 words.`;

  try {
    const { results } = await reviewBatch(prompt, references, images, {
      schema: CONFIRM_SCHEMA,
      maxTokens: 300,
      effort: 'medium'
    });
    return results;
  } catch (error) {
    console.log(`⚠️ Final photo check unavailable: ${error.message}`);
    return null;
  }
}

/** Why a final check fails, or null when the photo passes. */
function finalVerdict(result) {
  if (!result) return 'final_check_unavailable';
  if (!result.same_person || (result.confidence || 0) < config.sourcing.confirmConfidence) return 'failed_identity_check';
  if (!result.face_sharp) return 'blurry';
  if (!result.clean_image) return 'artifacts';
  if (!result.good_expression) return 'unflattering';
  if (!result.target_featured) return 'not_featured';
  if ((result.print_quality || 0) < config.sourcing.minPrintQuality) return 'low_quality_full_size';
  return null;
}

module.exports = { reviewImages, confirmIdentity, finalVerdict, loadReferences, decide, buildPrompt, REVIEW_SCHEMA };
