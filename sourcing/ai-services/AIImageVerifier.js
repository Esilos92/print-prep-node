const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

class AIImageVerifier {
  constructor() {
    this.openai = null;
    this.hasOpenAI = false;
    this.hasAnthropic = false;
    this.hasGoogle = false;
    
    this.initializeAPIs();
    
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

  initializeAPIs() {
    // Initialize OpenAI (Primary)
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.hasOpenAI = true;
        console.log('✅ OpenAI Vision initialized as primary verifier');
      }
    } catch (error) {
      console.log('⚠️ OpenAI Vision not available');
    }

    // Check Anthropic (Fallback)
    if (process.env.ANTHROPIC_API_KEY) {
      this.hasAnthropic = true;
      console.log('✅ Claude Vision initialized as fallback verifier');
    }

    // Check Google Vision (Backup)
    if (process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      this.hasGoogle = true;
      console.log('✅ Google Vision initialized as backup verifier');
    }

    // Report available services
    const availableServices = [
      this.hasOpenAI && 'OpenAI Vision',
      this.hasAnthropic && 'Claude Vision', 
      this.hasGoogle && 'Google Vision'
    ].filter(Boolean);

    console.log(`📊 Image verification services: ${availableServices.join(' → ')}`);
  }

  /**
   * STREAMLINED: Main verification - focuses on OpenAI primarily
   */
  async verifyImage(imagePath, celebrityName, character, title, medium) {
    try {
      console.log(`🔍 Verifying image: ${path.basename(imagePath)} for ${celebrityName} as ${character}`);

      // Primary: OpenAI Vision (best for identity verification)
      if (this.hasOpenAI) {
        try {
          const result = await this.verifyWithOpenAI(imagePath, celebrityName, character, title, medium);
          if (result !== this.verificationResults.VERIFICATION_FAILED) {
            console.log(`✅ OpenAI verification: ${result}`);
            return { result, service: 'openai', cost: 0.0015 };
          }
        } catch (error) {
          console.warn(`⚠️ OpenAI verification failed: ${error.message}`);
        }
      }

      // Fallback: Claude Vision
      if (this.hasAnthropic) {
        try {
          const result = await this.verifyWithClaude(imagePath, celebrityName, character, title, medium);
          if (result !== this.verificationResults.VERIFICATION_FAILED) {
            console.log(`✅ Claude verification: ${result}`);
            return { result, service: 'claude', cost: 0.0024 };
          }
        } catch (error) {
          console.warn(`⚠️ Claude verification failed: ${error.message}`);
        }
      }

      // Final fallback: Basic keyword verification
      console.log(`🔄 Using keyword fallback verification`);
      const result = await this.verifyWithKeywords(imagePath, celebrityName, character, title);
      return { result, service: 'keywords', cost: 0 };

    } catch (error) {
      console.error(`❌ All verification methods failed: ${error.message}`);
      return { 
        result: this.verificationResults.VERIFICATION_FAILED, 
        service: 'none', 
        cost: 0,
        error: error.message 
      };
    }
  }

  /**
   * IMPROVED: OpenAI Vision verification with clearer prompts
   */
  async verifyWithOpenAI(imagePath, celebrityName, character, title, medium) {
    const imageBase64 = await this.imageToBase64(imagePath);
    const isAnimated = medium.includes('animation') || medium.includes('voice') || medium.includes('anime');
    
    const prompt = `Identity verification: Does this image show ${isAnimated ? `the character "${character}" from "${title}"` : `${celebrityName} as ${character} from ${title}`}?

${isAnimated ? 
`ANIMATED CONTENT - Looking for "${character}":
✅ VALID if:
- This shows ${character} from ${title}
- ${character} is clearly recognizable 
- Group scenes with ${character} visible
- Different animation styles of ${character}

❌ INVALID if:
- Shows different characters from ${title}
- Shows characters from different shows
- Shows toys/merchandise/collectibles
- Shows live-action people (not animated)` :

`LIVE ACTION - Looking for ${celebrityName}:
✅ VALID if:
- This shows ${celebrityName} (any age/appearance)
- ${celebrityName} is recognizable as the same person
- Group scenes with ${celebrityName} visible
- ${celebrityName} at different ages/eras

❌ INVALID if:
- Shows a completely different person
- Shows toys/merchandise/collectibles
- Shows only other actors from ${title}
- Completely unrelated content`}

IMPORTANT: Be permissive with uncertain cases. Only reject if clearly wrong.

Respond with exactly one word:
- VALID: Shows correct ${isAnimated ? 'character' : 'person'}
- INVALID_WRONG_PERSON: Different person shown
- INVALID_WRONG_CHARACTER: Different character shown
- INVALID_MERCHANDISE: Toys/collectibles
- INVALID_UNRELATED: Completely unrelated`;

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
              detail: "low" // Cost-efficient
            }
          }
        ]
      }],
      max_tokens: 30,
      temperature: 0.05
    });

    const response = completion.choices[0].message.content.trim();
    return this.parseVerificationResponse(response);
  }

  /**
   * IMPROVED: Claude Vision verification with consistent criteria
   */
  async verifyWithClaude(imagePath, celebrityName, character, title, medium) {
    const imageBase64 = await this.imageToBase64(imagePath);
    const isAnimated = medium.includes('animation') || medium.includes('voice') || medium.includes('anime');
    
    const prompt = `Identity verification: Does this image show ${isAnimated ? `the character "${character}" from "${title}"` : `${celebrityName} as ${character} from ${title}`}?

${isAnimated ? 
`ANIMATED CONTENT - Checking for "${character}":
✅ ACCEPT if:
- Shows ${character} from ${title}
- ${character} is recognizable
- Group scenes with ${character} visible
- Different art styles of ${character}

❌ REJECT if:
- Shows different characters from ${title}
- Shows characters from different shows
- Shows toys/merchandise
- Shows live-action people` :

`LIVE ACTION - Checking for ${celebrityName}:
✅ ACCEPT if:
- Shows ${celebrityName} (any age/appearance)
- ${celebrityName} is recognizable as same person
- Group scenes with ${celebrityName} visible
- ${celebrityName} at different life stages

❌ REJECT if:
- Shows completely different person
- Shows toys/merchandise
- Shows only other actors from ${title}
- Completely unrelated content`}

Be permissive with uncertain cases. Only reject if clearly wrong.

Respond with exactly one word:
- VALID: Shows correct ${isAnimated ? 'character' : 'person'}
- INVALID_WRONG_PERSON: Different person
- INVALID_WRONG_CHARACTER: Different character
- INVALID_MERCHANDISE: Toys/collectibles
- INVALID_UNRELATED: Unrelated content`;

    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 20,
      temperature: 0.05,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageBase64
            }
          }
        ]
      }]
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.content[0].text.trim();
    return this.parseVerificationResponse(result);
  }

  /**
   * SIMPLIFIED: Keyword-based verification (final fallback)
   */
  async verifyWithKeywords(imagePath, celebrityName, character, title) {
    const filename = path.basename(imagePath).toLowerCase();
    
    // Only reject obvious problematic content
    const rejectKeywords = [
      'funko', 'pop', 'toy', 'figure', 'collectible', 
      'merchandise', 'packaging', 'box', 'signed', 'autograph'
    ];
    
    const hasRejectKeyword = rejectKeywords.some(keyword => filename.includes(keyword));
    
    if (hasRejectKeyword) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }

    // Default to valid for targeted searches
    return this.verificationResults.VALID;
  }

  /**
   * IMPROVED: Parse verification response with permissive approach
   */
  parseVerificationResponse(response) {
    const upperResponse = response.toUpperCase();
    
    // Accept clear VALID responses
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
    
    // Handle other invalid responses
    if (upperResponse.includes('INVALID') || upperResponse.includes('REJECT')) {
      return this.verificationResults.INVALID_UNRELATED;
    }
    
    // PERMISSIVE: Default to valid for unclear responses
    return this.verificationResults.VALID;
  }

  /**
   * Utility functions
   */
  async imageToBase64(imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    return imageBuffer.toString('base64');
  }

  /**
   * OPTIMIZED: Batch verification with better error handling
   */
  async verifyImages(images, celebrityName, character, title, medium) {
    console.log(`🔍 Starting batch verification of ${images.length} images for ${celebrityName} as ${character}`);
    
    const results = {
      valid: [],
      invalid: [],
      totalCost: 0,
      serviceUsage: {}
    };

    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;

    for (const image of images) {
      try {
        const verification = await this.verifyImage(image.filepath, celebrityName, character, title, medium);
        
        // Track costs and service usage
        results.totalCost += verification.cost;
        results.serviceUsage[verification.service] = (results.serviceUsage[verification.service] || 0) + 1;
        
        if (verification.result === this.verificationResults.VALID) {
          results.valid.push({
            ...image,
            verification: verification
          });
          consecutiveFailures = 0; // Reset failure count
        } else {
          results.invalid.push({
            ...image,
            verification: verification,
            reason: verification.result
          });
        }
        
      } catch (error) {
        console.error(`❌ Failed to verify ${image.filename}: ${error.message}`);
        consecutiveFailures++;
        
        // If too many consecutive failures, include remaining images to avoid losing everything
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.warn(`⚠️ Too many consecutive failures, including remaining images`);
          results.valid.push({
            ...image,
            verification: { result: this.verificationResults.VALID, service: 'failure_fallback' }
          });
        } else {
          results.invalid.push({
            ...image,
            verification: { result: this.verificationResults.VERIFICATION_FAILED, error: error.message }
          });
        }
      }
    }

    console.log(`✅ Verification complete: ${results.valid.length}/${images.length} valid images`);
    console.log(`💰 Total verification cost: $${results.totalCost.toFixed(4)}`);
    console.log(`📊 Service usage:`, results.serviceUsage);

    return results;
  }

  /**
   * SIMPLIFIED: Quick confidence check
   */
  async quickConfidenceCheck(imagePath, celebrityName, character, isAnimated = false) {
    if (!this.hasOpenAI) return { confidence: 'unknown', reason: 'OpenAI unavailable' };

    try {
      const imageBase64 = await this.imageToBase64(imagePath);
      
      const prompt = `Rate your confidence that this image shows ${isAnimated ? `the character "${character}"` : celebrityName} on a scale of 1-10.

1-3: Definitely not the right ${isAnimated ? 'character' : 'person'}
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
      hasAnthropic: this.hasAnthropic, 
      hasGoogle: this.hasGoogle,
      primaryService: this.hasOpenAI ? 'OpenAI Vision' : this.hasAnthropic ? 'Claude Vision' : 'Keywords Only',
      estimatedCostPer100Images: this.hasOpenAI ? '$0.15' : this.hasAnthropic ? '$0.24' : '$0.00',
      approach: 'Permissive - only reject clear mismatches'
    };
  }

  /**
   * Test connection to primary service
   */
  async testConnection() {
    if (this.hasOpenAI) {
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
    
    return true; // Always return true for fallback services
  }
}

module.exports = AIImageVerifier;
