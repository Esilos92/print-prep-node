const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../utils/config');
const sharp = require('sharp');
const { mapLimit } = require('../../utils/concurrency');

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
      /**
       * Right person, wrong context: red carpet, interview, convention panel,
       * awards show. These never tripped wrong_person — it IS the performer —
       * so they passed verification and reached print packages.
       */
      INVALID_OUT_OF_CHARACTER: 'out_of_character',
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
  /**
   * Product-photography rejections, named explicitly.
   *
   * "Toys/collectibles" did not cover a photograph of a VHS sleeve or a DVD
   * case, so home-video packaging fell straight through the category meant to
   * catch it — and because such a cover genuinely does show the actor in
   * character, it was never "clearly wrong" either. For a pre-2000 film,
   * retail listings are a large share of what exists online, so this has to
   * be named rather than implied.
   */
  get packagingRejections() {
    return `- VHS tapes, DVD or Blu-ray cases, box art, cover sleeves, discs
- photographs of any retail packaging, spine, or shrink-wrap
- eBay, Amazon, Etsy or marketplace listing photos
- posters, lobby cards or standees photographed for sale
- screenshots of a storefront or auction page`;
  }

  get packagingCaveat() {
    return `Packaging is a hard reject even when the artwork on it clearly shows the
right person, and even if you are confident about the identity. The artwork
being correct is not enough — the photograph is of a product, and a product
photo cannot be sold as an autograph print.`;
  }

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
- toys, figures, statues or other merchandise
- live-action photographs
- fan art, when you can tell
- images so small, blurry or obstructed that you cannot be sure
${this.packagingRejections}

${this.packagingCaveat}

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

    const inCharacter = character && character !== 'Unknown'
      ? `They must be IN CHARACTER as ${character}${title ? ` from ${title}` : ''} — in costume,
in the production, as the audience sees them on screen.`
      : `They must be in a production still or publicity photograph, not at a
public appearance.`;

    return `You are checking images for an autograph print run. These are sold as
prints of a performer in a role, so the photograph has to show the role.

${subject}

${inCharacter}

Reject as INVALID_OUT_OF_CHARACTER — this is the most common mistake, and the
person being correct does not make the image usable:
- red carpet, premiere or awards appearances
- interviews, talk shows, podcasts
- convention panels, signings, fan photos
- modern photographs of the performer out of costume
- candid or paparazzi shots
The subject may be exactly the right person in all of these. That is precisely
why they slip through. Judge the costume and the setting, not the face.

Reject as INVALID_WRONG_PERSON:
- a different person, including co-stars and lookalikes
- a group shot where you cannot confidently pick out the target

Also reject:
- toys, figures, statues or other merchandise
- images so small, blurry or obstructed that you cannot be sure
${this.packagingRejections}

${this.packagingCaveat}

If you are not confident it is the right person in character, reject. An
uncertain match is a rejection.

Reply with exactly: VERDICT|CONFIDENCE
VERDICT is one of VALID, INVALID_OUT_OF_CHARACTER, INVALID_WRONG_PERSON,
INVALID_MERCHANDISE, INVALID_UNRELATED.
CONFIDENCE is an integer 1-10 for how sure you are of that verdict.
Example: VALID|8`;
  }

  async verifyWithOpenAI(imagePath, context) {
    const hasReference = !!context.referencePath;
    const detail = config.verification.visionDetail;

    const content = [{ type: 'text', text: this.buildPrompt(context, hasReference) }];

    if (hasReference) {
      const ref = await this.prepareImage(context.referencePath);
      content.push({
        type: 'image_url',
        image_url: { url: `data:${ref.mediaType};base64,${ref.data}`, detail }
      });
    }

    const candidate = await this.prepareImage(imagePath);
    content.push({
      type: 'image_url',
      image_url: { url: `data:${candidate.mediaType};base64,${candidate.data}`, detail }
    });

    const completion = await this.openai.chat.completions.create({
      model: config.models.vision,
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
      const ref = await this.prepareImage(context.referencePath);
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: ref.mediaType, data: ref.data }
      });
    }

    const candidate = await this.prepareImage(imagePath);
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: candidate.mediaType, data: candidate.data }
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
      if (verdictPart.includes('OUT_OF_CHARACTER')) return this.verificationResults.INVALID_OUT_OF_CHARACTER;
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
  /**
   * Prepare an image for a vision API.
   *
   * Two bugs lived here. The bytes were sent at full resolution — a 2400x3000
   * source is a very large number of image tokens, and with gpt-4o's 30,000
   * TPM ceiling a run would spend most of a job being throttled; 95 429s in a
   * single run. And the media type was hardcoded to image/jpeg on both
   * providers while the downloader names every file .jpg regardless of what
   * the bytes actually are, so PNG and WebP candidates were declared as JPEG.
   * OpenAI tolerated the lie; Anthropic rejected it with a 400. Primary
   * throttled, fallback refusing — and every affected image fell through to
   * "unverified" and was discarded.
   *
   * Re-encoding to a bounded JPEG fixes both at once: the declared type
   * becomes true by construction, and the token cost drops by roughly an
   * order of magnitude. Identity is still legible — 1024px is far more than a
   * face needs, and well above the ~512px that `detail: "low"` would have
   * given us.
   */
  async prepareImage(imagePath) {
    const maxEdge = config.verification.maxImageEdge;

    try {
      const buffer = await sharp(imagePath)
        .rotate()                       // honour EXIF orientation
        .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      return { data: buffer.toString('base64'), mediaType: 'image/jpeg' };
    } catch (error) {
      // A file sharp cannot decode is not one a vision model will read either.
      throw new Error(`Unreadable image ${path.basename(imagePath)}: ${error.message}`);
    }
  }

  /** Kept for callers that only need the bytes. */
  async imageToBase64(imagePath) {
    return (await this.prepareImage(imagePath)).data;
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

    /**
     * Verification runs concurrently. Each image is an independent round-trip
     * to a vision API, and running them one at a time made verification the
     * longest phase of a job by a wide margin. mapLimit preserves order, so
     * the accepted set stays in quality-ranked sequence.
     */
    const verifications = await mapLimit(
      images,
      config.verification.concurrency,
      async (image) => {
        try {
          return await this.verifyImage(image.filepath, context);
        } catch (error) {
          return {
            result: this.verificationResults.VERIFICATION_FAILED,
            service: 'none',
            cost: 0,
            confidence: 0,
            error: error.message
          };
        }
      }
    );

    images.forEach((image, index) => {
      const verification = verifications[index];

      results.totalCost += verification.cost || 0;
      results.serviceUsage[verification.service] = (results.serviceUsage[verification.service] || 0) + 1;
      results.verdictCounts[verification.result] = (results.verdictCounts[verification.result] || 0) + 1;

      if (verification.result === this.acceptOnly) {
        results.valid.push({ ...image, verification });
      } else {
        results.invalid.push({ ...image, verification, reason: verification.result });
      }
    });

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
        model: config.models.vision,
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
          model: config.models.vision,
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
