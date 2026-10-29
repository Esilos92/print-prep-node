const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

/**
 * Fetches a known-good portrait of a celebrity from TMDb, to be used as a
 * reference when verifying candidate images.
 *
 * Without a reference, identity verification asks a vision model "is this
 * <name>?" and leans entirely on whatever it remembers about that person.
 * That is reliable for the very famous and unreliable for everyone else —
 * which is most of an autograph signing roster. Supplying a reference turns
 * the question into "are these two the same person?", which is a far easier
 * and much more accurate comparison.
 */
class ReferencePortrait {
  constructor() {
    this.apiKey = config.api.tmdbKey;
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.imageBase = 'https://image.tmdb.org/t/p/original';
    this.cache = new Map();
  }

  get available() {
    return !!this.apiKey;
  }

  /**
   * Resolve a celebrity name to a local portrait file. Returns null when no
   * reference can be obtained — callers must treat that as "no reference",
   * never as "verified".
   */
  async getPortrait(celebrityName, cacheDir) {
    if (!this.available) {
      logger.warn('⚠️ No TMDB_API_KEY — identity checks will run without a reference portrait');
      return null;
    }

    if (this.cache.has(celebrityName)) {
      return this.cache.get(celebrityName);
    }

    try {
      const profilePath = await this.findProfilePath(celebrityName);
      if (!profilePath) {
        logger.warn(`⚠️ No TMDb portrait found for ${celebrityName}`);
        this.cache.set(celebrityName, null);
        return null;
      }

      const localPath = await this.download(profilePath, celebrityName, cacheDir);
      this.cache.set(celebrityName, localPath);
      logger.info(`🪪 Reference portrait ready for ${celebrityName}`);
      return localPath;

    } catch (error) {
      logger.warn(`⚠️ Reference portrait lookup failed for ${celebrityName}: ${error.message}`);
      this.cache.set(celebrityName, null);
      return null;
    }
  }

  /**
   * Pick the TMDb person whose name matches exactly where possible, falling
   * back to the most popular match. An exact match matters: "Chris Evans"
   * is several different working actors.
   */
  async findProfilePath(celebrityName) {
    const response = await axios.get(`${this.baseUrl}/search/person`, {
      params: { api_key: this.apiKey, query: celebrityName },
      timeout: 15000
    });

    const results = (response.data?.results || []).filter(p => p.profile_path);
    if (results.length === 0) return null;

    const normalize = (value) => (value || '').toLowerCase().trim();
    const exact = results.filter(p => normalize(p.name) === normalize(celebrityName));
    const pool = exact.length > 0 ? exact : results;

    if (exact.length > 1) {
      logger.info(`ℹ️ ${exact.length} TMDb people named ${celebrityName}; using the most popular`);
    }

    const best = pool.reduce((a, b) => ((b.popularity || 0) > (a.popularity || 0) ? b : a));
    return best.profile_path;
  }

  /**
   * Up to `max` reference photos of the person, from different TMDb profile
   * images. One photo from one year is a weak basis for "is this the same
   * person?" when the candidate shows them a decade younger or in character.
   */
  async getPortraits(celebrityName, cacheDir, max = 3) {
    if (!this.available) {
      logger.warn('⚠️ No TMDB_API_KEY — identity checks will run without reference photos');
      return [];
    }

    try {
      const response = await axios.get(`${this.baseUrl}/search/person`, {
        params: { api_key: this.apiKey, query: celebrityName },
        timeout: 15000
      });
      const results = (response.data?.results || []).filter(p => p.profile_path);
      if (results.length === 0) return [];

      const normalize = (value) => (value || '').toLowerCase().trim();
      const exact = results.filter(p => normalize(p.name) === normalize(celebrityName));
      const pool = exact.length > 0 ? exact : results;
      const person = pool.reduce((a, b) => ((b.popularity || 0) > (a.popularity || 0) ? b : a));

      let paths = [person.profile_path];
      try {
        const images = await axios.get(`${this.baseUrl}/person/${person.id}/images`, {
          params: { api_key: this.apiKey },
          timeout: 15000
        });
        const profiles = (images.data?.profiles || [])
          .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.width || 0) - (a.width || 0))
          .map(p => p.file_path);
        paths = [...new Set([person.profile_path, ...profiles])];
      } catch {
        // one reference is still better than none
      }

      const local = [];
      for (const [i, profilePath] of paths.slice(0, max).entries()) {
        try {
          local.push(await this.download(profilePath, `${celebrityName}_${i + 1}`, cacheDir));
        } catch {
          // skip a reference that won't download
        }
      }
      logger.info(`🪪 ${local.length} reference photo(s) ready for ${celebrityName}`);
      return local;
    } catch (error) {
      logger.warn(`⚠️ Reference photo lookup failed for ${celebrityName}: ${error.message}`);
      return [];
    }
  }

  async download(profilePath, celebrityName, cacheDir) {
    await fs.mkdir(cacheDir, { recursive: true });

    const safeName = celebrityName.replace(/[^\w]/g, '_').substring(0, 40);
    const localPath = path.join(cacheDir, `reference_${safeName}.jpg`);

    const response = await axios.get(`${this.imageBase}${profilePath}`, {
      responseType: 'arraybuffer',
      timeout: 25000
    });

    await fs.writeFile(localPath, Buffer.from(response.data));
    return localPath;
  }
}

module.exports = ReferencePortrait;
