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
    if (!text) {
        return [];
    }

    const results: CriticMarkupRange[] = [];

    // Combined regex matching all five CriticMarkup types.
    // Uses non-greedy quantifiers to handle multiple marks in one string.
    // Order within alternation doesn't matter — matches are sorted by position.
    const pattern =
        /\{\+\+([\s\S]*?)\+\+\}|\{--([\s\S]*?)--\}|\{~~([\s\S]*?)~>([\s\S]*?)~~\}|\{>>([\s\S]*?)<<\}|\{==([\s\S]*?)==\}/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        const fullMatch = match[0];
        const start = match.index;
        const end = start + fullMatch.length;

        if (match[1] !== undefined) {
            // Addition: {++ text ++}
            results.push({
                type: 'addition',
                fullMatch,
                start,
                end,
                content: match[1],
            });
        } else if (match[2] !== undefined) {
            // Deletion: {-- text --}
            results.push({
                type: 'deletion',
                fullMatch,
                start,
                end,
                content: match[2],
            });
        } else if (match[3] !== undefined) {
            // Substitution: {~~ old ~> new ~~}
            results.push({
                type: 'substitution',
                fullMatch,
                start,
                end,
                content: match[3] + '~>' + match[4],
                oldText: match[3],
                newText: match[4],
            });
        } else if (match[5] !== undefined) {
            // Comment: {>> text <<}
            results.push({
                type: 'comment',
                fullMatch,
                start,
                end,
                content: match[5],
            });
        } else if (match[6] !== undefined) {
            // Highlight: {== text ==}
            results.push({
                type: 'highlight',
                fullMatch,
                start,
                end,
                content: match[6],
            });
        }
    }

    return results;
}
