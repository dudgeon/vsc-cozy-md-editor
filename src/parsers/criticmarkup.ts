/**
 * Regex-based parser for CriticMarkup syntax.
 * Handles: additions {++ ++}, deletions {-- --}, substitutions {~~ ~> ~~},
 * comments {>> <<}, highlights {== ==}
 * Reference: https://criticmarkup.com/spec.php
 */

export interface CriticMarkupRange {
    type: 'addition' | 'deletion' | 'substitution' | 'comment' | 'highlight';
    fullMatch: string;
    start: number;
    end: number;
    content: string;
    /** For substitutions: the old text */
    oldText?: string;
    /** For substitutions: the new text */
    newText?: string;
}

export function parseCriticMarkup(text: string): CriticMarkupRange[] {
    // TODO: Implement regex-based parser
    return [];
}
