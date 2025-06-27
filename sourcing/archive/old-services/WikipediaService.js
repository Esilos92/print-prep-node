const axios = require('axios');
const cheerio = require('cheerio');
const TitleValidation = require('./TitleValidation');
const logger = require('../../utils/logger');

class WikipediaService {

  /**
   * Extract "best known for" titles from Wikipedia
   */
  static async getKnownForTitles(celebrityName) {
    try {
      const wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(celebrityName.replace(/\s+/g, '_'))}`;
      const response = await axios.get(wikipediaUrl, { timeout: 10000 });
      const $ = cheerio.load(response.data);
      
      // Get the first few paragraphs of the article
      let articleText = '';
      $('p').slice(0, 3).each((i, p) => {
        const text = $(p).text().trim();
        if (text.length > 0) {
          articleText += text + ' ';
        }
      });
      
      const knownForTitles = [];
      
      // Simpler, more flexible patterns
      const patterns = [
        // "best known for his portrayal of Character in Title"
        /(?:best known for|known for|famous for).*?(?:portrayal|role|playing).*?of\s+([^,.\n]+?)\s+in\s+(?:the\s+)?([^,.\n]+)/gi,
        // "best known for playing Character"  
        /(?:best known for|known for|famous for).*?(?:playing|portraying)\s+([^,.\n]+)/gi,
        // "best known for Title" or mentions of franchises
        /(?:best known for|known for|famous for).*?(?:his|her|their).*?([A-Z][^,.\n]*(?:franchise|series|trilogy|saga))/gi,
        // Direct title mentions after "known for"
        /(?:best known for|known for|famous for)[^.]*?([A-Z][a-zA-Z\s:'-]{3,25}?)(?:\s+franchise|\s+series|\s*,|\s*\(|\.|$)/gi
      ];
      
      for (const pattern of patterns) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(articleText)) !== null) {
          // Get all capture groups
          for (let i = 1; i < match.length; i++) {
            if (match[i]) {
              const knownForText = match[i].trim();
              
              // Extract titles from the "known for" text
              const extractedTitles = TitleValidation.extractTitlesFromText(knownForText);
              knownForTitles.push(...extractedTitles);
              
              // Also add the raw text as a potential title
              if (TitleValidation.isValidTitle(knownForText)) {
                knownForTitles.push(knownForText);
              }
            }
          }
        }
      }
      
      // CRITICAL FIX: Filter out garbage titles using isValidExtractedTitle
      const rawTitles = [...new Set(knownForTitles)]
        .filter(title => title.length > 2 && title.length < 50);
      
      const validTitles = rawTitles.filter(title => 
        TitleValidation.isValidExtractedTitle(title, celebrityName)
      );
      
      logger.info(`📋 Wikipedia extraction: ${rawTitles.length} raw titles → ${validTitles.length} valid titles`);
      if (rawTitles.length > validTitles.length) {
        const filtered = rawTitles.filter(title => !validTitles.includes(title));
        logger.info(`🚫 Filtered out: ${filtered.join(', ')}`);
      }
      
      return validTitles.slice(0, 5); // Top 5 valid titles
      
    } catch (error) {
      logger.warn('Could not parse Wikipedia for known-for titles:', error.message);
      return [];
    }
  }

  /**
   * Enhanced Wikipedia scraping for fallback scenarios
   */
  static async fetchExpandedWikipediaRoles(celebrityName) {
    try {
      const wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(celebrityName.replace(/\s+/g, '_'))}`;
      const response = await axios.get(wikipediaUrl, { timeout: 10000 });
      const $ = cheerio.load(response.data);
      
      const roles = new Set(); // Use Set to avoid duplicates
      
      // Strategy 1: Look for filmography sections
      $('h2, h3').each((i, heading) => {
        const headingText = $(heading).text().toLowerCase();
        if (headingText.includes('filmography') || headingText.includes('voice') || 
            headingText.includes('television') || headingText.includes('film')) {
          
          // Get the next few elements after this heading
          let nextElement = $(heading).next();
          let attempts = 0;
          
          while (nextElement.length > 0 && attempts < 5) {
            if (nextElement.is('table')) {
              // Extract from tables
              nextElement.find('tr').each((j, row) => {
                const cells = $(row).find('td');
                if (cells.length >= 2) {
                  // Usually format is: Year | Title | Role
                  let title = '';
                  
                  // Try different cell positions for title
                  for (let cellIndex = 0; cellIndex < Math.min(cells.length, 3); cellIndex++) {
                    const cellText = $(cells[cellIndex]).text().trim();
                    if (cellText && cellText.length > 2 && !cellText.match(/^\d{4}$/)) {
                      title = cellText;
                      break;
                    }
                  }
                  
                  if (title && TitleValidation.isValidTitle(title)) {
                    roles.add(title);
                  }
                }
              });
              break; // Found table, stop looking
            } else if (nextElement.is('ul')) {
              // Extract from lists
              nextElement.find('li').each((j, item) => {
                const text = $(item).text().trim();
                const titleMatch = text.match(/^([^(]+)/); // Get text before first parenthesis
                if (titleMatch && TitleValidation.isValidTitle(titleMatch[1].trim())) {
                  roles.add(titleMatch[1].trim());
                }
              });
              break;
            }
            
            nextElement = nextElement.next();
            attempts++;
          }
        }
      });
      
      // Strategy 2: Look for notable works in the intro
      const firstParagraph = $('p').first().text();
      const notableWorksPattern = /(?:known for|appeared in|voiced|starred in)[^.]*?([A-Z][^,.]*?)(?:\s+and|\s*,|\s*\(|\.)/gi;
      let match;
      while ((match = notableWorksPattern.exec(firstParagraph)) !== null) {
        const potentialTitle = match[1].trim();
        if (TitleValidation.isValidTitle(potentialTitle)) {
          roles.add(potentialTitle);
        }
      }
      
      logger.info(`Found ${roles.size} roles from expanded Wikipedia search`);
      return Array.from(roles).slice(0, 10); // Return up to 10 roles
      
    } catch (error) {
      logger.warn('Expanded Wikipedia scraping failed:', error.message);
      return [];
    }
  }

  /**
   * ENHANCED: Fetch from BehindTheVoiceActors.com with better scraping
   */
  static async fetchFromBehindTheVoiceActors(celebrityName) {
    try {
      logger.info('🎤 Attempting BehindTheVoiceActors.com lookup...');
      
      // Multiple URL variations to try - FIXED CASING
      const nameVariations = [
        // BTVA uses Title-Case format: "David-Matranga"
        celebrityName.replace(/\s+/g, '-'), // Keep original case
        celebrityName.toLowerCase().replace(/\s+/g, '-'), // Our old attempt
        celebrityName.toUpperCase().replace(/\s+/g, '-'), // All caps
        celebrityName.replace(/\s+/g, '_'), // Underscores with original case
        celebrityName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, ''), // No spaces/special chars
        // Handle common name formats
        celebrityName.split(' ').map(name => name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()).join('-')
      ];
      
      for (const urlName of nameVariations) {
        const btvaUrl = `https://www.behindthevoiceactors.com/voice-actors/${urlName}/`;
        
        try {
          logger.info(`🔍 Trying BTVA URL: ${btvaUrl}`);
          
          const response = await axios.get(btvaUrl, { 
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1'
            }
          });
          
          const $ = cheerio.load(response.data);
          const roles = [];
          
          // Enhanced selectors - try multiple patterns
          const voiceActingSelectors = [
            '.voice-acting table tr',
            '.filmography table tr', 
            '.credits table tr',
            'table.voice tr',
            '.roles table tr'
          ];
          
          let foundRoles = false;
          
          for (const selector of voiceActingSelectors) {
            $(selector).each((i, row) => {
              if (i === 0) return; // Skip header
              
              const cells = $(row).find('td');
              if (cells.length >= 2) {
                const character = $(cells[0]).text().trim();
                const show = $(cells[1]).text().trim();
                
                if (character && show && 
                    character !== 'Character' && 
                    show !== 'Show/Movie' &&
                    character.length > 1 && show.length > 1) {
                  
                  const roleTitle = `${show}: ${character}`;
                  if (roleTitle.length > 5 && roleTitle.length < 100) {
                    roles.push(roleTitle);
                    foundRoles = true;
                  }
                }
              }
            });
            
            if (foundRoles) break; // Stop trying selectors if we found roles
          }
          
          // Try alternative selectors for different page layouts
          if (!foundRoles) {
            // Look for character names in different structures
            $('.character-name, .role-name, .voice-role').each((i, elem) => {
              const roleText = $(elem).text().trim();
              if (roleText && roleText.length > 3 && roleText.length < 100) {
                roles.push(roleText);
              }
            });
            
            // Look for show titles with character info
            $('.show-title, .series-title').each((i, elem) => {
              const showText = $(elem).text().trim();
              if (showText && showText.length > 3 && showText.length < 100) {
                roles.push(showText);
              }
            });
          }
          
          const uniqueRoles = [...new Set(roles)].slice(0, 10);
          
          if (uniqueRoles.length > 0) {
            logger.info(`🎤 BTVA SUCCESS: Found ${uniqueRoles.length} roles: ${uniqueRoles.slice(0, 3).join(', ')}`);
            return uniqueRoles;
          } else {
            logger.info(`🎤 BTVA: No roles found with URL ${btvaUrl}, trying next variation...`);
          }
          
        } catch (error) {
          logger.info(`🎤 BTVA URL failed: ${btvaUrl} - ${error.message}`);
          continue; // Try next URL variation
        }
        
        // Small delay between attempts
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      logger.info('🎤 BTVA: All URL variations failed');
      return [];
      
    } catch (error) {
      logger.info(`🎤 BehindTheVoiceActors lookup failed: ${error.message}`);
      return [];
    }
  }

  /**
   * NEW: Fetch from MyAnimeList for anime voice actors
   */
  static async fetchFromMyAnimeList(celebrityName) {
    try {
      logger.info('🎌 Attempting MyAnimeList lookup...');
      
      // MAL uses different URL structure - search first
      const searchName = celebrityName.replace(/\s+/g, '%20');
      const searchUrl = `https://myanimelist.net/people.php?q=${searchName}`;
      
      const searchResponse = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://myanimelist.net/'
        }
      });
      
      const $ = cheerio.load(searchResponse.data);
      const roles = [];
      
      // Look for person results and extract anime roles
      $('.people-result, .person-result').first().each((i, person) => {
        const personLink = $(person).find('a').attr('href');
        if (personLink) {
          // This would require a second request to get the person's page
          // For now, extract any anime titles from search results
          $(person).find('.anime-title, .title').each((j, title) => {
            const animeTitle = $(title).text().trim();
            if (animeTitle && animeTitle.length > 2 && animeTitle.length < 50) {
              roles.push(animeTitle);
            }
          });
        }
      });
      
      // Alternative: look for anime titles in the search results directly
      $('.anime-title, .title, .information').each((i, elem) => {
        const text = $(elem).text().trim();
        // Filter for anime-like titles
        if (text && text.length > 3 && text.length < 50 && 
            !text.toLowerCase().includes('more info')) {
          roles.push(text);
        }
      });
      
      const uniqueRoles = [...new Set(roles)].slice(0, 8);
      
      if (uniqueRoles.length > 0) {
        logger.info(`🎌 MAL found ${uniqueRoles.length} anime roles: ${uniqueRoles.slice(0, 3).join(', ')}`);
      } else {
        logger.info('🎌 MAL: No anime roles found');
      }
      
      return uniqueRoles;
      
    } catch (error) {
      logger.info(`🎌 MyAnimeList lookup failed: ${error.message}`);
      return [];
    }
  }

  /**
   * NEW: Enhanced voice actor role discovery combining multiple anime sources
   */
  static async fetchAnimeVoiceRoles(celebrityName) {
    try {
      logger.info('🎭 Fetching anime voice roles from multiple sources...');
      
      const allRoles = [];
      
      // Source 1: Enhanced BTVA
      const btvaRoles = await this.fetchFromBehindTheVoiceActors(celebrityName);
      allRoles.push(...btvaRoles);
      
      // Source 2: MyAnimeList
      const malRoles = await this.fetchFromMyAnimeList(celebrityName);
      allRoles.push(...malRoles);
      
      // Source 3: Anime News Network (simple search)
      try {
        const annRoles = await this.fetchFromAnimeNewsNetwork(celebrityName);
        allRoles.push(...annRoles);
      } catch (error) {
        logger.info('🎭 ANN lookup failed, continuing...');
      }
      
      // Deduplicate and clean
      const uniqueRoles = [...new Set(allRoles)]
        .filter(role => role && role.length > 3 && role.length < 100)
        .slice(0, 12);
      
      logger.info(`🎭 Combined anime sources: ${uniqueRoles.length} total roles`);
      return uniqueRoles;
      
    } catch (error) {
      logger.error('Enhanced anime voice role fetch failed:', error.message);
      return [];
    }
  }

  /**
   * NEW: Fetch from Anime News Network
   */
  static async fetchFromAnimeNewsNetwork(celebrityName) {
    try {
      logger.info('📰 Attempting Anime News Network lookup...');
      
      const searchName = celebrityName.replace(/\s+/g, '+');
      const annUrl = `https://www.animenewsnetwork.com/encyclopedia/search.php?searchbox=${searchName}`;
      
      const response = await axios.get(annUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      const roles = [];
      
      // Look for anime titles in search results
      $('.anime-title, .title, .result-title').each((i, elem) => {
        const title = $(elem).text().trim();
        if (title && title.length > 3 && title.length < 60) {
          roles.push(title);
        }
      });
      
      const uniqueRoles = [...new Set(roles)].slice(0, 6);
      
      if (uniqueRoles.length > 0) {
        logger.info(`📰 ANN found ${uniqueRoles.length} anime titles`);
      }
      
      return uniqueRoles;
      
    } catch (error) {
      logger.info(`📰 Anime News Network lookup failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch roles from Wikipedia (basic fallback)
   */
  static async fetchFromWikipedia(celebrityName) {
    try {
      const searchUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(celebrityName.replace(/\s+/g, '_'))}`;
      const response = await axios.get(searchUrl);
      const $ = cheerio.load(response.data);
      
      const roles = [];
      
      // Look for filmography tables or notable works
      $('table.wikitable').each((i, table) => {
        const tableText = $(table).text().toLowerCase();
        if (tableText.includes('film') || tableText.includes('television') || tableText.includes('role')) {
          $(table).find('tr').slice(1, 6).each((j, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 2) {
              const title = $(cells[0]).text().trim() || $(cells[1]).text().trim();
              if (title && title.length > 2) {
                roles.push({
                  name: title,
                  character: null,
                  year: null,
                  tags: ['wikipedia'],
                  searchTerms: [title, celebrityName]
                });
              }
            }
          });
        }
      });
      
      logger.info(`Found ${roles.length} roles from Wikipedia`);
      return roles.slice(0, 5);
      
    } catch (error) {
      logger.error('Wikipedia scraping error:', error.message);
      return [];
    }
  }

  /**
   * Extract roles from structured Wikipedia data
   */
  static extractRolesFromWikipediaTable(table, celebrityName) {
    const $ = cheerio.load(table);
    const roles = [];
    
    $('tr').each((i, row) => {
      if (i === 0) return; // Skip header row
      
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        let title = '';
        let character = '';
        let year = '';
        
        // Parse different table formats
        cells.each((j, cell) => {
          const cellText = $(cell).text().trim();
          
          if (j === 0 && cellText.match(/^\d{4}/)) {
            year = cellText;
          } else if (!title && cellText.length > 2 && !cellText.match(/^\d{4}$/)) {
            title = cellText;
          } else if (title && !character && cellText.length > 1) {
            character = cellText;
          }
        });
        
        if (title && TitleValidation.isValidTitle(title)) {
          roles.push({
            name: TitleValidation.cleanTitle(title),
            character: character || null,
            year: year ? parseInt(year) : null,
            source: 'wikipedia_table'
          });
        }
      }
    });
    
    return roles;
  }

  /**
   * Parse Wikipedia infobox for quick role extraction
   */
  static parseWikipediaInfobox(html) {
    const $ = cheerio.load(html);
    const roles = [];
    
    // Look for "Known for" field in infobox
    $('.infobox tr').each((i, row) => {
      const label = $(row).find('th').text().toLowerCase();
      if (label.includes('known for') || label.includes('notable work')) {
        const value = $(row).find('td').text().trim();
        
        // Parse comma-separated values
        const items = value.split(',').map(item => item.trim());
        items.forEach(item => {
          if (item.length > 3 && TitleValidation.isValidTitle(item)) {
            roles.push(TitleValidation.cleanTitle(item));
          }
        });
      }
    });
    
    return roles;
  }
}

module.exports = WikipediaService;
