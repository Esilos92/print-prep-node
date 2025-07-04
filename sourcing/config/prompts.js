/**
 * ENHANCED AI Prompt Templates for Universal Celebrity Role Fetching
 * Optimized for ALL fame levels - mainstream to indie to breakout stars
 */

const PROMPTS = {

  /**
   * FIXED: Ultra-conservative role discovery to prevent hallucination
   */
  FETCH_ROLES: (actorName) => `You are an entertainment expert. For "${actorName}", find their verified acting roles.

🚨 CRITICAL: DO NOT INVENT OR GUESS ANY ROLES
- If you're not 100% certain about a role, DO NOT include it
- Better to return 1-2 real roles than 5 fake ones
- Only include roles you can absolutely verify
- If uncertain about "${actorName}", return fewer roles or empty array

DISCOVERY APPROACH:
- Only include roles you are completely confident about
- Check your knowledge carefully before including any role
- Include all types of acting work (movies, TV, voice work, indie films)
- Focus on roles the actor is actually known for

VERIFICATION BEFORE INCLUDING:
- Am I certain "${actorName}" played this character?
- Am I certain this show/movie exists?
- Am I certain about the character name?
- If ANY uncertainty, exclude the role

MEDIUM CLASSIFICATION:
- live_action_tv: TV series/streaming shows
- live_action_movie: Films (any budget)
- voice_anime_tv: Anime TV series
- voice_anime_movie: Anime films
- voice_cartoon: Western animation
- voice_game: Video game characters

Format as JSON array with EXACT information:
[
  {
    "character": "Exact Character Name",
    "title": "Exact Show/Movie Title", 
    "medium": "live_action_movie",
    "year": "YYYY",
    "popularity": "high/medium/low",
    "confidence": "high"
  }
]

🚨 FINAL CHECK: Review each role before including it. Only include roles you can verify with high confidence.

If you're not confident about "${actorName}"'s filmography, return fewer roles or an empty array: []`,

  /**
   * ENHANCED: Horror/indie specific discovery for missed content
   */
  HORROR_INDIE_DISCOVERY: (actorName) => `"${actorName}" may have appeared in horror, thriller, or independent films that are often missed by general searches.

SPECIFIC FOCUS:
- Horror films (especially independent horror like "Terrifier", "The Conjuring", "Insidious", etc.)
- Thriller and suspense films
- Independent/art house cinema
- Low-budget genre films
- Film festival circuit movies
- Cult films and B-movies
- Streaming platform horror content

SEARCH STRATEGY:
- Check horror film databases and lists
- Look for indie horror from 2010-2020 period
- Include low-budget horror films
- Check for horror sequels and franchises
- Look for film festival horror entries

INCLUDE:
- Any horror film appearances (even small roles)
- Thriller and suspense films
- Independent productions
- Genre films that gained cult followings
- Film festival entries

CHARACTER NAMES:
- Use exact character names from official sources
- If character name is unclear, use "Character" as placeholder
- Include year of release if known

Format as JSON array:
[
  {
    "character": "Exact Character Name",
    "title": "Exact Film Title", 
    "medium": "live_action_movie",
    "year": "YYYY",
    "popularity": "low",
    "note": "horror film"
  }
]

IMPORTANT: Only include roles you can verify. If uncertain, do not include.`,

  /**
   * ENHANCED: Self-verification prompt to catch hallucinations
   */
  VERIFY_DISCOVERED_ROLES: (actorName, roles) => `Verify these roles for "${actorName}". Mark any you're uncertain about.

${roles.map(r => `- ${r.character} in ${r.title} (${r.year})`).join('\n')}

For each role, respond:
- CONFIRMED: You're certain this is correct
- UNCERTAIN: You're not sure about this role  
- INCORRECT: You believe this is wrong

Format: TITLE|STATUS|REASON
Example: "Terrifier|CONFIRMED|Horror film from 2016"

IMPORTANT: If you're not certain about a role, mark it as UNCERTAIN or INCORRECT. Better to be safe.`,

  /**
   * ENHANCED: Broad discovery for difficult/unknown celebrities
   */
  BROAD_DISCOVERY: (actorName) => `Find ANY notable acting work for "${actorName}" - include small roles, indie films, streaming content, voice work, or recent performances.

Even if they're not famous, they likely have:
- Student films that got attention
- Indie/festival films
- Streaming show appearances (Netflix, Hulu, etc.)
- Voice acting work (anime, animation, games)
- Recent breakout roles
- Web series with following
- Theater work that was recorded
- Short films that went viral

PRIORITY: Find what they're actually known for, even if it's small.

Return what you can find, even if limited:
[{"character": "Character or Role", "title": "Project Title", "medium": "type", "year": "YYYY", "popularity": "low", "note": "indie" or "web series" or "voice work"}]`,

  /**
   * ENHANCED: Voice actor specialized discovery
   */
  VOICE_ACTOR_DISCOVERY: (actorName) => `List the most recognizable voice acting performances by "${actorName}" in anime, animation, or video games.

FOCUS: CHARACTER IMAGES for search purposes - people know the characters, not the voice actor's face.

INCLUDE:
- Anime characters (popular and niche)
- Western animation roles
- Video game characters
- Audio drama characters
- Any voice work that has visual representation

Use exact character names from official sources.

Return as JSON array:
[{
  "character": "Exact Character Name", 
  "title": "Show/Movie/Game Title",
  "medium": "voice_anime_tv",
  "year": "YYYY",
  "popularity": "high/medium/low",
  "note": "main character" or "popular role" (if applicable)
}]`,

  /**
   * ENHANCED: Search term optimization for character images
   */
  OPTIMIZE_SEARCH: (character, title, medium, actorName) => `Create 6 search terms to find high-quality images of "${character}" from "${title}" (${medium}).

GOAL: Find professional production photos, promotional images, official character stills, and high-quality fan content.

STRICT EXCLUSIONS for ALL terms:
"-signed -autograph -signature -inscription -COA -authenticated -certificate -hologram -JSA -PSA -beckett -steiner -fanatics -meet -greeting -signing -autographed"

SEARCH STRATEGY:
${medium.includes('voice') ? 
  `CHARACTER-FOCUSED (animated content):
  - "${character}" official artwork
  - "${character} ${title}" character design
  - "${title} ${character}" anime
  - "${title}" main characters
  - "${character}" HD
  - "${title}" official art` :
  `ACTOR + CHARACTER (live-action):
  - "${actorName || 'ACTOR_NAME'} ${character}" scene
  - "${character} ${title}" HD
  - "${actorName || 'ACTOR_NAME'} ${title}" promotional
  - "${title} ${character}" still
  - "${character}" HD scene
  - "${title}" cast promotional`
}

QUALITY HINTS:
- Add "HD" for better resolution
- Add "official" for authentic sources
- Add "promotional" for professional photos
- Add "scene" for production stills

Return 6 clean search terms with exclusions:
["term 1", "term 2", "term 3", "term 4", "term 5", "term 6"]`,

  /**
   * ENHANCED: Performer type detection
   */
  DETECT_PERFORMER_TYPE: (actorName) => `What type of performer is "${actorName}"?

Categories:
- "live_action_primary": Primarily live-action movies/TV
- "voice_actor_anime": Primarily anime voice acting
- "voice_actor_western": Primarily western animation
- "voice_actor_games": Primarily video game voice acting
- "mixed_performer": Works across multiple mediums
- "indie_actor": Primarily indie/small productions
- "streaming_actor": Primarily streaming/web content
- "breakout_star": Recently gained fame from one major role

Consider their most notable work and current recognition level.

Respond with just the category.`,

  /**
   * ENHANCED: Image validation with quality focus
   */
  VALIDATE_IMAGE: (character, title, imageDescription) => `Validate if this image shows "${character}" from "${title}" and assess quality.

Image: "${imageDescription}"

QUALITY CRITERIA:
- High resolution (not pixelated or blurry)
- No autograph/signature overlays
- Professional or official appearance
- Clear character representation
- Not heavily compressed or artifacted

CONTENT CRITERIA:
- Correct character appearance
- From the right show/movie
- Not fan art (unless high quality)
- Not merchandise photos

Response:
{
  "isValid": true/false,
  "confidence": "high|medium|low", 
  "reason": "brief explanation",
  "qualityScore": 1-10,
  "hasAutograph": true/false
}`,

  /**
   * ENHANCED: Multi-actor character detection
   */
  DETECT_MULTI_ACTOR: (characterName, showTitle) => `Has the character "${characterName}" from "${showTitle}" been played by multiple different actors across different movies, TV shows, or reboots?

Consider:
- Different actors in reboots/remakes
- Recasting across film series
- Different TV vs movie versions
- Multiple live-action adaptations

GUARANTEED MULTI-ACTOR EXAMPLES:
- The Doctor (Doctor Who) = YES (14+ actors)
- James Bond = YES (6+ actors)
- Batman/Bruce Wayne = YES (8+ actors)
- Spider-Man/Peter Parker = YES (3+ actors)
- Sherlock Holmes = YES (10+ actors)

Answer with just "YES" if multiple actors have played this character, or "NO" if it's typically one actor.`,

  /**
   * ENHANCED: Fallback search for unknown celebrities
   */
  FALLBACK_SEARCH: (actorName) => `"${actorName}" appears to be a lesser-known performer. Suggest 3 alternative search approaches:

1. Their most notable work (even if small)
2. Their professional type (indie actor, voice actor, etc.)
3. Alternative name or recent project

Focus on what would have the best image availability.

Return: ["Alternative 1", "Alternative 2", "Alternative 3"]`,

  /**
   * ENHANCED: Breakout star discovery
   */
  BREAKOUT_DISCOVERY: (actorName) => `"${actorName}" appears to be a breakout star or rising talent. Find their breakthrough role and any supporting work.

FOCUS:
- Their major breakout performance
- Any recent trending roles
- Viral or popular content they've been in
- Rising star recognition

Include the role that made them famous plus any other notable work.

Return as JSON array focusing on what they're currently known for:
[{"character": "Breakout Character", "title": "Breakout Show/Movie", "medium": "type", "year": "YYYY", "popularity": "high", "note": "breakout role"}]`
};

/**
 * ENHANCED: Prompt configuration settings
 */
const PROMPT_CONFIG = {
  // Temperature settings for consistency
  TEMPERATURE: {
    ROLE_FETCHING: 0.1,        // Very low for consistent results
    SEARCH_OPTIMIZATION: 0.2,   // Low for reliable search terms
    VALIDATION: 0.1,           // Very low for consistent validation
    BROAD_DISCOVERY: 0.3       // Slightly higher for creative discovery
  },

  // Token limits optimized for cost
  MAX_TOKENS: {
    ROLE_FETCHING: 800,        // Standard role discovery
    BROAD_DISCOVERY: 400,      // Shorter for difficult cases
    VOICE_ACTOR: 600,          // Medium for voice actor discovery
    SEARCH_OPTIMIZATION: 200,   // Short for search terms
    ACTOR_DETECTION: 50,       // Very short for type detection
    VALIDATION: 150,           // Short for validation
    FALLBACK: 100,             // Very short for fallbacks
    BREAKOUT: 300              // Medium for breakout discovery
  },

  // Model preferences - cost optimized
  MODELS: {
    PRIMARY: "gpt-4o-mini",    // Cost-efficient primary model
    FALLBACK: "gpt-4o-mini",   // Same model for consistency
    EXPENSIVE: "gpt-4o"        // Only for critical tasks
  },

  // Enhanced search configuration
  SEARCH_CONFIG: {
    MAX_TERMS_PER_ROLE: 6,
    MAX_ROLES_PER_CELEBRITY: 5,
    QUALITY_THRESHOLD: 0.7,
    ENABLE_MULTI_ACTOR_DETECTION: true,
    ENABLE_VOICE_ACTOR_OPTIMIZATION: true,
    ENABLE_INDIE_ACTOR_SUPPORT: true
  }
};

/**
 * ENHANCED: Prompt templates for different celebrity types
 */
const SPECIALIZED_PROMPTS = {
  
  INDIE_ACTOR: (actorName) => `"${actorName}" appears to be an indie or independent film actor. Find their most notable independent work.

FOCUS:
- Independent films that gained attention
- Festival circuit appearances
- Streaming platform indies
- Small but memorable roles
- Art house or experimental work

Even small roles can be significant if the film was notable.

Return their most recognizable indie work:
[{"character": "Character", "title": "Indie Film/Show", "medium": "type", "year": "YYYY", "popularity": "medium", "note": "indie film"}]`,

  STREAMING_ACTOR: (actorName) => `"${actorName}" appears to work primarily in streaming or web content. Find their most notable streaming work.

FOCUS:
- Netflix, Hulu, Amazon Prime series
- YouTube originals or web series
- Streaming platform exclusives
- Digital-first content
- Web series that gained following

Return their most recognizable streaming work:
[{"character": "Character", "title": "Streaming Show", "medium": "live_action_tv", "year": "YYYY", "popularity": "medium", "note": "streaming content"}]`,

  VIRAL_TO_ACTOR: (actorName) => `"${actorName}" appears to be someone who transitioned from viral/social media fame to acting. Find ONLY their acting work.

STRICT FOCUS: Acting roles only, ignore viral content.

INCLUDE:
- First acting roles
- Transition projects
- Recent acting work
- Any film or TV appearances

AVOID:
- Social media content
- Viral videos
- Influencer content
- Non-acting appearances

Return only their acting work:
[{"character": "Character", "title": "Acting Project", "medium": "type", "year": "YYYY", "popularity": "low", "note": "acting debut"}]`
};

/**
 * ENHANCED: Quality indicators for search optimization
 */
const QUALITY_INDICATORS = {
  HIGH_QUALITY_SOURCES: [
    'imdb', 'wikipedia', 'official', 'promo', 'promotional', 'press', 'publicity',
    'hd', 'high resolution', 'production', 'behind scenes', 'bts', 'still'
  ],
  
  AUTOGRAPH_EXCLUSIONS: [
    'signed', 'autograph', 'signature', 'inscription', 'COA', 'authenticated',
    'certificate', 'hologram', 'JSA', 'PSA', 'beckett', 'steiner', 'fanatics',
    'meet and greet', 'meet&greet', 'signing', 'autographed', 'signed by'
  ],
  
  LOW_QUALITY_INDICATORS: [
    'thumbnail', 'thumb', 'small', 'icon', 'avatar', 'profile',
    'low res', 'low-res', 'compressed', 'pixelated', 'blurry'
  ]
};

module.exports = { 
  PROMPTS, 
  PROMPT_CONFIG, 
  SPECIALIZED_PROMPTS, 
  QUALITY_INDICATORS 
};
