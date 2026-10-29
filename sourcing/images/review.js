const sharp = require('sharp');
const config = require('../../utils/config');
const { chat } = require('../../utils/openai');
const { isAnimated } = require('./candidates');

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
          required: ['index', 'kind', 'target_present', 'identity_confidence', 'from_production',
            'matches_title', 'problem', 'print_quality', 'keep_box', 'reason'],
          properties: {
            index: { type: 'integer' },
            kind: { type: 'string', enum: ['solo', 'group', 'poster', 'official_art', 'other'] },
            target_present: { type: 'boolean' },
            identity_confidence: { type: 'integer' },
            from_production: { type: 'boolean' },
            matches_title: { type: 'boolean' },
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

function buildPrompt(celebrityName, role, count, hasReference) {
  const animated = isAnimated(role);
  const target = animated
    ? `the animated character ${role.character} from "${role.title}" (voiced by ${celebrityName})`
    : `${celebrityName} as ${role.character} in "${role.title}"`;

  return `You are selecting photos for autograph prints of ${target}.
${hasReference ? `The first image (REFERENCE) is a confirmed photo of ${celebrityName}. Use it to judge identity by facial structure, not by hair, clothing, age or lighting — the same person may look different in character.\n` : ''}
Then come ${count} candidate images, labelled Image 1 to Image ${count}. Each label gives where the image was found.

For EACH candidate report:
- kind: ${animated
    ? '"official_art" for studio artwork, key visuals or official promo art of the character; "solo" for a screenshot featuring the character alone; "group" for official art or screenshots with several characters; "poster" for an official poster or cover; "other" otherwise.'
    : '"solo" when the target is the only or clearly main person; "group" for two or more people where the target is clearly identifiable; "poster" for an official poster, key art or title card; "other" otherwise.'}
- target_present: ${animated ? `${role.character} is clearly depicted` : `the REFERENCE person appears and can be identified`}. For posters, whether ${animated ? 'the character' : 'they'} appear on it.
- identity_confidence: 1-10, how sure you are about target_present being true. 1 if absent.
- from_production: ${animated
    ? 'official material — studio art, official promotion, or a real screenshot. FALSE for fan art, fan edits, cosplay, AI-generated art, merchandise.'
    : `the photo comes from the production or its official promotion — scene still, episode screenshot, on-set photo, official cast or promo photo, poster. Many roles are set in the present day, so the "costume" can be ordinary clothes; do not mark false just because there is no distinctive costume. FALSE only on clear signs of a public appearance: red carpet or press wall, premiere, interview or talk-show set, podcast, convention panel or signing, fan photo, selfie, paparazzi.`}
- matches_title: the image belongs to "${role.title}" specifically, not another project.
- problem: the single main reason it is unusable, or "none". merchandise_or_packaging covers DVD/Blu-ray/VHS cases, toys, shop listings and photos of physical posters for sale. collage_or_text_overlay covers memes, collages, article screenshots and heavy captions (a real poster's own text is fine).
- print_quality: 1-5 for a large print — sharpness, noise, lighting, composition. 1 = unusable, 3 = fine, 5 = excellent.
- keep_box: a box (x, y, w, h as fractions 0-1 of the image width/height, origin top-left) that must survive any crop: it must contain EVERY face in the image, the target's whole head and hair with a little room above, and for posters the whole artwork including the title. If unsure, make it larger.
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

async function callOpenAI(prompt, reference, images) {
  const detail = config.verification.visionDetail;
  const content = [{ type: 'text', text: prompt }];

  if (reference) {
    content.push({ type: 'text', text: 'REFERENCE:' });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${reference}`, detail } });
  }
  for (const [i, image] of images.entries()) {
    content.push({ type: 'text', text: `Image ${i + 1} — ${describeSource(image)}:` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.b64}`, detail } });
  }

  const reply = await chat({
    model: config.models.vision,
    messages: [{ role: 'user', content }],
    maxTokens: 250 * images.length,
    schema: REVIEW_SCHEMA
  });
  return reply.images || [];
}

/** Claude fallback with the same schema, forced through a tool call. */
async function callClaude(prompt, reference, images) {
  const content = [{ type: 'text', text: prompt }];
  if (reference) {
    content.push({ type: 'text', text: 'REFERENCE:' });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: reference } });
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
      tools: [{ name: 'report', description: 'Report the review', input_schema: REVIEW_SCHEMA.schema }],
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
  return tool?.input?.images || [];
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Review one batch. Retries transient failures, then tries Claude. Throws
 * only when no service could review it — the caller reports that as an
 * outage, never as "rejected".
 */
async function reviewBatch(prompt, reference, images) {
  const errors = [];

  if (process.env.OPENAI_API_KEY) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return { results: await callOpenAI(prompt, reference, images), service: 'openai' };
      } catch (error) {
        errors.push(error.message);
        if (attempt < 3) await sleep(2000 * attempt * attempt);
      }
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { results: await callClaude(prompt, reference, images), service: 'claude' };
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

  if (review.problem && review.problem !== 'none') return { accepted: false, why: review.problem };
  if (kind === 'other') return { accepted: false, why: 'not_a_usable_kind' };
  if (!review.from_production) return { accepted: false, why: animated ? 'not_official' : 'not_from_production' };
  if (!review.matches_title) return { accepted: false, why: 'other_project' };
  if ((review.print_quality || 0) < 2) return { accepted: false, why: 'low_quality' };

  // A poster qualifies on being the official poster; the person need not be on it.
  if (kind !== 'poster') {
    if (!review.target_present) return { accepted: false, why: animated ? 'character_not_shown' : 'wrong_person' };
    if ((review.identity_confidence || 0) < minConfidence) return { accepted: false, why: 'uncertain_identity' };
  }

  return { accepted: true, bucket: kind };
}

/**
 * Review downloaded images for one role. Returns each image annotated with
 * `review` and `decision`, plus counts of why images were rejected.
 */
async function reviewImages(images, { celebrityName, role, referencePath }) {
  const animated = isAnimated(role);
  // A face photo of the performer says nothing about an animated character.
  const reference = !animated && referencePath ? await toJpegBase64(referencePath, 768) : null;

  const batchSize = Math.max(1, config.sourcing.reviewBatchSize);
  const reviewed = [];
  const reasons = {};
  let outageError = null;

  for (let start = 0; start < images.length; start += batchSize) {
    const batch = [];
    for (const image of images.slice(start, start + batchSize)) {
      try {
        batch.push({ ...image, b64: await toJpegBase64(image.filepath) });
      } catch {
        reasons.unreadable = (reasons.unreadable || 0) + 1;
      }
    }
    if (batch.length === 0) continue;

    const prompt = buildPrompt(celebrityName, role, batch.length, !!reference);

    let outcome;
    try {
      outcome = await reviewBatch(prompt, reference, batch);
    } catch (error) {
      outageError = error;
      reasons.review_unavailable = (reasons.review_unavailable || 0) + batch.length;
      console.log(`⚠️ ${error.message}`);
      continue;
    }

    for (const [i, image] of batch.entries()) {
      const { b64, ...rest } = image;
      const review = outcome.results.find(r => r.index === i + 1);
      if (!review) {
        reasons.no_answer = (reasons.no_answer || 0) + 1;
        continue;
      }
      const decision = decide(review, role);
      if (!decision.accepted) reasons[decision.why] = (reasons[decision.why] || 0) + 1;
      reviewed.push({ ...rest, review: { ...review, keep_box: normaliseBox(review.keep_box) }, decision, reviewedBy: outcome.service });
    }
  }

  // Every batch failed: this is an outage, and must not look like a rejection.
  if (reviewed.length === 0 && outageError) throw outageError;

  return { reviewed, reasons };
}

module.exports = { reviewImages, decide, buildPrompt, REVIEW_SCHEMA };
