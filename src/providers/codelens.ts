import * as vscode from 'vscode';
import { parseTable, serializeTable, MarkdownTable, TableCell } from '../parsers/markdown-table';

/**
 * CodeLens provider for Accept/Reject buttons on CriticMarkup,
 * table operations, @claude tags, and frontmatter actions.
 *
 * Table CodeLens: Shows quick-action buttons above each markdown table
 * (Align Columns, Compact, + Row, + Column, Delete Row, Delete Column).
 */

// ── Table Detection ──────────────────────────────────────────────────────

/**
 * Find the start and end lines of a table region in the document.
 * Scans up and down from the given line for contiguous lines containing `|`.
 */
function findTableRegion(
    document: vscode.TextDocument,
    line: number
): { startLine: number; endLine: number } | null {
    if (line < 0 || line >= document.lineCount) {
        return null;
    }
    if (!document.lineAt(line).text.includes('|')) {
        return null;
    }

    let startLine = line;
    while (startLine > 0) {
        const prevText = document.lineAt(startLine - 1).text.trim();
        if (!prevText.includes('|') || prevText === '') {
            break;
        }
        startLine--;
    }

    let endLine = line;
    while (endLine < document.lineCount - 1) {
        const nextText = document.lineAt(endLine + 1).text.trim();
        if (!nextText.includes('|') || nextText === '') {
            break;
        }
        endLine++;
    }

    return { startLine, endLine };
}

/**
 * Find all table regions in the document.
 * Returns an array of [startLine, endLine] pairs (inclusive).
 */
function findAllTableRegions(document: vscode.TextDocument): Array<{ startLine: number; endLine: number }> {
    const regions: Array<{ startLine: number; endLine: number }> = [];
    let i = 0;

    while (i < document.lineCount) {
        const line = document.lineAt(i).text;
        if (line.includes('|')) {
            const region = findTableRegion(document, i);
            if (region) {
                regions.push(region);
                // Skip past this region
                i = region.endLine + 1;
                continue;
            }
        }
        i++;
    }

    return regions;
}

/**
 * Find the table at cursor (same logic as tables.ts), parse and return it.
 */
function findTableAtCursor(
    document: vscode.TextDocument,
    cursorLine: number
): MarkdownTable | null {
    const region = findTableRegion(document, cursorLine);
    if (!region) {
        return null;
    }

    const lines: string[] = [];
    for (let i = region.startLine; i <= region.endLine; i++) {
        lines.push(document.lineAt(i).text);
    }
    const text = lines.join('\n');
    return parseTable(text, region.startLine);
}

/**
 * Determine which row/column the cursor occupies within a parsed table.
 */
function getCursorPosition(
    document: vscode.TextDocument,
    table: MarkdownTable,
    cursorLine: number,
    cursorChar: number
): { rowIndex: number; colIndex: number } {
    let rowIndex: number;
    if (cursorLine === table.startLine) {
        rowIndex = -1; // header
    } else if (cursorLine === table.startLine + 1) {
        rowIndex = -2; // separator
    } else {
        rowIndex = cursorLine - table.startLine - 2;
    }

    // Determine column by counting pipes before the cursor character
    const lineText = document.lineAt(cursorLine).text;
    let colIndex = -1;
    for (let i = 0; i < cursorChar && i < lineText.length; i++) {
        if (lineText[i] === '|') {
            colIndex++;
        }
    }
    colIndex = Math.max(0, Math.min(colIndex, table.headers.length - 1));

    if (rowIndex === -2) {
        rowIndex = 0;
    }
    if (rowIndex >= 0) {
        rowIndex = Math.min(rowIndex, Math.max(table.rows.length - 1, 0));
    }

    return { rowIndex, colIndex };
}

/**
 * Deep-clone a MarkdownTable so mutations don't affect the original.
 */
function cloneTable(table: MarkdownTable): MarkdownTable {
    return {
        headers: table.headers.map(h => ({ ...h })),
        rows: table.rows.map(row => row.map(cell => ({ ...cell }))),
        startLine: table.startLine,
        endLine: table.endLine,
    };
}

/**
 * Replace the table region in the editor with the serialized (modified) table text.
 */
async function replaceTableText(
    editor: vscode.TextEditor,
    table: MarkdownTable,
    newText: string
): Promise<void> {
    const startPos = new vscode.Position(table.startLine, 0);
    const endPos = new vscode.Position(
        table.endLine,
        editor.document.lineAt(table.endLine).text.length
    );
    const range = new vscode.Range(startPos, endPos);

    await editor.edit(editBuilder => {
        editBuilder.replace(range, newText);
    });
}

// ── Compact Serializer ───────────────────────────────────────────────────

/**
 * Serialize a table in compact form: trimmed cells, minimal separators.
 * Uses the smallest valid separator (`---`, `:---`, `:---:`, `---:`).
 */
function serializeCompact(table: MarkdownTable): string {
    const { headers, rows } = table;

    function buildMinimalSeparator(alignment: 'left' | 'center' | 'right' | 'none'): string {
        switch (alignment) {
            case 'left':
                return ':---';
            case 'center':
                return ':---:';
            case 'right':
                return '---:';
            case 'none':
            default:
                return '---';
        }
    }

    const headerLine = '| ' + headers.map(h => h.content.trim()).join(' | ') + ' |';
    const separatorLine = '| ' + headers.map(h => buildMinimalSeparator(h.alignment)).join(' | ') + ' |';
    const dataLines = rows.map(row => {
        const cells = headers.map((_, i) => {
            const content = i < row.length ? row[i].content.trim() : '';
            return content;
        });
        return '| ' + cells.join(' | ') + ' |';
    });

    return [headerLine, separatorLine, ...dataLines].join('\n');
}

// ── CodeLens Provider ────────────────────────────────────────────────────

export class MarkdownCraftCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    private _disposable: vscode.Disposable;

    constructor() {
        // Refresh CodeLens when the active editor changes or the cursor moves,
        // since "Delete Row" / "Delete Column" are context-sensitive.
        this._disposable = vscode.Disposable.from(
            vscode.window.onDidChangeTextEditorSelection(() => {
                this._onDidChangeCodeLenses.fire();
            }),
            vscode.workspace.onDidChangeTextDocument(() => {
                this._onDidChangeCodeLenses.fire();
            })
        );
    }

    dispose(): void {
        this._disposable.dispose();
        this._onDidChangeCodeLenses.dispose();
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (document.languageId !== 'markdown') {
            return [];
        }

        // Only show table CodeLens for the table containing the cursor
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return [];
        }
        const cursorLine = editor.selection.active.line;

        const regions = findAllTableRegions(document);

        // Find the region that contains the cursor line
        const activeRegion = regions.find(
            r => cursorLine >= r.startLine && cursorLine <= r.endLine
        );
        if (!activeRegion) {
            return [];
        }

        // Extract text and parse to validate it's a real table
        const lines: string[] = [];
        for (let i = activeRegion.startLine; i <= activeRegion.endLine; i++) {
            lines.push(document.lineAt(i).text);
        }
        const text = lines.join('\n');
        const table = parseTable(text, activeRegion.startLine);
        if (!table) {
            return [];
        }

        // Place the CodeLens on the header line of the table
        const codeLensLine = table.startLine;
        const range = new vscode.Range(codeLensLine, 0, codeLensLine, 0);

        return [
            new vscode.CodeLens(range, {
                title: 'Align Columns',
                command: 'cozyMd.alignTableColumns',
                tooltip: 'Pad cells with whitespace for fixed-width visual columns',
            }),
            new vscode.CodeLens(range, {
                title: 'Compact',
                command: 'cozyMd.compactTable',
                tooltip: 'Remove padding whitespace (trim cells, minimal separators)',
            }),
            new vscode.CodeLens(range, {
                title: '+ Row',
                command: 'cozyMd.codeLensAddRow',
                tooltip: 'Add a new row at the bottom of the table',
            }),
            new vscode.CodeLens(range, {
                title: '+ Column',
                command: 'cozyMd.codeLensAddColumn',
                tooltip: 'Add a new column at the right of the table',
            }),
            new vscode.CodeLens(range, {
                title: 'Delete Row',
                command: 'cozyMd.codeLensDeleteRow',
                tooltip: 'Delete the current row (cannot delete header)',
            }),
            new vscode.CodeLens(range, {
                title: 'Delete Column',
                command: 'cozyMd.codeLensDeleteColumn',
                tooltip: 'Delete the current column (cannot delete last column)',
            }),
        ];
    }
}

// ── Command Registration ─────────────────────────────────────────────────

/**
 * Register all table CodeLens commands.
 * These are standalone commands invoked by the CodeLens buttons above tables.
 */
export function registerTableCodeLensCommands(context: vscode.ExtensionContext): void {
    // Align Columns — parse table at cursor, serialize with full padding, replace
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.alignTableColumns',
            async (editor: vscode.TextEditor) => {
                const table = findTableAtCursor(editor.document, editor.selection.active.line);
                if (!table) {
                    vscode.window.showWarningMessage('No table found at cursor.');
                    return;
                }
                const formatted = serializeTable(table);
                await replaceTableText(editor, table, formatted);
            }
        )
    );

    // Compact — parse table at cursor, serialize with minimal padding, replace
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.compactTable',
            async (editor: vscode.TextEditor) => {
                const table = findTableAtCursor(editor.document, editor.selection.active.line);
                if (!table) {
                    vscode.window.showWarningMessage('No table found at cursor.');
                    return;
                }
                const compacted = serializeCompact(table);
                await replaceTableText(editor, table, compacted);
            }
        )
    );

    // + Row — add an empty row at the bottom of the table
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.codeLensAddRow',
            async (editor: vscode.TextEditor) => {
                const table = findTableAtCursor(editor.document, editor.selection.active.line);
                if (!table) {
                    vscode.window.showWarningMessage('No table found at cursor.');
                    return;
                }
                const modified = cloneTable(table);
                const emptyRow: TableCell[] = modified.headers.map(h => ({
                    content: '',
                    alignment: h.alignment,
                }));
                modified.rows.push(emptyRow);
                modified.endLine++;
                const newText = serializeTable(modified);
                await replaceTableText(editor, table, newText);
            }
        )
    );

    // + Column — add a column at the right of the table
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.codeLensAddColumn',
            async (editor: vscode.TextEditor) => {
                const table = findTableAtCursor(editor.document, editor.selection.active.line);
                if (!table) {
                    vscode.window.showWarningMessage('No table found at cursor.');
                    return;
                }
                const modified = cloneTable(table);
                modified.headers.push({ content: '', alignment: 'none' });
                for (const row of modified.rows) {
                    row.push({ content: '', alignment: 'none' });
                }
                const newText = serializeTable(modified);
                await replaceTableText(editor, table, newText);
            }
        )
    );

    // Delete Row — remove the current row (block header deletion)
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.codeLensDeleteRow',
            async (editor: vscode.TextEditor) => {
                const cursorLine = editor.selection.active.line;
                const cursorChar = editor.selection.active.character;
                const table = findTableAtCursor(editor.document, cursorLine);
                if (!table) {
                    vscode.window.showWarningMessage('No table found at cursor.');
                    return;
                }
                const { rowIndex } = getCursorPosition(editor.document, table, cursorLine, cursorChar);
                if (rowIndex < 0) {
                    vscode.window.showWarningMessage('Cannot delete the header row.');
                    return;
                }
                if (table.rows.length === 0) {
                    vscode.window.showWarningMessage('No data rows to delete.');
                    return;
                }
                const modified = cloneTable(table);
                const clampedIndex = Math.min(rowIndex, modified.rows.length - 1);
                modified.rows.splice(clampedIndex, 1);
                modified.endLine--;
                const newText = serializeTable(modified);
                await replaceTableText(editor, table, newText);
            }
        )
    );

    // Delete Column — remove the current column (block last-column deletion)
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.codeLensDeleteColumn',
            async (editor: vscode.TextEditor) => {
                const cursorLine = editor.selection.active.line;
                const cursorChar = editor.selection.active.character;
                const table = findTableAtCursor(editor.document, cursorLine);
                if (!table) {
                    vscode.window.showWarningMessage('No table found at cursor.');
                    return;
                }
                const { colIndex } = getCursorPosition(editor.document, table, cursorLine, cursorChar);
                if (table.headers.length <= 1) {
                    vscode.window.showWarningMessage('Cannot delete the last column.');
                    return;
                }
                const modified = cloneTable(table);
                modified.headers.splice(colIndex, 1);
                for (const row of modified.rows) {
                    if (colIndex < row.length) {
                        row.splice(colIndex, 1);
                    }
                }
                const newText = serializeTable(modified);
                await replaceTableText(editor, table, newText);
            }
        )
    );
}
