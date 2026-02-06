/**
 * Git Conflict Resolution Utility
 * 
 * Handles detection and resolution of merge conflicts
 */

import { ConflictInfo } from './git-storage-types';

/**
 * Conflict resolution strategies
 */
export type ConflictResolutionStrategy = 'ours' | 'theirs' | 'manual';

/**
 * Conflict Resolver utility class
 */
export class ConflictResolver {
  /**
   * Parse a conflicted file to extract conflict sections
   */
  static parseConflictMarkers(content: string): ConflictInfo | null {
    const conflictPattern = /^<<<<<<< .*\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> .*$/m;
    const match = content.match(conflictPattern);

    if (!match) {
      return null;
    }

    return {
      filePath: '',
      ours: match[1],
      theirs: match[2],
    };
  }

  /**
   * Detect if content has conflict markers
   */
  static hasConflictMarkers(content: string): boolean {
    return /^<<<<<<< /m.test(content);
  }

  /**
   * Count conflict sections in content
   */
  static countConflicts(content: string): number {
    const matches = content.match(/^<<<<<<< /gm);
    return matches ? matches.length : 0;
  }

  /**
   * Resolve a conflict with 'ours' strategy (keep local version)
   */
  static resolveWithOurs(content: string): string {
    return content.replace(
      /^<<<<<<< .*\n([\s\S]*?)\n=======\n[\s\S]*?\n>>>>>>> .*$/gm,
      '$1'
    );
  }

  /**
   * Resolve a conflict with 'theirs' strategy (keep remote version)
   */
  static resolveWithTheirs(content: string): string {
    return content.replace(
      /^<<<<<<< .*\n[\s\S]*?\n=======\n([\s\S]*?)\n>>>>>>> .*$/gm,
      '$1'
    );
  }

  /**
   * Format conflict for display
   */
  static formatConflictForDisplay(conflict: ConflictInfo): string {
    return `File: ${conflict.filePath}\n\nLocal (Ours):\n${conflict.ours}\n\nRemote (Theirs):\n${conflict.theirs}`;
  }

  /**
   * Generate a 3-way merge suggestion
   * Uses simple line-by-line comparison
   */
  static suggestMerge(base: string | undefined, ours: string, theirs: string): string {
    // If both sides made the same change, use it
    if (ours === theirs) {
      return ours;
    }

    // If base is available, try to apply both changes
    if (base) {
      const baseLines = base.split('\n');
      const oursLines = ours.split('\n');
      const theirsLines = theirs.split('\n');

      // Simple heuristic: if one side added lines, include them
      if (oursLines.length > baseLines.length && theirsLines.length === baseLines.length) {
        return ours;
      }
      if (theirsLines.length > baseLines.length && oursLines.length === baseLines.length) {
        return theirs;
      }

      // If both sides modified, prefer ours (local)
      return ours;
    }

    // Without base, prefer local version
    return ours;
  }

  /**
   * Extract multiple conflicts from file content
   */
  static extractAllConflicts(content: string, filePath: string): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    const conflictRegex = /^<<<<<<< .*\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> .*$/gm;

    let match;
    while ((match = conflictRegex.exec(content)) !== null) {
      conflicts.push({
        filePath,
        ours: match[1],
        theirs: match[2],
      });
    }

    return conflicts;
  }

  /**
   * Verify that all conflicts have been resolved
   */
  static isFullyResolved(content: string): boolean {
    return !this.hasConflictMarkers(content);
  }

  /**
   * Create a conflict marker
   */
  static createConflictMarker(ours: string, theirs: string, base?: string): string {
    if (base) {
      return `<<<<<<< HEAD\n${ours}\n||||||| BASE\n${base}\n=======\n${theirs}\n>>>>>>> REMOTE`;
    }
    return `<<<<<<< HEAD\n${ours}\n=======\n${theirs}\n>>>>>>> REMOTE`;
  }
}

/**
 * Conflict detection utility
 */
export class ConflictDetector {
  /**
   * Analyze two versions to detect potential conflicts
   */
  static analyzeChanges(base: string, ours: string, theirs: string): {
    hasConflict: boolean;
    ourChanges: string[];
    theirChanges: string[];
  } {
    const baseLines = base.split('\n');
    const ourLines = ours.split('\n');
    const theirLines = theirs.split('\n');

    const ourChanges: string[] = [];
    const theirChanges: string[] = [];

    // Simple diff: compare line by line
    const maxLen = Math.max(ourLines.length, theirLines.length, baseLines.length);

    for (let i = 0; i < maxLen; i++) {
      const baseLine = baseLines[i] || '';
      const ourLine = ourLines[i] || '';
      const theirLine = theirLines[i] || '';

      if (baseLine !== ourLine) {
        ourChanges.push(ourLine);
      }

      if (baseLine !== theirLine) {
        theirChanges.push(theirLine);
      }
    }

    // Conflict exists if both sides changed the same line
    const hasConflict = ourChanges.some((line, idx) => {
      return theirChanges[idx] && theirChanges[idx] !== line;
    });

    return {
      hasConflict,
      ourChanges,
      theirChanges,
    };
  }
}

/**
 * Merge strategy utility
 */
export class MergeStrategy {
  /**
   * Apply 'recursive' merge strategy (default)
   */
  static applyRecursiveMerge(base: string, ours: string, theirs: string): string {
    const analyzer = ConflictDetector.analyzeChanges(base, ours, theirs);

    if (!analyzer.hasConflict) {
      // No conflict, try to merge changes
      const baseLines = base.split('\n');
      const ourLines = ours.split('\n');
      const theirLines = theirs.split('\n');

      // Add lines from our version
      let result = ours;

      // Add any new lines from their version that we don't have
      for (let i = ourLines.length; i < theirLines.length; i++) {
        result += '\n' + theirLines[i];
      }

      return result;
    }

    // Has conflict, keep local version
    return ours;
  }

  /**
   * Apply 'ours' merge strategy (prefer local changes)
   */
  static applyOursMerge(ours: string): string {
    return ours;
  }

  /**
   * Apply 'theirs' merge strategy (prefer remote changes)
   */
  static applyTheirsMerge(theirs: string): string {
    return theirs;
  }
}
