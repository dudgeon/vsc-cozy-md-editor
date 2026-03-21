/**
 * Parse and serialize YAML frontmatter.
 * Reads both code fence (```) and triple-dash (---) delimiters.
 * Always writes code fence delimiters (Google Docs compatibility).
 */

export interface FrontmatterResult {
    data: Record<string, unknown>;
    rawYaml: string;
    startLine: number;
    endLine: number;
    delimiter: 'codefence' | 'dashes';
}

export function parseFrontmatter(text: string): FrontmatterResult | null {
    // TODO: Implement - must handle both delimiter formats
    return null;
}

export function serializeFrontmatter(data: Record<string, unknown>): string {
    // TODO: Always write with code fence delimiters
    return '';
}
