const OpenAI = require('openai');

class SimpleRoleVerifier {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // INTEGRATED: Refined safety net of major multi-actor roles
    this.definiteMultiActorRoles = [
      // Iconic Superheroes (Multiple Live-Action Actors)
      { char: ['batman', 'bruce wayne'], shows: ['batman'], reason: '8+ live-action actors (Keaton, Bale, Affleck, Pattinson, etc.)' },
      { char: ['superman', 'clark kent'], shows: ['superman'], reason: '6+ live-action actors (Reeve, Routh, Cavill, etc.)' },
      { char: ['spider-man', 'spiderman', 'peter parker'], shows: ['spider'], reason: '3+ live-action actors (Maguire, Garfield, Holland)' },
      { char: ['joker'], shows: ['batman', 'joker'], reason: '10+ actors (Nicholson, Ledger, Phoenix, etc.)' },
      
      // Long-Running TV Characters (Cast Changes)
      { char: ['doctor', 'the doctor'], shows: ['doctor who'], reason: '15+ actors across 60+ years' },
      { char: ['james bond', 'bond', '007'], shows: ['bond', '007', 'james bond'], reason: '6+ actors (Connery, Moore, Brosnan, Craig, etc.)' },
      
      // Classic Literature Characters (Multiple Adaptations)
      { char: ['sherlock holmes', 'sherlock'], shows: ['sherlock'], reason: '20+ actors across films/TV (Cumberbatch, RDJ, Brett, Rathbone, etc.)' },
      { char: ['dracula'], shows: ['dracula'], reason: '15+ actors across horror films' },
      { char: ['tarzan'], shows: ['tarzan'], reason: '12+ actors across films/TV' },
      { char: ['robin hood'], shows: ['robin hood'], reason: '10+ actors across adaptations' },
      { char: ['hamlet'], shows: ['hamlet'], reason: '50+ actors across stage/film adaptations' },
      
      // Franchise Characters (Reboots/Continuations)
      { char: ['luke skywalker'], shows: ['star wars'], reason: 'Multiple actors (Hamill, voice actors, etc.)' },
      { char: ['han solo'], shows: ['star wars'], reason: 'Multiple actors (Ford, Ehrenreich)' },
      { char: ['jack ryan'], shows: ['jack ryan'], reason: '4+ actors (Baldwin, Ford, Affleck, Krasinski)' },
      
      // Animated Characters (Multiple Voice Actors)
      { char: ['mickey mouse'], shows: ['disney', 'mickey'], reason: '5+ voice actors over decades' },
      { char: ['bugs bunny'], shows: ['looney tunes', 'bugs bunny'], reason: '8+ voice actors' },
      { char: ['scooby doo', 'scooby-doo'], shows: ['scooby'], reason: '6+ voice actors' },
      { char: ['mario'], shows: ['mario', 'nintendo'], reason: '5+ voice actors across games/films' },
      { char: ['sonic'], shows: ['sonic'], reason: 'Multiple voice actors across games/shows/films' },
      
      // Horror/Monster Characters
      { char: ['frankenstein', 'frankenstein monster'], shows: ['frankenstein'], reason: '20+ actors across horror films' },
      { char: ['dracula'], shows: ['dracula'], reason: '15+ actors across Universal/modern films' },
      { char: ['mummy'], shows: ['mummy'], reason: '8+ actors across Universal/modern films' },
      { char: ['king kong'], shows: ['king kong'], reason: 'Multiple motion-capture and voice actors' },
      
      // Universal Icons
      { char: ['santa claus', 'santa'], shows: ['christmas', 'santa'], reason: 'Countless actors across films/TV' },
      { char: ['jesus christ', 'jesus'], shows: ['jesus', 'christ', 'passion'], reason: '50+ actors in religious films' }
    ];
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
      }
    } catch (error) {
      console.log('⚠️ OpenAI not available for role verification');
    }
  }

  /**
   * ENHANCED: Role verification with confidence scoring and better accuracy
   */
  async verifyRoles(celebrityName, discoveredRoles) {
    console.log(`🔍 Verifying ${discoveredRoles.length} roles for ${celebrityName}...`);
    
    const verifiedRoles = [];
    const rejectedRoles = [];
    let verificationCost = 0;
    
    for (const role of discoveredRoles) {
      const verification = await this.verifyRoleWithConfidence(celebrityName, role);
      verificationCost += 0.0002;
      
      if (verification.isValid) {
        verifiedRoles.push({
          ...role,
          verificationConfidence: verification.confidence,
          verificationReason: verification.reason
        });
        console.log(`✅ ${verification.confidence}: ${role.character} in ${role.title} - ${verification.reason}`);
      } else {
        rejectedRoles.push({
          ...role,
          rejectionReason: verification.reason,
          confidence: verification.confidence
        });
        console.log(`❌ ${verification.confidence}: ${role.character} in ${role.title} - ${verification.reason}`);
      }
    }
    
    console.log(`💰 Verification cost: $${verificationCost.toFixed(4)}`);
    console.log(`🎭 ${verifiedRoles.length}/${discoveredRoles.length} roles verified as real`);
    
    if (rejectedRoles.length > 0) {
      console.log(`💡 Rejected roles might need manual verification:`, 
        rejectedRoles.filter(r => r.confidence === 'UNCERTAIN').map(r => `${r.character} in ${r.title}`)
      );
    }
    
    return verifiedRoles;
  }

  /**
   * CORRECTED: Role verification with better accuracy and less false negatives
   */
  async verifyRoleWithConfidence(celebrityName, role) {
    if (!this.hasOpenAI) {
      return { 
        isValid: true, 
        confidence: 'UNKNOWN', 
        reason: 'No AI verification available' 
      };
    }

    try {
      const prompt = this.buildCorrectedVerificationPrompt(celebrityName, role);

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.05,
        max_tokens: 100
      });

      const response = completion.choices[0].message.content.trim();
      return this.parseVerificationResponse(response);
      
    } catch (error) {
      console.log(`⚠️ Role verification failed: ${error.message}`);
      return { 
        isValid: true, 
        confidence: 'ERROR', 
        reason: 'Verification failed, allowing role' 
      };
    }
  }

  /**
   * CORRECTED: Build verification prompt with better examples and less false negatives
   */
  buildCorrectedVerificationPrompt(celebrityName, role) {
    return `Verify if "${celebrityName}" played the character "${role.character}" in "${role.title}".

IMPORTANT VERIFICATION GUIDELINES:
- Character names may be nicknames, shortened versions, or first names only
- Include ALL roles: main, supporting, cameo, guest appearances
- Include voice acting in animation, anime, video games
- Include early career and lesser-known work
- Be CAUTIOUS about rejecting - only reject if you're absolutely certain it's wrong

CONFIDENCE LEVELS:
- HIGH: Definitely correct or definitely wrong (only for very well-known cases)
- MEDIUM: Likely correct based on available information
- LOW: Uncertain, limited information available
- UNCERTAIN: Cannot verify either way

RESPOND FORMAT: CONFIDENCE|YES/NO|BRIEF_REASON

CRITICAL: Only use HIGH confidence for definitive cases. For lesser-known roles, use MEDIUM or LOW but lean toward YES unless absolutely certain it's wrong.

VERIFY: Did "${celebrityName}" play "${role.character}" in "${role.title}"?

Answer:`;
  }

  /**
   * CORRECTED: Parse verification response with bias toward accepting roles
   */
  parseVerificationResponse(response) {
    const parts = response.split('|');
    
    if (parts.length >= 3) {
      const confidence = parts[0].trim().toUpperCase();
      const decision = parts[1].trim().toUpperCase();
      const reason = parts[2].trim();
      
      // CORRECTED: Be more lenient - only reject HIGH confidence NOs
      const isValid = decision.includes('YES') || 
                     confidence === 'LOW' ||
                     confidence === 'MEDIUM' ||
                     confidence === 'UNCERTAIN' ||
                     (confidence === 'HIGH' && !decision.includes('NO'));
      
      return {
        isValid,
        confidence,
        reason: reason || 'No reason provided'
      };
    }
    
    // Fallback parsing for malformed responses
    const upperResponse = response.toUpperCase();
    
    // Only reject if explicitly HIGH confidence NO
    if (upperResponse.includes('HIGH') && upperResponse.includes('NO') && 
        (upperResponse.includes('DEFINITELY') || upperResponse.includes('NEVER'))) {
      return { isValid: false, confidence: 'HIGH', reason: 'High confidence rejection' };
    }
    
    // Default to allowing role - be conservative about rejecting
    return { 
      isValid: true, 
      confidence: 'UNCERTAIN', 
      reason: 'Could not parse verification, allowing role' 
    };
  }

  /**
   * UNIVERSAL: AI-powered search strategy with integrated multi-actor detection
   */
  async getSearchStrategy(celebrityName, role) {
    const character = (role.character || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    
    // Use integrated multi-actor detection
    const isMultiActor = await this.isMultiActorCharacter(character, title);
    
    if (isMultiActor) {
      console.log(`🎭 Multi-actor strategy for ${character} in ${title}`);
      return {
        searchTerms: [
          `"${celebrityName}" "${role.title}"`,        // Actor + Show (most specific)
          `"${celebrityName}" "${role.character}"`,    // Actor + Character  
          `"${celebrityName}" as "${role.character}"`, // Actor as Character
          `"${celebrityName}" ${role.title}`,          // Actor + Show (less strict)
        ],
        maxImages: 15, // Fewer images for multi-actor (need higher precision)
        reason: `Multi-actor character detected - searching for ${celebrityName}'s version only`
      };
    }
    
    // Standard approach for single-actor characters
    return {
      searchTerms: [
        `"${role.character}" "${role.title}"`,     // Character + Show
        `"${celebrityName}" "${role.character}"`,  // Actor + Character
        `"${celebrityName}" "${role.title}"`,      // Actor + Show
        `${role.character} ${role.title}`,         // Character + Show (less strict)
      ],
      maxImages: 20,
      reason: 'Single-actor character - standard search'
    };
  }

  /**
   * UNIVERSAL: Multi-actor detection with refined safety net + AI
   */
  async isMultiActorCharacter(character, title) {
    // Step 1: Check refined safety net first
    const safetyNetResult = this.checkSafetyNet(character, title);
    if (safetyNetResult.isMultiActor) {
      console.log(`🎭 SAFETY NET: ${character} in ${title} - ${safetyNetResult.reason}`);
      return true;
    }
    
    // Step 2: AI detection for everything else
    if (this.hasOpenAI) {
      try {
        const aiResult = await this.aiDetectMultiActor(character, title);
        if (aiResult !== null) {
          if (aiResult) {
            console.log(`🤖 AI DETECTED: ${character} in ${title} - Multi-actor character`);
          } else {
            console.log(`🤖 AI CONFIRMED: ${character} in ${title} - Single-actor character`);
          }
          return aiResult;
        }
      } catch (error) {
        console.log(`⚠️ AI detection failed for ${character}: ${error.message}`);
      }
    }
    
    // Step 3: Safe fallback
    console.log(`🔄 FALLBACK: Assuming ${character} in ${title} is single-actor`);
    return false;
  }

  /**
   * Check refined safety net of major multi-actor roles
   */
  checkSafetyNet(character, title) {
    for (const role of this.definiteMultiActorRoles) {
      // Check if character name matches
      const characterMatches = role.char.some(charVariant => 
        character.includes(charVariant) || charVariant.includes(character)
      );
      
      // Check if show/title matches
      const titleMatches = role.shows.some(showVariant => 
        title.includes(showVariant) || showVariant.includes(title)
      );
      
      if (characterMatches && titleMatches) {
        return {
          isMultiActor: true,
          reason: role.reason
        };
      }
    }
    
    return { isMultiActor: false };
  }

  /**
   * AI-powered multi-actor detection for unknown cases
   */
  async aiDetectMultiActor(characterName, showTitle) {
    if (!this.hasOpenAI) return null;

    try {
      const prompt = `Has the character "${characterName}" from "${showTitle}" been played by multiple different actors across different movies, TV shows, reboots, adaptations, or voice acting roles?

Consider ALL scenarios:
- Different actors in reboots/remakes (like Spider-Man: Maguire, Garfield, Holland)
- Recasting across film/TV series (like James Bond across decades)
- Different adaptations (book-to-film, animated-to-live-action)
- Voice actors vs live-action actors for same character
- Long-running series with cast changes
- Anthology series with different actors per episode/season
- International versions (different actors in different countries)
- Age-based recasting (child vs adult versions)

Examples:
- Sherlock Holmes = YES (Cumberbatch, RDJ, Brett, Rathbone, etc.)
- Dracula = YES (Lugosi, Lee, Oldman, etc.)
- Tony Stark/Iron Man (MCU only) = NO (only RDJ in MCU specifically)
- Walter White (Breaking Bad) = NO (only Bryan Cranston)

Be thorough - consider ALL adaptations and versions across ALL media.

Answer with just "YES" if multiple actors have played this character across any adaptations, or "NO" if typically one actor is associated with this specific version.

Answer:`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 10
      });

      const response = completion.choices[0].message.content.trim().toUpperCase();
      return response.includes('YES');
      
    } catch (error) {
      console.log(`⚠️ AI multi-actor detection failed: ${error.message}`);
      return null;
    }
  }

  /**
   * NEW: Batch verification for efficiency
   */
  async batchVerifyRoles(celebrityName, roles, batchSize = 5) {
    console.log(`🔍 Batch verifying ${roles.length} roles for ${celebrityName}...`);
    
    const verifiedRoles = [];
    let totalCost = 0;
    
    // Process in batches to avoid rate limits
    for (let i = 0; i < roles.length; i += batchSize) {
      const batch = roles.slice(i, i + batchSize);
      
      const batchPromises = batch.map(role => 
        this.verifyRoleWithConfidence(celebrityName, role)
      );
      
      const batchResults = await Promise.all(batchPromises);
      totalCost += batchResults.length * 0.0002;
      
      // Process batch results
      batchResults.forEach((verification, index) => {
        const role = batch[index];
        if (verification.isValid) {
          verifiedRoles.push({
            ...role,
            verificationConfidence: verification.confidence,
            verificationReason: verification.reason
          });
          console.log(`✅ ${verification.confidence}: ${role.character} in ${role.title}`);
        } else {
          console.log(`❌ ${verification.confidence}: ${role.character} in ${role.title} - ${verification.reason}`);
        }
      });
      
      // Brief pause between batches
      if (i + batchSize < roles.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`💰 Total verification cost: $${totalCost.toFixed(4)}`);
    console.log(`🎭 ${verifiedRoles.length}/${roles.length} roles verified`);
    
    return verifiedRoles;
  }

  /**
   * NEW: Get verification statistics
   */
  getVerificationStats(verifiedRoles) {
    const stats = {
      total: verifiedRoles.length,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      uncertain: 0
    };
    
    verifiedRoles.forEach(role => {
      const confidence = role.verificationConfidence || 'UNKNOWN';
      switch (confidence) {
        case 'HIGH': stats.highConfidence++; break;
        case 'MEDIUM': stats.mediumConfidence++; break;
        case 'LOW': stats.lowConfidence++; break;
        default: stats.uncertain++; break;
      }
    });
    
    return stats;
  }

  /**
   * NEW: Get multi-actor detection statistics
   */
  getMultiActorStats() {
    return {
      safetyNetEntries: this.definiteMultiActorRoles.length,
      hasAI: this.hasOpenAI,
      categories: {
        superheroes: this.definiteMultiActorRoles.filter(r => 
          r.char.some(c => ['batman', 'superman', 'spider'].some(hero => c.includes(hero)))
        ).length,
        classicLiterature: this.definiteMultiActorRoles.filter(r => 
          r.char.some(c => ['sherlock', 'dracula', 'tarzan'].some(lit => c.includes(lit)))
        ).length,
        franchiseCharacters: this.definiteMultiActorRoles.filter(r => 
          r.reason.includes('franchise') || r.reason.includes('series')
        ).length,
        animatedCharacters: this.definiteMultiActorRoles.filter(r => 
          r.char.some(c => ['mickey', 'bugs', 'mario'].some(anim => c.includes(anim)))
        ).length
      }
    };
  }
}

module.exports = SimpleRoleVerifier;
