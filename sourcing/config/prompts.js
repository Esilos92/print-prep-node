/**
 * AI Prompt Templates for Celebrity Role Fetching
 * Centralized prompts for consistent AI behavior
 */

export const PROMPTS = {
  
  /**
   * Main role fetching prompt - handles ANY celebrity type
   */
  FETCH_ROLES: (actorName) => `You are an entertainment industry expert. For the performer "${actorName}", provide their TOP 5 most iconic and recognizable roles from ANY medium.

IMPORTANT GUIDELINES:
- Include ALL types of roles: live-action movies, TV shows, voice acting, etc.
- Choose roles that are most recognizable and would have good image search results
- Prioritize iconic characters/roles over minor appearances
- Include character name for fictional roles, or role description for non-fiction
- For voice actors: include both English dub and Japanese roles if applicable
- For live-action: include both movies and significant TV roles
- Mixed performers: balance between their different mediums

Format your response as a JSON array with this exact structure:
[
  {
    "character": "Character/Role Name",
    "title": "Show/Movie/Production Title", 
    "medium": "live_action_movie|live_action_tv|voice_anime|voice_cartoon|voice_game|voice_movie",
    "year": "YYYY",
    "description": "Brief 1-2 sentence description of the character/role",
    "popularity": "high|medium|low"
  }
]

Provide exactly 5 roles, ordered from most iconic/recognizable to least iconic.`,

  /**
   * Search term optimization prompt - adapts to medium type
   */
  OPTIMIZE_SEARCH: (character, title, medium) => `You are an expert at creating optimal Google image search terms. 

For the ${medium.includes('voice') ? 'character' : 'role'} "${character}" from "${title}" (medium: ${medium}), create 3 search terms that will return the best images.

Guidelines for ${medium.includes('voice') ? 'voice acting roles' : 'live-action roles'}:
${medium.includes('voice') ? 
  `- Focus on getting clear character images or official artwork
  - Include character name and show/movie title
  - Add terms like "character", "anime", "cartoon" as appropriate
  - Avoid terms that might return voice actor photos instead of character` :
  `- Focus on getting clear photos of the actor in this specific role
  - Include actor name, character name, and movie/show title
  - Add descriptive terms about the role or costume
  - Include movie/show name to get role-specific images`
}

Return as JSON array:
["search term 1", "search term 2", "search term 3"]`,

  /**
   * Performer type detection prompt - broader scope
   */
  DETECT_PERFORMER_TYPE: (actorName) => `Analyze "${actorName}" and determine what type of performer they are.

Respond with ONLY one of these categories:
- "live_action_primary" - Primarily live-action actor (movies/TV)
- "voice_actor_anime" - Primarily anime voice actor
- "voice_actor_western" - Primarily western animation voice actor
- "voice_actor_games" - Primarily video game voice actor
- "mixed_performer" - Significant work in multiple mediums
- "comedian_actor" - Stand-up comedian who also acts
- "musician_actor" - Musician who also acts
- "unknown" - Cannot determine or unclear

Just return the category, nothing else.`,

  /**
   * Image validation prompt
   */
  VALIDATE_IMAGE: (character, title, imageDescription) => `You are validating if an image matches the intended character.

Character: "${character}"
From: "${title}"
Image shows: "${imageDescription}"

Does this image show the correct character? Consider:
- Character appearance matches expected design
- Image is from the correct show/movie
- Not a different character with same name
- Not fan art that looks different from official design

Respond with:
{
  "isValid": true/false,
  "confidence": "high|medium|low",
  "reason": "brief explanation"
}`,

  /**
   * Fallback search prompt when main search fails
   */
  FALLBACK_SEARCH: (actorName) => `The primary search for "${actorName}" failed. Provide 3 alternative character names or shows this voice actor is known for that might have better search results.

Focus on:
- Main characters (not minor roles)
- Popular shows/movies
- Characters with distinctive visual designs

Return as simple array:
["Alternative 1", "Alternative 2", "Alternative 3"]`
};

/**
 * Prompt configuration settings
 */
export const PROMPT_CONFIG = {
  // Temperature settings for different types of requests
  TEMPERATURE: {
    ROLE_FETCHING: 0.3,    // Lower for consistent role selection
    SEARCH_OPTIMIZATION: 0.5, // Medium for creative search terms
    VALIDATION: 0.1        // Very low for consistent validation
  },

  // Token limits for different prompt types
  MAX_TOKENS: {
    ROLE_FETCHING: 1000,
    SEARCH_OPTIMIZATION: 200,
    ACTOR_DETECTION: 50,
    VALIDATION: 150,
    FALLBACK: 100
  },

  // Model preferences
  MODELS: {
    PRIMARY: "gpt-4",
    FALLBACK: "gpt-3.5-turbo"
  }
};

export default { PROMPTS, PROMPT_CONFIG };
