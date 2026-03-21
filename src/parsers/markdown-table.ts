/**
 * Parse and serialize markdown tables.
 * Handles alignment markers (:---, :---:, ---:).
 * Self-contained string parsing — no markdown-it dependency.
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

/**
 * Split a table row string into individual cell contents.
 * Handles leading/trailing pipes and trims each cell.
 */
function splitRow(line: string): string[] {
    // Strip leading/trailing pipe characters
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) {
        trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith('|')) {
        trimmed = trimmed.slice(0, -1);
    }
    return trimmed.split('|').map(cell => cell.trim());
}

/**
 * Determine the alignment from a separator cell (e.g. :---, :---:, ---:, ---).
 */
function parseAlignment(separator: string): 'left' | 'center' | 'right' | 'none' {
    const s = separator.trim();
    const leftColon = s.startsWith(':');
    const rightColon = s.endsWith(':');

    if (leftColon && rightColon) {
        return 'center';
    }
    if (leftColon) {
        return 'left';
    }
    if (rightColon) {
        return 'right';
    }
    return 'none';
}

/**
 * Validate that a string is a valid separator cell (dashes with optional colons).
 */
function isValidSeparatorCell(cell: string): boolean {
    const s = cell.trim();
    return /^:?-{1,}:?$/.test(s);
}

export function parseTable(text: string, startLine: number): MarkdownTable | null {
    const lines = text.split('\n');

    // A valid table needs at least a header row and a separator row
    if (lines.length < 2) {
        return null;
    }

    // Parse header row
    const headerLine = lines[0];
    if (!headerLine.includes('|')) {
        return null;
    }
    const headerCells = splitRow(headerLine);

    // Parse separator row
    const separatorLine = lines[1];
    if (!separatorLine.includes('|')) {
        return null;
    }
    const separatorCells = splitRow(separatorLine);

    // Validate all separator cells contain valid dash patterns
    if (separatorCells.length === 0 || !separatorCells.every(isValidSeparatorCell)) {
        return null;
    }

    // Header count must match separator count
    if (headerCells.length !== separatorCells.length) {
        return null;
    }

    // Determine column alignments from the separator row
    const alignments = separatorCells.map(parseAlignment);

    // Build header TableCells
    const headers: TableCell[] = headerCells.map((content, i) => ({
        content,
        alignment: alignments[i],
    }));

    // Parse data rows (lines after header and separator)
    const rows: TableCell[][] = [];
    for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') {
            // Empty line ends the table
            break;
        }
        if (!line.includes('|')) {
            break;
        }
        const cells = splitRow(lines[i]);
        // Pad or truncate to match header count
        const row: TableCell[] = [];
        for (let j = 0; j < headers.length; j++) {
            row.push({
                content: j < cells.length ? cells[j] : '',
                alignment: alignments[j],
            });
        }
        rows.push(row);
    }

    const endLine = startLine + Math.min(2 + rows.length, lines.length) - 1;

    return {
        headers,
        rows,
        startLine,
        endLine,
    };
}

export function serializeTable(table: MarkdownTable): string {
    const { headers, rows } = table;
    const colCount = headers.length;

    // Compute the maximum width for each column (minimum 3 for separator dashes)
    const colWidths: number[] = [];
    for (let c = 0; c < colCount; c++) {
        let maxWidth = Math.max(3, headers[c].content.length);
        for (const row of rows) {
            if (c < row.length) {
                maxWidth = Math.max(maxWidth, row[c].content.length);
            }
        }
        colWidths.push(maxWidth);
    }

    /**
     * Pad a cell's content to the target width, respecting alignment.
     */
    function padCell(content: string, width: number, alignment: 'left' | 'center' | 'right' | 'none'): string {
        const padding = width - content.length;
        if (padding <= 0) {
            return content;
        }
        if (alignment === 'center') {
            const leftPad = Math.floor(padding / 2);
            const rightPad = padding - leftPad;
            return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
        }
        if (alignment === 'right') {
            return ' '.repeat(padding) + content;
        }
        // left or none: left-align
        return content + ' '.repeat(padding);
    }

    /**
     * Build the separator cell string for a column, preserving alignment markers.
     */
    function buildSeparator(width: number, alignment: 'left' | 'center' | 'right' | 'none'): string {
        switch (alignment) {
            case 'left':
                return ':' + '-'.repeat(width - 1);
            case 'center':
                return ':' + '-'.repeat(width - 2) + ':';
            case 'right':
                return '-'.repeat(width - 1) + ':';
            case 'none':
            default:
                return '-'.repeat(width);
        }
    }

    // Build header line
    const headerParts = headers.map((h, i) =>
        ' ' + padCell(h.content, colWidths[i], h.alignment) + ' '
    );
    const headerLine = '|' + headerParts.join('|') + '|';

    // Build separator line
    const separatorParts = headers.map((h, i) =>
        ' ' + buildSeparator(colWidths[i], h.alignment) + ' '
    );
    const separatorLine = '|' + separatorParts.join('|') + '|';

    // Build data rows
    const dataLines = rows.map(row => {
        const parts = headers.map((h, i) => {
            const content = i < row.length ? row[i].content : '';
            return ' ' + padCell(content, colWidths[i], h.alignment) + ' ';
        });
        return '|' + parts.join('|') + '|';
    });

    return [headerLine, separatorLine, ...dataLines].join('\n');
}
