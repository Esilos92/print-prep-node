/**
 * SIMPLE AI Prompts - Trust OpenAI to Do Its Job
 * Back to basics - no bloat, no overthinking
 */

const PROMPTS = {

  /**
   * SIMPLE: Basic role discovery - trust OpenAI
   */
  FETCH_ROLES: (actorName) => `List the 5 most notable acting roles for "${actorName}".

Include any type of acting work:
- Movies (big budget, indie, horror, etc.)
- TV shows (network, streaming, etc.)
- Voice acting (anime, cartoons, games)
- Any other notable performances

Use exact character names from official sources.

Format as JSON:
[
  {
    "character": "Exact Character Name",
    "title": "Show/Movie Title", 
    "medium": "live_action_movie",
    "year": "YYYY",
    "popularity": "high"
  }
]`,

  /**
   * SIMPLE: Character extraction from web results
   */
  EXTRACT_CHARACTER_NAME: (celebrityName, movieTitle, searchResults) => `Extract the character name that "${celebrityName}" played in "${movieTitle}" from these search results:

${searchResults.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Look for patterns like:
- "${celebrityName} as [Character]"
- "${celebrityName} plays [Character]"
- "[Character] played by ${celebrityName}"

Return just the character name, or "UNKNOWN" if not found.`,

  /**
   * SIMPLE: Search term optimization
   */
  OPTIMIZE_SEARCH: (character, title, medium, actorName) => `Create 6 search terms to find images of "${character}" from "${title}".

${medium.includes('voice') ? 
  `Focus on the character (animated):
  - "${character}" "${title}"
  - "${character}" official art
  - "${title}" "${character}" HD
  - "${character}" character design
  - "${title}" characters
  - "${character}" HD` :
  `Focus on character with actor backup:
  - "${character}" "${title}"
  - "${actorName}" "${character}"
  - "${character}" "${title}" HD
  - "${actorName}" "${title}"
  - "${character}" scene
  - "${title}" cast`
}

Return 6 search terms: ["term1", "term2", "term3", "term4", "term5", "term6"]`

};

/**
 * SIMPLE: Configuration
 */
const PROMPT_CONFIG = {
  TEMPERATURE: {
    ROLE_FETCHING: 0.1,
    SEARCH_OPTIMIZATION: 0.2,
    VALIDATION: 0.1
  },

  MAX_TOKENS: {
    ROLE_FETCHING: 800,
    SEARCH_OPTIMIZATION: 200,
    VALIDATION: 150
  },

  MODELS: {
    PRIMARY: "gpt-4o-mini",
    FALLBACK: "gpt-4o-mini"
  }
};

module.exports = { 
  PROMPTS, 
  PROMPT_CONFIG
};
