/**
 * AI Prompt Templates for Celebrity Role Fetching
 * Centralized prompts for consistent AI behavior
 */

const PROMPTS = {
  
  /**
   * Main role fetching prompt - handles ANY celebrity type with autograph focus
   */
  FETCH_ROLES: (actorName) => `You are an entertainment industry expert specializing in celebrity autograph and fan convention analysis. For the performer "${actorName}", provide their TOP 5 most iconic and recognizable CHARACTER ROLES that fans would want autographs for.

CRITICAL REQUIREMENTS - ONLY include roles that meet ALL of these criteria:
- NAMED CHARACTER ROLES (not hosting, presenting, or "various characters")
- ROLES WITH GOOD VISUAL REPRESENTATION (characters that have clear, searchable images)
- FAN-FAVORITE ROLES (characters that convention attendees would recognize)
- SPECIFIC CHARACTER NAMES (avoid "Various Characters" or "Multiple Roles")

PRIORITIZE:
- Main characters over minor appearances
- Named characters over unnamed roles
- Popular franchises with strong fan bases
- Roles with distinctive character designs or memorable performances
- Characters that would be recognizable from photos/images

AVOID:
- TV hosting, game show hosting, or presenting roles
- "Various characters" or "multiple characters" entries
- Minor voice work without specific character names
- Reality TV appearances
- Narrator or voice-over work without character identity
- Behind-the-scenes or producer credits

Format your response as a JSON array with this exact structure:
[
  {
    "character": "Specific Character Name (not 'Various Characters')",
    "title": "Show/Movie/Production Title", 
    "medium": "live_action_movie|live_action_tv|voice_anime|voice_cartoon|voice_game|voice_movie",
    "year": "YYYY",
    "description": "Brief 1-2 sentence description focusing on why fans love this character",
    "popularity": "high|medium|low",
    "autograph_appeal": "high|medium|low"
  }
]

Provide exactly 5 roles, ordered from most autograph-worthy/fan-recognizable to least.`,

  /**
   * Search term optimization prompt - both group AND solo photo optimization
   */
  OPTIMIZE_SEARCH: (character, title, medium) => `You are an expert at finding HIGH-VALUE AUTOGRAPH PHOTOS for convention sales.

For the ${medium.includes('voice') ? 'character' : 'role'} "${character}" from "${title}" (medium: ${medium}), create 5 search terms: 3 for GROUP PHOTOS (highest value) and 2 for SOLO PHOTOS (premium quality).

GROUP PHOTOS (Terms 1-3) - MAXIMUM AUTOGRAPH VALUE:
${medium.includes('voice') ? 
  `- Show name + "main characters" + "group"/"together"
  - Show name + "cast" + "all characters"
  - Character name + "with other characters" + show name
  GOAL: Multiple character artwork for multiple signatures` :
  `- Show/movie name + "main cast" + "group photo"
  - Actor name + "with cast" + show/movie name  
  - Show/movie name + "ensemble" + "promotional"
  GOAL: Multiple actors in one photo for multiple signatures`
}

SOLO PHOTOS (Terms 4-5) - PREMIUM SINGLE SIGNATURES:
${medium.includes('voice') ? 
  `- Character name + show name + "official artwork"/"promotional art"
  - Character name + "high quality" + show name
  GOAL: Professional character artwork, not fan art or merchandise` :
  `- Actor name + character name + "promotional photo"
  - Actor name + show/movie name + "production still"
  GOAL: Professional promotional photos, not convention or fan photos`
}

AVOID ALL TERMS THAT FIND:
- Convention photos, autograph signings, meet & greets
- Merchandise (Funko, action figures, toys, mugs, shirts)
- Fan photos, selfies, low-quality images
- eBay listings, signed memorabilia

Return as JSON array with 5 terms (3 group + 2 solo):
["group term 1", "group term 2", "group term 3", "solo term 1", "solo term 2"]`,

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
const PROMPT_CONFIG = {
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

module.exports = { PROMPTS, PROMPT_CONFIG };
