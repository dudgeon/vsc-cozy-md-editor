/**
 * Three-way merge for markdown ↔ Google Docs.
 * Uses jsdiff for diffing, represents conflicts as CriticMarkup.
 */

export function threeWayMerge(
    base: string,
    local: string,
    remote: string
): { merged: string; hasConflicts: boolean } {
    // TODO: Implement
    return { merged: '', hasConflicts: false };
}
