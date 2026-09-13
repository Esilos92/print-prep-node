/**
 * SIMPLE AI Prompts - Trust OpenAI to Do Its Job
 * Back to basics - no bloat, no overthinking
 */

const PROMPTS = {

  /**
   * SIMPLE: Basic role discovery - trust OpenAI
   */
  /**
   * Role discovery.
   *
   * The distinctness rules are the point of this prompt. Asking for "the 5
   * most notable acting ROLES" is answered correctly by naming one character
   * across four sequels — Murtaugh in Lethal Weapon 1-4 really is four
   * acting roles — which yields four near-identical image sets and one
   * sellable product instead of five.
   *
   * `count` is deliberately over-requested: duplicates are stripped in code
   * afterwards, so asking for extras leaves enough survivors.
   */
  FETCH_ROLES: (actorName, count = 8) => `List the ${count} most notable acting roles for "${actorName}".

HARD RULES — these matter more than fame:
- Every entry must be a DIFFERENT character.
- Never list the same character twice, even across sequels or seasons.
- At most ONE entry per film series or franchise. If an actor is known for a
  series, pick its single best-known instalment and move on.
- Prefer a spread across different decades, genres and formats.

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
    "franchise": "Series or franchise name, or null if standalone",
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
