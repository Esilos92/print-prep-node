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
    
    // Verification results
    this.verificationResults = {
      VALID: 'valid',
      INVALID_WRONG_PERSON: 'wrong_person',
      INVALID_WRONG_CHARACTER: 'wrong_character', 
      INVALID_MERCHANDISE: 'merchandise',
      INVALID_FAN_ART: 'fan_art',
      INVALID_FRAMED: 'framed',
      INVALID_EVENT_PHOTO: 'event_photo',
      INVALID_OTHER: 'other',
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
   * Main verification function - tries all available services in order
   */
  async verifyImage(imagePath, celebrityName, character, title, medium) {
    try {
      console.log(`🔍 Verifying image: ${path.basename(imagePath)} for ${celebrityName} as ${character}`);

      // Try OpenAI Vision first (best accuracy)
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

      // Fall back to Claude Vision
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

      // Fall back to Google Vision
      if (this.hasGoogle) {
        try {
          const result = await this.verifyWithGoogle(imagePath, celebrityName, character, title, medium);
          if (result !== this.verificationResults.VERIFICATION_FAILED) {
            console.log(`✅ Google verification: ${result}`);
            return { result, service: 'google', cost: 0.003 };
          }
        } catch (error) {
          console.warn(`⚠️ Google verification failed: ${error.message}`);
        }
      }

      // Final fallback - keyword-based verification (free)
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
   * OpenAI Vision verification (Primary) - Enhanced for ensemble movies
   */
  async verifyWithOpenAI(imagePath, celebrityName, character, title, medium) {
    const imageBase64 = await this.imageToBase64(imagePath);
    const mediaType = medium.includes('animation') || medium.includes('voice') ? 'animated' : 'live-action';
    const isAnimated = medium.includes('animation') || medium.includes('voice');
    
    const prompt = `You're analyzing an image for ${isAnimated ? `${character} from ${title}` : `${celebrityName} as ${character} from ${title}`}.

ENHANCED FACIAL VERIFICATION: Focus on identifying the specific person/character.

${isAnimated ? 
`STRICT REQUIREMENTS for animated content:
- ${character} must be clearly visible and recognizable in the image
- Must be the specific character ${character}, not other characters from ${title}
- Group shots OK only if ${character} is clearly identifiable among the group
- Different art styles OK if it's clearly ${character}

REJECT if:
- ${character} is not visible or not clearly identifiable
- Shows only other characters from ${title} without ${character}
- Wrong animated show/movie entirely
- Face/character too small to identify clearly
- Toys/merchandise` :

`STRICT REQUIREMENTS for live-action:
- ${celebrityName} must be clearly visible and facially recognizable
- Face must be identifiable specifically as ${celebrityName} (not other actors)
- Group shots OK only if ${celebrityName} is clearly visible and identifiable
- Different ages/looks OK if face is recognizably ${celebrityName}

REJECT if:
- ${celebrityName} is not visible or face not clearly identifiable
- Shows only other actors from ${title} without ${celebrityName}
- Face too small/obscured to identify as ${celebrityName}
- Clearly a different person entirely
- Toys/merchandise`}

SPECIAL NOTE FOR ENSEMBLE MOVIES: Many movies have large casts. Only accept if the TARGET person is clearly visible and identifiable, not just other actors from the same movie.

RESPOND WITH EXACTLY ONE WORD:
- VALID: ${isAnimated ? character : celebrityName} is clearly present and facially/visually identifiable
- INVALID_WRONG_PERSON: Different person/character shown instead
- INVALID_NOT_VISIBLE: Target person present but not clearly identifiable
- INVALID_MERCHANDISE: Toys/collectibles
- INVALID_OTHER: Completely unrelated or target not present`;

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
      max_tokens: 25,
      temperature: 0.05
    });

    const response = completion.choices[0].message.content.trim();
    return this.parseVerificationResponse(response);
  }

  /**
   * Claude Vision verification (Fallback) - Enhanced facial recognition
   */
  async verifyWithClaude(imagePath, celebrityName, character, title, medium) {
    const imageBase64 = await this.imageToBase64(imagePath);
    const mediaType = medium.includes('animation') || medium.includes('voice') ? 'animated' : 'live-action';
    const isAnimated = medium.includes('animation') || medium.includes('voice');
    
    const prompt = `This image came from a search for ${isAnimated ? `${character} from ${title}` : `${celebrityName} as ${character} from ${title}`}.

ENHANCED FACIAL VERIFICATION: Focus specifically on identifying the correct person.

${isAnimated ? 
`ACCEPT only if ${character} is clearly visible and identifiable:
- ${character} must be recognizable as the specific character from ${title}
- Group shots OK only if ${character} is clearly present and identifiable
- Must be the correct character, not other characters from the same show

REJECT if:
- Shows other characters from ${title} without ${character}
- ${character} is not clearly visible or identifiable
- Wrong animated show entirely
- Toys/merchandise` :

`ACCEPT only if ${celebrityName} is clearly visible and identifiable:
- Must be recognizable as ${celebrityName} specifically (not other actors)
- Face must be visible and identifiable as ${celebrityName}
- Group shots OK only if ${celebrityName} is clearly present and identifiable
- Different ages/looks of ${celebrityName} are OK if recognizable

REJECT if:
- Shows other actors from ${title} without ${celebrityName} (even main characters)
- ${celebrityName} is not clearly visible or identifiable in the image
- Face is too small/obscured to identify as ${celebrityName}
- Clearly a different person entirely
- Toys/merchandise`}

CRITICAL: In ensemble movies/shows, reject images that show only other characters/actors without the target person clearly visible.

Focus on: Can you clearly identify ${isAnimated ? character : celebrityName} in this specific image?

Respond with exactly one word:
- VALID (${isAnimated ? character : celebrityName} is clearly present and identifiable)
- INVALID_WRONG_PERSON (different person/character shown)
- INVALID_NOT_VISIBLE (target person not clearly visible/identifiable)
- INVALID_MERCHANDISE (toys/collectibles)
- INVALID_OTHER (completely unrelated)`;

    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 15,
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
   * Google Vision verification (Backup)
   */
  async verifyWithGoogle(imagePath, celebrityName, character, title, medium) {
    const imageBuffer = await fs.readFile(imagePath);
    const imageBase64 = imageBuffer.toString('base64');

    const requestBody = {
      requests: [{
        image: { content: imageBase64 },
        features: [
          { type: 'LABEL_DETECTION', maxResults: 10 },
          { type: 'TEXT_DETECTION', maxResults: 5 }
        ]
      }]
    };

    let response;
    if (process.env.GOOGLE_VISION_API_KEY) {
      // Use API Key method
      response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use Application Default Credentials (your existing setup)
      const { GoogleAuth } = require('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      const authClient = await auth.getClient();
      const accessToken = await authClient.getAccessToken();
      
      response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken.token}`
        },
        body: JSON.stringify(requestBody)
      });
    } else {
      throw new Error('No Google Vision credentials available');
    }

    if (!response.ok) {
      throw new Error(`Google Vision error: ${response.status}`);
    }

    const data = await response.json();
    const labels = data.responses[0]?.labelAnnotations || [];
    const textDetections = data.responses[0]?.textAnnotations || [];

    // Basic verification logic using labels and text
    return this.analyzeGoogleVisionResults(labels, textDetections, celebrityName, character, title);
  }

  /**
   * Keyword-based verification (Final fallback) - More lenient
   */
  async verifyWithKeywords(imagePath, celebrityName, character, title) {
    const filename = path.basename(imagePath).toLowerCase();
    
    // Only reject obvious merchandise/junk
    const obviousBadKeywords = ['funko', 'pop', 'toy', 'figure', 'collectible', 'merchandise', 'packaging'];
    const hasObviousBad = obviousBadKeywords.some(keyword => filename.includes(keyword));
    
    if (hasObviousBad) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }

    // For targeted searches, default to valid
    return this.verificationResults.VALID;
  }

  /**
   * Utility functions
   */
  async imageToBase64(imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    return imageBuffer.toString('base64');
  }

  parseVerificationResponse(response) {
    const upperResponse = response.toUpperCase();
    
    // Enhanced parsing for facial recognition results
    if (upperResponse.includes('VALID') && !upperResponse.includes('INVALID')) {
      return this.verificationResults.VALID;
    }
    if (upperResponse.includes('WRONG_PERSON') || upperResponse.includes('DIFFERENT_PERSON')) {
      return this.verificationResults.INVALID_WRONG_PERSON;
    }
    if (upperResponse.includes('WRONG_CHARACTER') || upperResponse.includes('DIFFERENT_CHARACTER')) {
      return this.verificationResults.INVALID_WRONG_CHARACTER;
    }
    if (upperResponse.includes('NOT_VISIBLE') || upperResponse.includes('NOT_IDENTIFIABLE') || upperResponse.includes('TOO_SMALL')) {
      return this.verificationResults.INVALID_OTHER;
    }
    if (upperResponse.includes('MERCHANDISE') || upperResponse.includes('TOY')) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }
    if (upperResponse.includes('EVENT_PHOTO')) {
      return this.verificationResults.INVALID_EVENT_PHOTO;
    }
    if (upperResponse.includes('INVALID_OTHER') || upperResponse.includes('UNRELATED')) {
      return this.verificationResults.INVALID_OTHER;
    }
    
    // Be stricter with ambiguous responses for facial recognition
    if (upperResponse.includes('INVALID') || upperResponse.includes('REJECT') || upperResponse.includes('NO')) {
      return this.verificationResults.INVALID_OTHER;
    }
    
    // Only accept clear positives
    return this.verificationResults.INVALID_OTHER;
  }

  analyzeGoogleVisionResults(labels, textDetections, celebrityName, character, title) {
    // Only reject obvious merchandise
    const merchandiseLabels = ['toy', 'figurine', 'collectible', 'product', 'packaging'];
    const hasMerchandise = labels.some(label => 
      merchandiseLabels.some(merch => label.description.toLowerCase().includes(merch))
    );
    
    if (hasMerchandise) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }

    // Default to valid for targeted searches
    return this.verificationResults.VALID;
  }

  /**
   * Batch verification for multiple images
   */
  async verifyImages(images, celebrityName, character, title, medium) {
    console.log(`🔍 Starting batch verification of ${images.length} images for ${celebrityName} as ${character}`);
    
    const results = {
      valid: [],
      invalid: [],
      totalCost: 0,
      serviceUsage: {}
    };

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
        } else {
          results.invalid.push({
            ...image,
            verification: verification,
            reason: verification.result
          });
        }
        
      } catch (error) {
        console.error(`❌ Failed to verify ${image.filename}: ${error.message}`);
        results.invalid.push({
          ...image,
          verification: { result: this.verificationResults.VERIFICATION_FAILED, error: error.message }
        });
      }
    }

    console.log(`✅ Verification complete: ${results.valid.length}/${images.length} valid images`);
    console.log(`💰 Total verification cost: $${results.totalCost.toFixed(4)}`);
    console.log(`📊 Service usage:`, results.serviceUsage);

    return results;
  }

  /**
   * Get verification statistics
   */
  getVerificationStats() {
    return {
      hasOpenAI: this.hasOpenAI,
      hasAnthropic: this.hasAnthropic, 
      hasGoogle: this.hasGoogle,
      primaryService: this.hasOpenAI ? 'OpenAI Vision' : this.hasAnthropic ? 'Claude Vision' : this.hasGoogle ? 'Google Vision' : 'Keywords Only',
      estimatedCostPer100Images: this.hasOpenAI ? '$0.15' : this.hasAnthropic ? '$0.24' : this.hasGoogle ? '$0.30' : '$0.00'
    };
  }
}

module.exports = AIImageVerifier;
