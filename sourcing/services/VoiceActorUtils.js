const TitleValidation = require('./TitleValidation');

class VoiceActorUtils {

  /**
   * Check if this appears to be a voice actor based on known titles
   */
  static isLikelyVoiceActor(knownForTitles) {
    if (!knownForTitles || knownForTitles.length === 0) return false;
    
    const voiceActorIndicators = [
      'adult swim', 'cartoon network', 'animated', 'voice', 'character',
      'aqua teen', 'robot chicken', 'family guy', 'simpsons', 'south park'
    ];
    
    return knownForTitles.some(title => {
      const titleLower = title.toLowerCase();
      return voiceActorIndicators.some(indicator => titleLower.includes(indicator));
    });
  }

  /**
   * GENERALIZED: Enhanced voice role detection for all voice actors
   */
  static detectVoiceRole(title, celebrityName) {
    if (!title) return false;
    
    const titleLower = title.toLowerCase();
    
    // Animation networks and studios
    const animationNetworks = [
      'adult swim', 'cartoon network', 'nickelodeon', 'disney channel', 'disney junior',
      'fox kids', 'kids wb', 'toonami', 'boomerang', 'comedy central'
    ];
    
    // Animation-specific terms
    const animationTerms = [
      'animated', 'animation', 'cartoon', 'anime', 'voice', 'voice actor',
      'voice cast', 'animated series', 'animated film', 'animated movie'
    ];
    
    // Common animated show patterns
    const animatedShowPatterns = [
      'adventures of', 'tales of', 'chronicles of', 'legend of',
      'teenage mutant', 'transformers', 'my little pony', 'pokemon',
      'dragon ball', 'naruto', 'one piece', 'attack on titan'
    ];
    
    // Production companies known for animation
    const animationStudios = [
      'pixar', 'dreamworks', 'illumination', 'blue sky', 'warner bros animation',
      'sony pictures animation', 'paramount animation', 'disney animation'
    ];
    
    // Check all categories
    const allVoiceIndicators = [
      ...animationNetworks,
      ...animationTerms,
      ...animatedShowPatterns,
      ...animationStudios
    ];
    
    return allVoiceIndicators.some(indicator => titleLower.includes(indicator));
  }

  /**
   * GENERALIZED: Extract character name for any voice role
   */
  static extractCharacterName(title, celebrityName) {
    if (!title) return 'Unknown Character';
    
    const titleLower = title.toLowerCase();
    
    // Generic character extraction patterns
    const characterExtractionPatterns = [
      // "Voice of Character in Show" -> Character
      /voice\s+of\s+([A-Z][^,\n\(]+?)(?:\s+in|\s*,|\s*\(|$)/i,
      // "Character (voice)" -> Character  
      /^([A-Z][^,\n\(]+?)\s*\(voice\)/i,
      // "Show: Character" -> Character
      /:\s*([A-Z][^,\n\(]+?)(?:\s*,|\s*\(|$)/i,
      // "Character - Show" -> Character
      /^([A-Z][^,\n\-]+?)\s*-\s*/i,
      // Look for character names in parentheses
      /\(([A-Z][^,\n\)]+?)\)/i,
      // "as Character" -> Character
      /\bas\s+([A-Z][^,\n\(]+?)(?:\s*,|\s*\(|$)/i
    ];
    
    // Try pattern-based extraction first
    for (const pattern of characterExtractionPatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        let character = match[1].trim();
        
        // Clean up common artifacts
        character = character.replace(/\s+(voice|actor|character)$/i, '');
        character = character.replace(/^(the|a|an)\s+/i, '');
        
        if (character.length > 1 && character.length < 50) {
          return character;
        }
      }
    }
    
    // Fallback: Look for capitalized words that could be character names
    const words = title.split(/\s+/);
    const potentialCharacterWords = words.filter(word => {
      // Must be capitalized and substantial
      if (word.length < 2 || word[0] !== word[0].toUpperCase()) return false;
      
      // Filter out common show-related words
      const commonWords = [
        'show', 'series', 'movie', 'film', 'animated', 'adventures',
        'tales', 'chronicles', 'legend', 'story', 'season', 'episode',
        'voice', 'actor', 'cast', 'starring', 'featuring'
      ];
      
      return !commonWords.includes(word.toLowerCase());
    });
    
    // Return first 1-2 potential character words
    if (potentialCharacterWords.length > 0) {
      return potentialCharacterWords.slice(0, 2).join(' ');
    }
    
    // Ultimate fallback: extract from title without common words
    const cleanTitle = title.replace(/\b(the|a|an|voice|of|in|as|actor|character|show|series|movie|film|animated)\b/gi, ' ')
                           .replace(/\s+/g, ' ')
                           .trim();
    
    if (cleanTitle && cleanTitle.length > 2 && cleanTitle.length < 30) {
      return cleanTitle;
    }
    
    return 'Unknown Character';
  }

  /**
   * Enhanced talk show and guest appearance detection
   */
  static isTalkShowOrGuestAppearance(title, character) {
    if (!title) return false;
    
    const titleLower = title.toLowerCase();
    const characterLower = (character || '').toLowerCase();
    
    // Talk show title patterns - be specific to avoid false positives
    const talkShowPatterns = [
      // Late night shows
      'tonight show', 'late show', 'late late show', 'late night',
      'jimmy fallon', 'jimmy kimmel', 'stephen colbert', 'craig ferguson',
      'conan', 'seth meyers', 'james corden',
      
      // Daytime shows
      'kelly clarkson show', 'ellen degeneres show', 'the ellen show',
      'oprah winfrey show', 'the view', 'the talk', 'live with kelly',
      'good morning america', 'today show', 'this morning',
      
      // Comedy/variety shows  
      'saturday night live', 'snl', 'daily show', 'real time with bill maher',
      'comedy central presents', 'last week tonight',
      
      // Award shows (but be careful - some actors host legitimately)
      'academy awards', 'golden globe awards', 'emmy awards', 'tony awards',
      'peoples choice awards', 'critics choice awards', 'sag awards',
      
      // Game shows
      'jeopardy!', 'wheel of fortune', 'family feud', 'celebrity family feud',
      'hollywood squares', 'match game',
      
      // News/interview shows  
      'anderson cooper', '60 minutes', 'dateline', '20/20'
    ];
    
    // Check if title matches talk show patterns
    const isTalkShowTitle = talkShowPatterns.some(pattern => titleLower.includes(pattern));
    
    // Guest character patterns - these indicate guest appearances
    const guestCharacters = [
      'self', 'himself', 'herself', 'guest', 'host', 'presenter', 
      'interviewee', 'panelist', 'contestant', 'themselves'
    ];
    
    // Check for exact guest character matches
    const isGuestCharacter = guestCharacters.some(guestType => {
      return characterLower === guestType || 
             characterLower === `self - ${guestType}` ||
             characterLower.includes(`(${guestType})`) ||
             characterLower.startsWith(guestType + ' ') ||
             characterLower.endsWith(' ' + guestType);
    });
    
    // Additional red flags for guest appearances
    const hasGuestIndicators = titleLower.includes('celebrity') && 
                              (titleLower.includes('special') || titleLower.includes('edition'));
    
    // White list check - make sure we don't filter actual acting roles
    const isLikelyActingRole = this.isLikelyActingRole(title, character);
    
    // Final determination
    const isFiltered = (isTalkShowTitle || isGuestCharacter || hasGuestIndicators) && !isLikelyActingRole;
    
    return isFiltered;
  }

  /**
   * Check if this is likely a legitimate acting role vs guest appearance
   */
  static isLikelyActingRole(title, character) {
    if (!title || !character) return false;
    
    const titleLower = title.toLowerCase();
    const characterLower = character.toLowerCase();
    
    // Legitimate acting roles usually have:
    // 1. Character names that aren't "self" variants
    const hasRealCharacterName = !characterLower.includes('self') && 
                                !characterLower.includes('himself') &&
                                !characterLower.includes('herself') &&
                                characterLower !== 'guest' &&
                                characterLower !== 'host';
    
    // 2. Title doesn't look like a talk show format
    const isNotTalkShowFormat = !titleLower.match(/\b(show|live|tonight|morning|today)\b/) ||
                               titleLower.includes('movie') ||
                               titleLower.includes('film') ||
                               titleLower.includes('series');
    
    // 3. Character has substance (not just single words)
    const hasSubstantialCharacter = character && character.length > 3 && 
                                  character.includes(' ') && // Multi-word character names
                                  !character.toLowerCase().includes('unknown');
    
    return hasRealCharacterName && (isNotTalkShowFormat || hasSubstantialCharacter);
  }
}

module.exports = VoiceActorUtils;
