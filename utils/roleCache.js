const fs = require('fs').promises;
const path = require('path');

/**
 * On-disk cache for role discovery results.
 *
 * The orchestrator previously held an in-process Map. Every job runs as a
 * fresh `node index.js`, so that cache was empty at startup and discarded at
 * exit — it never returned a hit. Role discovery is several model calls plus
 * verification plus search-term generation, and a convention roster repeats
 * the same performers across events, so a real cache is worth having.
 *
 * Deliberately a JSON file per celebrity rather than a database: the data is
 * small, the access pattern is a single keyed read per job, and a file is
 * trivially inspectable and deletable when a cached answer looks wrong.
 */

const CACHE_DIR = path.join(__dirname, '..', '.cache', 'roles');
const TTL_HOURS = parseInt(process.env.ROLE_CACHE_TTL_HOURS, 10) || 24 * 30;
const ENABLED = process.env.ROLE_CACHE !== 'false';

function keyFor(celebrityName) {
  const slug = celebrityName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60);

  return slug ? path.join(CACHE_DIR, `${slug}.json`) : null;
}

async function get(celebrityName) {
  if (!ENABLED) return null;

  const file = keyFor(celebrityName);
  if (!file) return null;

  try {
    const raw = await fs.readFile(file, 'utf8');
    const entry = JSON.parse(raw);

    const ageMs = Date.now() - entry.cachedAt;
    const ageHours = Math.round(ageMs / 3600000);

    if (ageHours >= TTL_HOURS) return null;
    if (!entry.value?.roles?.length) return null;   // never serve an empty hit

    return { value: entry.value, ageHours };
  } catch {
    return null;   // absent or unreadable is simply a miss
  }
}

async function set(celebrityName, value) {
  if (!ENABLED) return;
  if (!value?.roles?.length) return;   // don't cache a failed discovery

  const file = keyFor(celebrityName);
  if (!file) return;

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({ celebrity: celebrityName, cachedAt: Date.now(), value }, null, 2)
    );
  } catch {
    // A cache that cannot write is a slow cache, not a broken job.
  }
}

async function clear(celebrityName) {
  const file = celebrityName ? keyFor(celebrityName) : null;
  try {
    if (file) await fs.unlink(file);
    else await fs.rm(CACHE_DIR, { recursive: true, force: true });
  } catch { /* already gone */ }
}

module.exports = { get, set, clear, CACHE_DIR, TTL_HOURS };
