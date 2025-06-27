const OpenAI = require('openai');
const { PROMPTS, PROMPT_CONFIG } = require('../config/prompts.js');

class SearchOptimizer {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // ChatGPT's optimized exclusions - more comprehensive than before
    this.chatgptExclusions = "-funko -toy -figure -doll -collectible -merchandise -convention -comic-con -autograph -signing -fan -art -drawing -reproduction -poster -framed -wall -display -mounted -pinterest -ebay -amazon -etsy";
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI initialized for search optimization (ChatGPT template + API fallback)');
      } else {
        console.log('ℹ️ OpenAI not configured, using ChatGPT template + Claude fallback');
      }
    } catch (error) {
      console.log('⚠️ OpenAI initialization failed, using ChatGPT template + Claude fallback');
      this.hasOpenAI = false;
    }
  }

  /**
   * Main function to optimize search terms for any role type
   * NOW USES CHATGPT TEMPLATE AS PRIMARY METHOD
   */
  async optimizeSearchTerms(roles) {
    try {
      console.log(`🔍 Optimizing search terms using ChatGPT template for ${roles.length} roles`);
      
      const optimizedRoles = await Promise.all(
        roles.map(role => this.optimizeRoleWithChatGPTTemplate(role))
      );

      console.log(`✅ ChatGPT template optimization complete`);
      return optimizedRoles;

    } catch (error) {
      console.error(`❌ Search optimization failed:`, error.message);
      // Return roles with basic search terms as fallback
      return this.generateFallbackTerms(roles);
    }
  }

  /**
   * NEW: Optimize search terms using ChatGPT template (primary method)
   */
  async optimizeRoleWithChatGPTTemplate(role) {
    try {
      // Extract celebrity name from the role data
      const celebrityName = this.extractCelebrityName(role);
      
      const chatgptTemplateTerms = await this.generateChatGPTSearchTerms(
        celebrityName,
        role.character, 
        role.title, 
        role.medium
      );
      
      const basicTerms = this.generateBasicTerms(role);
      const mediumSpecificTerms = this.generateMediumSpecificTerms(role);

      return {
        ...role,
        searchTerms: {
          chatgpt_template: chatgptTemplateTerms,  // NEW: ChatGPT template terms (primary)
          ai: chatgptTemplateTerms,                // Unified AI field
          chatgpt: chatgptTemplateTerms,           // Keep for compatibility
          basic: basicTerms,                       // Fallback basic terms
          specific: mediumSpecificTerms,           // Medium-specific terms
          all: [...chatgptTemplateTerms, ...basicTerms, ...mediumSpecificTerms] // Combined
        }
      };

    } catch (error) {
      console.error(`⚠️ ChatGPT template failed for ${role.character}, using manual fallback`);
      return {
        ...role,
        searchTerms: {
          chatgpt_template: [],
          ai: [],
          chatgpt: [],
          basic: this.generateBasicTerms(role),
          specific: this.generateMediumSpecificTerms(role),
          all: [...this.generateBasicTerms(role), ...this.generateMediumSpecificTerms(role)]
        }
      };
    }
  }

  /**
   * NEW: Generate search terms using ChatGPT template with Claude fallback
   */
  async generateChatGPTSearchTerms(celebrityName, character, title, medium) {
    // First try the ChatGPT-provided template (most reliable)
    try {
      const templateTerms = this.generateChatGPTTemplate(celebrityName, character, title, medium);
      if (templateTerms.length === 6) {
        console.log(`✅ ChatGPT template generated 6 search terms for ${celebrityName} as ${character}`);
        return templateTerms;
      }
    } catch (error) {
      console.warn(`⚠️ ChatGPT template failed for ${character}: ${error.message}`);
    }

    // Fallback to live ChatGPT API if available
    if (this.hasOpenAI) {
      try {
        return await this.tryOpenAIGeneration(celebrityName, character, title, medium);
      } catch (error) {
        console.warn(`⚠️ ChatGPT API failed for ${character}, trying Claude fallback: ${error.message}`);
      }
    }

    // Fallback to Claude if ChatGPT fails or unavailable
    try {
      return await this.tryClaudeGeneration(celebrityName, character, title, medium);
    } catch (error) {
      console.error(`❌ All AI methods failed for ${character}: ${error.message}`);
      return [];
    }
  }

  /**
   * NEW: Generate search terms using ChatGPT's provided template
   */
  generateChatGPTTemplate(celebrityName, character, title, medium) {
    // ChatGPT's universal exclusions
    const exclusions = "-funko -toy -figure -doll -collectible -merchandise -convention -comic-con -autograph -signing -fan -art -drawing -reproduction -poster -framed -wall -display -mounted -pinterest -ebay -amazon -etsy";
    
    // Medium-specific adjustments
    const mediumAdjustments = this.getMediumAdjustments(medium);
    
    // CHARACTER PORTRAYAL (3 terms) - ChatGPT's exact template
    const term1 = `"${celebrityName}" "${character}" "${title}" costume makeup character production still portraying ${mediumAdjustments.term1} ${exclusions}`;
    
    const term2 = `"${character}" "${celebrityName}" "${title}" scene action shot episode ${mediumAdjustments.term2} in role of ${exclusions}`;
    
    const term3 = `"${celebrityName}" as "${character}" "${title}" promotional photo publicity still official character image ${mediumAdjustments.term3} ${exclusions}`;
    
    // CAST & OFFICIAL MATERIALS (3 terms) - ChatGPT's exact template
    const term4 = `"${title}" cast "${celebrityName}" "${character}" in character costume ${mediumAdjustments.term4} ensemble photo ${exclusions}`;
    
    const term5 = `"${title}" "${character}" "${celebrityName}" official poster theatrical promotional image ${mediumAdjustments.term5} ${exclusions}`;
    
    const term6 = `"${celebrityName}" "${character}" behind the scenes "${title}" ${mediumAdjustments.term6} in costume or booth ${exclusions}`;
    
    return [term1, term2, term3, term4, term5, term6];
  }

  /**
   * NEW: Get medium-specific adjustments for ChatGPT template
   */
  getMediumAdjustments(medium) {
    const adjustments = {
      term1: "", // costume makeup additions
      term2: "", // scene/action additions  
      term3: "", // promotional additions
      term4: "", // cast ensemble additions
      term5: "", // poster additions
      term6: ""  // behind scenes additions
    };

    switch (medium) {
      case 'live_action_movie':
      case 'live_action_tv':
        adjustments.term1 = "on set filming";
        adjustments.term2 = "filming";
        adjustments.term3 = "press photo";
        adjustments.term4 = "on set";
        adjustments.term5 = "theatrical release";
        adjustments.term6 = "filming on set";
        break;

      case 'voice_anime':
      case 'animation_tv':
      case 'animation_movie':
        adjustments.term1 = "voice actor";
        adjustments.term2 = "animation still";
        adjustments.term3 = "voice talent";
        adjustments.term4 = "voice actor";
        adjustments.term5 = "anime poster";
        adjustments.term6 = "recording session voice";
        break;

      case 'voice_cartoon':
      case 'voice_movie':
        adjustments.term1 = "voice actor";
        adjustments.term2 = "cartoon animation";
        adjustments.term3 = "voice talent";
        adjustments.term4 = "voice actor";
        adjustments.term5 = "animated poster";
        adjustments.term6 = "recording session voice";
        break;

      case 'voice_game':
        adjustments.term1 = "voice actor";
        adjustments.term2 = "game character";
        adjustments.term3 = "voice talent";
        adjustments.term4 = "voice actor";
        adjustments.term5 = "game poster";
        adjustments.term6 = "recording session game";
        break;

      default:
        // Use basic live-action defaults
        adjustments.term1 = "production";
        adjustments.term2 = "scene";
        adjustments.term3 = "official";
        adjustments.term4 = "cast";
        adjustments.term5 = "official poster";
        adjustments.term6 = "behind scenes";
        break;
    }

    return adjustments;
  }

  /**
   * Try OpenAI/ChatGPT generation
   */
  async tryOpenAIGeneration(celebrityName, character, title, medium) {
    // Format the data exactly as ChatGPT expects
    const inputData = `* Celebrity Name: ${celebrityName}
* Character Name: ${character}
* Show/Movie Title: ${title}
* Medium Type: ${medium}`;

    console.log(`🤖 ChatGPT generating terms for: ${celebrityName} as ${character}`);

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4", // Use GPT-4 for better search term generation
      messages: [
        { 
          role: "system", 
          content: `You are a Google Images search expert specializing in finding high-quality celebrity photos for autograph sales. Your job is to create 6 precise search terms that find professional production photos showing celebrities PORTRAYING their characters, whether live-action or animated. Focus on in-character photos, costume/makeup shots, and official character artwork.

**IMPORTANT: All input data (Celebrity Name, Character Name, Show/Movie Title, Medium Type) is automatically generated by our AI celebrity role discovery system. You will receive this pre-processed data and need to generate optimized search terms based on it.**

## Output Exactly 6 Search Terms:

**CHARACTER PORTRAYAL (3 terms):**
1. [Celebrity in costume/character makeup]
2. [Character scenes/action shots from show/movie]
3. [Character promotional stills/publicity photos]

**CAST & OFFICIAL MATERIALS (3 terms):**
4. [Cast ensemble in character/costume]
5. [Official movie/show posters featuring the character]
6. [Behind-scenes in costume or voice recording sessions]

## Search Term Rules:

**ALWAYS INCLUDE:**
- Full celebrity name in quotes
- Character name in quotes (CRITICAL - this is key for character portrayal)
- Production title in quotes
- Character-focused terms: "as [character]", "portraying", "costume", "character", "in role of"
- Quality terms: "production still", "promotional photo", "official poster", "publicity still", "scene", "episode"
- Time period for older shows (1960s, 1980s, etc.)
- Network/studio names

**ALWAYS EXCLUDE (use -minus):**
- Merchandise: -funko -toy -figure -doll -collectible -merchandise -statue
- Conventions: -convention -comic-con -autograph -signing -fan -meet
- Low quality: -dvd -cover -fan -art -drawing -reproduction -poster
- Displays: -framed -wall -display -mounted
- Sites: -pinterest -ebay -amazon -etsy

**Medium-Specific Focus:**
- **Live Action**: Add "costume", "makeup", "on set", "filming", "as [character]", "portraying [character]"
- **Animation/Voice Acting**: Add "voice actor as [character]", "character design", "animation still", "[character] voice", "recording as [character]"
- **TV Shows**: Include network name, season/episode references, "TV series"
- **Movies**: Include studio name, release year, "film"

**Respond with ONLY the 6 numbered search terms, no other text.**` 
        },
        { 
          role: "user", 
          content: inputData 
        }
      ],
      temperature: 0.3,
      max_tokens: 600
    });

    const response = completion.choices[0].message.content;
    const parsedTerms = this.parseChatGPTResponse(response);
    
    console.log(`✅ ChatGPT generated ${parsedTerms.length} search terms for ${celebrityName} as ${character}`);
    return parsedTerms;
  }

  /**
   * Try Claude generation as fallback
   */
  async tryClaudeGeneration(celebrityName, character, title, medium) {
    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeApiKey) {
      throw new Error('No Claude API key available for fallback');
    }

    console.log(`🔄 Claude fallback generating terms for: ${celebrityName} as ${character}`);

    const prompt = `Generate 6 Google Images search terms for finding high-quality photos of ${celebrityName} portraying ${character} in ${title}.

Focus on:
- Production stills and promotional photos
- Official movie/show posters
- Behind-the-scenes in costume
- Cast photos in character

For ${medium} content, prioritize ${medium.includes('voice') ? 'character artwork and voice actor credits' : 'live-action production photos'}.

EXCLUDE: -funko -toy -collectible -convention -fan -art -dvd -merchandise

Return exactly 6 numbered search terms.`;

    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.content[0].text;
    const parsedTerms = this.parseChatGPTResponse(content); // Same parsing works for Claude
    
    console.log(`✅ Claude generated ${parsedTerms.length} search terms for ${celebrityName} as ${character}`);
    return parsedTerms;
  }

  /**
   * NEW: Parse ChatGPT response to extract the 6 search terms
   */
  parseChatGPTResponse(response) {
    try {
      const terms = [];
      const lines = response.split('\n');
      
      for (const line of lines) {
        // Look for numbered lines (1., 2., etc.)
        const match = line.match(/^\d+\.\s*(.+)$/);
        if (match) {
          const term = match[1].trim();
          if (term && !term.includes('[') && !term.includes('CHARACTER PORTRAYAL') && !term.includes('CAST & OFFICIAL')) {
            terms.push(term);
          }
        }
      }

      // If parsing failed, try to extract quoted content
      if (terms.length === 0) {
        const quotedTerms = response.match(/"([^"]+)"/g);
        if (quotedTerms) {
          terms.push(...quotedTerms.slice(0, 6).map(term => term.replace(/"/g, '')));
        }
      }

      // Ensure we have exactly 6 terms
      if (terms.length < 6) {
        console.warn(`⚠️ ChatGPT only returned ${terms.length} terms, expected 6`);
      }

      return terms.slice(0, 6); // Return exactly 6 terms max

    } catch (error) {
      console.error('Failed to parse ChatGPT response:', error.message);
      return [];
    }
  }

  /**
   * Extract celebrity name from role data
   */
  extractCelebrityName(role) {
    // Try to get celebrity name from various possible fields
    return role.actor || role.actorName || role.performer || role.celebrity || 'ACTOR_NAME';
  }

  /**
   * Generate basic search terms (fallback) - UNCHANGED
   */
  generateBasicTerms(role) {
    const terms = [];

    // Character + Title combination
    if (role.character && role.title) {
      terms.push(`${role.character} ${role.title}`);
      terms.push(`${role.title} ${role.character}`);
    }

    // Character alone (for well-known characters)
    if (role.character) {
      terms.push(role.character);
    }

    // Title alone (for less character-specific searches)
    if (role.title) {
      terms.push(role.title);
    }

    return terms.filter(term => term.length > 3); // Remove very short terms
  }

  /**
   * Generate medium-specific search terms - UNCHANGED
   */
  generateMediumSpecificTerms(role) {
    const { character, title, medium } = role;
    const terms = [];
    
    // Universal exclusions (removed -poster to allow official movie posters)
    const exclusions = "-funko -pop -action -figure -toy -merchandise -convention -signed -autograph -dvd -case -fan -art -edit -meme";

    switch (medium) {
      case 'live_action_movie':
        terms.push(`"${title}" cast production photo ${exclusions}`);
        terms.push(`"${title}" official movie poster theatrical ${exclusions}`);
        terms.push(`"${character}" "${title}" promotional ${exclusions}`);
        terms.push(`"${title}" original cinema poster high resolution ${exclusions}`);
        break;

      case 'live_action_tv':
        terms.push(`"${title}" main cast promotional photo ${exclusions}`);
        terms.push(`"${title}" official promotional poster ${exclusions}`);
        terms.push(`"${character}" production still ${exclusions}`);
        break;

      case 'voice_anime':
        terms.push(`"${title}" main characters official artwork ${exclusions}`);
        terms.push(`"${title}" official anime poster ${exclusions}`);
        terms.push(`"${character}" "${title}" official anime art ${exclusions}`);
        break;

      case 'voice_cartoon':
        terms.push(`"${title}" main characters official art ${exclusions}`);
        terms.push(`"${title}" official cartoon poster ${exclusions}`);
        terms.push(`"${character}" "${title}" official character ${exclusions}`);
        break;

      case 'voice_game':
        terms.push(`"${title}" main characters official game art ${exclusions}`);
        terms.push(`"${title}" official game poster ${exclusions}`);
        terms.push(`"${character}" "${title}" official character art ${exclusions}`);
        break;

      case 'voice_movie':
        terms.push(`"${title}" animated characters promotional ${exclusions}`);
        terms.push(`"${title}" official animated movie poster ${exclusions}`);
        terms.push(`"${character}" "${title}" official animation art ${exclusions}`);
        break;

      default:
        terms.push(`"${title}" cast promotional photo ${exclusions}`);
        terms.push(`"${title}" official poster ${exclusions}`);
        terms.push(`"${character}" "${title}" official image ${exclusions}`);
        break;
    }

    return terms.filter(Boolean);
  }

  /**
   * Generate fallback terms when ChatGPT fails completely - UNCHANGED
   */
  generateFallbackTerms(roles) {
    return roles.map(role => ({
      ...role,
      searchTerms: {
        chatgpt: [],
        basic: this.generateBasicTerms(role),
        specific: this.generateMediumSpecificTerms(role),
        all: [...this.generateBasicTerms(role), ...this.generateMediumSpecificTerms(role)]
      }
    }));
  }

  /**
   * UPDATED: Get best search terms for a role (AI-PRIORITIZED with fallback)
   */
  getBestSearchTerms(role, maxTerms = 5) {
    if (!role.searchTerms) {
      // If no search terms exist, generate basic ones
      const basic = this.generateBasicTerms(role);
      const specific = this.generateMediumSpecificTerms(role);
      return [...specific, ...basic].slice(0, maxTerms);
    }

    // PRIORITIZE AI TERMS (ChatGPT or Claude), then specific, then basic
    const { ai, chatgpt, specific, basic } = role.searchTerms;
    
    // Use AI terms first (either ChatGPT or Claude), then specific, then basic
    const aiTerms = ai || chatgpt || [];
    const prioritizedTerms = [
      ...aiTerms,                       // AI terms first (character-focused)
      ...(specific || []),              // Medium-specific terms second
      ...(basic || []).slice(0, 1)      // Only 1 basic term as fallback
    ];
    
    // Remove duplicates and return top terms
    const uniqueTerms = [...new Set(prioritizedTerms)];
    return uniqueTerms.slice(0, maxTerms);
  }

  /**
   * Test the search optimizer - UPDATED for ChatGPT template
   */
  async testOptimizer() {
    const testRole = {
      character: "Iron Man",
      title: "Avengers",
      medium: "live_action_movie",
      year: "2012",
      celebrity: "Robert Downey Jr",
      actorName: "Robert Downey Jr"
    };

    try {
      const optimized = await this.optimizeRoleWithChatGPTTemplate(testRole);
      console.log('ChatGPT template optimizer test successful:', optimized.searchTerms);
      return optimized.searchTerms?.chatgpt_template?.length === 6;
    } catch (error) {
      console.error('ChatGPT template optimizer test failed:', error.message);
      return false;
    }
  }
}

module.exports = SearchOptimizer;
