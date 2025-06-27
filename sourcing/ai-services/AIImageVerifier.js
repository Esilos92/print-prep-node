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
   * OpenAI Vision verification (Primary)
   */
  async verifyWithOpenAI(imagePath, celebrityName, character, title, medium) {
    const imageBase64 = await this.imageToBase64(imagePath);
    const mediaType = medium.includes('animation') || medium.includes('voice') ? 'animated' : 'live-action';
    const isAnimated = medium.includes('animation') || medium.includes('voice');
    
    const prompt = `Analyze this image carefully. I need to verify if this shows ${celebrityName} playing the character ${character} from the ${mediaType} ${medium.includes('movie') ? 'movie' : 'TV show'} "${title}".

${isAnimated ? `NOTE: This is animated content. Official animation includes promotional art, concept art, merchandise art, HD remasters, and fan recreations that may have different art styles. Only mark as FAN_ART if it's clearly amateur artwork or completely different from the source material.` : ''}

RESPOND WITH EXACTLY ONE OF THESE:
- VALID: Shows ${celebrityName} as ${character} from ${title}
- INVALID_WRONG_PERSON: Shows different actor/person
- INVALID_WRONG_CHARACTER: Shows ${celebrityName} but as different character  
- INVALID_MERCHANDISE: Shows toys, figures, collectibles, or merchandise packaging
- INVALID_FAN_ART: Shows clearly amateur fan art or completely different art style
- INVALID_FRAMED: Shows a framed photo or picture on wall
- INVALID_EVENT_PHOTO: Shows convention, interview, or event photo
- INVALID_OTHER: Shows something else entirely

Focus on: Is this the right person playing the right character from the right show/movie?`;

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
      max_tokens: 50,
      temperature: 0.1
    });

    const response = completion.choices[0].message.content.trim();
    return this.parseVerificationResponse(response);
  }

  /**
   * Claude Vision verification (Fallback)
   */
  async verifyWithClaude(imagePath, celebrityName, character, title, medium) {
    const imageBase64 = await this.imageToBase64(imagePath);
    const mediaType = medium.includes('animation') || medium.includes('voice') ? 'animated' : 'live-action';
    const isAnimated = medium.includes('animation') || medium.includes('voice');
    
    const prompt = `Analyze this image. Does it show EXACTLY ${celebrityName} playing ${character} from the ${mediaType} ${medium.includes('movie') ? 'movie' : 'show'} "${title}"?

${isAnimated ? `IMPORTANT: For animated content, verify the character matches ${character} from ${title}. Accept any art style but must be the correct character.` : `IMPORTANT: For live-action, this must be specifically ${celebrityName} - not someone with a similar name or appearance.`}

BE LENIENT with:
- Art style variations (for animation)
- Different ages/looks of the same actor
- High-quality fan art of the correct character
- Official promotional materials

BE STRICT with:
- Must be the EXACT person: ${celebrityName} (not similar names)
- Must be the EXACT character: ${character} from ${title}
- Reject if different person with similar name
- Reject if wrong character entirely

Respond with exactly one word:
- VALID if it shows exactly ${celebrityName} as ${character} from ${title}
- INVALID_WRONG_PERSON if different person (even similar name)
- INVALID_WRONG_CHARACTER if wrong character
- INVALID_MERCHANDISE if toys/packaging
- INVALID_OTHER if unrelated`;

    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 20,
      temperature: 0.1, // Lower temperature for more precise matching
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
   * Keyword-based verification (Final fallback)
   */
  async verifyWithKeywords(imagePath, celebrityName, character, title) {
    const filename = path.basename(imagePath).toLowerCase();
    
    // Check for obvious bad indicators in filename
    const badKeywords = ['funko', 'pop', 'toy', 'figure', 'framed', 'frame', 'convention', 'signed', 'autograph', 'fan', 'art', 'render'];
    const hasBadKeywords = badKeywords.some(keyword => filename.includes(keyword));
    
    if (hasBadKeywords) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }

    // Check for good indicators
    const characterName = character.toLowerCase().replace(/\s+/g, '');
    const titleName = title.toLowerCase().replace(/\s+/g, '');
    const hasCharacter = filename.includes(characterName) || filename.includes(character.toLowerCase());
    const hasTitle = filename.includes(titleName) || filename.includes(title.toLowerCase());

    if (hasCharacter && hasTitle) {
      return this.verificationResults.VALID;
    }

    // Default to valid for keyword verification (let other filters handle it)
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
    
    if (upperResponse.includes('VALID') && !upperResponse.includes('INVALID')) {
      return this.verificationResults.VALID;
    }
    if (upperResponse.includes('WRONG_PERSON')) {
      return this.verificationResults.INVALID_WRONG_PERSON;
    }
    if (upperResponse.includes('WRONG_CHARACTER')) {
      return this.verificationResults.INVALID_WRONG_CHARACTER;
    }
    if (upperResponse.includes('MERCHANDISE')) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }
    if (upperResponse.includes('EVENT_PHOTO')) {
      return this.verificationResults.INVALID_EVENT_PHOTO;
    }
    if (upperResponse.includes('INVALID_OTHER')) {
      return this.verificationResults.INVALID_OTHER;
    }
    
    // For ambiguous cases, be moderately lenient but not too much
    return this.verificationResults.VALID;
  }

  analyzeGoogleVisionResults(labels, textDetections, celebrityName, character, title) {
    // Check for merchandise indicators
    const merchandiseLabels = ['toy', 'figurine', 'collectible', 'product', 'packaging'];
    const hasMerchandise = labels.some(label => 
      merchandiseLabels.some(merch => label.description.toLowerCase().includes(merch))
    );
    
    if (hasMerchandise) {
      return this.verificationResults.INVALID_MERCHANDISE;
    }

    // Check for frame indicators
    const frameLabels = ['picture frame', 'framing', 'wall', 'hanging'];
    const hasFrame = labels.some(label => 
      frameLabels.some(frame => label.description.toLowerCase().includes(frame))
    );
    
    if (hasFrame) {
      return this.verificationResults.INVALID_FRAMED;
    }

    // Default to valid for Google Vision
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
