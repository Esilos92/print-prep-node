/**
 * Prompt for role discovery when TMDb has no match for the performer and
 * roles must come from the model's own knowledge. (When TMDb has the
 * performer, TMDbFilmography asks the model to pick from real credits.)
 *
 * The distinctness rules are the point of this prompt. Asking for "the 5
 * most notable acting ROLES" is answered correctly by naming one character
 * across four sequels, which yields near-identical image sets.
 */
const PROMPTS = {
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
]`
};

module.exports = { PROMPTS };
