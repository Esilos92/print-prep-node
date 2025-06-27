const TitleValidation = require('./TitleValidation');
const logger = require('../../utils/logger');

class DeduplicationService {

  /**
   * IP DEDUPLICATION: Prevent multiple roles from same franchise/IP
   */
  static deduplicateByIP(roles, celebrityName) {
    const ipGroups = {};
    const standalone = [];
    
    // Group roles by IP/franchise
    for (const role of roles) {
      const ip = this.detectIP(role);
      
      if (ip) {
        if (!ipGroups[ip]) {
          ipGroups[ip] = [];
        }
        ipGroups[ip].push(role);
      } else {
        standalone.push(role);
      }
    }
    
    const deduplicatedRoles = [];
    
    // For each IP group, select the most specific/character-focused role
    for (const [ip, ipRoles] of Object.entries(ipGroups)) {
      if (ipRoles.length === 1) {
        deduplicatedRoles.push(ipRoles[0]);
        logger.info(`📺 ${ip}: Single role → ${ipRoles[0]}`);
      } else {
        // Prioritize character names over show names
        const prioritized = ipRoles.sort((a, b) => {
          const aIsCharacter = this.isCharacterName(a, ip);
          const bIsCharacter = this.isCharacterName(b, ip);
          
          if (aIsCharacter && !bIsCharacter) return -1;
          if (!aIsCharacter && bIsCharacter) return 1;
          
          // If both are characters or both are shows, prefer shorter (more specific)
          return a.length - b.length;
        });
        
        deduplicatedRoles.push(prioritized[0]);
        logger.info(`📺 ${ip}: ${ipRoles.length} roles → KEPT: ${prioritized[0]} | REMOVED: ${prioritized.slice(1).join(', ')}`);
      }
    }
    
    // Add standalone roles
    deduplicatedRoles.push(...standalone);
    
    return deduplicatedRoles;
  }

  /**
   * DETECT IP/FRANCHISE: Identify which IP/franchise a role belongs to
   * GENERIC VERSION - works for any voice actor
   */
  static detectIP(roleName) {
    if (!roleName) return null;
    
    const roleLower = roleName.toLowerCase();
    
    // Generic franchise patterns - not actor-specific
    const franchisePatterns = {
      // Animation networks (any show on these networks)
      'adult swim': this.extractShowName(roleName, 'adult swim'),
      'cartoon network': this.extractShowName(roleName, 'cartoon network'),
      'nickelodeon': this.extractShowName(roleName, 'nickelodeon'),
      'disney': this.extractShowName(roleName, 'disney'),
      
      // Major animated franchises
      'simpsons': 'The Simpsons',
      'family guy': 'Family Guy',
      'south park': 'South Park',
      'futurama': 'Futurama',
      'rick and morty': 'Rick and Morty',
      'adventure time': 'Adventure Time',
      'regular show': 'Regular Show',
      'steven universe': 'Steven Universe',
      
      // Live action franchises
      'star trek': 'Star Trek',
      'star wars': 'Star Wars',
      'marvel': 'Marvel',
      'dc comics': 'DC',
      'harry potter': 'Harry Potter',
      'lord of the rings': 'Lord of the Rings'
    };
    
    // Check for direct franchise matches
    for (const [keyword, franchise] of Object.entries(franchisePatterns)) {
      if (roleLower.includes(keyword)) {
        return typeof franchise === 'function' ? franchise : franchise;
      }
    }
    
    // Use the base franchise extraction as fallback
    const baseName = this.extractBaseFranchiseName(roleName);
    if (baseName && baseName !== 'unknown' && baseName.length > 3) {
      return this.capitalizeFirstLetter(baseName);
    }
    
    return null; // Standalone role
  }

  /**
   * Extract show name from a role with network context
   */
  static extractShowName(roleName, network) {
    // Remove the network name and extract the actual show
    const roleWithoutNetwork = roleName.toLowerCase().replace(network, '').trim();
    const words = roleWithoutNetwork.split(/\s+/).filter(w => w.length > 2);
    
    if (words.length >= 2) {
      return this.capitalizeWords(words.slice(0, 3).join(' ')); // First 3 meaningful words
    }
    
    return this.capitalizeFirstLetter(network);
  }

  /**
   * Capitalize first letter of string
   */
  static capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Capitalize each word in a string
   */
  static capitalizeWords(str) {
    if (!str) return '';
    return str.split(' ').map(word => this.capitalizeFirstLetter(word)).join(' ');
  }

  /**
   * CHECK IF ROLE NAME IS A CHARACTER: Determine if this is a character name vs show name
   * GENERIC VERSION - works for any voice actor
   */
  static isCharacterName(roleName, ip) {
    if (!roleName || !ip) return false;
    
    const roleLower = roleName.toLowerCase();
    const ipLower = ip.toLowerCase();
    
    // If the role name doesn't contain the IP name, it's likely a character
    if (!roleLower.includes(ipLower)) {
      return true;
    }
    
    // Generic character indicators (not actor-specific)
    const characterPatterns = [
      // Character name patterns
      /^[A-Z][a-z]+ [A-Z][a-z]+$/, // "First Last" pattern
      /^[A-Z][a-z]+$/, // Single name like "Bart"
      /^(Dr|Mr|Ms|Mrs|Captain|Professor) /i, // Titles
      /\b(the|a)\s+[A-Z]/i // "The Joker", "A Robot"
    ];
    
    // Check if role matches character name patterns
    const looksLikeCharacter = characterPatterns.some(pattern => 
      pattern.test(roleName.trim())
    );
    
    // If it looks like a character name and doesn't exactly match the show name
    if (looksLikeCharacter && roleLower !== ipLower) {
      return true;
    }
    
    // Check word count - character names are usually shorter than show names
    const roleWords = roleName.split(/\s+/).length;
    const ipWords = ip.split(/\s+/).length;
    
    if (roleWords < ipWords) {
      return true; // Shorter is likely a character
    }
    
    return false; // Default to show name
  }

  /**
   * Diversify roles by detecting and limiting franchise dominance
   * FIXED VERSION - Properly handles franchise vs standalone detection
   */
  static diversifyByFranchise(roles) {
    logger.info('🎯 Applying franchise diversification...');
    
    // Step 1: Detect franchises automatically
    const franchises = this.detectFranchises(roles);
    
    // Step 2: Create a set of all franchise names for filtering
    const franchiseNames = new Set(franchises.map(f => f.name));
    
    // Step 3: Select best roles from each franchise + standalone roles
    const selectedRoles = [];
    const usedRoleIds = new Set();
    
    // Add franchise roles (max 2 per franchise)
    franchises.forEach(franchise => {
      const maxFromFranchise = franchise.roles.length >= 5 ? 2 : 1; // Big franchises get 2 slots
      const selectedFromFranchise = franchise.roles.slice(0, maxFromFranchise);
      
      logger.info(`📁 ${franchise.name} franchise: Taking ${selectedFromFranchise.length}/${franchise.roles.length} roles`);
      
      selectedFromFranchise.forEach(role => {
        // Set the franchise name properly
        role.franchiseName = franchise.name;
        selectedRoles.push(role);
        usedRoleIds.add(role.name);
      });
    });
    
    // Add TRUE standalone roles (not part of any detected franchise)
    const standaloneRoles = roles.filter(role => {
      // Skip if already used
      if (usedRoleIds.has(role.name)) return false;
      
      // Check if this role belongs to any detected franchise
      const roleFranchise = this.extractBaseFranchiseName(role.name);
      const belongsToFranchise = franchiseNames.has(roleFranchise);
      
      return !belongsToFranchise;
    });
    
    // Add standalone roles to selection
    standaloneRoles.forEach(role => {
      role.franchiseName = null; // Mark as truly standalone
      selectedRoles.push(role);
    });
    
    // Sort by priority: Known for first, then by vote count
    const finalRoles = selectedRoles.sort((a, b) => {
      if (a.isKnownFor && !b.isKnownFor) return -1;
      if (!a.isKnownFor && b.isKnownFor) return 1;
      return b.vote_count - a.vote_count;
    });
    
    logger.info('🎬 Final diversified selection:');
    finalRoles.slice(0, 5).forEach((role, i) => {
      const knownForMarker = role.isKnownFor ? ' ⭐ KNOWN FOR' : '';
      const franchiseInfo = role.franchiseName ? ` [${role.franchiseName} franchise]` : ' [standalone]';
      logger.info(`  ${i + 1}. ${role.name}${franchiseInfo}${knownForMarker}`);
    });
    
    return finalRoles;
  }

  /**
   * Automatically detect franchises by grouping similar titles
   */
  static detectFranchises(roles) {
    const groups = {};
    
    // Group roles by base title
    roles.forEach(role => {
      const baseTitle = this.extractBaseFranchiseName(role.name);
      
      if (!groups[baseTitle]) {
        groups[baseTitle] = [];
      }
      
      groups[baseTitle].push({
        ...role,
        franchiseName: baseTitle
      });
    });
    
    // Identify franchises (3+ related titles)
    const franchises = Object.entries(groups)
      .filter(([name, roleGroup]) => roleGroup.length >= 3)
      .map(([name, roleGroup]) => ({
        name: name,
        roles: roleGroup.sort((a, b) => {
          // Sort by known-for first, then vote count
          if (a.isKnownFor && !b.isKnownFor) return -1;
          if (!a.isKnownFor && b.isKnownFor) return 1;
          return b.vote_count - a.vote_count;
        })
      }));
    
    if (franchises.length > 0) {
      logger.info('🔍 Detected franchises:');
      franchises.forEach(franchise => {
        logger.info(`  📁 ${franchise.name}: ${franchise.roles.length} titles`);
      });
    }
    
    return franchises;
  }

  /**
   * Extract base franchise name from a title
   */
  static extractBaseFranchiseName(title) {
    if (!title) return 'unknown';
    
    const titleLower = title.toLowerCase();
    
    // Handle special cases first for better grouping
    const specialCases = {
      'star trek': 'star trek',          // All Star Trek movies/shows
      'captain america': 'marvel',
      'iron man': 'marvel', 
      'thor': 'marvel',
      'avengers': 'marvel',
      'spider-man': 'marvel',
      'x-men': 'marvel',
      'guardians of the galaxy': 'marvel',
      'doctor strange': 'marvel',
      'black panther': 'marvel',
      'ant-man': 'marvel',
      
      'star wars': 'star wars',
      'empire strikes back': 'star wars',
      'return of the jedi': 'star wars',
      'phantom menace': 'star wars',
      'attack of the clones': 'star wars',
      'revenge of the sith': 'star wars',
      
      'fast & furious': 'fast furious',
      'fast five': 'fast furious',
      '2 fast 2 furious': 'fast furious',
      'furious': 'fast furious',
      
      'harry potter': 'harry potter',
      'fantastic beasts': 'harry potter'
    };
    
    // Check for special case matches FIRST
    for (const [pattern, franchise] of Object.entries(specialCases)) {
      if (titleLower.includes(pattern)) {
        return franchise;
      }
    }
    
    // If no special case, clean up the title and extract base name
    let baseName = titleLower
      // Remove roman numerals and numbers (II, III, IV, 2, 3, etc.)
      .replace(/\s+(ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, '')
      .replace(/\s+\d+\b/g, '')
      // Remove subtitle after colon or dash
      .split(/[:\-]/)[0]
      // Remove common subtitle indicators
      .replace(/\s+(the|a|an)\s+/g, ' ')
      .replace(/\s+(part|episode|chapter)\s*\d*/g, '')
      .trim();
    
    // Default: use the cleaned base name
    return baseName || 'unknown';
  }

  /**
   * Remove exact and partial duplicates from role list
   */
  static removeDuplicateRoles(roles) {
    const seen = new Set();
    const filtered = [];
    
    for (const role of roles) {
      const roleName = role.name || role;
      const normalizedName = roleName.toLowerCase().trim();
      
      // Check for exact duplicates
      if (seen.has(normalizedName)) {
        logger.info(`🚫 Removed exact duplicate: "${roleName}"`);
        continue;
      }
      
      // Check for partial duplicates (substring matches)
      const isPartialDuplicate = Array.from(seen).some(existingName => {
        return existingName.includes(normalizedName) || normalizedName.includes(existingName);
      });
      
      if (isPartialDuplicate) {
        logger.info(`🚫 Removed partial duplicate: "${roleName}"`);
        continue;
      }
      
      seen.add(normalizedName);
      filtered.push(role);
    }
    
    logger.info(`🔄 Deduplication: ${roles.length} → ${filtered.length} roles`);
    return filtered;
  }

  /**
   * Group roles by similarity for intelligent deduplication
   */
  static groupSimilarRoles(roles) {
    const groups = [];
    
    for (const role of roles) {
      const roleName = (role.name || role).toLowerCase();
      
      // Find existing group this role might belong to
      let foundGroup = null;
      for (const group of groups) {
        const groupName = (group[0].name || group[0]).toLowerCase();
        
        // Check for similarity (shared words, franchise indicators)
        const roleWords = roleName.split(/\s+/);
        const groupWords = groupName.split(/\s+/);
        const sharedWords = roleWords.filter(word => groupWords.includes(word));
        
        if (sharedWords.length >= Math.min(roleWords.length, groupWords.length) * 0.6) {
          foundGroup = group;
          break;
        }
      }
      
      if (foundGroup) {
        foundGroup.push(role);
      } else {
        groups.push([role]);
      }
    }
    
    return groups;
  }
}

module.exports = DeduplicationService;
