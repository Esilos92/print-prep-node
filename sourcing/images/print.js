const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const config = require('../../utils/config');

// One large image at a time on a 2 GB box.
sharp.cache(false);
sharp.concurrency(1);

/**
 * Turns selected photos into print files.
 *
 * The old resizer shrank each image to fit INSIDE the sheet and never
 * cropped, so a wide movie still became a 2400x1600 file labelled "8x10".
 * Now every file has the sheet's true proportions:
 *
 * - If the photo is already the sheet's shape (within 2%), it is only resized.
 * - Otherwise it is cropped, positioned so the reviewer's keep-box — every
 *   face, the subject's whole head, a poster's full artwork — stays whole.
 * - If no crop can keep that box intact, the photo is skipped for that sheet
 *   rather than cutting someone's face.
 * - Wide photos go on landscape sheets instead of being forced into portrait.
 * - Nothing is enlarged unless ALLOW_UPSCALE=true.
 */

const SHAPE_TOLERANCE = 0.02;

function sheetFor(format, landscape) {
  const f = config.print.formats[format];
  return landscape
    ? { wIn: f.heightIn, hIn: f.widthIn, wPx: f.height, hPx: f.width }
    : { wIn: f.widthIn, hIn: f.heightIn, wPx: f.width, hPx: f.height };
}

/** The region a crop must keep, in pixels, with breathing room. */
function keepRegion(image, W, H) {
  const box = image.review?.keep_box;
  const kind = image.decision?.bucket;

  // Posters and unknowns: allow only a thin trim around the edges.
  const inset = (fraction) => ({ x0: W * fraction, y0: H * fraction, x1: W * (1 - fraction), y1: H * (1 - fraction) });
  if (kind === 'poster') {
    const safe = inset(0.03);
    if (!box) return safe;
    return {
      x0: Math.min(safe.x0, box.x * W), y0: Math.min(safe.y0, box.y * H),
      x1: Math.max(safe.x1, (box.x + box.w) * W), y1: Math.max(safe.y1, (box.y + box.h) * H)
    };
  }
  if (!box) return inset(0.05);

  // Model boxes are approximate: a small margin, and a little headroom above.
  const padX = W * 0.02;
  const padY = H * 0.02;
  return {
    x0: Math.max(0, box.x * W - padX),
    y0: Math.max(0, box.y * H - padY - box.h * H * 0.08),
    x1: Math.min(W, (box.x + box.w) * W + padX),
    y1: Math.min(H, (box.y + box.h) * H + padY)
  };
}

/**
 * Plan the crop for one sheet. Returns null when the sheet can't be filled
 * without cutting into the keep region or dropping below the DPI floor.
 */
function planCrop(image, W, H, format) {
  const landscape = W > H * 1.05;
  const sheet = sheetFor(format, landscape);
  const target = sheet.wIn / sheet.hIn;
  const ratio = W / H;

  let cw;
  let ch;
  if (ratio > target) {
    ch = H;
    cw = Math.round(H * target);
  } else {
    cw = W;
    ch = Math.round(W / target);
  }

  const resizeOnly = Math.abs(ratio / target - 1) <= SHAPE_TOLERANCE;
  const keep = resizeOnly ? null : keepRegion(image, W, H);

  let left = Math.round((W - cw) / 2);
  let top = Math.round((H - ch) / 2);

  if (keep) {
    if (keep.x1 - keep.x0 > cw + 1 || keep.y1 - keep.y0 > ch + 1) {
      if (!(image.guaranteedPoster && format === '11x17')) return { skip: 'crop would cut the subject' };
      // Guaranteed poster that won't fit: centre crop, trimming the edges evenly.
    } else {
      // Centre on the keep region, then slide just enough to contain it.
      left = Math.round((keep.x0 + keep.x1) / 2 - cw / 2);
      top = Math.round((keep.y0 + keep.y1) / 2 - ch / 2);
      left = Math.min(Math.max(left, Math.ceil(keep.x1 - cw)), Math.floor(keep.x0));
      top = Math.min(Math.max(top, Math.ceil(keep.y1 - ch)), Math.floor(keep.y0));
      left = Math.min(Math.max(0, left), W - cw);
      top = Math.min(Math.max(0, top), H - ch);
    }
  }

  const dpi = Math.floor(Math.min(cw / sheet.wIn, ch / sheet.hIn));
  // The official poster always ships at 11x17, at whatever resolution exists.
  const forced = image.guaranteedPoster && format === '11x17';
  if (dpi < config.print.minDpi && !config.print.allowUpscale && !forced) {
    return { skip: `only ${dpi} DPI at ${format}` };
  }

  // Downscale to 300 DPI when larger; never enlarge unless allowed.
  const scale = config.print.allowUpscale ? sheet.wPx / cw : Math.min(1, sheet.wPx / cw);
  const outW = Math.round(cw * scale);
  const outH = Math.round(ch * scale);

  return {
    landscape,
    method: resizeOnly ? 'resized' : 'cropped',
    crop: { left, top, width: cw, height: ch },
    outW,
    outH,
    printDpi: Math.round(outW / sheet.wIn),
    trimmed: 1 - (cw * ch) / (W * H)
  };
}

const slug = (value) => (value || '')
  .normalize('NFKD')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '_')
  .slice(0, 40);

async function preparePrints(images, workDir, celebrityName) {
  const outRoot = path.join(workDir, 'resized');
  const results = [];
  const skipped = [];
  const lastName = slug(celebrityName.split(/\s+/).pop());
  const counters = {};

  for (const image of images) {
    let meta;
    try {
      meta = await sharp(image.filepath, { failOn: 'none' }).rotate().metadata();
    } catch {
      continue;
    }
    // metadata() reports pre-rotation size; swap for sideways EXIF.
    const sideways = (meta.orientation || 1) >= 5;
    const W = sideways ? meta.height : meta.width;
    const H = sideways ? meta.width : meta.height;

    const key = `${image.character}|${image.title}`;
    counters[key] = (counters[key] || 0) + 1;
    const number = String(counters[key]).padStart(2, '0');

    for (const format of Object.keys(config.print.formats)) {
      const plan = planCrop(image, W, H, format);
      if (plan.skip) {
        skipped.push({ id: image.id, format, why: plan.skip });
        continue;
      }

      const dir = path.join(outRoot, format);
      await fs.mkdir(dir, { recursive: true });
      const name = [lastName, slug(image.character), slug(image.title), number, image.decision.bucket,
        plan.landscape ? `${format}_landscape` : format].filter(Boolean).join('_') + '.jpg';
      const outPath = path.join(dir, name);

      try {
        await sharp(image.filepath, { failOn: 'none' })
          .rotate()
          .extract(plan.crop)
          .resize(plan.outW, plan.outH, { fit: 'fill', kernel: 'lanczos3' })
          .jpeg({ quality: config.print.jpegQuality, chromaSubsampling: '4:4:4', mozjpeg: true })
          .withMetadata({ density: plan.printDpi })
          .toFile(outPath);
      } catch (error) {
        skipped.push({ id: image.id, format, why: `write failed: ${error.message}` });
        continue;
      }

      results.push({
        resizedPath: outPath,
        filename: path.basename(image.filepath),
        role: image.role,
        character: image.character,
        title: image.title,
        format,
        kind: image.decision.bucket,
        orientation: plan.landscape ? 'landscape' : 'portrait',
        method: plan.method,
        trimmedPercent: Math.round(plan.trimmed * 100),
        outputWidth: plan.outW,
        outputHeight: plan.outH,
        actualWidth: W,
        actualHeight: H,
        printDpi: plan.printDpi,
        tags: [image.decision.bucket, plan.method, plan.landscape ? 'landscape' : 'portrait', image.source],
        originalUrl: image.url,
        sourcePage: image.pageUrl,
        hash: image.hash,
        review: image.review?.reason
      });
    }
  }

  return { prints: results, skipped };
}

/**
 * One page of thumbnails, one per photo, labelled with the sizes it was
 * printed at — a quick way to eyeball every crop before printing.
 */
async function buildContactSheet(prints, outPath) {
  if (prints.length === 0) return null;

  const byPhoto = new Map();
  for (const p of prints) {
    const key = p.hash || p.filename;
    if (!byPhoto.has(key)) byPhoto.set(key, { preview: p, formats: [] });
    const entry = byPhoto.get(key);
    entry.formats.push(p.orientation === 'landscape' ? `${p.format} L` : p.format);
    if (p.format === '8x10') entry.preview = p;
  }

  const cellW = 300;
  const cellH = 330;
  const thumbH = 270;
  const columns = 6;
  const entries = [...byPhoto.values()];
  const rows = Math.ceil(entries.length / columns);
  const escape = (s) => String(s).replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);

  const composites = [];
  for (const [i, entry] of entries.entries()) {
    const x = (i % columns) * cellW;
    const y = Math.floor(i / columns) * cellH;
    const thumb = await sharp(entry.preview.resizedPath)
      .resize(cellW - 16, thumbH, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });
    composites.push({
      input: thumb.data,
      left: x + Math.round((cellW - thumb.info.width) / 2),
      top: y + 8 + Math.round((thumbH - thumb.info.height) / 2)
    });
    const label = `${escape(entry.preview.character)} · ${escape(entry.preview.kind)} · ${escape(entry.formats.join(', '))}`;
    composites.push({
      input: Buffer.from(`<svg width="${cellW}" height="40"><text x="${cellW / 2}" y="24" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" text-anchor="middle" fill="#222">${label.slice(0, 60)}</text></svg>`),
      left: x,
      top: y + thumbH + 12
    });
  }

  await sharp({ create: { width: columns * cellW, height: rows * cellH, channels: 3, background: '#f4f4f4' } })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toFile(outPath);
  return outPath;
}

module.exports = { preparePrints, planCrop, buildContactSheet, keepRegion };
