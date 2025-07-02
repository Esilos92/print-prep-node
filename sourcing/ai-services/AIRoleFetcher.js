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
   * MAIN: Fetch top 5 character roles optimized for image searching
   */
  async fetchRoles(celebrityName) {
    try {
      console.log(`🎯 AI discovering top roles for: ${celebrityName}`);
      
      // Try voice actor detection first
      let roles = await this.performVoiceActorDiscovery(celebrityName);
      
      if (!roles || roles.length < 3) {
        // Primary discovery using main prompt
        const primaryRoles = await this.performPrimaryDiscovery(celebrityName);
        roles = this.mergeRoles(roles, primaryRoles);
      }
      
      if (!roles || roles.length < 3) {
        // Enhanced discovery with specialized prompts
        const enhancedRoles = await this.performEnhancedDiscovery(celebrityName);
        roles = this.mergeRoles(roles, enhancedRoles);
      }

      if (!roles || roles.length < 3) {
        // Broad discovery with fallback strategies
        const broadRoles = await this.performBroadDiscovery(celebrityName);
        roles = this.mergeRoles(roles, broadRoles);
      }

      // Process and optimize roles
      const processedRoles = this.enhanceRoleData(roles);
      const optimizedRoles = await this.optimizeByPopularity(processedRoles, celebrityName);
      
      console.log(`✅ AI discovered ${optimizedRoles.length} roles for ${celebrityName}`);
      return optimizedRoles;

    } catch (error) {
      console.error(`❌ AI role discovery failed for ${celebrityName}:`, error.message);
      return this.createMinimalFallback(celebrityName);
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
        model: "gpt-4o",
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

      const voiceActorPrompt = `List the 5 most famous voice acting roles for "${celebrityName}" in anime, animation, or video games.

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
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert on voice acting. Always use exact character names from official credits."
          },
          {
            role: "user", 
            content: voiceActorPrompt
          }
        ],
        temperature: 0.2,
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
   * Broad discovery with multiple strategies
   */
  async performBroadDiscovery(celebrityName) {
    const strategies = [
      this.buildAlternativePrompt(celebrityName),
      this.buildSimplifiedPrompt(celebrityName),
      this.buildFallbackPrompt(celebrityName)
    ];

    for (const prompt of strategies) {
      try {
        let result = null;
        
        if (this.hasOpenAI) {
          result = await this.queryOpenAI(celebrityName, prompt);
        } else {
          result = await this.queryClaudeAPI(celebrityName, prompt);
        }
        
        if (result?.length > 0) return result;
      } catch (error) {
        console.log(`Strategy failed, trying next: ${error.message}`);
      }
    }
    
    return null;
  }

  /**
   * OpenAI query with error handling
   */
  async queryOpenAI(celebrityName, prompt) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: PROMPT_CONFIG.MODELS.PRIMARY,
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
        temperature: PROMPT_CONFIG.TEMPERATURE.ROLE_FETCHING,
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
        temperature: PROMPT_CONFIG.TEMPERATURE.ROLE_FETCHING,
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
          model: "gpt-4o",
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
   * Alternative prompt strategies
   */
  buildAlternativePrompt(celebrityName) {
    return `List 5 most recognizable character roles for "${celebrityName}" with exact character names.

Format: [{"character":"Name", "title":"Show/Movie", "medium":"type", "year":"YYYY", "popularity":"high"}]`;
  }

  buildSimplifiedPrompt(celebrityName) {
    return `"${celebrityName}" top 5 character roles. JSON format: [{"character":"X", "title":"Y", "medium":"Z", "year":"YYYY"}]`;
  }

  buildFallbackPrompt(celebrityName) {
    return `What are 3-5 main character roles "${celebrityName}" is known for? Include exact character names.`;
  }

  /**
   * Enhance role data with better medium detection
   */
  enhanceRoleData(roles) {
    if (!roles || !Array.isArray(roles)) return [];

    return roles.map(role => {
      const enhanced = { ...role };
      
      // Fix medium classification
      enhanced.medium = this.correctMediumType(role);
      
      // Detect voice acting
      enhanced.isVoiceRole = this.isVoiceActing(enhanced.medium);
      
      // Add metadata for image searching
      enhanced.searchTerm = `${role.character} ${role.title}`.trim();
      
      return enhanced;
    });
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
   * Popularity-based ranking
   */
  async optimizeByPopularity(roles, celebrityName) {
    if (!roles || roles.length === 0) return [];

    try {
      if (this.hasOpenAI) {
        const enhancedRoles = await this.enhanceWithPopularityScoring(roles, celebrityName);
        return this.sortByPopularity(enhancedRoles).slice(0, 5);
      }
      
      return this.sortByPopularity(roles).slice(0, 5);
      
    } catch (error) {
      console.log(`Popularity optimization failed: ${error.message}`);
      return roles.slice(0, 5);
    }
  }

  /**
   * AI-driven popularity scoring
   */
  async enhanceWithPopularityScoring(roles, celebrityName) {
    try {
      const scoringPrompt = `Rate these roles for "${celebrityName}" by recognition/popularity (1-10):
      
${roles.map((role, i) => `${i+1}. ${role.character} in ${role.title}`).join('\n')}

Return JSON: [{"index": 1, "popularityScore": 8}, {"index": 2, "popularityScore": 6}, ...]`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: scoringPrompt }],
        temperature: 0.2,
        max_tokens: 300
      });

      const response = completion.choices[0].message.content;
      const scores = this.parseJSONResponse(response);
      
      if (Array.isArray(scores)) {
        return roles.map((role, index) => {
          const scoreData = scores.find(s => s.index === index + 1);
          return {
            ...role,
            popularityScore: scoreData?.popularityScore || 5
          };
        });
      }
      
      return roles;
      
    } catch (error) {
      console.log(`Popularity scoring failed: ${error.message}`);
      return roles;
    }
  }

  /**
   * Sort roles by popularity factors
   */
  sortByPopularity(roles) {
    return roles.sort((a, b) => {
      // Primary: popularity score
      if (a.popularityScore && b.popularityScore) {
        return b.popularityScore - a.popularityScore;
      }
      
      // Secondary: popularity field
      const popularityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      const aVal = popularityOrder[a.popularity] || 0;
      const bVal = popularityOrder[b.popularity] || 0;
      
      if (aVal !== bVal) return bVal - aVal;
      
      // Tertiary: recent years
      const aYear = parseInt(a.year) || 0;
      const bYear = parseInt(b.year) || 0;
      
      return bYear - aYear;
    });
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
      searchTerm: `${role.character} ${role.title}`.trim()
    };
  }

  /**
   * Minimal fallback when all methods fail
   */
  createMinimalFallback(celebrityName) {
    return [{
      character: 'Research Required',
      title: `${celebrityName} Roles`,
      medium: 'unknown',
      year: 'unknown',
      popularity: 'unknown'
    }];
  }

  /**
   * System diagnostics
   */
  async testConnection() {
    if (this.hasOpenAI) {
      try {
        await this.openai.chat.completions.create({
          model: "gpt-4o",
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
      primaryEngine: this.hasOpenAI ? 'OpenAI GPT-4o' : 'Claude API',
      optimizationLevel: 'Enhanced for Image Discovery',
      multiStageDiscovery: true,
      voiceActorSupport: true
    };
  }
}

module.exports = AIRoleFetcher;
