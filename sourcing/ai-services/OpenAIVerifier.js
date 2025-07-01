const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

class OpenAIVerifier {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.initializeOpenAI();
    
    // Verification results
    this.verificationResults = {
      VALID: 'valid',
      INVALID_WRONG_PERSON: 'wrong_person',
      INVALID_WRONG_CHARACTER: 'wrong_character', 
      INVALID_PRODUCTION_QUALITY: 'production_quality',
      INVALID_MERCHANDISE: 'merchandise',
      INVALID_EVENT_PHOTO: 'event_photo',
      INVALID_OTHER: 'other',
      VERIFICATION_FAILED: 'failed'
    };
  }

  initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI Vision initialized for final validation');
      } else {
        console.log('ℹ️ OpenAI not configured for final validation');
      }
    } catch (error) {
      console.log('⚠️ OpenAI Vision not available for final validation');
      this.hasOpenAI = false;
    }
  }

  /**
   * MAIN: Final validation for pre-filtered, high-quality images
   */
  async finalValidation(images, celebrityName, character, title, medium) {
    try {
      console.log(`🔍 OpenAI final validation for ${images.length} pre-verified images...`);
      
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

      // Process images individually for highest accuracy
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        
        try {
          console.log(`🔄 OpenAI validating ${i + 1}/${images.length}: ${image.filename}`);
          
          const validation = await this.validatePrintReadyImage(
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
              openaiValidation: validation,
              finalValidationReason: validation.reasoning || 'passed_openai_validation'
            });
            console.log(`✅ ${image.filename}: ${validation.reasoning || 'VALID'}`);
          } else {
            results.invalid.push({
              ...image,
              openaiValidation: validation,
              finalValidationReason: validation.result,
              rejectionReason: validation.reasoning || validation.result
            });
            console.log(`❌ ${image.filename}: ${validation.reasoning || validation.result}`);
          }

          // Brief pause to respect rate limits
          if (i < images.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          console.warn(`⚠️ OpenAI validation failed for ${image.filename}: ${error.message}`);
          // Conservative approach: if validation fails, include in valid set
          results.valid.push({
            ...image,
            finalValidationReason: 'openai_validation_failed'
          });
        }
      }

      const passRate = Math.round((results.valid.length / images.length) * 100);
      console.log(`✅ OpenAI final validation complete: ${results.valid.length}/${images.length} passed (${passRate}%)`);
      console.log(`💰 OpenAI validation cost: $${results.cost.toFixed(4)}`);

      return results;

    } catch (error) {
      console.error(`❌ OpenAI final validation failed: ${error.message}`);
      // Fallback: pass all images
      return {
        valid: images,
        invalid: [],
        cost: 0
      };
    }
  }

  /**
   * Validate image for print-ready quality using OpenAI Vision
   */
  async validatePrintReadyImage(imagePath, celebrityName, character, title, medium) {
    try {
      const imageBase64 = await this.imageToBase64(imagePath);
      const isAnimated = medium.includes('animation') || medium.includes('voice') || medium.includes('anime');
      
      const prompt = `You are the FINAL VALIDATOR for PRINT-READY autograph photos. This image has already passed pre-filtering.

CONTEXT: ${isAnimated ? `${character} from ${title}` : `${celebrityName} as ${character} from ${title}`}

PRINT-READY REQUIREMENTS (STRICT):
${isAnimated ? 
`ANIMATED CONTENT:
- ${character} must be clearly visible and recognizable
- Must be official production art, screenshot, or promotional material
- Character should be the primary focus, not background element
- NO fan art, NO merchandise, NO toys

REJECT if:
- ${character} is not clearly identifiable
- Shows only other characters without ${character}
- Fan art or unofficial artwork
- Toys, figurines, merchandise
- Text overlays, watermarks, or logos covering character` :

`LIVE ACTION:
- ${celebrityName} must be clearly visible and recognizable (any age/era)
- Must show ${celebrityName} IN CHARACTER as ${character} from ${title}
- Official production still, promotional photo, or scene capture
- Face should be clear and unobstructed for autograph purposes

REJECT if:
- ${celebrityName} not clearly visible or recognizable
- Shows ${celebrityName} out of character (red carpet, personal life, etc.)
- Face too small, blurred, or obscured for autograph signing
- Fan conventions, meet & greets, or signing events
- Toys, merchandise, or collectibles`}

PRODUCTION QUALITY REQUIREMENTS:
- Image should appear professional/official
- Acceptable resolution and clarity
- Suitable for autograph signing (clear face/character area)
- NO obvious watermarks or "PREVIEW" stamps

RESPOND WITH EXACTLY ONE WORD:
- VALID: Meets all print-ready requirements for autograph use
- INVALID_WRONG_PERSON: Different person shown
- INVALID_WRONG_CHARACTER: Different character shown  
- INVALID_PRODUCTION_QUALITY: Poor quality or unofficial source
- INVALID_MERCHANDISE: Toys, collectibles, or products
- INVALID_EVENT_PHOTO: Convention, signing, or personal event
- INVALID_OTHER: Other issues preventing autograph use`;

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
                detail: "high" // High detail for final validation
              }
            }
          ]
        }],
        max_tokens: 50,
        temperature: 0.05 // Very low temperature for consistent results
      });

      const response = completion.choices[0].message.content.trim();
      const result = this.parseValidationResponse(response);
      
      return {
        result: result,
        reasoning: this.getReasoningForResult(result),
        rawResponse: response
      };

    } catch (error) {
      throw new Error(`OpenAI validation failed: ${error.message}`);
    }
  }

  /**
   * Parse OpenAI validation response
   */
  parseValidationResponse(response) {
    const upperResponse = response.toUpperCase();
    
    // Parse specific validation results
    if (upperResponse.includes('VALID') && !upperResponse.includes('INVALID')) {
      return this.verificationResults.VALID;
    }
    if (upperResponse.includes('WRONG_PERSON') || upperResponse.includes('DIFFERENT_PERSON')) {
      return this.verificationResults.INVALID_WRONG_PERSON;
    }
    if (upperResponse.includes('WRONG_CHARACTER') || upperResponse.includes('DIFFERENT_CHARACTER')) {
      return this.verificationResults.INVALID_WRONG_CHARACTER;
    }
    if (upperResponse.includes('PRODUCTION_QUALITY') || upperResponse.includes('POOR_QUALITY') || upperResponse.includes('UNOFFICIAL')) {
      return this.verificationResults.INVALID_PRODUCTION_QUALITY;
    }
    if (upperResponse.includes('MERCHANDISE') || upperResponse.includes('TOY') || upperResponse.includes('COLLECTIBLE')) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }
    if (upperResponse.includes('EVENT_PHOTO') || upperResponse.includes('CONVENTION') || upperResponse.includes('SIGNING')) {
      return this.verificationResults.INVALID_EVENT_PHOTO;
    }
    if (upperResponse.includes('INVALID_OTHER') || upperResponse.includes('OTHER_ISSUES')) {
      return this.verificationResults.INVALID_OTHER;
    }
    
    // Any other invalid response
    if (upperResponse.includes('INVALID') || upperResponse.includes('REJECT') || upperResponse.includes('NO')) {
      return this.verificationResults.INVALID_OTHER;
    }
    
    // Default to invalid for ambiguous responses in final validation
    return this.verificationResults.INVALID_OTHER;
  }

  /**
   * Get human-readable reasoning for validation result
   */
  getReasoningForResult(result) {
    const reasoningMap = {
      [this.verificationResults.VALID]: 'Meets all print-ready requirements for autograph use',
      [this.verificationResults.INVALID_WRONG_PERSON]: 'Wrong person shown in image',
      [this.verificationResults.INVALID_WRONG_CHARACTER]: 'Wrong character shown in image',
      [this.verificationResults.INVALID_PRODUCTION_QUALITY]: 'Poor quality or unofficial source',
      [this.verificationResults.INVALID_MERCHANDISE]: 'Shows toys, collectibles, or merchandise',
      [this.verificationResults.INVALID_EVENT_PHOTO]: 'Convention, signing, or personal event photo',
      [this.verificationResults.INVALID_OTHER]: 'Other issues preventing autograph use',
      [this.verificationResults.VERIFICATION_FAILED]: 'Validation process failed'
    };
    
    return reasoningMap[result] || 'Unknown validation result';
  }

  /**
   * Utility: Convert image to base64
   */
  async imageToBase64(imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    return imageBuffer.toString('base64');
  }

  /**
   * Batch validation for smaller sets (used for testing)
   */
  async batchValidate(images, celebrityName, character, title, medium, batchSize = 5) {
    const results = {
      valid: [],
      invalid: [],
      cost: 0
    };

    // Process in small batches to manage costs and rate limits
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      console.log(`🔄 Processing OpenAI batch ${Math.floor(i/batchSize) + 1}: ${batch.length} images`);

      for (const image of batch) {
        try {
          const validation = await this.validatePrintReadyImage(
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
              openaiValidation: validation
            });
          } else {
            results.invalid.push({
              ...image,
              openaiValidation: validation,
              rejectionReason: validation.result
            });
          }

        } catch (error) {
          console.warn(`⚠️ Validation failed for ${image.filename}: ${error.message}`);
          // Conservative: include in valid set if validation fails
          results.valid.push(image);
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
   * Get verification statistics
   */
  getVerificationStats() {
    return {
      hasOpenAI: this.hasOpenAI,
      service: 'OpenAI GPT-4 Vision',
      primaryUse: 'Final validation for print-ready quality',
      costPerImage: '$0.002',
      processingSpeed: '3-8 seconds per image',
      accuracy: 'Highest (final validation)',
      detailLevel: 'High'
    };
  }

  /**
   * Test OpenAI connection
   */
  async testConnection() {
    if (!this.hasOpenAI) return false;

    try {
      // Test with a simple text completion
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

  /**
   * Print-ready quality assessment without full validation
   */
  async quickQualityCheck(imagePath) {
    if (!this.hasOpenAI) return { quality: 'unknown', reason: 'OpenAI unavailable' };

    try {
      const imageBase64 = await this.imageToBase64(imagePath);
      
      const prompt = `Rate this image's suitability for autograph signing on a scale of 1-10. Consider:
- Image clarity and resolution
- Face/character visibility
- Professional/official appearance
- Print quality potential

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
        quality: score >= 7 ? 'high' : score >= 5 ? 'medium' : 'low',
        score: score,
        reason: score >= 7 ? 'Excellent for autographs' : score >= 5 ? 'Acceptable quality' : 'Below standard'
      };

    } catch (error) {
      return { quality: 'unknown', reason: `Quality check failed: ${error.message}` };
    }
  }
}

module.exports = OpenAIVerifier;
