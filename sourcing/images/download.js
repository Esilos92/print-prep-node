const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { settleLimit } = require('../../utils/concurrency');
const { bigEnough } = require('./candidates');

const MAX_BYTES = 30 * 1024 * 1024;
const TIMEOUT_MS = 25000;
const FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'tiff', 'heif']);

/**
 * Download one candidate, check it is a real image of usable size, and
 * record its true pixel dimensions and a perceptual hash for de-duplication.
 * Returns null for anything unusable; never throws.
 */
async function downloadOne(candidate, dir, { anySize = false } = {}) {
  try {
    const response = await axios.get(candidate.url, {
      responseType: 'arraybuffer',
      timeout: TIMEOUT_MS,
      maxContentLength: MAX_BYTES,
      maxRedirects: 5,
      headers: {
        // Some image hosts refuse requests without a browser-like agent.
        'User-Agent': 'Mozilla/5.0 (compatible; PrintPrep/2.0)',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'
      }
    });

    const buffer = Buffer.from(response.data);
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    if (!FORMATS.has(meta.format) || !meta.width || !meta.height) return null;

    // EXIF orientation: a phone photo stored sideways reports swapped sizes.
    const rotated = (meta.orientation || 1) >= 5;
    const width = rotated ? meta.height : meta.width;
    const height = rotated ? meta.width : meta.height;
    if (!anySize && !bigEnough(width, height)) return null;

    const id = crypto.createHash('sha1').update(candidate.url).digest('hex').slice(0, 12);
    const filepath = path.join(dir, `${id}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`);
    await fs.writeFile(filepath, buffer);

    return {
      ...candidate,
      id,
      filepath,
      width,
      height,
      bytes: buffer.length,
      hash: await perceptualHash(buffer)
    };
  } catch {
    return null;
  }
}

/** 64-bit difference hash: robust to resizing and re-compression. */
async function perceptualHash(buffer) {
  const pixels = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | (pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

function hammingDistance(a, b) {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/** Same picture at a different size or crop-free re-encode. */
const NEAR_DUPLICATE = 6;

function isDuplicate(image, seen) {
  return seen.some(other => hammingDistance(image.hash, other.hash) <= NEAR_DUPLICATE);
}

/**
 * Download candidates in parallel, skipping URLs already tried and images
 * that duplicate ones already kept (`seen` is shared across a whole run).
 * When two copies of one picture appear, the larger one is kept.
 */
async function downloadCandidates(candidates, dir, { seen = [], triedUrls = new Set(), limit = 6, want = Infinity } = {}) {
  await fs.mkdir(dir, { recursive: true });

  const fresh = candidates.filter(c => !triedUrls.has(c.url));
  const kept = [];
  let attempted = 0;

  // Many sites refuse hotlinked downloads, so keep working down the list
  // until `want` usable images are in hand rather than trying a fixed count.
  for (let start = 0; start < fresh.length && kept.length < want; start += limit * 2) {
    const chunk = fresh.slice(start, start + limit * 2);
    chunk.forEach(c => triedUrls.add(c.url));
    attempted += chunk.length;

    const results = await settleLimit(chunk, limit, c => downloadOne(c, dir));
    for (const result of results) {
      const image = result.ok ? result.value : null;
      if (!image) continue;

      const twinIndex = kept.findIndex(other => hammingDistance(image.hash, other.hash) <= NEAR_DUPLICATE);
      if (twinIndex >= 0) {
        const twin = kept[twinIndex];
        if (image.width * image.height > twin.width * twin.height) kept[twinIndex] = image;
        continue;
      }
      if (isDuplicate(image, seen)) continue;
      kept.push(image);
    }
  }

  return { images: kept.slice(0, want), attempted };
}

module.exports = { downloadCandidates, downloadOne, perceptualHash, hammingDistance, isDuplicate };
