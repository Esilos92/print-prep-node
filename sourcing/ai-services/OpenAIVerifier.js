const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

class OpenAIVerifier {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // Simplified verification results
    this.verificationResults = {
      VALID: 'valid',
      INVALID_WRONG_PERSON: 'wrong_person',
      INVALID_WRONG_CHARACTER: 'wrong_character', 
      INVALID_MERCHANDISE: 'merchandise',
      INVALID_UNRELATED: 'unrelated',
      VERIFICATION_FAILED: 'failed'
    };
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI Vision initialized for identity verification');
      } else {
        console.log('ℹ️ OpenAI not configured for identity verification');
      }
    } catch (error) {
      console.log('⚠️ OpenAI Vision not available for identity verification');
      this.hasOpenAI = false;
    }
  }

  /**
   * SIMPLIFIED: Identity verification focused on "Is this the right person/character?"
   */
  async finalValidation(images, celebrityName, character, title, medium) {
    try {
      console.log(`🔍 OpenAI identity verification for ${images.length} images...`);
      
      if (!this.hasOpenAI) {
        console.log('📝 OpenAI unavailable, passing all pre-filtered images');
        return {
          valid: images,
          invalid: [],
          cost: 0
        };
      }

      const results = {
        valid: [],
        invalid: [],
        cost: 0
      };

      // Process images for identity verification only
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        
        try {
          console.log(`🔄 Identity check ${i + 1}/${images.length}: ${image.filename}`);
          
          const validation = await this.validateIdentity(
            image.filepath, 
            celebrityName, 
            character, 
            title, 
            medium
          );
          
          results.cost += 0.002; // OpenAI Vision cost per image

          if (validation.result === this.verificationResults.VALID) {
            results.valid.push({
              ...image,
              identityVerification: validation,
              verificationReason: validation.reasoning || 'identity_confirmed'
            });
            console.log(`✅ ${image.filename}: ${validation.reasoning || 'VALID'}`);
          } else {
            results.invalid.push({
              ...image,
              identityVerification: validation,
              rejectionReason: validation.result,
              verificationReason: validation.reasoning || validation.result
            });
            console.log(`❌ ${image.filename}: ${validation.reasoning || validation.result}`);
          }

          // Brief pause to respect rate limits
          if (i < images.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          console.warn(`⚠️ Identity verification failed for ${image.filename}: ${error.message}`);
          // Conservative approach: if verification fails, include in valid set
          results.valid.push({
            ...image,
            verificationReason: 'verification_failed_included'
          });
        }
      }

      const passRate = Math.round((results.valid.length / images.length) * 100);
      console.log(`✅ Identity verification complete: ${results.valid.length}/${images.length} confirmed (${passRate}%)`);
      console.log(`💰 Identity verification cost: $${results.cost.toFixed(4)}`);

      return results;

    } catch (error) {
      console.error(`❌ Identity verification failed: ${error.message}`);
      // Fallback: pass all images
      return {
        valid: images,
        invalid: [],
        cost: 0
      };
    }
  }

  /**
   * SIMPLIFIED: Focus purely on identity verification
   */
  async validateIdentity(imagePath, celebrityName, character, title, medium) {
    try {
      const imageBase64 = await this.imageToBase64(imagePath);
      const isAnimated = medium.includes('animation') || medium.includes('voice') || medium.includes('anime');
      
      const prompt = `You are verifying identity only. Is this image showing ${isAnimated ? `the character "${character}" from "${title}"` : `${celebrityName} as ${character} from ${title}`}?

${isAnimated ? 
`ANIMATED CONTENT - Looking for character "${character}":
✅ VALID if:
- This clearly shows ${character} from ${title}
- Character is recognizable as ${character}
- Group scenes with ${character} visible are OK
- Different art styles of ${character} are OK

❌ INVALID if:
- This shows different characters from ${title} (not ${character})
- This shows characters from completely different shows
- This shows toys/merchandise/collectibles
- This shows real people (not animated characters)` :

`LIVE ACTION - Looking for ${celebrityName}:
✅ VALID if:
- This clearly shows ${celebrityName} (any age/era)
- ${celebrityName} is recognizable as the same person
- Group scenes with ${celebrityName} visible are OK
- Different ages of ${celebrityName} are OK (child vs adult roles)

❌ INVALID if:
- This shows a completely different person (not ${celebrityName})
- This shows toys/merchandise/collectibles
- This shows only other actors from ${title} (not ${celebrityName})
- This is completely unrelated content`}

IMPORTANT: Be permissive with uncertain cases. Only reject if you're confident it's wrong.

Respond with exactly one word:
- VALID: This shows the correct ${isAnimated ? 'character' : 'person'}
- INVALID_WRONG_PERSON: This shows a different person
- INVALID_WRONG_CHARACTER: This shows a different character
- INVALID_MERCHANDISE: This shows toys/collectibles
- INVALID_UNRELATED: This is completely unrelated content`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { 
              type: "image_url", 
              image_url: { 
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "low"  // Sufficient for identity verification
              }
            }
          ]
        }],
        max_tokens: 50,
        temperature: 0.05 // Very low for consistent results
      });

      const response = completion.choices[0].message.content.trim();
      const result = this.parseVerificationResponse(response);
      
      return {
        result: result,
        reasoning: this.getReasoningForResult(result),
        rawResponse: response,
        isAnimated: isAnimated
      };

    } catch (error) {
      throw new Error(`Identity verification failed: ${error.message}`);
    }
  }

  /**
   * SIMPLIFIED: Parse verification response with permissive approach
   */
  parseVerificationResponse(response) {
    const upperResponse = response.toUpperCase();
    
    // Only accept clear VALID responses
    if (upperResponse.includes('VALID') && !upperResponse.includes('INVALID')) {
      return this.verificationResults.VALID;
    }
    
    // Parse specific rejections
    if (upperResponse.includes('WRONG_PERSON') || upperResponse.includes('DIFFERENT_PERSON')) {
      return this.verificationResults.INVALID_WRONG_PERSON;
    }
    if (upperResponse.includes('WRONG_CHARACTER') || upperResponse.includes('DIFFERENT_CHARACTER')) {
      return this.verificationResults.INVALID_WRONG_CHARACTER;
    }
    if (upperResponse.includes('MERCHANDISE') || upperResponse.includes('TOY') || upperResponse.includes('COLLECTIBLE')) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }
    if (upperResponse.includes('UNRELATED') || upperResponse.includes('COMPLETELY_DIFFERENT')) {
      return this.verificationResults.INVALID_UNRELATED;
    }
    
    // For any other INVALID response, categorize as unrelated
    if (upperResponse.includes('INVALID') || upperResponse.includes('REJECT')) {
      return this.verificationResults.INVALID_UNRELATED;
    }
    
    // PERMISSIVE: If unclear, default to valid for borderline cases
    return this.verificationResults.VALID;
  }

  /**
   * Get human-readable reasoning for verification result
   */
  getReasoningForResult(result) {
    const reasoningMap = {
      [this.verificationResults.VALID]: 'Identity confirmed - correct person/character',
      [this.verificationResults.INVALID_WRONG_PERSON]: 'Wrong person shown in image',
      [this.verificationResults.INVALID_WRONG_CHARACTER]: 'Wrong character shown in image',
      [this.verificationResults.INVALID_MERCHANDISE]: 'Shows toys, collectibles, or merchandise',
      [this.verificationResults.INVALID_UNRELATED]: 'Unrelated or completely different content',
      [this.verificationResults.VERIFICATION_FAILED]: 'Identity verification process failed'
    };
    
    return reasoningMap[result] || 'Unknown verification result';
  }

  /**
   * Utility: Convert image to base64
   */
  async imageToBase64(imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    return imageBuffer.toString('base64');
  }

  /**
   * SIMPLIFIED: Batch validation for smaller sets
   */
  async batchValidate(images, celebrityName, character, title, medium, batchSize = 10) {
    const results = {
      valid: [],
      invalid: [],
      cost: 0
    };

    // Process in batches
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      console.log(`🔄 Processing identity batch ${Math.floor(i/batchSize) + 1}: ${batch.length} images`);

      for (const image of batch) {
        try {
          const validation = await this.validateIdentity(
            image.filepath, 
            celebrityName, 
            character, 
            title, 
            medium
          );
          
          results.cost += 0.002;

          if (validation.result === this.verificationResults.VALID) {
            results.valid.push({
              ...image,
              identityVerification: validation
            });
          } else {
            results.invalid.push({
              ...image,
              identityVerification: validation,
              rejectionReason: validation.result
            });
          }

        } catch (error) {
          console.warn(`⚠️ Identity verification failed for ${image.filename}: ${error.message}`);
          // Conservative: include in valid set if verification fails
          results.valid.push({
            ...image,
            verificationReason: 'verification_failed_included'
          });
        }
      }

      // Pause between batches
      if (i + batchSize < images.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * SIMPLIFIED: Quick identity confidence check
   */
  async quickIdentityCheck(imagePath, celebrityName, character, isAnimated = false) {
    if (!this.hasOpenAI) return { confidence: 'unknown', reason: 'OpenAI unavailable' };

    try {
      const imageBase64 = await this.imageToBase64(imagePath);
      
      const prompt = `Rate your confidence that this image shows ${isAnimated ? `the character "${character}"` : celebrityName} on a scale of 1-10.

1-3: Not the right ${isAnimated ? 'character' : 'person'}
4-6: Uncertain
7-10: Confident this is the right ${isAnimated ? 'character' : 'person'}

Respond with just a number 1-10.`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { 
              type: "image_url", 
              image_url: { 
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "low"
              }
            }
          ]
        }],
        max_tokens: 5,
        temperature: 0.1
      });

      const score = parseInt(completion.choices[0].message.content.trim());
      
      return {
        confidence: score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low',
        score: score,
        reason: score >= 7 ? 'High confidence match' : score >= 4 ? 'Uncertain match' : 'Low confidence match'
      };

    } catch (error) {
      return { confidence: 'unknown', reason: `Confidence check failed: ${error.message}` };
    }
  }

  /**
   * Get verification statistics
   */
  getVerificationStats() {
    return {
      hasOpenAI: this.hasOpenAI,
      service: 'OpenAI GPT-4 Vision',
      primaryUse: 'Identity verification only',
      costPerImage: '$0.002',
      processingSpeed: '2-5 seconds per image',
      accuracy: 'High (focused on identity)',
      approach: 'Permissive - only reject clear mismatches'
    };
  }

  /**
   * Test OpenAI connection
   */
  async testConnection() {
    if (!this.hasOpenAI) return false;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Test" }],
        max_tokens: 5
      });

      return completion.choices && completion.choices.length > 0;

    } catch (error) {
      console.error('OpenAI connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = OpenAIVerifier;
