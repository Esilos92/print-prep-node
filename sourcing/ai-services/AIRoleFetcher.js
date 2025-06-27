import OpenAI from 'openai';

class AIRoleFetcher {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Main function that replaces your entire old fetchRoles.js
   * Gets top 5 roles for any voice actor using AI
   */
  async fetchRoles(actorName) {
    try {
      console.log(`🤖 AI fetching roles for: ${actorName}`);
      
      const prompt = this.buildRolePrompt(actorName);
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 1000
      });

      const response = completion.choices[0].message.content;
      const roles = this.parseAIResponse(response);
      
      console.log(`✅ AI found ${roles.length} roles for ${actorName}`);
      return roles;

    } catch (error) {
      console.error(`❌ AI fetch failed for ${actorName}:`, error.message);
      throw error;
    }
  }

  /**
   * Builds the AI prompt for role fetching
   */
  buildRolePrompt(actorName) {
    return `You are a voice acting expert. For the voice actor "${actorName}", provide their TOP 5 most iconic and recognizable voice roles.

IMPORTANT GUIDELINES:
- Focus on VOICE ACTING roles only (not live-action)
- Choose roles that are most recognizable and iconic
- Include both character name AND show/movie name
- Prioritize roles that would have good image search results
- For anime voice actors, include both English dub and Japanese roles if applicable
- Avoid obscure or minor roles

Format your response as a JSON array with this exact structure:
[
  {
    "character": "Character Name",
    "title": "Show/Movie Title",
    "type": "anime|cartoon|video_game",
    "year": "YYYY",
    "description": "Brief 1-2 sentence description of the character"
  }
]

Provide exactly 5 roles, ordered from most iconic to least iconic.`;
  }

  /**
   * Parses AI response and validates the format
   */
  parseAIResponse(response) {
    try {
      // Extract JSON from response (handles cases where AI adds extra text)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in AI response');
      }

      const roles = JSON.parse(jsonMatch[0]);
      
      // Validate structure
      if (!Array.isArray(roles)) {
        throw new Error('AI response is not an array');
      }

      // Validate each role has required fields
      const validatedRoles = roles.map((role, index) => {
        if (!role.character || !role.title) {
          throw new Error(`Role ${index + 1} missing character or title`);
        }

        return {
          character: role.character.trim(),
          title: role.title.trim(),
          type: role.type || 'unknown',
          year: role.year || 'unknown',
          description: role.description || '',
          searchTerm: `${role.character} ${role.title}` // Generated search term
        };
      });

      return validatedRoles;

    } catch (error) {
      console.error('❌ Failed to parse AI response:', error.message);
      console.error('Raw AI response:', response);
      throw new Error(`AI response parsing failed: ${error.message}`);
    }
  }

  /**
   * Generate optimized search terms for image fetching
   * This enhances your existing fetchImages.js
   */
  generateSearchTerms(roles) {
    return roles.map(role => {
      const baseTerms = [
        `${role.character} ${role.title}`,
        `${role.character} voice actor`,
        `${role.title} ${role.character}`
      ];

      // Add type-specific terms
      if (role.type === 'anime') {
        baseTerms.push(`${role.character} anime character`);
      } else if (role.type === 'cartoon') {
        baseTerms.push(`${role.character} cartoon character`);
      }

      return {
        ...role,
        searchTerms: baseTerms
      };
    });
  }

  /**
   * Health check - test if AI is working
   */
  async testConnection() {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: "Say 'AI connection working'" }],
        max_tokens: 10
      });
      
      return completion.choices[0].message.content.includes('working');
    } catch (error) {
      console.error('AI connection test failed:', error.message);
      return false;
    }
  }
}

export default AIRoleFetcher;
