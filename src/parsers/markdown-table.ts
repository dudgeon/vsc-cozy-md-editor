/**
 * Parse and serialize markdown tables.
 * Handles alignment markers (:---, :---:, ---:).
 * Uses markdown-it for table boundary detection.
 */

export interface TableCell {
    content: string;
    alignment: 'left' | 'center' | 'right' | 'none';
}

export interface MarkdownTable {
    headers: TableCell[];
    rows: TableCell[][];
    startLine: number;
    endLine: number;
}

export function parseTable(text: string, startLine: number): MarkdownTable | null {
    // TODO: Implement
    return null;
}

export function serializeTable(table: MarkdownTable): string {
    // TODO: Implement with column alignment
    return '';
}
