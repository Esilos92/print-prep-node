const axios = require('axios');
const config = require('../../utils/config');
const { chat } = require('../../utils/openai');
const { searchImages, searchWeb } = require('../../utils/serpapi');
const { settleLimit } = require('../../utils/concurrency');

/**
 * Gathers candidate images for one role, best sources first.
 *
 * 1. TMDb's own posters and stills for the title. These are official,
 *    usually large, and need no guessing about where they came from.
 * 2. Google Images, through queries written for this specific role.
 *
 * Every candidate keeps the order its source ranked it in. The old pipeline
 * re-sorted by pixel count, which threw away Google's relevance ranking and
 * pushed wallpapers and posters above the scene stills that were wanted.
 */

const TMDB = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/original';

/**
 * Sites whose images are never usable: fan art, marketplaces, watermarked
 * stock. Matched against the host name, not as substrings of arbitrary text,
 * so "designed" no longer matches "signed" and "Complete" no longer matches "comp".
 */
const BLOCKED_HOSTS = [
  'deviantart.com', 'deviantart.net', 'pinterest.com', 'pinimg.com', 'artstation.com',
  'tumblr.com', 'reddit.com', 'redd.it', 'wattpad.com', 'pixiv.net', 'fanpop.com',
  'ebay.com', 'ebayimg.com', 'etsy.com', 'etsystatic.com', 'amazon.com', 'media-amazon.com',
  'aliexpress.com', 'redbubble.com', 'teepublic.com', 'zazzle.com', 'mercari.com', 'poshmark.com',
  'alamy.com', 'gettyimages.com', 'gettyimages.co.uk', 'shutterstock.com', 'istockphoto.com',
  'dreamstime.com', 'depositphotos.com', '123rf.com', 'bigstockphoto.com', 'agefotostock.com',
  'wireimage.com'
];

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isBlocked(...urls) {
  return urls.some(url => {
    const host = hostOf(url);
    return host && BLOCKED_HOSTS.some(b => host === b || host.endsWith(`.${b}`));
  });
}

/** Smallest source that can fill the smallest sheet at the DPI floor. */
function minimumSize() {
  const dpi = config.print.minDpi;
  const sheets = Object.values(config.print.formats);
  const shortIn = Math.min(...sheets.map(f => Math.min(f.widthIn, f.heightIn)));
  const longIn = Math.min(...sheets.map(f => Math.max(f.widthIn, f.heightIn)));
  return { short: Math.round(shortIn * dpi), long: Math.round(longIn * dpi) };
}

function bigEnough(width, height) {
  if (!width || !height) return true;   // unknown: decide after download
  const min = minimumSize();
  return Math.min(width, height) >= min.short && Math.max(width, height) >= min.long;
}

const isAnimated = (role) => /voice|anim|anime/i.test(role.medium || '') || role.isVoiceRole === true;

// ---------------------------------------------------------------- TMDb

async function findTitleId(role) {
  const apiKey = config.api.tmdbKey;
  if (!apiKey) return null;
  if (role.tmdbId && role.mediaType) return { id: role.tmdbId, mediaType: role.mediaType };

  // Roles from the memory fallback don't carry an id; look the title up.
  const response = await axios.get(`${TMDB}/search/multi`, {
    params: { api_key: apiKey, query: role.title },
    timeout: 15000
  });
  const hits = (response.data?.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
  const year = String(role.year || '');
  const best = hits.find(r => (r.release_date || r.first_air_date || '').startsWith(year)) || hits[0];
  return best ? { id: best.id, mediaType: best.media_type } : null;
}

async function tmdbCandidates(role) {
  if (!config.api.tmdbKey) return [];

  try {
    const title = await findTitleId(role);
    if (!title) return [];

    const response = await axios.get(`${TMDB}/${title.mediaType}/${title.id}/images`, {
      params: { api_key: config.api.tmdbKey, include_image_language: 'en,null' },
      timeout: 15000
    });

    const byVotes = (a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.width || 0) - (a.width || 0);
    const usable = (img) => bigEnough(img.width, img.height);
    // English posters carry the title; textless ones are fine as a fallback.
    const posterOrder = (a, b) => (b.iso_639_1 === 'en') - (a.iso_639_1 === 'en') || byVotes(a, b);

    // Posters are not size-filtered: the guaranteed poster must exist even when small.
    const posters = (response.data?.posters || []).sort(posterOrder).slice(0, 8);
    const stills = (response.data?.backdrops || []).filter(usable).sort(byVotes).slice(0, 16);

    const toCandidate = (kind) => (img, i) => ({
      url: `${TMDB_IMAGE}${img.file_path}`,
      pageUrl: `https://www.themoviedb.org/${title.mediaType}/${title.id}`,
      title: `${role.title} ${kind}`,
      width: img.width,
      height: img.height,
      source: 'tmdb',
      hint: kind,
      lang: img.iso_639_1 || null,
      belowFloor: !usable(img),
      rank: i
    });

    return [...posters.map(toCandidate('poster')), ...stills.map(toCandidate('still'))];
  } catch (error) {
    console.log(`⚠️ TMDb images unavailable for ${role.title}: ${error.message}`);
    return [];
  }
}

/**
 * Images TMDb has tagged as containing this person, for this title only.
 * The tag is TMDb's own record of who is in the frame, so these are the
 * most reliable stills there are. Fetched once per run and shared by roles.
 */
const taggedCache = new Map();

async function tmdbPersonId(celebrityName) {
  const response = await axios.get(`${TMDB}/search/person`, {
    params: { api_key: config.api.tmdbKey, query: celebrityName },
    timeout: 15000
  });
  const results = response.data?.results || [];
  if (results.length === 0) return null;
  const norm = (v) => (v || '').toLowerCase().trim();
  const exact = results.filter(p => norm(p.name) === norm(celebrityName));
  const pool = exact.length ? exact : results;
  return pool.reduce((a, b) => ((b.popularity || 0) > (a.popularity || 0) ? b : a)).id;
}

async function taggedImages(celebrityName) {
  if (taggedCache.has(celebrityName)) return taggedCache.get(celebrityName);
  const load = (async () => {
    const personId = await tmdbPersonId(celebrityName);
    if (!personId) return [];
    const all = [];
    for (let page = 1; page <= 5; page++) {
      const response = await axios.get(`${TMDB}/person/${personId}/tagged_images`, {
        params: { api_key: config.api.tmdbKey, page },
        timeout: 15000
      });
      all.push(...(response.data?.results || []));
      if (page >= (response.data?.total_pages || 1)) break;
    }
    return all;
  })().catch(error => {
    console.log(`⚠️ TMDb tagged images unavailable: ${error.message}`);
    return [];
  });
  taggedCache.set(celebrityName, load);
  return load;
}

async function tmdbTaggedCandidates(celebrityName, role) {
  if (!config.api.tmdbKey || !role.tmdbId) return [];
  const images = await taggedImages(celebrityName);
  return images
    .filter(img => img.media?.id === role.tmdbId && (!role.mediaType || img.media_type === role.mediaType))
    .filter(img => img.file_path && bigEnough(img.width, img.height))
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.width || 0) - (a.width || 0))
    .slice(0, 20)
    .map((img, i) => ({
      url: `${TMDB_IMAGE}${img.file_path}`,
      pageUrl: `https://www.themoviedb.org/${role.mediaType || 'movie'}/${role.tmdbId}`,
      title: `${role.title} still tagged with ${celebrityName}`,
      width: img.width,
      height: img.height,
      source: 'tmdb',
      hint: img.image_type === 'poster' ? 'poster' : 'tagged',
      rank: i
    }));
}

/**
 * The title's top-billed cast other than the performer. Used to tell a
 * search engine which "Trespass" we mean, and to tell the reviewer which
 * faces in a photo are co-stars rather than the target.
 */
async function titleCast(celebrityName, role) {
  if (!config.api.tmdbKey) return [];
  try {
    const title = await findTitleId(role);
    if (!title) return [];
    const path = title.mediaType === 'tv' ? 'aggregate_credits' : 'credits';
    const response = await axios.get(`${TMDB}/${title.mediaType}/${title.id}/${path}`, {
      params: { api_key: config.api.tmdbKey },
      timeout: 15000
    });
    const norm = (v) => (v || '').toLowerCase().trim();
    return (response.data?.cast || [])
      .filter(c => norm(c.name) !== norm(celebrityName))
      .slice(0, 6)
      .map(c => c.name);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- fandom

/**
 * The character's gallery on the show's fan wiki. Most shows have one, and
 * its gallery page is mostly official screenshots and promo photos of
 * exactly this character. Fan art can appear too; the reviewer rejects it.
 */
// Fan-fiction and role-play wikis host invented stories, not official images.
const FANON = /(fanon|fanfic|fan-fiction|fanfiction|roleplay|role-play|rp-|ideas|headhunters)/i;

/** "Scream 4" -> scream, "The Walking Dead: World Beyond" -> walkingdead */
function guessWikiNames(title) {
  const base = (title || '')
    .replace(/[:\u2013\u2014-].*$/, '')
    .replace(/\b(part|chapter|vol|volume|season)\b.*$/i, '')
    .replace(/\b([0-9]+|i{1,3}|iv|v|vi{1,3})\s*$/i, '')
    .toLowerCase()
    .normalize('NFKD');
  const words = base.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const noArticle = words[0] === 'the' ? words.slice(1) : words;
  return [...new Set([noArticle.join(''), words.join(''), noArticle.join('-')].filter(n => n.length >= 3))];
}

const normName = (v) => (v || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'wiki', 'fandom', 'database', 'series', 'movie', 'film', 'tv']);
const keyWords = (v) => (v || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
  .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

/**
 * Is this wiki about the title? "Scream Wiki" is for Scream 4; "Tropedia"
 * is not for Trespass. Compares the wiki's own name with the title.
 */
async function wikiMatchesTitle(origin, title) {
  try {
    const response = await axios.get(`${origin}/api.php`, {
      params: { action: 'query', format: 'json', meta: 'siteinfo', siprop: 'general' },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PrintPrep/2.0)' }
    });
    const site = keyWords(response.data?.query?.general?.sitename);
    const host = origin.replace(/^https:\/\//, '').split('.')[0].replace(/-/g, '');
    const words = keyWords(title);
    return words.some(w => site.includes(w) || host.includes(w));
  } catch {
    return false;
  }
}

/** Ask a wiki's own search for the character's page; null if it has none. */
async function wikiCharacterPage(origin, name, title) {
  if (title && !(await wikiMatchesTitle(origin, title))) return null;
  try {
    const response = await axios.get(`${origin}/api.php`, {
      params: { action: 'query', format: 'json', list: 'search', srsearch: name, srlimit: 8, srnamespace: 0 },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PrintPrep/2.0)' }
    });
    const target = normName(name);
    const hits = response.data?.query?.search || [];
    const hit = hits.find(h => normName(h.title) === target)
      || hits.find(h => normName(h.title).startsWith(target));
    return hit ? hit.title : null;
  } catch {
    return null;
  }
}

/**
 * Find the character's page on the title's official Fandom wiki. Tries the
 * obvious wiki address first (no search credit spent), then wikis from a web
 * search, skipping fan-fiction wikis. Each candidate wiki is asked through its
 * own search whether it has a page for this character.
 */
async function findFandomPage(name, role) {
  const origins = guessWikiNames(role.title).map(n => `https://${n}.fandom.com`);

  for (const origin of origins) {
    const title = await wikiCharacterPage(origin, name, role.title);
    if (title) return { origin, title };
  }

  if (!config.api.serpApiKey) return null;
  const data = await searchWeb(`"${name}" ${role.title} wiki`, { timeout: 45000 }).catch(() => ({}));
  const found = [...new Set((data.organic_results || [])
    .map(r => (r.link || '').match(/^(https:\/\/[a-z0-9-]+\.fandom\.com)\//i)?.[1])
    .filter(o => o && !FANON.test(o) && !origins.includes(o)))].slice(0, 3);

  for (const origin of found) {
    const title = await wikiCharacterPage(origin, name, role.title);
    if (title) return { origin, title };
  }
  return null;
}

async function fandomCandidates(role) {
  const name = (role.character || '').split(/\s*\/\s*/)[0];
  if (!name) return [];

  try {
    const page = await findFandomPage(name, role);
    if (!page) return [];
    const pageTitle = page.title;
    const api = `${page.origin}/api.php`;

    // Fandom's MediaWiki API: every image used on the character page and its
    // gallery subpage, with the original file's URL and real pixel size.
    const response = await axios.get(api, {
      params: {
        action: 'query',
        format: 'json',
        redirects: 1,
        titles: `${pageTitle}|${pageTitle}/Gallery`,
        generator: 'images',
        gimlimit: 'max',
        prop: 'imageinfo',
        iiprop: 'url|size|mime'
      },
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PrintPrep/2.0; +https://github.com/Esilos92/print-prep-node)' }
    });

    const files = Object.values(response.data?.query?.pages || {})
      .map(p => ({ title: p.title, info: p.imageinfo?.[0] }))
      .filter(f => f.info?.url && /^image\/(jpeg|png|webp)$/i.test(f.info.mime || ''))
      .filter(f => !/(wordmark|logo|favicon|placeholder|icon|avatar|badge|flag|symbol)/i.test(f.title))
      .filter(f => (f.info.width || 0) >= 300 && (f.info.height || 0) >= 300)
      .sort((a, b) => b.info.width * b.info.height - a.info.width * a.info.height);

    const gallery = `${page.origin}/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
    // Small images can't be printed but still work as era references.
    const usable = files.filter(f => bigEnough(f.info.width, f.info.height)).length;
    console.log(`📚 ${name}: ${usable} printable image(s) of ${files.length} on ${gallery}`);
    return files.slice(0, 60).map((f, i) => ({
      url: f.info.url,
      pageUrl: gallery,
      title: f.title.replace(/^File:/, ''),
      width: f.info.width,
      height: f.info.height,
      source: 'fandom',
      hint: 'solo',
      belowFloor: !bigEnough(f.info.width, f.info.height),
      rank: i
    }));
  } catch (error) {
    console.log(`⚠️ Fandom gallery unavailable for ${name}: ${error.message}`);
    return [];
  }
}

// ---------------------------------------------------------------- queries

/** Queries used when no model is available, or as a backstop if it fails. */
function templateQueries(celebrityName, role) {
  const t = `"${role.title}"`;
  // "Will Wilson / Jacob Wells" -> search the first name; quoting both finds nothing.
  const c = `"${(role.character || '').split(/\s*\/\s*/)[0]}"`;
  const tv = role.mediaType === 'tv' || /tv/.test(role.medium || '');

  if (isAnimated(role)) {
    return [
      { q: `${c} ${t} official art`, aim: 'solo' },
      { q: `${c} ${t} screenshot`, aim: 'solo' },
      { q: `${t} key visual official`, aim: 'group' },
      { q: `${t} official poster`, aim: 'poster' }
    ];
  }

  const year = role.year && role.year !== 'unknown' ? ` ${role.year}` : '';
  const costar = role.coStars?.[0] ? ` "${role.coStars[0]}"` : '';
  return [
    { q: `"${celebrityName}" ${t}${year} still`, aim: 'solo' },
    { q: `${c} ${t}${year} scene`, aim: 'solo' },
    { q: `"${celebrityName}" as ${c}${tv ? '' : year}`, aim: 'solo' },
    { q: `${t}${year}${costar} cast ${tv ? 'promotional photo' : 'still'}`, aim: 'group' },
    { q: `${t}${year} official poster`, aim: 'poster' }
  ];
}

const QUERY_SCHEMA = {
  name: 'image_queries',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['queries'],
    properties: {
      queries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['q', 'aim'],
          properties: {
            q: { type: 'string' },
            aim: { type: 'string', enum: ['solo', 'group', 'poster'] }
          }
        }
      }
    }
  }
};

async function plannedQueries(celebrityName, role) {
  if (!process.env.OPENAI_API_KEY) return templateQueries(celebrityName, role);

  const animated = isAnimated(role);
  const prompt = `Write Google Images search queries to find print-quality photos for an autograph signing.

Performer: ${celebrityName}
Role: ${role.character} in "${role.title}" (${role.year || 'year unknown'}, ${role.mediaType || role.medium || 'unknown type'}${role.episodes ? `, ${role.episodes} episodes` : ''})
${role.coStars?.length ? `Co-stars: ${role.coStars.join(', ')}` : ''}
${animated ? 'This is a VOICE/ANIMATED role: we need OFFICIAL art of the character — studio artwork, key visuals, official promotional art, screenshots from the show/film. Never fan art.' : 'This is a LIVE-ACTION role: we need the performer IN THIS ROLE — scene stills, episode screenshots, on-set photos, official cast/promotional photos. Not red carpets, interviews or conventions.'}

Write 7 queries:
- 4 with aim "solo": ${animated ? 'the character on their own' : 'the performer alone, in character'}
- 2 with aim "group": ${animated ? 'the character with other characters, official group art' : 'official cast photos or scenes with co-stars'}
- 1 with aim "poster": the official poster or key art for the title

Tips: quote exact names. Many titles are shared by several films or shows, so include the year in most queries, and a co-star's name in some, so results are about THIS "${role.title}". Words like still, scene, episode, season, promotional, official help. Do not use site: or minus operators.`;

  try {
    const reply = await chat({
      model: config.models.fast,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      schema: QUERY_SCHEMA
    });
    const queries = (reply.queries || []).filter(q => q.q && q.q.trim()).slice(0, 8);
    if (queries.length >= 3) return queries;
  } catch (error) {
    console.log(`⚠️ Query planning failed, using templates: ${error.message}`);
  }
  return templateQueries(celebrityName, role);
}

// ---------------------------------------------------------------- Google

function exclusionSuffix() {
  return config.search.excludeTerms
    .map(term => (term.includes(' ') ? `-"${term}"` : `-${term}`))
    .join(' ');
}

async function googleCandidates(queries, { page = 0, animated = false } = {}) {
  const suffix = exclusionSuffix();
  const errors = [];

  // A few at a time, so one slow search doesn't hold up the rest.
  const outcomes = await settleLimit(queries, 3, async (query) => {
    const data = await searchImages({
      q: `${query.q} ${suffix}`.trim(),
      ijn: page,
      // Large images only for photos; official animation art is often mid-sized.
      ...(animated ? {} : { tbs: 'isz:l' })
    });

    return (data.images_results || [])
      .filter(r => r.original && !isBlocked(r.original, r.link))
      .filter(r => bigEnough(r.original_width, r.original_height))
      .map((r, i) => ({
        url: r.original,
        pageUrl: r.link,
        title: r.title || '',
        width: r.original_width,
        height: r.original_height,
        source: 'google',
        hint: query.aim,
        query: query.q,
        rank: i
      }));
  });

  const lists = [];
  outcomes.forEach((outcome, i) => {
    if (outcome.ok) {
      lists.push(outcome.value);
    } else {
      errors.push(outcome.error.message);
      console.log(`⚠️ Search failed for ${queries[i].q}: ${outcome.error.message}`);
    }
  });

  if (lists.length === 0 && errors.length > 0) {
    throw new Error(`Every image search failed: ${errors[0]}`);
  }

  // Round-robin, so each query's best results come before any query's weaker ones.
  const merged = [];
  const longest = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (list[i]) merged.push(list[i]);
  }
  return merged;
}

module.exports = {
  tmdbCandidates,
  tmdbTaggedCandidates,
  fandomCandidates,
  titleCast,
  guessWikiNames,
  plannedQueries,
  templateQueries,
  googleCandidates,
  isBlocked,
  bigEnough,
  minimumSize,
  isAnimated
};
