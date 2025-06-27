const logger = require('../../utils/logger');

class TitleValidation {
  
  /**
   * CRITICAL FIX: Validate extracted title from Google results - MUCH MORE RESTRICTIVE
   * This prevents garbage titles like "in Aqua Teen Hunger Force" and "Cartoon Network's animated"
   */
  static isValidExtractedTitle(title, celebrityName) {
    if (!title || title.length < 3 || title.length > 50) return false;
    
    // Filter out partial phrases and prepositions - THE CORE FIX
    const invalidPrefixes = ['in ', 'on ', 'of ', 'the ', 'a ', 'an ', 'and ', 'or '];
    const invalidSuffixes = ["'s animated", "'s ", " animated", " show", " series"];
    const titleLower = title.toLowerCase();
    
    // Reject if starts with preposition - PREVENTS "in Aqua Teen Hunger Force"
    if (invalidPrefixes.some(prefix => titleLower.startsWith(prefix))) return false;
    
    // Reject if ends with generic terms - PREVENTS "Cartoon Network's animated"
    if (invalidSuffixes.some(suffix => titleLower.endsWith(suffix))) return false;
    
    // FIXED: Allow single substantial words for show names
    const words = title.split(/\s+/).filter(word => word.length > 2);
    if (words.length < 1) { // Changed from < 2 to < 1
      logger.info(`🚫 Rejected empty title: "${title}"`);
      return false;
    }
    
    // Additional check: Single words should be substantial (4+ characters for show names)
    if (words.length === 1 && words[0].length < 4) {
      logger.info(`🚫 Rejected short single word: "${title}" (${words[0].length} characters)`);
      return false;
    }
    
    // Filter out common non-title words
    const excludeWords = [
      'actor', 'actress', 'voice', 'character', 'role', 'cast', 'starring',
      'movie', 'film', 'show', 'series', 'television', 'tv', 'episode',
      'season', 'year', 'years', 'career', 'work', 'performance', 'latest',
      'news', 'interview', 'photos', 'images', 'biography', 'wikipedia',
      'animated', 'cartoon', 'network'
    ];
    
    // Don't include if it's just an excluded word
    if (excludeWords.includes(titleLower)) return false;
    
    // Don't include if it contains the actor's name (likely a bio page)
    if (titleLower.includes(celebrityName.toLowerCase())) return false;
    
    // Must contain at least one letter and be substantial
    if (!/[a-zA-Z]/.test(title) || title.trim().length < 4) return false;
    
    // Must not be just generic phrases - ADDITIONAL PROTECTION
    const genericPhrases = [
      'cartoon network', 'adult swim', 'comedy central', 'animated series',
      'voice actor', 'voice acting', 'television series', 'tv show'
    ];
    if (genericPhrases.includes(titleLower)) return false;
    
    return true;
  }

  /**
   * Check if extracted text is likely a valid title
   * Used for general title validation (less strict than isValidExtractedTitle)
   */
  static isValidTitle(title) {
    if (!title || title.length < 3) return false;
    
    // Filter out common non-title words (but be careful with partial matches)
    const excludeWords = [
      'actor', 'actress', 'director', 'producer', 'writer', 'comedian', 'singer',
      'musician', 'artist', 'celebrity', 'performer', 'character',
      'role', 'roles', 'performance', 'performances', 'portrayal', 'work',
      'career', 'american', 'british', 'canadian', 'english', 'film', 'movie',
      'television', 'tv', 'show', 'series', 'franchise'
    ];
    
    const titleLower = title.toLowerCase();
    
    // Only filter if the title is EXACTLY one of these words, or ends with " [word]"
    // This protects "Star Trek" and "Star Wars" which START with "star"
    return !excludeWords.some(word => {
      return titleLower === word || 
             (titleLower.endsWith(' ' + word) && titleLower !== 'star trek' && titleLower !== 'star wars');
    });
  }

  /**
   * Extract title names from "known for" text
   * Used by Wikipedia service for parsing "known for" sections
   */
  static extractTitlesFromText(text) {
    const titles = [];
    
    // Handle specific patterns we know work for common cases
    if (text.toLowerCase().includes('star trek')) {
      titles.push('Star Trek');
    }
    
    // Look for patterns like "Character in Title" or "Title"
    const titlePatterns = [
      // "James T. Kirk in the Star Trek franchise" -> "Star Trek"
      /\bin\s+(?:the\s+)?([A-Z][^,.\n]*?)(?:\s+franchise|\s+series|\s*,|\.|$)/gi,
      // General title extraction
      /\b([A-Z][a-zA-Z\s:'-]{2,25}?)(?:\s+franchise|\s+series|\s+and|\s*,|\.|$)/gi
    ];
    
    for (const pattern of titlePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let title = match[1].trim();
        
        // Clean up the extracted title
        title = title.replace(/^(the|a|an)\s+/i, '');
        title = title.replace(/\s+(and|or|,).*$/i, '');
        title = title.trim();
        
        // Filter out obvious non-titles
        if (this.isValidTitle(title)) {
          titles.push(title);
        }
      }
    }
    
    return titles;
  }

  /**
   * Clean up title by removing common prefixes and suffixes
   */
  static cleanTitle(title) {
    if (!title) return '';
    
    return title
      .replace(/^(the|a|an)\s+/i, '')
      .replace(/\s+(and|or|,).*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if a title contains obvious non-content indicators
   */
  static hasContentRedFlags(title) {
    if (!title) return false;
    
    const redFlags = [
      'comic con', 'convention', 'podcast', 'interview', 'behind the scenes',
      'vhs', 'dvd', 'blu ray', 'box art', 'vs', 'versus', 'meme', 'parody',
      'fanart', 'fan art', 'drawing', 'sketch', 'artwork'
    ];
    
    const titleLower = title.toLowerCase();
    return redFlags.some(flag => titleLower.includes(flag));
  }
}

module.exports = TitleValidation;
