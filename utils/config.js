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
     * that packaging were reaching the finished print packages. Excluding
     * them at the search engine is far cheaper than paying for a vision call
     * to reject each one afterwards.
     */
    excludeTerms: (process.env.SEARCH_EXCLUDE_TERMS
      || 'vhs,dvd,bluray,blu-ray,ebay,amazon,etsy,boxset,box set,for sale,poster for sale,laserdisc'
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
    useReferenceImage: process.env.USE_REFERENCE_IMAGE !== 'false'
  }
};

module.exports = config;
