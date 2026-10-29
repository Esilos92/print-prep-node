const axios = require('axios');
const config = require('../../utils/config');
const { chat } = require('../../utils/openai');
const { searchImages } = require('../../utils/serpapi');

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

  return [
    { q: `"${celebrityName}" ${t} still`, aim: 'solo' },
    { q: `${c} ${t} scene`, aim: 'solo' },
    { q: `"${celebrityName}" as ${c}`, aim: 'solo' },
    { q: `${t} cast ${tv ? 'promotional photo' : 'still'}`, aim: 'group' },
    { q: `${t} official poster`, aim: 'poster' }
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
${animated ? 'This is a VOICE/ANIMATED role: we need OFFICIAL art of the character — studio artwork, key visuals, official promotional art, screenshots from the show/film. Never fan art.' : 'This is a LIVE-ACTION role: we need the performer IN THIS ROLE — scene stills, episode screenshots, on-set photos, official cast/promotional photos. Not red carpets, interviews or conventions.'}

Write 7 queries:
- 4 with aim "solo": ${animated ? 'the character on their own' : 'the performer alone, in character'}
- 2 with aim "group": ${animated ? 'the character with other characters, official group art' : 'official cast photos or scenes with co-stars'}
- 1 with aim "poster": the official poster or key art for the title

Tips: quote exact names; add disambiguating words when the title is a common word (e.g. TV series, film, the year, the network); words like still, scene, episode, season, promotional, official help. Do not use site: or minus operators.`;

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
  const lists = [];
  const errors = [];

  for (const query of queries) {
    try {
      const data = await searchImages({
        q: `${query.q} ${suffix}`.trim(),
        ijn: page,
        // Large images only for photos; official animation art is often mid-sized.
        ...(animated ? {} : { tbs: 'isz:l' })
      });

      const results = (data.images_results || [])
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

      lists.push(results);
    } catch (error) {
      errors.push(error.message);
      console.log(`⚠️ Search failed for ${query.q}: ${error.message}`);
    }
  }

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
  plannedQueries,
  templateQueries,
  googleCandidates,
  isBlocked,
  bigEnough,
  minimumSize,
  isAnimated
};
