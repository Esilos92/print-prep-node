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
   * SIMPLE: Just verify roles are real, let AI Vision handle the rest
   */
  async verifyRoles(celebrityName, discoveredRoles) {
    console.log(`🔍 Verifying ${discoveredRoles.length} roles for ${celebrityName}...`);
    
    const verifiedRoles = [];
    let verificationCost = 0;
    
    for (const role of discoveredRoles) {
      const isReal = await this.isRoleReal(celebrityName, role);
      verificationCost += 0.0001; // GPT-4o-mini cost
      
      if (isReal) {
        verifiedRoles.push(role);
        console.log(`✅ REAL: ${role.character} in ${role.title}`);
      } else {
        console.log(`❌ FAKE: ${role.character} in ${role.title} - SKIPPING`);
      }
    }
    
    console.log(`💰 Verification cost: $${verificationCost.toFixed(4)}`);
    console.log(`🎭 ${verifiedRoles.length}/${discoveredRoles.length} roles verified as real`);
    
    return verifiedRoles;
  }

  /**
   * SIMPLE: Just ask AI if the role is real
   */
  async isRoleReal(celebrityName, role) {
    if (!this.hasOpenAI) {
      return true; // If no AI, assume real (fail open)
    }

    try {
      const prompt = `Did "${celebrityName}" actually play "${role.character}" in "${role.title}"?

Answer with just YES or NO.

Examples:
- Did Jodie Whittaker play The Doctor in Doctor Who? YES
- Did Jodie Whittaker play Beth Latimer in Broadchurch? YES  
- Did Jodie Whittaker play Viv Nicholson in The National? NO
- Did Robert Downey Jr play Tony Stark in Iron Man? YES
- Did Robert Downey Jr play Batman in The Dark Knight? NO

Answer:`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Cheap model
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 5
      });

      const response = completion.choices[0].message.content.trim().toUpperCase();
      return response.includes('YES');
      
    } catch (error) {
      console.log(`⚠️ Role verification failed: ${error.message}`);
      return true; // Fail open - don't block on errors
    }
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
      return {
        searchTerms: [
          `"${celebrityName}" "${role.title}"`,        // Actor + Show (most important)
          `"${celebrityName}" "${role.character}"`,    // Actor + Character
          `"${celebrityName}" as "${role.character}"`, // Actor as Character
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
        `"${celebrityName}" "${role.title}"`       // Actor + Show
      ],
      maxImages: 20,
      reason: 'Single-actor character - standard search'
    };
  }

  /**
   * SIMPLE: AI determines if character has been played by multiple actors
   */
  async isMultiActorCharacter(character, title) {
    if (!this.hasOpenAI) {
      return false; // Safe fallback
    }

    try {
      const prompt = `Has the character "${character}" from "${title}" been played by multiple different actors in different movies, TV shows, or reboots?

Consider:
- Different actors in reboots/remakes  
- Recasting across film series
- Different versions (TV vs movies)

Answer with just YES or NO.

Examples:
- The Doctor (Doctor Who) = YES (14+ actors)
- James Bond = YES (6+ actors)
- Batman = YES (8+ actors) 
- Spider-Man = YES (3+ actors)
- Tony Stark/Iron Man (MCU) = NO (only RDJ)
- Tyrion Lannister (Game of Thrones) = NO (only Peter Dinklage)

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
}

module.exports = SimpleRoleVerifier;
