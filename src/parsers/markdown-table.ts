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

function parseAlignment(separator: string): 'left' | 'center' | 'right' | 'none' {
    const trimmed = separator.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');

    if (left && right) { return 'center'; }
    if (left) { return 'left'; }
    if (right) { return 'right'; }
    return 'none';
}

function parseCells(line: string): string[] {
    // Remove leading/trailing pipes and split
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) { trimmed = trimmed.slice(1); }
    if (trimmed.endsWith('|')) { trimmed = trimmed.slice(0, -1); }
    return trimmed.split('|').map(c => c.trim());
}

export function parseTable(text: string, startLine: number): MarkdownTable | null {
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    if (lines.length < 2) {
        return null;
    }

    // Check that it looks like a table (has pipes)
    if (!lines[0].includes('|') || !lines[1].includes('|')) {
        return null;
    }

    // Line 1 should be separator row with dashes
    const separatorCells = parseCells(lines[1]);
    const isSeparator = separatorCells.every(c => /^:?-{3,}:?$/.test(c.trim()));
    if (!isSeparator) {
        return null;
    }

    const alignments = separatorCells.map(parseAlignment);
    const headerCells = parseCells(lines[0]);

    const headers: TableCell[] = headerCells.map((content, i) => ({
        content,
        alignment: alignments[i] || 'none',
    }));

    const rows: TableCell[][] = [];
    for (let i = 2; i < lines.length; i++) {
        const cells = parseCells(lines[i]);
        const row: TableCell[] = cells.map((content, j) => ({
            content,
            alignment: alignments[j] || 'none',
        }));
        rows.push(row);
    }

    return {
        headers,
        rows,
        startLine,
        endLine: startLine + lines.length - 1,
    };
}

export function serializeTable(table: MarkdownTable): string {
    const colCount = table.headers.length;

    // Calculate max width per column
    const widths: number[] = new Array(colCount).fill(0);
    for (let c = 0; c < colCount; c++) {
        widths[c] = Math.max(widths[c], table.headers[c].content.length);
        for (const row of table.rows) {
            if (row[c]) {
                widths[c] = Math.max(widths[c], row[c].content.length);
            }
        }
        // Minimum width of 3 for separator dashes
        widths[c] = Math.max(widths[c], 3);
    }

    function padCell(content: string, width: number): string {
        return content + ' '.repeat(width - content.length);
    }

    function makeSeparator(alignment: 'left' | 'center' | 'right' | 'none', width: number): string {
        switch (alignment) {
            case 'left':
                return ':' + '-'.repeat(width - 1);
            case 'center':
                return ':' + '-'.repeat(width - 2) + ':';
            case 'right':
                return '-'.repeat(width - 1) + ':';
            default:
                return '-'.repeat(width);
        }
    }

    // Header row
    const headerLine = '| ' + table.headers.map((h, i) =>
        padCell(h.content, widths[i])
    ).join(' | ') + ' |';

    // Separator row
    const sepLine = '| ' + table.headers.map((h, i) =>
        makeSeparator(h.alignment, widths[i])
    ).join(' | ') + ' |';

    // Data rows
    const dataLines = table.rows.map(row => {
        const cells = [];
        for (let c = 0; c < colCount; c++) {
            cells.push(padCell(row[c]?.content || '', widths[c]));
        }
        return '| ' + cells.join(' | ') + ' |';
    });

    return [headerLine, sepLine, ...dataLines].join('\n');
}
