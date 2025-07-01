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
        console.log('✅ OpenAI initialized as primary AI engine');
      } else {
        console.log('ℹ️ OpenAI not configured, Claude API will be primary');
      }
    } catch (error) {
      console.log('⚠️ OpenAI initialization failed, using Claude API only');
      this.hasOpenAI = false;
    }
  }

  /**
   * ENHANCED: Voice actor optimized role discovery
   */
  async fetchRoles(celebrityName) {
    try {
      console.log(`🎯 AI discovering top roles for: ${celebrityName}`);
      
      // ENHANCED: Try voice actor specific discovery first
      let roles = await this.performVoiceActorDiscovery(celebrityName);
      
      if (!roles || roles.length < 3) {
        // Stage 1: Primary AI discovery (OpenAI → Claude → Anthropic)
        const primaryRoles = await this.performPrimaryDiscovery(celebrityName);
        roles = this.mergeRoles(roles, primaryRoles);
      }
      
      if (!roles || roles.length < 3) {
        // Stage 2: Enhanced discovery with context analysis
        const enhancedRoles = await this.performEnhancedDiscovery(celebrityName);
        roles = this.mergeRoles(roles, enhancedRoles);
      }

      if (!roles || roles.length < 3) {
        // Stage 3: Broad search with alternative prompting
        const broadRoles = await this.performBroadDiscovery(celebrityName);
        roles = this.mergeRoles(roles, broadRoles);
      }

      // Stage 4: Enhanced voice role detection and medium fixing
      const processedRoles = this.enhanceVoiceRoleDetection(roles);
      
      // Stage 5: Popularity optimization and ranking
      const optimizedRoles = await this.optimizeByPopularity(processedRoles, celebrityName);
      
      console.log(`✅ AI discovered ${optimizedRoles.length} popularity-ranked roles for ${celebrityName}`);
      return optimizedRoles;

    } catch (error) {
      console.error(`❌ AI role discovery failed for ${celebrityName}:`, error.message);
      return this.createMinimalFallback(celebrityName);
    }
  }

  /**
   * NEW: Voice actor specific discovery - CONDITIONAL approach
   */
  async performVoiceActorDiscovery(celebrityName) {
    if (!this.hasOpenAI) return null;

    try {
      // First, quickly check if they might be a voice actor
      const checkPrompt = `Is "${celebrityName}" primarily known for voice acting in anime, animation, or video games? Answer with just "YES" or "NO".`;
      
      const checkCompletion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: checkPrompt }],
        temperature: 0.1,
        max_tokens: 10
      });

      const isVoiceActor = checkCompletion.choices[0].message.content.trim().toUpperCase().includes('YES');
      
      if (!isVoiceActor) {
        console.log(`📺 ${celebrityName} identified as primarily live-action performer`);
        return null; // Skip voice-specific discovery
      }

      console.log(`🎭 ${celebrityName} identified as voice actor, using specialized discovery`);

      const voiceActorPrompt = `"${celebrityName}" is a voice actor. List their 5 most famous voice acting roles in anime, animation, or video games.

For each role, provide:
- Character name
- Show/movie/game title
- Medium type (anime, animation, video game, etc.)
- Year if known

Return as JSON array:
[{
  "character": "Character Name",
  "title": "Show/Movie/Game Title", 
  "medium": "voice_anime_tv",
  "year": "YYYY",
  "popularity": "high/medium/low"
}]`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert on voice acting specializing in anime, animation, and video games."
          },
          {
            role: "user", 
            content: voiceActorPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 800
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
   * NEW: Merge role arrays without duplicates
   */
  mergeRoles(existingRoles, newRoles) {
    if (!existingRoles) existingRoles = [];
    if (!newRoles || !Array.isArray(newRoles)) return existingRoles;
    
    const seen = new Set();
    const merged = [];
    
    // Add existing roles first
    existingRoles.forEach(role => {
      const key = `${role.character}_${role.title}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(role);
      }
    });
    
    // Add new roles if not duplicates
    newRoles.forEach(role => {
      const key = `${role.character}_${role.title}`.toLowerCase();
      if (!seen.has(key) && merged.length < 8) { // Allow up to 8 total
        seen.add(key);
        merged.push(role);
      }
    });
    
    return merged;
  }

  /**
   * ENHANCED: Voice role detection and medium correction
   */
  enhanceVoiceRoleDetection(roles) {
    if (!roles || !Array.isArray(roles)) return [];

    return roles.map(role => {
      const enhanced = { ...role };
      
      // Detect voice acting from various indicators
      const isVoiceRole = this.detectVoiceActing(role);
      enhanced.isVoiceRole = isVoiceRole;
      
      // Fix medium if it's voice acting but not properly tagged
      if (isVoiceRole && !enhanced.medium.includes('voice')) {
        enhanced.medium = this.correctVoiceMedium(enhanced.medium, role);
      }
      
      // Add voice-specific tags
      if (isVoiceRole) {
        enhanced.tags = enhanced.tags || [];
        enhanced.tags.push('voice_acting');
        
        if (enhanced.medium.includes('anime')) {
          enhanced.tags.push('anime');
        }
      }
      
      return enhanced;
    });
  }

  /**
   * NEW: Enhanced voice acting detection - GENERIC approach
   */
  detectVoiceActing(role) {
    const character = (role.character || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    const medium = (role.medium || '').toLowerCase();
    const description = (role.description || '').toLowerCase();
    
    // Direct medium indicators
    if (medium.includes('voice') || medium.includes('anime') || 
        medium.includes('animation') || medium.includes('game') ||
        medium.includes('animated') || medium.includes('cartoon')) {
      return true;
    }
    
    // Content indicators - generic patterns
    const voiceKeywords = [
      'anime', 'animated', 'animation', 'cartoon', 'character voice',
      'dub', 'dubbing', 'voice actor', 'voice work', 'video game',
      'game', 'character', 'animated series', 'animated movie'
    ];
    
    const hasVoiceKeywords = voiceKeywords.some(keyword => 
      title.includes(keyword) || description.includes(keyword)
    );
    
    if (hasVoiceKeywords) {
      return true;
    }
    
    // Generic live-action indicators (if present, likely NOT voice acting)
    const liveActionKeywords = [
      'movie', 'film', 'tv series', 'television', 'sitcom', 'drama',
      'thriller', 'comedy series', 'netflix', 'hbo', 'broadcast'
    ];
    
    const hasLiveActionKeywords = liveActionKeywords.some(keyword => 
      title.includes(keyword) || description.includes(keyword)
    );
    
    // If has live action indicators but no voice indicators, probably live action
    if (hasLiveActionKeywords && !hasVoiceKeywords) {
      return false;
    }
    
    // Default: if medium is unknown, use heuristics
    if (medium === 'unknown' || !medium) {
      // If it has character + title pattern with no clear live action indicators
      return !hasLiveActionKeywords;
    }
    
    return false;
  }

  /**
   * NEW: Correct medium type for voice acting
   */
  correctVoiceMedium(currentMedium, role) {
    const title = (role.title || '').toLowerCase();
    
    // If already properly tagged, keep it
    if (currentMedium.includes('voice')) {
      return currentMedium;
    }
    
    // Determine correct voice medium
    if (title.includes('movie') || currentMedium.includes('movie')) {
      return 'voice_anime_movie';
    }
    
    if (title.includes('game') || currentMedium.includes('game')) {
      return 'voice_game';
    }
    
    // Default to anime TV series
    return 'voice_anime_tv';
  }

  /**
   * Stage 1: Primary AI discovery using best available model
   */
  async performPrimaryDiscovery(celebrityName) {
    // Try OpenAI first (most reliable for pop culture)
    if (this.hasOpenAI) {
      const result = await this.queryOpenAI(celebrityName, PROMPTS.FETCH_ROLES(celebrityName));
      if (result?.length > 0) return result;
    }

    // Fallback to Claude API
    const claudeResult = await this.queryClaudeAPI(celebrityName);
    if (claudeResult?.length > 0) return claudeResult;

    // Fallback to Anthropic API (you via API)
    const anthropicResult = await this.queryAnthropicAPI(celebrityName);
    return anthropicResult;
  }

  /**
   * Stage 2: Enhanced discovery with performer type detection
   */
  async performEnhancedDiscovery(celebrityName) {
    try {
      // First detect what type of performer they are
      const performerType = await this.detectPerformerType(celebrityName);
      
      // Use specialized prompt based on performer type
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
   * Stage 3: Broad discovery with multiple search strategies
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
   * CORE: OpenAI query with optimized parameters
   */
  async queryOpenAI(celebrityName, prompt) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o", // Latest model for best results
        messages: [
          {
            role: "system",
            content: "You are an expert entertainment industry analyst specializing in celebrity career analysis, with deep knowledge of anime, voice acting, and animation."
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        temperature: PROMPT_CONFIG.TEMPERATURE.ROLE_FETCHING,
        max_tokens: PROMPT_CONFIG.MAX_TOKENS.ROLE_FETCHING,
        top_p: 0.9, // Focus on high-probability tokens
        frequency_penalty: 0.3 // Reduce repetition
      });

      const response = completion.choices[0].message.content;
      return this.parseAndValidateResponse(response, celebrityName);
      
    } catch (error) {
      console.log(`OpenAI query failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Claude API query (fallback) - Fixed for correct API format
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
        const errorText = await response.text();
        console.log(`Claude API error details:`, errorText);
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`✅ Claude API response received`);
      
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
   * Anthropic API query (you as fallback)
   */
  async queryAnthropicAPI(celebrityName) {
    // This would be a direct API call to you (Claude) if available
    // For now, return null to indicate this method isn't implemented
    return null;
  }

  /**
   * OPTIMIZATION: Detect performer type for specialized prompting
   */
  async detectPerformerType(celebrityName) {
    try {
      const prompt = PROMPTS.DETECT_PERFORMER_TYPE(celebrityName);
      
      let response = null;
      if (this.hasOpenAI) {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 50
        });
        response = completion.choices[0].message.content.trim();
      }
      
      return response || 'mixed_performer';
    } catch (error) {
      return 'mixed_performer'; // Safe default
    }
  }

  /**
   * Build specialized prompts based on performer type
   */
  buildSpecializedPrompt(celebrityName, performerType) {
    const basePrompt = PROMPTS.FETCH_ROLES(celebrityName);
    
    const specializations = {
      'live_action_primary': `Focus heavily on live-action movie and TV roles. Include only their most iconic film and television performances.`,
      'voice_actor_anime': `Focus on anime voice acting roles, including both English dub and Japanese original roles if applicable. Prioritize popular anime series.`,
      'voice_actor_western': `Focus on western animation, cartoons, and animated movies. Include video game voice work if significant.`,
      'mixed_performer': `Balance between live-action and voice acting roles. Show their range across different mediums.`
    };
    
    const specialization = specializations[performerType] || specializations['mixed_performer'];
    
    return basePrompt + `\n\nSPECIAL FOCUS: ${specialization}`;
  }

  /**
   * Alternative prompt strategies for difficult cases
   */
  buildAlternativePrompt(celebrityName) {
    return `What are the 5 most famous and recognizable roles that "${celebrityName}" is known for? Include any medium: movies, TV shows, voice acting, etc. Focus on roles that the general public would recognize.

    Return as JSON: [{"character":"name", "title":"show/movie", "medium":"type", "year":"YYYY", "popularity":"high/medium/low"}]`;
  }

  buildSimplifiedPrompt(celebrityName) {
    return `List "${celebrityName}"'s top 5 most popular roles. Format: [{"character":"X", "title":"Y", "medium":"Z"}]`;
  }

  buildFallbackPrompt(celebrityName) {
    return `"${celebrityName}" is most famous for playing which characters? Give me 3-5 of their biggest roles in any format.`;
  }

  /**
   * OPTIMIZATION: Popularity-based ranking and enhancement
   */
  async optimizeByPopularity(roles, celebrityName) {
    if (!roles || roles.length === 0) return [];

    try {
      // Enhance roles with popularity scoring
      const enhancedRoles = await this.enhanceWithPopularityScoring(roles, celebrityName);
      
      // Sort by popularity and iconicness
      const sortedRoles = this.sortByPopularity(enhancedRoles);
      
      // Ensure we have exactly 5 top roles
      return sortedRoles.slice(0, 5);
      
    } catch (error) {
      console.log(`Popularity optimization failed: ${error.message}`);
      return roles.slice(0, 5); // Return top 5 without optimization
    }
  }

  /**
   * Enhance roles with AI-driven popularity scoring
   */
  async enhanceWithPopularityScoring(roles, celebrityName) {
    if (!this.hasOpenAI) return roles; // Skip if no AI available

    try {
      const scoringPrompt = `Rate these roles for "${celebrityName}" by popularity/recognition (1-10 scale):
      
${roles.map((role, i) => `${i+1}. ${role.character} in ${role.title}`).join('\n')}

Return JSON: [{"index": 1, "popularityScore": 8, "reasoning": "brief reason"}, ...]`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: scoringPrompt }],
        temperature: 0.2,
        max_tokens: 500
      });

      const scores = JSON.parse(completion.choices[0].message.content);
      
      // Apply scores to roles
      return roles.map((role, index) => {
        const scoreData = scores.find(s => s.index === index + 1);
        return {
          ...role,
          popularityScore: scoreData?.popularityScore || 5,
          popularityReasoning: scoreData?.reasoning || 'No specific analysis'
        };
      });
      
    } catch (error) {
      console.log(`Popularity scoring failed: ${error.message}`);
      return roles;
    }
  }

  /**
   * Sort roles by multiple popularity factors
   */
  sortByPopularity(roles) {
    return roles.sort((a, b) => {
      // Primary sort: popularity score (if available)
      if (a.popularityScore && b.popularityScore) {
        if (a.popularityScore !== b.popularityScore) {
          return b.popularityScore - a.popularityScore;
        }
      }
      
      // Secondary sort: popularity field
      const popularityOrder = { 'high': 3, 'medium': 2, 'low': 1, 'unknown': 0 };
      const aVal = popularityOrder[a.popularity] || 0;
      const bVal = popularityOrder[b.popularity] || 0;
      
      if (aVal !== bVal) return bVal - aVal;
      
      // Tertiary sort: more recent years
      const aYear = parseInt(a.year) || 0;
      const bYear = parseInt(b.year) || 0;
      
      return bYear - aYear;
    });
  }

  /**
   * ADVANCED: Parse and validate AI responses with error recovery
   */
  parseAndValidateResponse(response, celebrityName) {
    try {
      // Multiple parsing strategies
      let parsed = this.tryJSONParsing(response) || 
                   this.tryRegexParsing(response) || 
                   this.tryFallbackParsing(response, celebrityName);
      
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('No valid roles extracted from AI response');
      }

      // Validate and clean each role
      const validRoles = parsed
        .filter(role => role.character && role.title)
        .map(role => this.normalizeRole(role))
        .slice(0, 8); // Allow up to 8 for merging

      return validRoles;
      
    } catch (error) {
      console.error(`Response parsing failed for ${celebrityName}: ${error.message}`);
      return null;
    }
  }

  tryJSONParsing(response) {
    try {
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) { /* Silent fail, try next method */ }
    return null;
  }

  tryRegexParsing(response) {
    // Extract structured data using regex patterns
    // This is a fallback for when JSON parsing fails
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

  tryFallbackParsing(response, celebrityName) {
    // Last resort: create minimal structure from any text
    return [{
      character: 'AI Discovery Failed',
      title: 'Manual Research Required',
      medium: 'unknown',
      year: 'unknown',
      description: `AI could not parse roles for ${celebrityName}. Raw response available.`,
      popularity: 'unknown',
      rawResponse: response.substring(0, 200) // Include snippet for debugging
    }];
  }

  normalizeRole(role) {
    return {
      character: (role.character || '').trim(),
      title: (role.title || '').trim(),
      medium: role.medium || 'unknown',
      year: role.year || 'unknown',
      description: role.description || '',
      popularity: role.popularity || 'medium',
      searchTerm: `${role.character} ${role.title}`.trim()
    };
  }

  /**
   * Minimal fallback when all AI methods fail
   */
  createMinimalFallback(celebrityName) {
    return [{
      character: 'Research Required',
      title: `${celebrityName} Roles`,
      medium: 'unknown',
      year: 'unknown',
      description: `All AI discovery methods failed for ${celebrityName}`,
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
    return true; // Always true for fallback modes
  }

  getSystemStatus() {
    return {
      openaiAPI: this.hasOpenAI,
      claudeAPI: !!process.env.ANTHROPIC_API_KEY,
      primaryEngine: this.hasOpenAI ? 'OpenAI GPT-4o' : 'Claude API',
      optimizationLevel: 'Advanced + Voice Actor Enhanced',
      popularityRanking: this.hasOpenAI,
      multiStageDiscovery: true,
      voiceActorSupport: true
    };
  }
}

module.exports = AIRoleFetcher;
