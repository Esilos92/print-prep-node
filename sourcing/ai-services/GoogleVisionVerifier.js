const fs = require('fs').promises;
const path = require('path');

class GoogleVisionVerifier {
  constructor() {
    this.hasGoogle = false;
    this.initializeGoogle();
    
    // Pre-filter criteria for fast bulk processing
    this.preFilterCriteria = {
      requiredLabels: ['person', 'human face', 'facial expression'],
      bannedLabels: ['toy', 'figurine', 'product', 'package', 'poster'],
      minConfidence: 0.6
    };
  }

  initializeGoogle() {
    try {
      if (process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        this.hasGoogle = true;
        console.log('✅ Google Vision initialized for pre-filtering');
      } else {
        console.log('ℹ️ Google Vision not configured, using keyword fallback');
      }
    } catch (error) {
      console.log('⚠️ Google Vision initialization failed');
      this.hasGoogle = false;
    }
  }

  /**
   * MAIN: Batch pre-filter for high-speed processing
   */
  async batchPreFilter(images, celebrityName, character) {
    try {
      console.log(`🔍 Google Vision pre-filtering ${images.length} images...`);
      
      if (!this.hasGoogle) {
        console.log('📝 Using keyword-based pre-filter (Google Vision unavailable)');
        return this.keywordPreFilter(images, celebrityName, character);
      }

      const results = {
        passed: [],
        failed: [],
        cost: 0
      };

      // Process in batches for efficiency
      const batchSize = 20;
      const batches = this.createBatches(images, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`🔄 Processing Google Vision batch ${i + 1}/${batches.length} (${batch.length} images)`);

        try {
          const batchResults = await this.processBatch(batch, celebrityName, character);
          
          results.passed.push(...batchResults.passed);
          results.failed.push(...batchResults.failed);
          results.cost += batchResults.cost;

          // Brief pause between batches to respect rate limits
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

        } catch (batchError) {
          console.warn(`⚠️ Batch ${i + 1} failed: ${batchError.message}, using fallback`);
          // Add failed batch to passed for Claude to handle
          results.passed.push(...batch);
        }
      }

      const passRate = Math.round((results.passed.length / images.length) * 100);
      console.log(`✅ Google Vision pre-filter complete: ${results.passed.length}/${images.length} passed (${passRate}%)`);
      console.log(`💰 Google Vision cost: $${results.cost.toFixed(4)}`);

      return results;

    } catch (error) {
      console.error(`❌ Google Vision batch pre-filter failed: ${error.message}`);
      // Fallback: pass all images to next stage
      return {
        passed: images,
        failed: [],
        cost: 0
      };
    }
  }

  /**
   * Process a batch of images through Google Vision
   */
  async processBatch(batch, celebrityName, character) {
    const results = {
      passed: [],
      failed: [],
      cost: 0
    };

    for (const image of batch) {
      try {
        const analysis = await this.analyzeImage(image.filepath);
        results.cost += 0.0015; // Google Vision cost per image

        const shouldPass = this.evaluateAnalysis(analysis, image, celebrityName, character);

        if (shouldPass) {
          results.passed.push({
            ...image,
            googleAnalysis: analysis,
            preFilterReason: 'passed_google_vision'
          });
        } else {
          results.failed.push({
            ...image,
            googleAnalysis: analysis,
            preFilterReason: 'failed_google_vision'
          });
        }

      } catch (error) {
        console.warn(`⚠️ Google Vision analysis failed for ${image.filename}: ${error.message}`);
        // On failure, pass to next stage (conservative approach)
        results.passed.push({
          ...image,
          preFilterReason: 'google_vision_failed'
        });
      }
    }

    return results;
  }

  /**
   * Analyze single image with Google Vision
   */
  async analyzeImage(imagePath) {
    try {
      const imageBuffer = await fs.readFile(imagePath);
      const imageBase64 = imageBuffer.toString('base64');

      const requestBody = {
        requests: [{
          image: { content: imageBase64 },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 15 },
            { type: 'FACE_DETECTION', maxResults: 5 },
            { type: 'TEXT_DETECTION', maxResults: 10 },
            { type: 'SAFE_SEARCH_DETECTION' }
          ]
        }]
      };

      let response;
      if (process.env.GOOGLE_VISION_API_KEY) {
        // API Key method
        response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Service Account method
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
        throw new Error(`Google Vision API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseGoogleVisionResponse(data.responses[0]);

    } catch (error) {
      throw new Error(`Google Vision analysis failed: ${error.message}`);
    }
  }

  /**
   * Parse Google Vision API response
   */
  parseGoogleVisionResponse(response) {
    const analysis = {
      labels: [],
      faces: [],
      text: [],
      safeSearch: {},
      hasPerson: false,
      faceCount: 0,
      confidence: 0
    };

    // Process labels
    if (response.labelAnnotations) {
      analysis.labels = response.labelAnnotations.map(label => ({
        description: label.description.toLowerCase(),
        confidence: label.score,
        topicality: label.topicality
      }));

      // Check for person/face indicators
      const personLabels = ['person', 'human face', 'facial expression', 'human', 'people'];
      analysis.hasPerson = analysis.labels.some(label => 
        personLabels.some(personLabel => label.description.includes(personLabel)) &&
        label.confidence > 0.6
      );

      // Calculate overall confidence
      analysis.confidence = analysis.labels.length > 0 ? 
        analysis.labels.reduce((sum, label) => sum + label.confidence, 0) / analysis.labels.length : 0;
    }

    // Process faces
    if (response.faceAnnotations) {
      analysis.faces = response.faceAnnotations.map(face => ({
        confidence: face.detectionConfidence,
        joy: face.joyLikelihood,
        anger: face.angerLikelihood,
        boundingBox: face.boundingPoly
      }));
      analysis.faceCount = analysis.faces.length;
    }

    // Process text
    if (response.textAnnotations) {
      analysis.text = response.textAnnotations.map(text => ({
        description: text.description.toLowerCase(),
        confidence: text.confidence || 0.8
      }));
    }

    // Process safe search
    if (response.safeSearchAnnotation) {
      analysis.safeSearch = {
        adult: response.safeSearchAnnotation.adult,
        violence: response.safeSearchAnnotation.violence,
        racy: response.safeSearchAnnotation.racy
      };
    }

    return analysis;
  }

  /**
   * Evaluate Google Vision analysis for pre-filtering
   */
  evaluateAnalysis(analysis, image, celebrityName, character) {
    const reasons = [];

    // REQUIREMENT 1: Must have person/face indicators
    if (!analysis.hasPerson && analysis.faceCount === 0) {
      reasons.push('no_person_detected');
      return false;
    }

    // REQUIREMENT 2: Check for banned content (toys, merchandise)
    const bannedLabels = ['toy', 'figurine', 'action figure', 'doll', 'collectible', 'product', 'package'];
    const hasBannedContent = analysis.labels.some(label => 
      bannedLabels.some(banned => label.description.includes(banned)) &&
      label.confidence > 0.7
    );

    if (hasBannedContent) {
      reasons.push('merchandise_detected');
      return false;
    }

    // REQUIREMENT 3: Safe search filtering
    if (analysis.safeSearch.adult === 'LIKELY' || analysis.safeSearch.adult === 'VERY_LIKELY') {
      reasons.push('inappropriate_content');
      return false;
    }

    // REQUIREMENT 4: Text-based filtering for obvious junk
    const junkTextPatterns = ['watermark', 'getty images', 'shutterstock', 'preview', 'sample'];
    const hasJunkText = analysis.text.some(text => 
      junkTextPatterns.some(pattern => text.description.includes(pattern))
    );

    if (hasJunkText) {
      reasons.push('watermarked_content');
      return false;
    }

    // BONUS: Boost confidence for entertainment-related labels
    const entertainmentLabels = ['movie', 'television', 'entertainment', 'performance', 'actor', 'character'];
    const hasEntertainmentContext = analysis.labels.some(label => 
      entertainmentLabels.some(ent => label.description.includes(ent)) &&
      label.confidence > 0.5
    );

    if (hasEntertainmentContext) {
      reasons.push('entertainment_context_boost');
    }

    // REQUIREMENT 5: Minimum confidence threshold
    if (analysis.confidence < this.preFilterCriteria.minConfidence) {
      reasons.push('low_confidence');
      return false;
    }

    // Passed all checks
    return true;
  }

  /**
   * Keyword-based fallback when Google Vision unavailable
   */
  async keywordPreFilter(images, celebrityName, character) {
    const results = {
      passed: [],
      failed: [],
      cost: 0
    };

    for (const image of images) {
      const filename = path.basename(image.filepath).toLowerCase();
      const title = (image.title || '').toLowerCase();
      const url = (image.sourceUrl || '').toLowerCase();

      // Only reject obvious junk
      const obviousJunk = [
        'funko', 'pop', 'toy', 'figure', 'collectible', 'merchandise',
        'package', 'box', 'watermark', 'preview', 'sample', 'comp'
      ];

      const isObviousJunk = obviousJunk.some(junk => 
        filename.includes(junk) || title.includes(junk) || url.includes(junk)
      );

      if (isObviousJunk) {
        results.failed.push({
          ...image,
          preFilterReason: 'keyword_filtered'
        });
      } else {
        results.passed.push({
          ...image,
          preFilterReason: 'keyword_passed'
        });
      }
    }

    console.log(`📝 Keyword pre-filter: ${results.passed.length}/${images.length} passed`);
    return results;
  }

  /**
   * Create batches for processing
   */
  createBatches(images, batchSize) {
    const batches = [];
    for (let i = 0; i < images.length; i += batchSize) {
      batches.push(images.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get verification statistics
   */
  getVerificationStats() {
    return {
      hasGoogle: this.hasGoogle,
      service: 'Google Vision API',
      primaryUse: 'High-speed pre-filtering',
      costPerImage: '$0.0015',
      processingSpeed: '0.5-2 seconds per image',
      batchOptimized: true
    };
  }

  /**
   * Test Google Vision connection
   */
  async testConnection() {
    if (!this.hasGoogle) return false;

    try {
      // Create a small test image buffer (1x1 pixel)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      const requestBody = {
        requests: [{
          image: { content: testImageBase64 },
          features: [{ type: 'LABEL_DETECTION', maxResults: 1 }]
        }]
      };

      let response;
      if (process.env.GOOGLE_VISION_API_KEY) {
        response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      } else {
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
      }

      return response.ok;

    } catch (error) {
      console.error('Google Vision connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = GoogleVisionVerifier;
