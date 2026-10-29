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
    ? `This role is from ${year}, about ${gap} years ago. The reference photos are likely more recent, so expect ${celebrityName} to look younger, with different hair, facial hair, weight or styling. Match bone structure, not current look.\n`
    : '';
  const cast = role.coStars?.length
    ? `Other cast members of "${role.title}": ${role.coStars.join(', ')}. They are NOT the target, but their presence is good evidence the photo is from this title.\n`
    : '';
  return era + cast;
}

function buildPrompt(celebrityName, role, count, referenceCount) {
  const hasReference = referenceCount > 0;
  const animated = isAnimated(role);
  const target = animated
    ? `the animated character ${role.character} from "${role.title}" (voiced by ${celebrityName})`
    : `${celebrityName} as ${role.character} in "${role.title}"`;

  return `You are selecting photos for autograph prints of ${target}.
${hasReference ? `The first ${referenceCount === 1 ? 'image (REFERENCE) is a confirmed photo' : `${referenceCount} images (REFERENCE 1-${referenceCount}) are confirmed photos`} of ${celebrityName}. Judge identity by facial structure — eyes, nose, jaw, ears, face shape — not by hair, clothing, age or lighting; the same person may look different in character. Lookalike co-stars are common: if the face does not clearly match, target_present is false.\n` : ''}
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
- print_quality: 1-5 for a large print — sharpness, noise, lighting, composition. 1 = unusable, 3 = fine, 5 = excellent.
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
  const references = animated ? [] : await loadReferences(referencePaths, 768);

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

    const prompt = buildPrompt(celebrityName, role, batch.length, references.length);
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
  name: 'identity_check',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['same_person', 'confidence', 'reason'],
    properties: {
      same_person: { type: 'boolean' },
      confidence: { type: 'integer' },
      reason: { type: 'string' }
    }
  }
};

/**
 * Second, stricter identity check on one photo at higher resolution.
 *
 * The batch review sees eight small images at once, which is enough to sort
 * them but not to tell a lookalike co-star from the performer. Every photo
 * of a person is confirmed on its own before it can be delivered. A failed
 * check (API error) returns null, and the caller does not deliver the photo.
 */
async function confirmIdentity(image, { celebrityName, role, references }) {
  if (references.length === 0) return { same_person: true, confidence: 0, reason: 'no reference available', unchecked: true };

  const candidate = { ...image, b64: await toJpegBase64(image.filepath, 1280) };
  const many = references.length > 1;
  const prompt = `${many ? `REFERENCE 1-${references.length} are confirmed photos` : 'REFERENCE is a confirmed photo'} of ${celebrityName}, taken at different times.
The last image is a candidate for an autograph print of ${celebrityName} as ${role.character} in "${role.title}"${image.decision?.bucket === 'group' ? '. It is a group photo: decide whether ' + celebrityName + ' is one of the people in it' : ''}.
${eraNote(celebrityName, role)}
Is ${celebrityName} in the candidate image? Compare facial structure — eye shape and spacing, nose, mouth, jaw and chin, ears, hairline — and allow for age, makeup, lighting and hair. Co-stars and lookalikes are common in these searches; if any feature clearly differs, answer false.

confidence: 1-10 for your answer. reason: at most 12 words.`;

  try {
    const { results } = await reviewBatch(prompt, references, [candidate], {
      schema: CONFIRM_SCHEMA,
      maxTokens: 200,
      effort: 'medium'
    });
    return results;
  } catch (error) {
    console.log(`⚠️ Identity confirmation unavailable: ${error.message}`);
    return null;
  }
}

module.exports = { reviewImages, confirmIdentity, loadReferences, decide, buildPrompt, REVIEW_SCHEMA };
