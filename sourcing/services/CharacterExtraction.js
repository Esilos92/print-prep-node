const TitleValidation = require('./TitleValidation');

class CharacterExtraction {

  /**
   * ENHANCED CHARACTER EXTRACTION: Multiple patterns for better character discovery
   */
  static extractCharacterFromSnippet(text, actorName, projectName) {
    const actorLower = actorName.toLowerCase();
    const projectLower = projectName.toLowerCase();
    const characters = [];
    
    // Enhanced patterns for character extraction
    const characterPatterns = [
      // "John Doe voices CHARACTER in Project"
      new RegExp(`${actorLower}\\s+(?:voices?|plays?)\\s+([A-Z][A-Za-z\\s]+?)\\s+(?:in|on)\\s+${projectLower}`, 'gi'),
      // "CHARACTER (voiced by John Doe)"
      new RegExp(`([A-Z][A-Za-z\\s]+?)\\s*\\((?:voiced|played)\\s+by\\s+${actorLower}\\)`, 'gi'),
      // "John Doe as CHARACTER"
      new RegExp(`${actorLower}\\s+as\\s+([A-Z][A-Za-z\\s]+?)(?:\\s*[,.]|$)`, 'gi'),
      // "CHARACTER - John Doe" 
      new RegExp(`([A-Z][A-Za-z\\s]+?)\\s*-\\s*${actorLower}`, 'gi'),
      // "voice of CHARACTER"
      new RegExp(`voice\\s+of\\s+([A-Z][A-Za-z\\s]+?)(?:\\s*[,.]|$)`, 'gi'),
      // "CHARACTER voiced by John Doe"
      new RegExp(`([A-Z][A-Za-z\\s]+?)\\s+voiced\\s+by\\s+${actorLower}`, 'gi'),
      // "plays CHARACTER"
      new RegExp(`plays\\s+([A-Z][A-Za-z\\s]+?)(?:\\s*[,.]|$)`, 'gi'),
      // Project-specific patterns for common shows
      new RegExp(`${projectLower}[^.]*?([A-Z][A-Za-z\\s]+?)\\s*\\(${actorLower}\\)`, 'gi'),
      // "CHARACTER character"
      new RegExp(`([A-Z][A-Za-z\\s]+?)\\s+character`, 'gi')
    ];
    
    for (const pattern of characterPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          let character = match[1].trim();
          
          // Clean up the character name
          character = character.replace(/\s+(voice|actor|character|voiced|plays?)$/gi, '');
          character = character.replace(/^(the|a|an)\s+/gi, '');
          character = character.replace(/\s+(and|or|,).*$/gi, '');
          character = character.trim();
          
          // Validate character name
          if (this.isValidCharacterName(character, actorName, projectName)) {
            characters.push(character);
          }
        }
      }
    }
    
    return characters;
  }

  /**
   * VALIDATE CHARACTER NAMES: Filter out false character extractions
   */
  static isValidCharacterName(character, actorName, projectName) {
    if (!character || character.length < 2 || character.length > 25) return false;
    
    const charLower = character.toLowerCase();
    const actorLower = actorName.toLowerCase();
    const projectLower = projectName.toLowerCase();
    
    // Don't include if it's the actor's name
    if (charLower.includes(actorLower) || actorLower.includes(charLower)) return false;
    
    // Don't include if it's the project name
    if (charLower.includes(projectLower) || projectLower.includes(charLower)) return false;
    
    // Filter out common non-character words
    const invalidCharacterWords = [
      'voice', 'actor', 'actress', 'character', 'role', 'cast', 'member',
      'show', 'series', 'movie', 'film', 'episode', 'season', 'network',
      'animation', 'animated', 'cartoon', 'adult', 'swim', 'comedy', 'central',
      'television', 'starring', 'featuring', 'guest', 'recurring', 'main'
    ];
    
    if (invalidCharacterWords.includes(charLower)) return false;
    
    // Must contain actual letters
    if (!/[A-Za-z]/.test(character)) return false;
    
    // Character names should be mostly alphabetic
    const alphaRatio = (character.match(/[A-Za-z]/g) || []).length / character.length;
    if (alphaRatio < 0.6) return false;
    
    return true;
  }

  /**
   * Extract character name from a role title using various patterns
   */
  static extractCharacterFromTitle(title, actorName) {
    if (!title) return null;
    
    // Patterns for extracting character names from titles
    const patterns = [
      // "Show: Character Name"
      /:([^,\n\(]+?)(?:\s*,|\s*\(|$)/,
      // "Character Name (Voice)"
      /^([^,\n\(]+?)\s*\(voice\)/i,
      // "Voice of Character Name"
      /voice\s+of\s+([^,\n\(]+?)(?:\s*,|\s*\(|$)/i,
      // "as Character Name"
      /\bas\s+([^,\n\(]+?)(?:\s*,|\s*\(|$)/i,
      // "Character Name - Show"
      /^([^,\n\-]+?)\s*-\s*/
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        let character = match[1].trim();
        
        // Clean up
        character = character.replace(/\s+(voice|actor|character)$/i, '');
        character = character.replace(/^(the|a|an)\s+/i, '');
        
        // Validate
        if (this.isValidCharacterName(character, actorName, title)) {
          return character;
        }
      }
    }
    
    return null;
  }

  /**
   * Clean and normalize character names
   */
  static cleanCharacterName(character) {
    if (!character) return '';
    
    return character
      .replace(/\s+(voice|actor|character|voiced|plays?)$/gi, '')
      .replace(/^(the|a|an)\s+/gi, '')
      .replace(/\s+(and|or|,).*$/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if a string looks like a character name vs other content
   */
  static looksLikeCharacterName(text) {
    if (!text || text.length < 2 || text.length > 30) return false;
    
    // Should start with capital letter
    if (text[0] !== text[0].toUpperCase()) return false;
    
    // Should be mostly letters and spaces
    const letterRatio = (text.match(/[A-Za-z\s]/g) || []).length / text.length;
    if (letterRatio < 0.8) return false;
    
    // Shouldn't contain obvious non-character indicators
    const nonCharacterWords = [
      'episode', 'season', 'series', 'movie', 'film', 'show',
      'voice', 'actor', 'actress', 'cast', 'crew', 'director'
    ];
    
    const textLower = text.toLowerCase();
    if (nonCharacterWords.some(word => textLower.includes(word))) return false;
    
    return true;
  }

  /**
   * Extract multiple character names from a comma-separated list
   */
  static extractMultipleCharacters(text, actorName, projectName) {
    if (!text) return [];
    
    // Split on common separators
    const parts = text.split(/[,&]|\band\b/).map(part => part.trim());
    const characters = [];
    
    for (const part of parts) {
      if (this.looksLikeCharacterName(part)) {
        const cleaned = this.cleanCharacterName(part);
        if (this.isValidCharacterName(cleaned, actorName, projectName)) {
          characters.push(cleaned);
        }
      }
    }
    
    return characters;
  }
}

module.exports = CharacterExtraction;
