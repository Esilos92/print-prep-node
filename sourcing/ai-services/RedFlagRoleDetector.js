const OpenAI = require('openai');
const axios = require('axios');

/**
 * RED FLAG EMERGENCY SYSTEM
 * Detects when AI is hallucinating roles and triggers emergency web search
 */

class RedFlagRoleDetector {
  constructor() {
    this.serpApiKey = process.env.SERP_API_KEY;
    this.hasWebSearch = !!this.serpApiKey;
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
      console.log('⚠️ OpenAI not available for red flag system');
    }
  }

  /**
   * MAIN: Detect red flags in verification results
   */
  detectRedFlags(celebrityName, verifiedRoles, rejectedRoles) {
    console.log(`🚨 Analyzing verification results for red flags...`);
    
    const redFlags = [];
    
    // Red Flag 1: Too many rejections with "Celebrity in title but not this character"
    const fakeCharacterRejections = rejectedRoles.filter(r => 
      r.rejectionReason && r.rejectionReason.includes('Celebrity in title but not this character')
    );
    
    if (fakeCharacterRejections.length >= 3) {
      redFlags.push({
        type: 'AI_HALLUCINATION',
        severity: 'HIGH',
        count: fakeCharacterRejections.length,
        description: `${fakeCharacterRejections.length} fake character names detected - AI is inventing roles`,
        trigger: 'emergency_web_search'
      });
    }

    // Red Flag 2: Too many "No search results found" (AI inventing titles)
    const noResultsRejections = rejectedRoles.filter(r => 
      r.rejectionReason && r.rejectionReason.includes('No search results found')
    );
    
    if (noResultsRejections.length >= 2) {
      redFlags.push({
        type: 'FAKE_TITLES',
        severity: 'MEDIUM',
        count: noResultsRejections.length,
        description: `${noResultsRejections.length} non-existent titles detected - AI inventing shows/movies`,
        trigger: 'emergency_web_search'
      });
    }

    // Red Flag 3: Very low success rate (< 30%)
    const totalRoles = verifiedRoles.length + rejectedRoles.length;
    const successRate = totalRoles > 0 ? (verifiedRoles.length / totalRoles) * 100 : 0;
    
    if (successRate < 30 && totalRoles >= 3) {
      redFlags.push({
        type: 'LOW_SUCCESS_RATE',
        severity: 'MEDIUM',
        successRate: Math.round(successRate),
        description: `Only ${Math.round(successRate)}% verification success rate - AI struggling with this celebrity`,
        trigger: 'emergency_web_search'
      });
    }

    // Red Flag 4: Pattern of similar fake roles (same shows with different characters)
    const titleCounts = {};
    rejectedRoles.forEach(role => {
      const title = role.title;
      titleCounts[title] = (titleCounts[title] || 0) + 1;
    });
    
    const repeatedTitles = Object.entries(titleCounts).filter(([title, count]) => count > 1);
    if (repeatedTitles.length > 0) {
      redFlags.push({
        type: 'REPEATED_FAKE_TITLES',
        severity: 'HIGH',
        repeatedTitles: repeatedTitles.map(([title, count]) => `${title} (${count}x)`),
        description: `AI repeatedly using same fake titles with different characters`,
        trigger: 'emergency_web_search'
      });
    }

    // Determine if emergency action needed
    const highSeverityFlags = redFlags.filter(flag => flag.severity === 'HIGH');
    const triggerEmergency = highSeverityFlags.length > 0 || redFlags.length >= 2;

    return {
      hasRedFlags: redFlags.length > 0,
      triggerEmergency,
      redFlags,
      celebrityName,
      analysis: {
        totalRoles,
        verifiedCount: verifiedRoles.length,
        rejectedCount: rejectedRoles.length,
        successRate: Math.round(successRate),
        fakeCharacterCount: fakeCharacterRejections.length,
        noResultsCount: noResultsRejections.length
      }
    };
  }

  /**
   * EMERGENCY: Web search for actual filmography when red flags detected
   */
  async emergencyFilmographySearch(celebrityName) {
    if (!this.hasWebSearch) {
      console.log('⚠️ Emergency web search not available - no SerpAPI key');
      return [];
    }

    try {
      console.log(`🚨 EMERGENCY: Web searching actual filmography for ${celebrityName}`);
      
      // Targeted searches for actual filmography
      const searchQueries = [
        `"${celebrityName}" filmography site:imdb.com`,
        `"${celebrityName}" movies TV shows site:imdb.com`,
        `"${celebrityName}" cast site:imdb.com`,
        `"${celebrityName}" actor credits site:wikipedia.org`,
        `"${celebrityName}" filmography site:wikipedia.org`
      ];

      const webResults = [];
      
      for (const query of searchQueries) {
        try {
          console.log(`🔍 Emergency search: ${query}`);
          const searchResult = await this.performWebSearch(query);
          
          if (searchResult.organic_results && searchResult.organic_results.length > 0) {
            webResults.push(...searchResult.organic_results);
          }
          
          // Brief pause between searches
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.log(`⚠️ Emergency search failed: ${query} - ${error.message}`);
        }
      }

      console.log(`📊 Emergency search collected ${webResults.length} web results`);
      
      // Parse web results to extract actual roles
      const actualRoles = await this.parseWebResultsForRoles(celebrityName, webResults);
      
      console.log(`✅ Emergency search extracted ${actualRoles.length} actual roles`);
      return actualRoles;

    } catch (error) {
      console.error(`❌ Emergency filmography search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Perform web search using SerpAPI
   */
  async performWebSearch(query) {
    const params = {
      api_key: this.serpApiKey,
      engine: 'google',
      q: query,
      num: 10,
      gl: 'us',
      hl: 'en'
    };

    const response = await axios.get('https://serpapi.com/search', { 
      params,
      timeout: 10000
    });

    return response.data;
  }

  /**
   * Parse web results to extract actual roles
   */
  async parseWebResultsForRoles(celebrityName, webResults) {
    if (!this.hasOpenAI) {
      return this.manualParseWebResults(webResults);
    }

    try {
      // Combine all web snippets and titles
      const webContent = webResults.map(result => {
        return `${result.title || ''} ${result.snippet || ''}`;
      }).join('\n').substring(0, 3000); // Limit content length

      const parsePrompt = `Extract the actual acting roles for "${celebrityName}" from these web search results:

${webContent}

INSTRUCTIONS:
- Only extract roles that are clearly stated in the text
- Look for character names and show/movie titles
- Include horror films, TV shows, voice acting, any acting work
- Do NOT invent or guess roles
- If a role is mentioned but character name is unclear, use "Character" as placeholder

Format as JSON array:
[
  {
    "character": "Character Name (or 'Character' if unclear)",
    "title": "Show/Movie Title",
    "medium": "live_action_movie/live_action_tv/voice_cartoon/unknown",
    "year": "YYYY (if mentioned)",
    "popularity": "low",
    "source": "web_search"
  }
]

If no clear roles found, return empty array: []`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are parsing web search results to extract factual acting roles. Only extract roles that are clearly stated in the text. Do not invent or guess."
          },
          {
            role: "user",
            content: parsePrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const response = completion.choices[0].message.content;
      const parsedRoles = this.parseJSONResponse(response);
      
      if (Array.isArray(parsedRoles) && parsedRoles.length > 0) {
        console.log(`🤖 AI parsed ${parsedRoles.length} roles from web results`);
        return parsedRoles;
      }

      return [];

    } catch (error) {
      console.log(`⚠️ AI parsing of web results failed: ${error.message}`);
      return this.manualParseWebResults(webResults);
    }
  }

  /**
   * Manual parsing of web results as fallback
   */
  manualParseWebResults(webResults) {
    const roles = [];
    
    webResults.forEach(result => {
      const text = `${result.title || ''} ${result.snippet || ''}`.toLowerCase();
      
      // Look for common patterns
      if (text.includes('terrifier') && text.includes('cast')) {
        roles.push({
          character: 'Character',
          title: 'Terrifier',
          medium: 'live_action_movie',
          year: '2016',
          popularity: 'low',
          source: 'manual_parse'
        });
      }
      
      if (text.includes('loud house') && text.includes('voice')) {
        roles.push({
          character: 'Character',
          title: 'The Loud House',
          medium: 'voice_cartoon',
          year: 'unknown',
          popularity: 'medium',
          source: 'manual_parse'
        });
      }
    });
    
    return roles;
  }

  /**
   * Parse JSON response with error handling
   */
  parseJSONResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      try {
        const jsonMatch = response.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return [];
      } catch (parseError) {
        console.log(`JSON parsing failed: ${response.substring(0, 100)}...`);
        return [];
      }
    }
  }

  /**
   * Generate red flag report
   */
  generateRedFlagReport(redFlagResult) {
    const report = {
      timestamp: new Date().toISOString(),
      celebrity: redFlagResult.celebrityName,
      redFlagsDetected: redFlagResult.hasRedFlags,
      emergencyTriggered: redFlagResult.triggerEmergency,
      analysis: redFlagResult.analysis,
      flags: redFlagResult.redFlags,
      recommendations: []
    };

    // Generate recommendations
    if (redFlagResult.hasRedFlags) {
      report.recommendations.push('AI role discovery is unreliable for this celebrity');
      
      if (redFlagResult.triggerEmergency) {
        report.recommendations.push('Emergency web search recommended');
        report.recommendations.push('Consider manual research for this celebrity');
      }
      
      redFlagResult.redFlags.forEach(flag => {
        switch (flag.type) {
          case 'AI_HALLUCINATION':
            report.recommendations.push('AI is inventing character names - switch to web-first approach');
            break;
          case 'FAKE_TITLES':
            report.recommendations.push('AI is inventing show/movie titles - verify all roles');
            break;
          case 'LOW_SUCCESS_RATE':
            report.recommendations.push('Very low success rate - celebrity may be lesser-known');
            break;
          case 'REPEATED_FAKE_TITLES':
            report.recommendations.push('AI is recycling fake titles - complete discovery failure');
            break;
        }
      });
    }

    return report;
  }
}

module.exports = RedFlagRoleDetector;
