const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../utils/config');

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
      INVALID_LOW_CONFIDENCE: 'low_confidence',
      VERIFICATION_FAILED: 'failed',
      UNVERIFIED: 'unverified'
    };

    // Only this verdict lets an image through. Everything else — including
    // "we could not tell" — is a rejection. An autograph print of the wrong
    // person is worse than one fewer print.
    this.acceptOnly = this.verificationResults.VALID;
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
   * Verify one candidate image.
   *
   * `context.referencePath`, when supplied, is a confirmed portrait of the
   * celebrity. With it the model is asked to compare two faces; without it
   * the model has to recognise the name unaided, which is markedly less
   * reliable for anyone short of A-list — i.e. most convention signers.
   */
  async verifyImage(imagePath, context) {
    const { celebrityName, character, title, medium, referencePath } = context;

    try {
      if (this.hasOpenAI) {
        try {
          const verdict = await this.verifyWithOpenAI(imagePath, context);
          if (verdict.result !== this.verificationResults.VERIFICATION_FAILED) {
            return { ...verdict, service: 'openai', cost: 0.0045 };
          }
        } catch (error) {
          console.warn(`⚠️ OpenAI verification error: ${error.message}`);
        }
      }

      if (this.hasAnthropic) {
        try {
          const verdict = await this.verifyWithClaude(imagePath, context);
          if (verdict.result !== this.verificationResults.VERIFICATION_FAILED) {
            return { ...verdict, service: 'claude', cost: 0.006 };
          }
        } catch (error) {
          console.warn(`⚠️ Claude verification error: ${error.message}`);
        }
      }

      /**
       * No vision service could reach a verdict. The filename check below
       * catches obvious merchandise, but it cannot confirm identity, so its
       * best case is UNVERIFIED — which does not pass.
       */
      const keywordResult = await this.verifyWithKeywords(imagePath);
      return { ...keywordResult, service: 'keywords', cost: 0 };

    } catch (error) {
      console.error(`❌ Verification failed for ${path.basename(imagePath)}: ${error.message}`);
      return {
        result: this.verificationResults.VERIFICATION_FAILED,
        service: 'none',
        cost: 0,
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Build the verification prompt.
   *
   * The instruction is deliberately the opposite of permissive: an uncertain
   * match is a rejection. The previous wording ("Be permissive with uncertain
   * cases. Only reject if clearly wrong.") is how co-stars, lookalikes and
   * crowd shots ended up in finished print packages.
   */
  buildPrompt({ celebrityName, character, title, medium }, hasReference) {
    const isAnimated = (medium || '').includes('animation')
      || (medium || '').includes('voice')
      || (medium || '').includes('anime');

    if (isAnimated) {
      return `You are checking images for an autograph print run.

TARGET: the character "${character}" from "${title}".

Answer VALID only if ${character} is clearly and identifiably depicted.

Reject:
- a different character, even from ${title}
- a character from another production
- toys, figures, packaging or other merchandise
- live-action photographs
- fan art, when you can tell
- images so small, blurry or obstructed that you cannot be sure

If you are not confident, reject. An uncertain match is a rejection.

Reply with exactly: VERDICT|CONFIDENCE
VERDICT is one of VALID, INVALID_WRONG_CHARACTER, INVALID_MERCHANDISE, INVALID_UNRELATED.
CONFIDENCE is an integer 1-10 for how sure you are of that verdict.
Example: VALID|8`;
    }

    const subject = hasReference
      ? `The FIRST image is a confirmed photograph of ${celebrityName}.
The SECOND image is the candidate.

Answer VALID only if the person in the second image is the same person as in the first.
Compare facial structure, not clothing, styling, age or image quality — the same
person may appear at different ages and in character makeup.`
      : `TARGET: ${celebrityName}${character && character !== 'Unknown' ? `, as ${character} in ${title}` : ''}.

Answer VALID only if ${celebrityName} is clearly and identifiably the person shown.`;

    return `You are checking images for an autograph print run. Getting the wrong
person into a print package is a costly error.

${subject}

Reject:
- a different person, including co-stars and lookalikes
- a group shot where you cannot confidently pick out the target
- toys, figures, packaging or other merchandise
- images so small, blurry or obstructed that you cannot be sure

If you are not confident it is the right person, reject. An uncertain match is a rejection.

Reply with exactly: VERDICT|CONFIDENCE
VERDICT is one of VALID, INVALID_WRONG_PERSON, INVALID_MERCHANDISE, INVALID_UNRELATED.
CONFIDENCE is an integer 1-10 for how sure you are of that verdict.
Example: VALID|8`;
  }

  async verifyWithOpenAI(imagePath, context) {
    const hasReference = !!context.referencePath;
    const detail = config.verification.visionDetail;

    const content = [{ type: 'text', text: this.buildPrompt(context, hasReference) }];

    if (hasReference) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${await this.imageToBase64(context.referencePath)}`, detail }
      });
    }

    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${await this.imageToBase64(imagePath)}`, detail }
    });

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content }],
      max_tokens: 10,
      temperature: 0
    });

    return this.parseVerificationResponse(completion.choices[0].message.content);
  }

  async verifyWithClaude(imagePath, context) {
    const hasReference = !!context.referencePath;
    const content = [{ type: 'text', text: this.buildPrompt(context, hasReference) }];

    if (hasReference) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: await this.imageToBase64(context.referencePath)
        }
      });
    }

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: await this.imageToBase64(imagePath)
      }
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        // Overridable because per-image verification is a high-volume call and
        // a cheaper model may be the right trade for a given roster.
        model: process.env.ANTHROPIC_VERIFY_MODEL || 'claude-opus-5',
        max_tokens: 10,
        temperature: 0,
        messages: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      // Surface the status. A retired model id or a bad key used to be
      // swallowed here and silently degraded the run to no verification.
      const body = await response.text().catch(() => '');
      throw new Error(`Claude API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    return this.parseVerificationResponse(data.content[0].text);
  }

  /**
   * Filename-only check. Can rule an image OUT, can never rule one IN.
   */
  async verifyWithKeywords(imagePath) {
    const filename = path.basename(imagePath).toLowerCase();

    const rejectKeywords = [
      'funko', 'toy', 'figure', 'collectible',
      'merchandise', 'packaging', 'signed', 'autograph'
    ];

    if (rejectKeywords.some(keyword => filename.includes(keyword))) {
      return { result: this.verificationResults.INVALID_MERCHANDISE, confidence: 5 };
    }

    return { result: this.verificationResults.UNVERIFIED, confidence: 0 };
  }

  /**
   * Parse "VERDICT|CONFIDENCE". Anything unparseable is a failure, not a pass.
   */
  parseVerificationResponse(response) {
    const text = (response || '').trim().toUpperCase();

    const [verdictPart, confidencePart] = text.split('|').map(part => (part || '').trim());
    const parsedConfidence = parseInt(confidencePart, 10);
    const confidence = Number.isFinite(parsedConfidence) ? parsedConfidence : 0;

    const verdict = (() => {
      if (verdictPart === 'VALID') return this.verificationResults.VALID;
      if (verdictPart.includes('WRONG_PERSON')) return this.verificationResults.INVALID_WRONG_PERSON;
      if (verdictPart.includes('WRONG_CHARACTER')) return this.verificationResults.INVALID_WRONG_CHARACTER;
      if (verdictPart.includes('MERCHANDISE')) return this.verificationResults.INVALID_MERCHANDISE;
      if (verdictPart.includes('UNRELATED')) return this.verificationResults.INVALID_UNRELATED;
      if (verdictPart.includes('INVALID')) return this.verificationResults.INVALID_UNRELATED;
      return this.verificationResults.VERIFICATION_FAILED;
    })();

    // A pass the model is unsure about does not pass.
    if (verdict === this.verificationResults.VALID && confidence < config.verification.minConfidence) {
      return { result: this.verificationResults.INVALID_LOW_CONFIDENCE, confidence };
    }

    return { result: verdict, confidence };
  }

  /**
   * Utility functions
   */
  async imageToBase64(imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    return imageBuffer.toString('base64');
  }

  /**
   * Verify a batch of candidates for one role.
   *
   * There is deliberately no "too many failures, let the rest through"
   * escape hatch. That path existed to avoid losing a whole batch, but it
   * triggers precisely when verification is broken — an expired key, a
   * retired model — and silently shipped unverified images as verified.
   * A failed batch should look like a failed batch.
   */
  async verifyImages(images, celebrityName, character, title, medium, referencePath = null) {
    console.log(`🔍 Verifying ${images.length} images for ${celebrityName} as ${character}`);

    if (referencePath) {
      console.log(`🪪 Comparing against reference portrait of ${celebrityName}`);
    } else if (this.hasOpenAI || this.hasAnthropic) {
      console.log(`ℹ️ No reference portrait — falling back to unaided recognition of ${celebrityName}`);
    }

    if (!this.hasOpenAI && !this.hasAnthropic) {
      console.error(
        '❌ No vision service configured (OPENAI_API_KEY / ANTHROPIC_API_KEY). ' +
        'Identity cannot be checked, so no image can be confirmed as the right person.'
      );
    }

    const results = { valid: [], invalid: [], totalCost: 0, serviceUsage: {}, verdictCounts: {} };
    const context = { celebrityName, character, title, medium, referencePath };

    for (const image of images) {
      let verification;

      try {
        verification = await this.verifyImage(image.filepath, context);
      } catch (error) {
        verification = {
          result: this.verificationResults.VERIFICATION_FAILED,
          service: 'none',
          cost: 0,
          confidence: 0,
          error: error.message
        };
      }

      results.totalCost += verification.cost || 0;
      results.serviceUsage[verification.service] = (results.serviceUsage[verification.service] || 0) + 1;
      results.verdictCounts[verification.result] = (results.verdictCounts[verification.result] || 0) + 1;

      if (verification.result === this.acceptOnly) {
        results.valid.push({ ...image, verification });
      } else {
        results.invalid.push({ ...image, verification, reason: verification.result });
      }
    }

    console.log(`✅ AI SELECTED: ${results.valid.length} of ${images.length} images`);
    console.log(`📊 Verdicts:`, results.verdictCounts);
    console.log(`💰 Total verification cost: $${results.totalCost.toFixed(4)}`);

    const unresolved = (results.verdictCounts[this.verificationResults.VERIFICATION_FAILED] || 0)
      + (results.verdictCounts[this.verificationResults.UNVERIFIED] || 0);

    if (unresolved > 0) {
      console.warn(
        `⚠️ ${unresolved} image(s) could not be checked and were rejected. ` +
        `If this is most of the batch, verification is misconfigured — check the API keys above.`
      );
    }

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
                detail: config.verification.visionDetail
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
      approach: `Strict - accept only a confident match (>= ${config.verification.minConfidence}/10)`
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
