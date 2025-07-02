const OpenAI = require('openai');

class SimpleRoleVerifier {
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
      verificationCost += 0.0002; // Slightly higher cost for enhanced prompt
      
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
   * ENHANCED: Role verification with confidence scoring
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
      const prompt = this.buildEnhancedVerificationPrompt(celebrityName, role);

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 50
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
   * Build enhanced verification prompt with context and examples
   */
  buildEnhancedVerificationPrompt(celebrityName, role) {
    return `Verify if "${celebrityName}" played the character "${role.character}" in "${role.title}".

IMPORTANT CONSIDERATIONS:
- Character names might be nicknames, shortened versions, or alternate names
- Include voice acting roles in anime, animation, or video games
- Include guest appearances, cameos, or minor roles
- Include roles from smaller productions or independent films
- Consider different time periods (early career, recent work)

CONFIDENCE LEVELS:
- HIGH: Definitely played this role (famous/well-documented)
- MEDIUM: Likely played this role (supporting evidence)
- LOW: Uncertain but possible (limited information)
- FAKE: Definitely did not play this role

FORMAT: CONFIDENCE|YES/NO|BRIEF_REASON

EXAMPLES:
- HIGH|YES|Main character in popular series
- MEDIUM|YES|Supporting role in independent film
- LOW|YES|Minor character, limited documentation
- HIGH|NO|Never appeared in this production

VERIFY: Did "${celebrityName}" play "${role.character}" in "${role.title}"?

Answer:`;
  }

  /**
   * Parse the AI verification response
   */
  parseVerificationResponse(response) {
    const parts = response.split('|');
    
    if (parts.length >= 3) {
      const confidence = parts[0].trim().toUpperCase();
      const decision = parts[1].trim().toUpperCase();
      const reason = parts[2].trim();
      
      // Only reject if HIGH confidence NO or clear FAKE
      const isValid = decision.includes('YES') || 
                     (confidence === 'LOW' && !decision.includes('NO')) ||
                     confidence === 'UNCERTAIN';
      
      return {
        isValid,
        confidence,
        reason: reason || 'No reason provided'
      };
    }
    
    // Fallback parsing for malformed responses
    const upperResponse = response.toUpperCase();
    if (upperResponse.includes('HIGH') && upperResponse.includes('NO')) {
      return { isValid: false, confidence: 'HIGH', reason: 'High confidence rejection' };
    }
    
    // Default to allowing role if uncertain
    return { 
      isValid: true, 
      confidence: 'UNCERTAIN', 
      reason: 'Could not parse verification response' 
    };
  }

  /**
   * ENHANCED: AI-powered search strategy with multi-actor detection
   */
  async getSearchStrategy(celebrityName, role) {
    const character = (role.character || '').toLowerCase();
    const title = (role.title || '').toLowerCase();
    
    // Check if this is a multi-actor character
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
   * ENHANCED: Multi-actor detection with better examples and logic
   */
  async isMultiActorCharacter(character, title) {
    if (!this.hasOpenAI) {
      return false; // Safe fallback
    }

    try {
      const prompt = `Has the character "${character}" from "${title}" been played by multiple different actors across different movies, TV shows, reboots, or adaptations?

Consider these scenarios:
- Different actors in reboots/remakes (Batman, Spider-Man, etc.)
- Recasting across film/TV series (James Bond, Doctor Who)
- Different versions (animated vs live-action, different studios)
- Franchise characters across multiple films
- Long-running series with cast changes

Answer with just YES or NO.

EXAMPLES:
- The Doctor (Doctor Who) = YES (14+ actors across decades)
- James Bond = YES (6+ actors: Connery, Moore, Brosnan, Craig, etc.)
- Batman = YES (Keaton, Bale, Affleck, Pattinson, etc.)
- Spider-Man = YES (Maguire, Garfield, Holland + animated versions)
- Iron Man/Tony Stark (MCU) = NO (only Robert Downey Jr in MCU)
- Tyrion Lannister (Game of Thrones) = NO (only Peter Dinklage)
- Walter White (Breaking Bad) = NO (only Bryan Cranston)
- Elsa (Frozen) = NO (only Idina Menzel for main version)

Character: "${character}" from "${title}"
Answer:`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 5
      });

      const response = completion.choices[0].message.content.trim().toUpperCase();
      const isMulti = response.includes('YES');
      
      if (isMulti) {
        console.log(`🎭 Multi-actor character detected: ${character} in ${title}`);
      }
      
      return isMulti;
      
    } catch (error) {
      console.log(`⚠️ Multi-actor detection failed: ${error.message}`);
      return false; // Safe fallback
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
}

module.exports = SimpleRoleVerifier;
