const OpenAI = require('openai');
const { PROMPTS, PROMPT_CONFIG } = require('../config/prompts.js');

class AIRoleFetcher {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI initialized for role discovery');
      } else {
        console.log('ℹ️ OpenAI not configured, using fallback methods');
      }
    } catch (error) {
      console.log('⚠️ OpenAI initialization failed, using fallback methods');
      this.hasOpenAI = false;
    }
  }

  /**
   * ENHANCED: Universal role discovery for any celebrity level
   */
  async fetchRoles(celebrityName) {
    try {
      console.log(`🎯 Universal discovery for: ${celebrityName}`);
      
      // Single comprehensive AI call for cost efficiency
      const roles = await this.performUniversalDiscovery(celebrityName);
      
      if (!roles || roles.length < 2) {
        console.log(`⚠️ Primary discovery found ${roles?.length || 0} roles, trying broad search...`);
        const broadRoles = await this.performBroadDiscovery(celebrityName);
        return this.mergeRoles(roles, broadRoles);
      }

      // Process and optimize roles without extra AI calls
      const processedRoles = this.enhanceRoleData(roles);
      const optimizedRoles = this.optimizeByContentType(processedRoles);
      
      console.log(`✅ Universal discovery complete: ${optimizedRoles.length} roles for ${celebrityName}`);
      return optimizedRoles;

    } catch (error) {
      console.error(`❌ Universal discovery failed for ${celebrityName}:`, error.message);
      return this.createSmartFallback(celebrityName);
    }
  }

  /**
   * ENHANCED: Single AI call for universal discovery (cost-efficient)
   */
  async performUniversalDiscovery(celebrityName) {
    if (!this.hasOpenAI) return null;

    try {
      const universalPrompt = `You are an entertainment expert. For "${celebrityName}", find their TOP 5 most popular/recognizable NAMED CHARACTER ROLES from any level of fame.

DISCOVERY STRATEGY:
1. If mainstream celebrity: Focus on their most iconic roles
2. If emerging/breakout star: Focus heavily on their breakthrough performance + any supporting roles
3. If niche/indie actor: Find their most notable work even if small-scale
4. If voice actor: Focus on character roles people know them for
5. If viral-to-actor: Focus ONLY on their acting roles, ignore viral content

SEARCH APPROACH:
- Check recent breakout roles and trending performances
- Include indie films, streaming shows, and animation that gained popularity
- For voice actors: Focus on character images, not actor photos
- Look for roles that audiences actually discuss or remember

INCLUDE:
- Named character roles (priority)
- Breakout/trending performances
- Popular indie/streaming content
- Voice acting characters (for anime/animation)
- Recent notable work gaining attention

AVOID:
- Hosting/presenting roles
- Background/extra work
- Social media content (focus on acting only)
- Unreleased or unknown projects

MEDIUM CLASSIFICATION:
- live_action_tv: TV series/streaming shows
- live_action_movie: Films (any budget level)
- voice_anime_tv: Anime TV series
- voice_anime_movie: Anime films
- voice_cartoon: Western animation
- voice_game: Video game characters

Format as JSON array with EXACT character names:
[
  {
    "character": "Exact Character Name",
    "title": "Show/Movie Title", 
    "medium": "live_action_tv",
    "year": "YYYY",
    "popularity": "high/medium/low",
    "note": "breakout role" or "trending" or "popular indie" (if applicable)
  }
]

Focus on what "${celebrityName}" is actually KNOWN for, regardless of fame level. Include recent work if they're a rising star.`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Use mini to save costs
        messages: [
          {
            role: "system",
            content: "You are an expert entertainment analyst. Focus on roles that people actually know the celebrity for, regardless of their fame level. Always use exact character names from official sources. For voice actors, prioritize character images over actor photos."
          },
          {
            role: "user", 
            content: universalPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 800
      });

      const response = completion.choices[0].message.content;
      return this.parseAndValidateResponse(response, celebrityName);
      
    } catch (error) {
      console.log(`Universal discovery failed: ${error.message}`);
      return null;
    }
  }

  /**
   * ENHANCED: Broad discovery for difficult cases
   */
  async performBroadDiscovery(celebrityName) {
    if (!this.hasOpenAI) return null;

    try {
      const broadPrompt = `Find ANY notable acting work for "${celebrityName}" - include small roles, indie films, streaming content, voice work, or recent performances.

Even if they're not famous, they likely have:
- Student films that got attention
- Indie/festival films
- Streaming show appearances
- Voice acting work
- Recent breakout roles
- Web series with following
- Generic roles like "Narrator", "Host", "Announcer"

Return what you can find, even if limited:
[{"character": "Character or Role", "title": "Project Title", "medium": "type", "year": "YYYY", "popularity": "low"}]`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Cost-efficient
        messages: [
          {
            role: "system",
            content: "You are researching lesser-known performers. Find any acting work, no matter how small or indie."
          },
          {
            role: "user", 
            content: broadPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 400
      });

      const response = completion.choices[0].message.content;
      return this.parseAndValidateResponse(response, celebrityName);
      
    } catch (error) {
      console.log(`Broad discovery failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Voice actor specific discovery
   */
  async performVoiceActorDiscovery(celebrityName) {
    if (!this.hasOpenAI) return null;

    try {
      // Quick check if they're primarily a voice actor
      const checkPrompt = `Is "${celebrityName}" primarily known for voice acting in anime, animation, or video games? Answer YES or NO.`;
      
      const checkCompletion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: checkPrompt }],
        temperature: 0.1,
        max_tokens: 10
      });

      const isVoiceActor = checkCompletion.choices[0].message.content.trim().toUpperCase().includes('YES');
      
      if (!isVoiceActor) {
        console.log(`📺 ${celebrityName} identified as primarily live-action performer`);
        return null;
      }

      console.log(`🎭 ${celebrityName} identified as voice actor, using specialized discovery`);

      const voiceActorPrompt = `List the 5 most recognizable voice acting performances by "${celebrityName}" in anime, animation, or video games.

Focus on CHARACTER IMAGES for search purposes - people know the characters, not the voice actor's face.

Use exact character names from official sources.

Return as JSON array:
[{
  "character": "Exact Character Name", 
  "title": "Show/Movie/Game Title",
  "medium": "voice_anime_tv",
  "year": "YYYY",
  "popularity": "high"
}]`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert on voice acting. Always use exact character names from official credits. Remember - for voice actors, people recognize characters, not the actor's face."
          },
          {
            role: "user", 
            content: voiceActorPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 600
      });

      const response = completion.choices[0].message.content;
      const roles = this.parseAndValidateResponse(response, celebrityName);
      
      if (roles && roles.length > 0) {
        console.log(`🎭 Found ${roles.length} voice acting roles for ${celebrityName}`);
        return roles;
      }
      
      return null;
      
    } catch (error) {
      console.log(`Voice actor discovery failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Primary discovery using main prompt
   */
  async performPrimaryDiscovery(celebrityName) {
    if (this.hasOpenAI) {
      const result = await this.queryOpenAI(celebrityName, PROMPTS.FETCH_ROLES(celebrityName));
      if (result?.length > 0) return result;
    }

    // Fallback to Claude API
    const claudeResult = await this.queryClaudeAPI(celebrityName);
    return claudeResult;
  }

  /**
   * Enhanced discovery with performer type detection
   */
  async performEnhancedDiscovery(celebrityName) {
    try {
      const performerType = await this.detectPerformerType(celebrityName);
      const specializedPrompt = this.buildSpecializedPrompt(celebrityName, performerType);
      
      if (this.hasOpenAI) {
        return await this.queryOpenAI(celebrityName, specializedPrompt);
      }
      
      return await this.queryClaudeAPI(celebrityName, specializedPrompt);
    } catch (error) {
      console.log(`⚠️ Enhanced discovery failed: ${error.message}`);
      return null;
    }
  }

  /**
   * OpenAI query with error handling
   */
  async queryOpenAI(celebrityName, prompt) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Cost-efficient
        messages: [
          {
            role: "system",
            content: "You are an expert entertainment analyst. Always use exact character names from official sources. Focus on roles with good visual representation for image searching."
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: PROMPT_CONFIG.MAX_TOKENS.ROLE_FETCHING
      });

      const response = completion.choices[0].message.content;
      return this.parseAndValidateResponse(response, celebrityName);
      
    } catch (error) {
      console.log(`OpenAI query failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Claude API query (fallback)
   */
  async queryClaudeAPI(celebrityName, customPrompt = null) {
    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeApiKey) return null;

    try {
      const prompt = customPrompt || PROMPTS.FETCH_ROLES(celebrityName);
      
      const requestBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: PROMPT_CONFIG.MAX_TOKENS.ROLE_FETCHING,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      };

      console.log(`🔍 Making Claude API request for ${celebrityName}...`);
      
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
      
      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error('Invalid response format from Claude API');
      }
      
      const content = data.content[0].text;
      return this.parseAndValidateResponse(content, celebrityName);
      
    } catch (error) {
      console.log(`Claude API query failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect performer type for specialized prompts
   */
  async detectPerformerType(celebrityName) {
    try {
      const prompt = PROMPTS.DETECT_PERFORMER_TYPE(celebrityName);
      
      if (this.hasOpenAI) {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 50
        });
        return completion.choices[0].message.content.trim();
      }
      
      return 'mixed_performer';
    } catch (error) {
      return 'mixed_performer';
    }
  }

  /**
   * Build specialized prompts based on performer type
   */
  buildSpecializedPrompt(celebrityName, performerType) {
    const basePrompt = PROMPTS.FETCH_ROLES(celebrityName);
    
    const specializations = {
      'live_action_primary': `Focus on live-action movie and TV roles with strong visual presence.`,
      'voice_actor_anime': `Focus on anime voice acting roles with distinctive character designs.`,
      'voice_actor_western': `Focus on western animation and cartoon voice work.`,
      'voice_actor_games': `Focus on video game character voice work.`,
      'mixed_performer': `Include both live-action and voice acting roles.`
    };
    
    const specialization = specializations[performerType] || specializations['mixed_performer'];
    return basePrompt + `\n\nSPECIAL FOCUS: ${specialization}`;
  }

  /**
   * Enhanced role data processing
   */
  enhanceRoleData(roles) {
    if (!roles || !Array.isArray(roles)) return [];

    return roles.map(role => {
      const enhanced = { ...role };
      
      // Fix medium classification
      enhanced.medium = this.correctMediumType(role);
      
      // Detect voice acting
      enhanced.isVoiceRole = this.isVoiceActing(enhanced.medium);
      
      // Add search strategy hints
      enhanced.searchStrategy = this.determineSearchStrategy(enhanced);
      
      // Add metadata for image searching
      enhanced.searchTerm = `${role.character} ${role.title}`.trim();
      
      return enhanced;
    });
  }

  /**
   * ENHANCED: Determine search strategy based on role type
   */
  determineSearchStrategy(role) {
    const medium = (role.medium || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    const year = parseInt(role.year) || 0;
    
    // Voice/Animation roles - pure character focus
    if (medium.includes('voice') || medium.includes('anime') || 
        medium.includes('animation') || medium.includes('cartoon')) {
      return 'character_images_only';
    }
    
    // Recent/trending content - character + context
    if (role.note?.includes('breakout') || role.note?.includes('trending') || year >= 2020) {
      return 'character_with_context';
    }
    
    // Indie/small productions - broader search needed
    if (role.note?.includes('indie') || role.popularity === 'low') {
      return 'broad_search';
    }
    
    // Standard approach for established content
    return 'character_first';
  }

  /**
   * Correct medium type based on content analysis
   */
  correctMediumType(role) {
    const title = (role.title || '').toLowerCase();
    const medium = (role.medium || '').toLowerCase();
    
    // If already correctly specified, keep it
    if (medium.includes('live_action_tv') || medium.includes('live_action_movie') || 
        medium.includes('voice_anime') || medium.includes('voice_cartoon') || 
        medium.includes('voice_game')) {
      return role.medium;
    }
    
    // Voice/Animation indicators
    if (medium.includes('voice') || medium.includes('anime') || medium.includes('animation')) {
      if (title.includes('movie') || title.includes('film')) {
        return 'voice_anime_movie';
      } else if (title.includes('game')) {
        return 'voice_game';
      } else {
        return 'voice_anime_tv';
      }
    }
    
    // Live action classification
    const tvIndicators = ['series', 'show', 'season', 'episode'];
    const movieIndicators = ['movie', 'film', 'cinema'];
    
    const isTv = tvIndicators.some(indicator => title.includes(indicator));
    const isMovie = movieIndicators.some(indicator => title.includes(indicator));
    
    if (isTv) return 'live_action_tv';
    if (isMovie) return 'live_action_movie';
    
    // Default classification by year (newer content more likely to be movies)
    const year = parseInt(role.year) || 0;
    return year >= 2000 ? 'live_action_movie' : 'live_action_tv';
  }

  /**
   * Check if role is voice acting
   */
  isVoiceActing(medium) {
    return medium && (medium.includes('voice') || medium.includes('anime') || medium.includes('animation'));
  }

  /**
   * ENHANCED: Content-type based optimization (no AI cost)
   */
  optimizeByContentType(roles) {
    if (!roles || roles.length === 0) return [];

    // Group by content type for better search strategies
    const grouped = {
      voice_roles: roles.filter(r => r.isVoiceRole),
      recent_roles: roles.filter(r => parseInt(r.year) >= 2020),
      breakout_roles: roles.filter(r => r.note?.includes('breakout')),
      established_roles: roles.filter(r => r.popularity === 'high')
    };

    // Priority order: breakout > recent > established > voice
    const prioritized = [
      ...grouped.breakout_roles,
      ...grouped.recent_roles.filter(r => !grouped.breakout_roles.includes(r)),
      ...grouped.established_roles.filter(r => !grouped.recent_roles.includes(r) && !grouped.breakout_roles.includes(r)),
      ...grouped.voice_roles.filter(r => !grouped.established_roles.includes(r) && !grouped.recent_roles.includes(r) && !grouped.breakout_roles.includes(r)),
      ...roles.filter(r => !Object.values(grouped).some(group => group.includes(r)))
    ];

    return prioritized.slice(0, 5);
  }

  /**
   * Merge role arrays without duplicates
   */
  mergeRoles(existingRoles, newRoles) {
    if (!existingRoles) existingRoles = [];
    if (!newRoles || !Array.isArray(newRoles)) return existingRoles;
    
    const seen = new Set();
    const merged = [];
    
    existingRoles.forEach(role => {
      const key = `${role.character}_${role.title}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(role);
      }
    });
    
    newRoles.forEach(role => {
      const key = `${role.character}_${role.title}`.toLowerCase();
      if (!seen.has(key) && merged.length < 8) {
        seen.add(key);
        merged.push(role);
      }
    });
    
    return merged;
  }

  /**
   * Parse and validate JSON responses
   */
  parseAndValidateResponse(response, celebrityName) {
    try {
      let parsed = this.parseJSONResponse(response);
      
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        parsed = this.tryRegexParsing(response);
      }
      
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('No valid roles extracted from AI response');
      }

      const validRoles = parsed
        .filter(role => role.character && role.title)
        .map(role => this.normalizeRole(role))
        .slice(0, 8);

      return validRoles;
      
    } catch (error) {
      console.error(`Response parsing failed for ${celebrityName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Robust JSON parsing
   */
  parseJSONResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      try {
        // Extract from markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          return JSON.parse(jsonMatch[1]);
        }
        
        // Extract array pattern
        const arrayMatch = response.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          return JSON.parse(arrayMatch[0]);
        }
        
        throw new Error('No valid JSON found');
      } catch (parseError) {
        console.log(`JSON parsing failed: ${response.substring(0, 200)}...`);
        return null;
      }
    }
  }

  /**
   * Regex-based parsing fallback
   */
  tryRegexParsing(response) {
    try {
      const rolePattern = /"character":\s*"([^"]+)"[\s\S]*?"title":\s*"([^"]+)"/g;
      const roles = [];
      let match;
      
      while ((match = rolePattern.exec(response)) !== null && roles.length < 8) {
        roles.push({
          character: match[1],
          title: match[2],
          medium: 'unknown',
          year: 'unknown',
          popularity: 'medium'
        });
      }
      
      return roles.length > 0 ? roles : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Normalize role data
   */
  normalizeRole(role) {
    return {
      character: (role.character || '').trim(),
      title: (role.title || '').trim(),
      medium: role.medium || 'live_action_movie',
      year: role.year || 'unknown',
      popularity: role.popularity || 'medium',
      note: role.note || '',
      searchTerm: `${role.character} ${role.title}`.trim()
    };
  }

  /**
   * ENHANCED: Smart fallback for difficult cases
   */
  createSmartFallback(celebrityName) {
    // Create multiple fallback strategies
    return [
      {
        character: `${celebrityName} Character`,
        title: `${celebrityName} Acting Work`,
        medium: 'unknown',
        year: 'unknown',
        popularity: 'unknown',
        searchStrategy: 'actor_headshots',
        note: 'fallback_search'
      },
      {
        character: 'Recent Role',
        title: `${celebrityName} Recent Work`,
        medium: 'unknown',
        year: '2023',
        popularity: 'unknown',
        searchStrategy: 'promotional_photos',
        note: 'fallback_search'
      }
    ];
  }

  /**
   * System diagnostics
   */
  async testConnection() {
    if (this.hasOpenAI) {
      try {
        await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Test" }],
          max_tokens: 5
        });
        return true;
      } catch (e) {
        return false;
      }
    }
    return true;
  }

  getSystemStatus() {
    return {
      openaiAPI: this.hasOpenAI,
      claudeAPI: !!process.env.ANTHROPIC_API_KEY,
      primaryEngine: this.hasOpenAI ? 'OpenAI GPT-4o-mini' : 'Claude API',
      optimizationLevel: 'Universal Discovery - All Fame Levels',
      costOptimized: true,
      universalSupport: true,
      voiceActorSupport: true
    };
  }
}

module.exports = AIRoleFetcher;
