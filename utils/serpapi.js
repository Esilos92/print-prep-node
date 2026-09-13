const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

/**
 * Single SerpApi client.
 *
 * There were three: two hand-rolled copies of performWebSearch hitting
 * serpapi.com/search, plus a separately configured endpoint for image search
 * at serpapi.com/search.json. None retried. A transient 429 or a dropped
 * connection silently cost a search — and since the callers treat an empty
 * result as "nothing found" rather than "we failed to look", those losses
 * looked like a celebrity having no images rather than like an outage.
 */

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(error) {
  if (!error.response) return true;               // network, DNS, timeout
  return RETRYABLE_STATUS.has(error.response.status);
}

function describe(error) {
  if (error.response) {
    const detail = error.response.data?.error || error.response.statusText || '';
    return `HTTP ${error.response.status}${detail ? ` — ${detail}` : ''}`;
  }
  return error.code || error.message;
}

/**
 * Run a SerpApi query with bounded retries and exponential backoff.
 * Throws once retries are exhausted; callers decide what an outage means.
 */
async function search(params, { retries = 3, timeout = 20000, label = 'search' } = {}) {
  if (!config.api.serpApiKey) {
    throw new Error('SERP_API_KEY is not set');
  }

  const url = config.api.serpEndpoint;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        params: { ...params, api_key: config.api.serpApiKey },
        timeout
      });

      // SerpApi reports some failures in the body with a 200.
      if (response.data?.error) {
        throw new Error(`SerpApi: ${response.data.error}`);
      }

      return response.data;

    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === retries) break;

      const backoff = 500 * Math.pow(2, attempt - 1);
      logger.warn(
        `SerpApi ${label} attempt ${attempt}/${retries} failed (${describe(error)}), retrying in ${backoff}ms`
      );
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  throw new Error(`SerpApi ${label} failed after ${retries} attempts: ${describe(lastError)}`);
}

/** Image search (google_images engine). */
function searchImages(params, options = {}) {
  return search({ engine: 'google_images', ...params }, { label: 'image search', ...options });
}

/** Web search (google engine), used for role verification. */
function searchWeb(query, options = {}) {
  return search({ engine: 'google', q: query, num: 10 }, { label: 'web search', ...options });
}

module.exports = { search, searchImages, searchWeb };
