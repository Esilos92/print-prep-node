/**
 * AI Prompt Templates for Celebrity Role Fetching
 * Optimized for finding high-quality character images
 */

const PROMPTS = {
  
  /**
   * Main role fetching prompt - focused on visual character roles
   */
  FETCH_ROLES: (actorName) => `You are an entertainment expert. For "${actorName}", list their TOP 5 most visually iconic CHARACTER ROLES from film, TV, or animation.

INCLUDE:
- Named character roles with strong visual presence
- Cult horror, viral hits, genre favorites, and indie standouts
- Roles fans would recognize from posters, trailers, or iconic scenes
- Live-action and animated work from 2010 onward (unless earlier roles are definitive)

AVOID:
- Hosting or presenting roles
- "Various characters" entries
- Minor background roles
- Reality TV appearances

MEDIUM CLASSIFICATION:
- live_action_tv: TV series (any length)
- live_action_movie: Feature films
- voice_anime_tv: Anime TV series
- voice_anime_movie: Anime films
- voice_cartoon: Western animation
- voice_game: Video game characters

Format as JSON array with exact character names from credits:
[
  {
    "character": "Exact Character Name",
    "title": "Show/Movie Title", 
    "medium": "live_action_tv",
    "year": "YYYY",
    "popularity": "high"
  }
]

Provide exactly 5 roles ordered by visual recognition and fan familiarity.`,

  /**
   * Search term optimization prompt - high-quality character images
   */
  OPTIMIZE_SEARCH: (character, title, medium, actorName) => `Create 6 search terms to find high-quality images of "${character}" from "${title}" (${medium}).

GOAL: Find professional production photos, promotional images, and official character stills. Avoid celebrity autograph photos.

EXCLUSIONS for ALL terms:
"-funko -pop -action -figure -toy -merchandise -convention -signed -autograph -signature -inscription -fan -art -edit -meme -comic -dvd -case"

SEARCH STRATEGY:
${medium.includes('voice') ? 
  `CHARACTER-FOCUSED (animated content):
  - "${character}" official artwork
  - "${character} ${title}" character design
  - "${title} ${character}" scene
  - "${title}" main characters
  - "${character}" anime character
  - "${title}" official art` :
  `ACTOR + CHARACTER (live-action):
  - "${actorName || 'ACTOR_NAME'} ${character}" production still
  - "${character} ${title}" official image
  - "${actorName || 'ACTOR_NAME'} ${title}" scene
  - "${title} ${character}" promo shot
  - "${character}" character still
  - "${title}" cast promotional photo`
}

Return 6 clean search terms with exclusions:
["term 1", "term 2", "term 3", "term 4", "term 5", "term 6"]`,

  /**
   * Performer type detection prompt
   */
  DETECT_PERFORMER_TYPE: (actorName) => `What type of performer is "${actorName}"?

Categories:
- "live_action_primary": Primarily live-action movies/TV
- "voice_actor_anime": Primarily anime voice acting
- "voice_actor_western": Primarily western animation
- "voice_actor_games": Primarily video game voice acting
- "mixed_performer": Works across multiple mediums

Respond with just the category.`,

  /**
   * Image validation prompt
   */
  VALIDATE_IMAGE: (character, title, imageDescription) => `Validate if this image shows "${character}" from "${title}".

Image: "${imageDescription}"

Consider:
- Correct character appearance
- From the right show/movie
- Official or production quality
- Not fan art or merchandise

Response:
{
  "isValid": true/false,
  "confidence": "high|medium|low", 
  "reason": "brief explanation"
}`,

  /**
   * Fallback search when main search fails
   */
  FALLBACK_SEARCH: (actorName) => `Primary search failed for "${actorName}". Suggest 3 alternative character names or shows they're known for with better image availability.

Focus on:
- Main characters
- Popular productions
- Visually distinctive roles

Return: ["Alternative 1", "Alternative 2", "Alternative 3"]`
};

/**
 * Prompt configuration settings
 */
const PROMPT_CONFIG = {
  // Temperature settings
  TEMPERATURE: {
    ROLE_FETCHING: 0.2,    // Lower for consistent results
    SEARCH_OPTIMIZATION: 0.3,
    VALIDATION: 0.1
  },

  // Token limits
  MAX_TOKENS: {
    ROLE_FETCHING: 800,
    SEARCH_OPTIMIZATION: 200,
    ACTOR_DETECTION: 50,
    VALIDATION: 150,
    FALLBACK: 100
  },

  // Model preferences
  MODELS: {
    PRIMARY: "gpt-4o",
    FALLBACK: "gpt-3.5-turbo"
  }
};

module.exports = { PROMPTS, PROMPT_CONFIG };
