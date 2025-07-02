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

      // FIXED: Remove description field to prevent JSON truncation
      const voiceActorPrompt = `"${celebrityName}" is a voice actor. List their 5 most famous voice acting roles in anime, animation, or video games.

Return as JSON array with EXACT character names as they appear in credits:
[{
  "character": "Exact Character Name", 
  "title": "Show/Movie/Game Title",
  "medium": "voice_anime_tv",
  "year": "YYYY",
  "popularity": "high"
}]

Focus on:
- EXACT character names from official sources
- Most well-known roles first
- Include both English dub and original roles if applicable`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert on voice acting specializing in anime, animation, and video games. Always use exact character names as they appear in official credits."
          },
          {
            role: "user", 
            content: voiceActorPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 600 // Reduced since no descriptions
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
      
      // FIXED: If medium is still "unknown", infer it from title/character
      if (enhanced.medium === 'unknown') {
        enhanced.medium = this.inferMediumFromContext(role);
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
   * SMART: Infer medium from context using AI patterns - no hardcoded titles needed
   */
  inferMediumFromContext(role) {
    const title = (role.title || '').toLowerCase();
    const character = (role.character || '').toLowerCase();
    const year = parseInt(role.year) || 0;
    
    const allText = `${title} ${character}`.toLowerCase();
    
    // PRIORITY 1: Game indicators (most specific)
    const gameKeywords = [
      'game', 'video game', 'gaming', 'nintendo', 'playstation', 'xbox', 
      'pc game', 'mobile game', 'steam', 'epic games', 'console'
    ];
    if (gameKeywords.some(keyword => allText.includes(keyword))) {
      return 'voice_game';
    }
    
    // PRIORITY 2: Animation/Anime indicators
    const animationKeywords = [
      'anime', 'animation', 'animated', 'cartoon', 'studio ghibli',
      'pixar', 'disney', 'dreamworks', 'adult swim', 'nickelodeon',
      'cartoon network', 'voice actor', 'voice acting', 'dub', 'dubbing'
    ];
    if (animationKeywords.some(keyword => allText.includes(keyword))) {
      // Determine if it's movie or TV based on additional context
      const movieAnimationKeywords = ['movie', 'film', 'feature', 'theatrical'];
      if (movieAnimationKeywords.some(keyword => allText.includes(keyword))) {
        return 'voice_anime_movie';
      } else {
        return 'voice_anime_tv';
      }
    }
    
    // PRIORITY 3: Strong TV indicators
    const strongTvKeywords = [
      'series', 'season', 'episode', 'tv show', 'television show',
      'streaming series', 'web series', 'miniseries', 'limited series'
    ];
    if (strongTvKeywords.some(keyword => allText.includes(keyword))) {
      return 'live_action_tv';
    }
    
    // PRIORITY 4: Strong movie indicators  
    const strongMovieKeywords = [
      'movie', 'film', 'cinema', 'theatrical', 'feature film',
      'blockbuster', 'franchise', 'sequel', 'prequel', 'reboot'
    ];
    if (strongMovieKeywords.some(keyword => allText.includes(keyword))) {
      return 'live_action_movie';
    }
    
    // PRIORITY 5: Network/Platform indicators (TV)
    const tvNetworks = [
      'netflix', 'hbo', 'amazon prime', 'disney+', 'hulu', 'showtime',
      'amc', 'fx', 'cbs', 'nbc', 'abc', 'fox', 'cw', 'syfy',
      'usa network', 'tnt', 'tbs', 'comedy central', 'mtv'
    ];
    if (tvNetworks.some(network => allText.includes(network))) {
      return 'live_action_tv';
    }
    
    // PRIORITY 6: Movie franchise/format indicators
    const movieFormatKeywords = [
      'saga', 'trilogy', 'cinematic universe', 'franchise',
      'part', 'chapter', 'volume', 'the', 'returns', 'rises',
      'begins', 'origins', 'forever', 'returns'
    ];
    if (movieFormatKeywords.some(keyword => allText.includes(keyword))) {
      return 'live_action_movie';
    }
    
    // PRIORITY 7: Title structure analysis
    // Movie titles often have "The [Noun]" or single word titles
    // TV shows often have longer, descriptive names
    const titleWords = title.split(' ').filter(word => word.length > 2);
    
    if (titleWords.length === 1) {
      // Single word titles more likely to be movies
      return 'live_action_movie';
    }
    
    if (title.startsWith('the ') && titleWords.length <= 3) {
      // "The [Something]" format often movies
      return 'live_action_movie';
    }
    
    if (titleWords.length >= 4) {
      // Longer titles often TV shows
      return 'live_action_tv';
    }
    
    // PRIORITY 8: Year-based intelligent defaults
    if (year >= 2010) {
      // Modern era: if unclear, lean toward movies (higher production values)
      return 'live_action_movie';
    } else if (year >= 1990) {
      // 90s-2000s: balanced era
      return 'live_action_movie';
    } else if (year >= 1970) {
      // 70s-80s: TV was king
      return 'live_action_tv';
    } else {
      // Pre-1970: likely classic movies
      return 'live_action_movie';
    }
  }

  /**
   * NEW: Enhanced voice acting detection - CONSERVATIVE approach
   */
  detectVoiceActing(role) {
    const character = (role.character || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    const medium = (role.medium || '').toLowerCase();
    
    // CONSERVATIVE: Only mark as voice if we have STRONG indicators
    
    // Direct medium indicators - only if explicitly stated
    if (medium.includes('voice') || medium.includes('dub') || medium.includes('dubbing')) {
      return true;
    }
    
    // Animation/anime indicators - but be careful about live-action adaptations
    if (medium.includes('animation') || medium.includes('animated')) {
      // Make sure it's not live-action with animation elements
      if (!medium.includes('live') && !title.includes('movie')) {
        return true;
      }
    }
    
    // Game voice work
    if (medium.includes('game') || medium.includes('video game')) {
      return true;
    }
    
    // Anime - but ONLY if not a live-action adaptation
    if (medium.includes('anime')) {
      // Check if this might be a live-action adaptation
      if (title.includes('movie') || title.includes('film') || title.includes('live action')) {
        return false; // Live-action adaptation of anime
      }
      return true;
    }
    
    // Title-based detection - VERY CONSERVATIVE
    const voiceKeywords = ['anime series', 'animated series', 'cartoon series', 'voice work'];
    const hasVoiceKeywords = voiceKeywords.some(keyword => 
      title.includes(keyword)
    );
    
    if (hasVoiceKeywords) {
      return true;
    }
    
    // IMPORTANT: Live-action indicators (prioritize these)
    const liveActionKeywords = [
      'movie', 'film', 'tv series', 'television series', 'saga', 'trilogy',
      'live action', 'live-action', 'theatrical', 'cinema', 'netflix series',
      'hbo', 'broadcast', 'streaming series'
    ];
    
    const hasLiveActionKeywords = liveActionKeywords.some(keyword => 
      title.includes(keyword) || medium.includes(keyword)
    );
    
    // If has live action indicators, it's NOT voice acting
    if (hasLiveActionKeywords) {
      return false;
    }
    
    // CONSERVATIVE DEFAULT: If unclear, assume live action for known actors
    // Most performers are primarily live action unless explicitly voice actors
    return false;
  }

  /**
   * NEW: Correct medium type for voice acting - ONLY when actually voice acting
   */
  correctVoiceMedium(currentMedium, role) {
    const title = (role.title || '').toLowerCase();
    
    // IMPORTANT: Don't change medium unless we're certain it's voice acting
    
    // If already properly tagged, keep it
    if (currentMedium.includes('voice')) {
      return currentMedium;
    }
    
    // Only correct if we have STRONG voice indicators
    if (title.includes('anime series') || title.includes('animated series')) {
      return 'voice_anime_tv';
    }
    
    if (title.includes('animated movie') || title.includes('anime movie')) {
      return 'voice_anime_movie';
    }
    
    if (title.includes('game') || title.includes('video game')) {
      return 'voice_game';
    }
    
    if (title.includes('cartoon')) {
      return 'voice_cartoon';
    }
    
    // CONSERVATIVE: If unsure, don't change the medium
    // Let it stay as live_action if that's what was originally detected
    return currentMedium;
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
            content: "You are an expert entertainment industry analyst specializing in celebrity career analysis. Always use exact character names as they appear in official credits and sources."
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
