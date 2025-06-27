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
   * EXPERIMENTAL: Fetch from BehindTheVoiceActors.com for voice actor roles
   */
  static async fetchFromBehindTheVoiceActors(celebrityName) {
    try {
      logger.info('🎤 Attempting BehindTheVoiceActors.com lookup...');
      
      // Create URL-friendly name
      const urlName = celebrityName.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      
      const btvaUrl = `https://www.behindthevoiceactors.com/voice-actors/${urlName}/`;
      
      const response = await axios.get(btvaUrl, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      const roles = [];
      
      // Look for voice acting credits
      $('.voice-acting table tr').each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const character = $(cells[0]).text().trim();
          const show = $(cells[1]).text().trim();
          
          if (character && show && character !== 'Character' && show !== 'Show/Movie') {
            const roleTitle = `${show}: ${character}`;
            if (roleTitle.length > 5 && roleTitle.length < 100) {
              roles.push(roleTitle);
            }
          }
        }
      });
      
      // Also check for popular roles section
      $('.popular-roles .role').each((i, elem) => {
        const roleText = $(elem).text().trim();
        if (roleText && roleText.length > 3 && roleText.length < 100) {
          roles.push(roleText);
        }
      });
      
      const uniqueRoles = [...new Set(roles)].slice(0, 8); // Top 8 voice roles
      
      if (uniqueRoles.length > 0) {
        logger.info(`🎤 BehindTheVoiceActors found ${uniqueRoles.length} roles: ${uniqueRoles.slice(0, 3).join(', ')}`);
      } else {
        logger.info('🎤 BehindTheVoiceActors: No roles found');
      }
      
      return uniqueRoles;
      
    } catch (error) {
      logger.info(`🎤 BehindTheVoiceActors lookup failed: ${error.message}`);
      return []; // Fail silently, this is experimental
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
