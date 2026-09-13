require('dotenv').config();

const int = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const float = (value, fallback) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Print targets, in pixels, at 300 DPI.
 *
 * These describe the FINISHED PRINT and nothing else. They are deliberately
 * not reused as a floor for web search results: a 2400x3000 requirement on
 * candidate images rejects essentially the whole indexed web, and lowering
 * them to let candidates through makes the resizer upscale small images into
 * blurry "print ready" files. Those are separate concerns and now have
 * separate settings — see `search` and `print` below.
 */
const PRINT_FORMATS = {
  '8x10': { width: 2400, height: 3000, widthIn: 8, heightIn: 10 },
  '11x17': { width: 3300, height: 5100, widthIn: 11, heightIn: 17 }
};

const TARGET_DPI = 300;

const config = {
  api: {
    serpApiKey: process.env.SERP_API_KEY,
    serpEndpoint: process.env.SERP_ENDPOINT || 'https://serpapi.com/search.json',
    tmdbKey: process.env.TMDB_API_KEY,
  },

  googleDrive: {
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    credentialsPath: './credentials/google-drive-creds.json'
  },

  /**
   * Floor for accepting a candidate image off the web. This is about whether
   * an image is worth downloading and looking at, not about whether it can be
   * printed — `print.minDpi` decides that, using real pixels.
   */
  search: {
    minWidth: int(process.env.MIN_SEARCH_WIDTH, 900),
    minHeight: int(process.env.MIN_SEARCH_HEIGHT, 900),
    minFileSizeBytes: int(process.env.MIN_FILE_SIZE_BYTES, 50 * 1024),
    maxAspectRatio: float(process.env.MAX_ASPECT_RATIO, 2.5),

    /**
     * Terms excluded from every image query.
     *
     * For a pre-2000 title, a large share of what exists online is retail
     * listings — VHS sleeves, DVD cases, eBay auctions — and photographs of
     * that packaging were reaching the finished print packages.
     *
     * Kept deliberately narrow. A negative term here matches the whole page,
     * not the image, so excluding "dvd" would also drop a Wikipedia or IMDb
     * page that happens to mention a DVD release — which for an older title
     * is most of the pages carrying good stills. Broad markers like dvd,
     * blu-ray and amazon are filtered instead at download time against the
     * image's own title and URL (fetchImages.packagingExclusions), where
     * matching is precise. Only high-precision terms belong here.
     */
    /**
     * Image downloads in flight at once. These are I/O-bound and were run one
     * at a time, each with a 25-second timeout, so a role spent most of its
     * wall-clock time idle. Bounded because this box has one vCPU and 2 GB.
     */
    downloadConcurrency: int(process.env.DOWNLOAD_CONCURRENCY, 6),

    excludeTerms: (process.env.SEARCH_EXCLUDE_TERMS
      || 'ebay,etsy,for sale,boxset,box set,laserdisc'
    ).split(',').map(t => t.trim()).filter(Boolean)
  },

  print: {
    formats: PRINT_FORMATS,
    targetDpi: TARGET_DPI,
    /**
     * An image qualifies for a print format only if it can fill that format
     * at this DPI or better WITHOUT being enlarged. 150 DPI is the usual
     * floor for a photographic print that still looks sharp at arm's length;
     * raise it toward 300 for stricter output, lower it to accept softer
     * sources.
     */
    minDpi: int(process.env.MIN_PRINT_DPI, 150),
    /**
     * Upscaling invents pixels. It makes a small image the right dimensions
     * without making it the right quality, which is how a 900px web image
     * becomes a soft 2400x3000 "8x10". Off by default and it should stay off.
     */
    allowUpscale: process.env.ALLOW_UPSCALE === 'true',
    jpegQuality: int(process.env.JPEG_QUALITY, 95)
  },

  image: {
    maxImagesPerRole: int(process.env.MAX_IMAGES_PER_ROLE, 50),
    dedupThreshold: float(process.env.DEDUP_THRESHOLD, 0.85),
    // Retained for callers that still read config.image.minDimensions.
    minDimensions: PRINT_FORMATS
  },

  /**
   * Model identifiers, in one place.
   *
   * These were hardcoded across eleven call sites, so changing provider or
   * model meant hunting through five files and missing one. Override any of
   * them from .env without touching code.
   */
  models: {
    // Role discovery, character validation — cheap, high volume.
    roleDiscovery: process.env.MODEL_ROLE_DISCOVERY || 'gpt-4o-mini',
    // Identity verification from images — the quality-critical one.
    vision: process.env.MODEL_VISION || 'gpt-4o',
    // Claude fallback when the primary vision service errors.
    visionFallback: process.env.ANTHROPIC_VERIFY_MODEL || 'claude-opus-5'
  },

  verification: {
    /**
     * "low" downsamples the image to roughly 512px before the model sees it,
     * which is not enough to tell two similar-looking actors apart. Identity
     * checking needs "high".
     */
    visionDetail: process.env.VISION_DETAIL || 'high',
    /** Reject a candidate unless the model is at least this confident (1-10). */
    minConfidence: int(process.env.MIN_VERIFY_CONFIDENCE, 7),
    /** Compare candidates against a reference portrait pulled from TMDb. */
    useReferenceImage: process.env.USE_REFERENCE_IMAGE !== 'false',

    /**
     * Vision calls in flight at once. Lower than the download limit: each call
     * carries base64 image data, and provider rate limits bite sooner than
     * bandwidth does.
     */
    concurrency: int(process.env.VERIFY_CONCURRENCY, 4)
  }
};

module.exports = config;
