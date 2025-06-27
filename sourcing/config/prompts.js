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
   * Search term optimization prompt - production photos AND official movie posters
   */
  OPTIMIZE_SEARCH: (character, title, medium) => `You are an expert at finding PROFESSIONAL PRODUCTION PHOTOS and HIGH-RESOLUTION OFFICIAL MOVIE POSTERS from TV shows and movies for autograph sales.

For "${character}" from "${title}" (${medium}), create 6 search terms that find authentic production content and official promotional materials.

MANDATORY EXCLUSIONS - Add to ALL terms:
- "-funko -pop -action -figure -toy -merchandise -convention -signed -autograph -fan -art -edit -meme -comic -dvd -case"

GROUP PHOTOS (Terms 1-2):
${medium.includes('voice') ? 
  `- "${title} main characters official artwork -funko -pop -toy -merchandise -fan -art"
  - "${title} character group promotional art -action -figure -convention -edit"` :
  `- "${title} cast group production photo -funko -pop -toy -merchandise -convention"  
  - "${title} main cast press photo -convention -autograph -fan -art"`
}

SOLO PHOTOS (Terms 3-4):
${medium.includes('voice') ? 
  `- "${character} ${title} official character art -funko -pop -toy -merchandise -fan"
  - "${character} ${title} promotional artwork -action -figure -convention -edit"` :
  `- "William Shatner ${character} production still -funko -pop -toy -merchandise -convention"
  - "William Shatner ${title} promotional photo -action -figure -signed -fan -art"`
}

OFFICIAL MOVIE POSTERS (Terms 5-6) - HIGH AUTOGRAPH VALUE:
${medium.includes('voice') ? 
  `- "${title} official movie poster high resolution -funko -pop -toy -merchandise -fan"
  - "${title} theatrical poster official artwork -action -figure -convention -edit"` :
  `- "${title} official movie poster theatrical release -funko -pop -toy -merchandise -fan"
  - "${title} original cinema poster high resolution -action -figure -convention -signed"`
}

INCLUDE ONLY:
- Production stills from actual episodes/movies  
- Official promotional photos from the show/movie
- Press photos with the actual actors
- Official theatrical movie posters (high resolution)
- Original cinema release posters
- Studio promotional poster artwork

EXCLUDE:
- Fan-made posters, reproductions, bootlegs
- Merchandise packaging or toy boxes
- Convention promotional materials
- Low-resolution or watermarked images
- DVD/Blu-ray covers (different from theatrical posters)

Return 6 search terms with proper exclusions:
["group term", "group term", "solo term", "solo term", "poster term", "poster term"]`,

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
