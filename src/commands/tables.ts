import * as vscode from 'vscode';
import { parseTable, serializeTable, MarkdownTable, TableCell } from '../parsers/markdown-table';

/**
 * Table structure operations: insert, add/delete rows/columns, alignment.
 * All operations preserve column alignment markers (CLAUDE.md constraint).
 */

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Find the table surrounding the given line number in the document.
 * Scans up and down from the cursor line to find contiguous lines containing `|`.
 * Returns the parsed MarkdownTable or null if the cursor is not inside a table.
 */
function findTableAtCursor(
    document: vscode.TextDocument,
    cursorLine: number
): MarkdownTable | null {
    const lineCount = document.lineCount;

    // Check if the current line even looks like a table row
    const currentLineText = document.lineAt(cursorLine).text;
    if (!currentLineText.includes('|')) {
        return null;
    }

    // Scan upward to find the first line of the table
    let startLine = cursorLine;
    while (startLine > 0) {
        const prevText = document.lineAt(startLine - 1).text.trim();
        if (!prevText.includes('|') || prevText === '') {
            break;
        }
        startLine--;
    }

    // Scan downward to find the last line of the table
    let endLine = cursorLine;
    while (endLine < lineCount - 1) {
        const nextText = document.lineAt(endLine + 1).text.trim();
        if (!nextText.includes('|') || nextText === '') {
            break;
        }
        endLine++;
    }

    // Extract the text block and parse it
    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
        lines.push(document.lineAt(i).text);
    }
    const text = lines.join('\n');
    return parseTable(text, startLine);
}

/**
 * Determine which row/column the cursor occupies within a parsed table.
 * Row index: -1 = header, 0+ = data rows. Column index derived from pipe positions.
 */
function getCursorPosition(
    document: vscode.TextDocument,
    table: MarkdownTable,
    cursorLine: number,
    cursorChar: number
): { rowIndex: number; colIndex: number } {
    // rowIndex: -1 for header, -2 for separator, 0+ for data rows
    let rowIndex: number;
    if (cursorLine === table.startLine) {
        rowIndex = -1; // header
    } else if (cursorLine === table.startLine + 1) {
        rowIndex = -2; // separator — treat as row 0 for operations
    } else {
        rowIndex = cursorLine - table.startLine - 2;
    }

    // Determine column by counting pipes before the cursor character
    const lineText = document.lineAt(cursorLine).text;
    let colIndex = -1; // before first pipe
    for (let i = 0; i < cursorChar && i < lineText.length; i++) {
        if (lineText[i] === '|') {
            colIndex++;
        }
    }
    // Clamp to valid column range
    colIndex = Math.max(0, Math.min(colIndex, table.headers.length - 1));

    // Clamp rowIndex for data rows
    if (rowIndex === -2) {
        rowIndex = 0;
    }
    if (rowIndex >= 0) {
        rowIndex = Math.min(rowIndex, table.rows.length - 1);
    }

    return { rowIndex, colIndex };
}

/**
 * Replace the table region in the editor with the serialized (modified) table.
 */
async function replaceTable(
    editor: vscode.TextEditor,
    table: MarkdownTable,
    modified: MarkdownTable
): Promise<void> {
    const startPos = new vscode.Position(table.startLine, 0);
    const endPos = new vscode.Position(
        table.endLine,
        editor.document.lineAt(table.endLine).text.length
    );
    const range = new vscode.Range(startPos, endPos);
    const newText = serializeTable(modified);

    await editor.edit(editBuilder => {
        editBuilder.replace(range, newText);
    });
}

/**
 * Create a default empty table with the given dimensions.
 * Reads column/row counts from workspace configuration.
 */
function createDefaultTable(cols: number, rows: number, startLine: number): MarkdownTable {
    const headers: TableCell[] = [];
    for (let c = 0; c < cols; c++) {
        headers.push({ content: `Column ${c + 1}`, alignment: 'none' });
    }

    const tableRows: TableCell[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: TableCell[] = [];
        for (let c = 0; c < cols; c++) {
            row.push({ content: '', alignment: 'none' });
        }
        tableRows.push(row);
    }

    return {
        headers,
        rows: tableRows,
        startLine,
        endLine: startLine + 1 + rows, // header + separator + data rows
    };
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

// ── Table Operations ─────────────────────────────────────────────────────

function insertRowAbove(table: MarkdownTable, rowIndex: number): MarkdownTable {
    const modified = cloneTable(table);
    const emptyRow: TableCell[] = modified.headers.map(h => ({
        content: '',
        alignment: h.alignment,
    }));

    if (rowIndex < 0) {
        // Cursor is on header — insert a new row at the very top of data rows
        modified.rows.splice(0, 0, emptyRow);
    } else {
        modified.rows.splice(rowIndex, 0, emptyRow);
    }
    modified.endLine++;
    return modified;
}

function insertRowBelow(table: MarkdownTable, rowIndex: number): MarkdownTable {
    const modified = cloneTable(table);
    const emptyRow: TableCell[] = modified.headers.map(h => ({
        content: '',
        alignment: h.alignment,
    }));

    if (rowIndex < 0) {
        // Cursor is on header — insert at start of data rows
        modified.rows.splice(0, 0, emptyRow);
    } else {
        modified.rows.splice(rowIndex + 1, 0, emptyRow);
    }
    modified.endLine++;
    return modified;
}

function deleteRow(table: MarkdownTable, rowIndex: number): MarkdownTable | null {
    if (rowIndex < 0) {
        // Cannot delete the header row
        return null;
    }
    if (table.rows.length === 0) {
        return null;
    }
    const modified = cloneTable(table);
    const clampedIndex = Math.min(rowIndex, modified.rows.length - 1);
    modified.rows.splice(clampedIndex, 1);
    modified.endLine--;
    return modified;
}

function addColumnLeft(table: MarkdownTable, colIndex: number): MarkdownTable {
    const modified = cloneTable(table);
    const newHeader: TableCell = { content: '', alignment: 'none' };
    modified.headers.splice(colIndex, 0, newHeader);
    for (const row of modified.rows) {
        row.splice(colIndex, 0, { content: '', alignment: 'none' });
    }
    return modified;
}

function addColumnRight(table: MarkdownTable, colIndex: number): MarkdownTable {
    const modified = cloneTable(table);
    const newHeader: TableCell = { content: '', alignment: 'none' };
    modified.headers.splice(colIndex + 1, 0, newHeader);
    for (const row of modified.rows) {
        row.splice(colIndex + 1, 0, { content: '', alignment: 'none' });
    }
    return modified;
}

function deleteColumn(table: MarkdownTable, colIndex: number): MarkdownTable | null {
    if (table.headers.length <= 1) {
        // Cannot delete the last column
        return null;
    }
    const modified = cloneTable(table);
    modified.headers.splice(colIndex, 1);
    for (const row of modified.rows) {
        if (colIndex < row.length) {
            row.splice(colIndex, 1);
        }
    }
    return modified;
}

function setColumnAlignment(
    table: MarkdownTable,
    colIndex: number,
    alignment: 'left' | 'center' | 'right'
): MarkdownTable {
    const modified = cloneTable(table);
    modified.headers[colIndex].alignment = alignment;
    for (const row of modified.rows) {
        if (colIndex < row.length) {
            row[colIndex].alignment = alignment;
        }
    }
    return modified;
}

// ── Command Registration ─────────────────────────────────────────────────

interface TableQuickPickItem extends vscode.QuickPickItem {
    action: string;
}

export function registerTableCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.tableMenu',
            async (editor: vscode.TextEditor) => {
                const document = editor.document;
                const cursorLine = editor.selection.active.line;
                const cursorChar = editor.selection.active.character;

                const table = findTableAtCursor(document, cursorLine);

                // Build menu items based on context
                const items: TableQuickPickItem[] = [];

                if (table) {
                    // Cursor is inside a table — show full menu
                    items.push(
                        { label: '$(add) Insert Table', description: 'Insert a new table at cursor', action: 'insert' },
                        { label: '$(arrow-up) Add Row Above', description: 'Insert empty row above cursor', action: 'addRowAbove' },
                        { label: '$(arrow-down) Add Row Below', description: 'Insert empty row below cursor', action: 'addRowBelow' },
                        { label: '$(arrow-left) Add Column Left', description: 'Insert column to the left', action: 'addColumnLeft' },
                        { label: '$(arrow-right) Add Column Right', description: 'Insert column to the right', action: 'addColumnRight' },
                        { label: '$(trash) Delete Row', description: 'Remove the current row', action: 'deleteRow' },
                        { label: '$(trash) Delete Column', description: 'Remove the current column', action: 'deleteColumn' },
                        { label: '$(text-size) Align Left', description: 'Left-align current column', action: 'alignLeft' },
                        { label: '$(text-size) Align Center', description: 'Center-align current column', action: 'alignCenter' },
                        { label: '$(text-size) Align Right', description: 'Right-align current column', action: 'alignRight' },
                    );
                } else {
                    // Cursor is not in a table — only offer insert
                    items.push(
                        { label: '$(add) Insert Table', description: 'Insert a new table at cursor', action: 'insert' },
                    );
                }

                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: table ? 'Table operation…' : 'Insert a table',
                });

                if (!picked) {
                    return;
                }

                // Handle the "Insert Table" action (works regardless of context)
                if (picked.action === 'insert') {
                    const config = vscode.workspace.getConfiguration('cozyMd.tables');
                    const cols = config.get<number>('defaultColumns', 3);
                    const rows = config.get<number>('defaultRows', 3);

                    const insertLine = cursorLine;
                    const newTable = createDefaultTable(cols, rows, insertLine);
                    const tableText = serializeTable(newTable);

                    // Insert at the beginning of the current line with surrounding blank lines
                    const position = new vscode.Position(insertLine, 0);
                    await editor.edit(editBuilder => {
                        const prefix = insertLine > 0 ? '\n' : '';
                        editBuilder.insert(position, prefix + tableText + '\n');
                    });
                    return;
                }

                // All remaining actions require a table context
                if (!table) {
                    return;
                }

                const { rowIndex, colIndex } = getCursorPosition(
                    document,
                    table,
                    cursorLine,
                    cursorChar
                );

                let modified: MarkdownTable | null = null;

                switch (picked.action) {
                    case 'addRowAbove':
                        modified = insertRowAbove(table, rowIndex);
                        break;

                    case 'addRowBelow':
                        modified = insertRowBelow(table, rowIndex);
                        break;

                    case 'deleteRow':
                        modified = deleteRow(table, rowIndex);
                        if (modified === null) {
                            vscode.window.showWarningMessage(
                                rowIndex < 0
                                    ? 'Cannot delete the header row.'
                                    : 'No data rows to delete.'
                            );
                            return;
                        }
                        break;

                    case 'addColumnLeft':
                        modified = addColumnLeft(table, colIndex);
                        break;

                    case 'addColumnRight':
                        modified = addColumnRight(table, colIndex);
                        break;

                    case 'deleteColumn':
                        modified = deleteColumn(table, colIndex);
                        if (modified === null) {
                            vscode.window.showWarningMessage('Cannot delete the last column.');
                            return;
                        }
                        break;

                    case 'alignLeft':
                        modified = setColumnAlignment(table, colIndex, 'left');
                        break;

                    case 'alignCenter':
                        modified = setColumnAlignment(table, colIndex, 'center');
                        break;

                    case 'alignRight':
                        modified = setColumnAlignment(table, colIndex, 'right');
                        break;

                    default:
                        return;
                }

                if (modified) {
                    await replaceTable(editor, table, modified);
                }
            }
        )
    );
}
