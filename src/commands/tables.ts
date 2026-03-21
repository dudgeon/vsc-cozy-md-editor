import * as vscode from 'vscode';
import { parseTable, serializeTable, MarkdownTable, TableCell } from '../parsers/markdown-table';

/**
 * Table structure operations: insert, add/delete rows/columns, auto-align.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TableContext {
    table: MarkdownTable;
    /** The row index within the table data rows (0-based). -1 for header, -2 for separator. */
    dataRow: number;
    /** The column index the cursor is in (0-based). */
    column: number;
    /** The full range in the document occupied by the table. */
    range: vscode.Range;
}

/**
 * Scan lines around the cursor to find a contiguous table block.
 * Returns the table text, its start line, and document range — or null.
 */
function findTableAroundCursor(document: vscode.TextDocument, cursorLine: number): { text: string; startLine: number; range: vscode.Range } | null {
    // Walk upward to find the first non-table line
    let start = cursorLine;
    while (start > 0) {
        const line = document.lineAt(start - 1).text.trim();
        if (!line.includes('|')) { break; }
        start--;
    }

    // Walk downward to find the last table line
    let end = cursorLine;
    const lastLine = document.lineCount - 1;
    while (end < lastLine) {
        const line = document.lineAt(end + 1).text.trim();
        if (!line.includes('|')) { break; }
        end++;
    }

    if (start > end) { return null; }

    const lines: string[] = [];
    for (let i = start; i <= end; i++) {
        lines.push(document.lineAt(i).text);
    }
    const text = lines.join('\n');

    const range = new vscode.Range(
        new vscode.Position(start, 0),
        new vscode.Position(end, document.lineAt(end).text.length),
    );

    return { text, startLine: start, range };
}

/**
 * Determine which column the cursor is in by counting unescaped pipes
 * to the left of the cursor character offset.
 */
function getColumnAtCursor(lineText: string, charOffset: number): number {
    let col = -1; // Start at -1; first pipe moves us to column 0
    for (let i = 0; i < charOffset && i < lineText.length; i++) {
        if (lineText[i] === '|') {
            col++;
        }
    }
    return Math.max(col, 0);
}

/**
 * Get full table context for the current cursor position, or null if the
 * cursor is not inside a valid markdown table.
 */
function getTableContext(editor: vscode.TextEditor): TableContext | null {
    const document = editor.document;
    const cursorLine = editor.selection.active.line;

    const found = findTableAroundCursor(document, cursorLine);
    if (!found) { return null; }

    const table = parseTable(found.text, found.startLine);
    if (!table) { return null; }

    // Determine data row index relative to the table
    const lineInTable = cursorLine - found.startLine;
    let dataRow: number;
    if (lineInTable === 0) {
        dataRow = -1; // header row
    } else if (lineInTable === 1) {
        dataRow = -2; // separator row
    } else {
        dataRow = lineInTable - 2;
    }

    const lineText = document.lineAt(cursorLine).text;
    const column = getColumnAtCursor(lineText, editor.selection.active.character);

    return { table, dataRow, column, range: found.range };
}

/**
 * Replace the table range in the document with a newly serialized table.
 */
async function replaceTable(editor: vscode.TextEditor, range: vscode.Range, table: MarkdownTable): Promise<boolean> {
    const newText = serializeTable(table);
    return editor.edit(editBuilder => {
        editBuilder.replace(range, newText);
    });
}

/**
 * Create a default empty cell with a given alignment.
 */
function emptyCell(alignment: TableCell['alignment'] = 'none'): TableCell {
    return { content: '', alignment };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Insert a brand-new table at the cursor position.
 */
async function insertTable(editor: vscode.TextEditor): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownCraft.tables');
    const cols = config.get<number>('defaultColumns', 3);
    const rows = config.get<number>('defaultRows', 3);

    const headers: TableCell[] = [];
    for (let c = 0; c < cols; c++) {
        headers.push({ content: `Header ${c + 1}`, alignment: 'none' });
    }

    const dataRows: TableCell[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: TableCell[] = [];
        for (let c = 0; c < cols; c++) {
            row.push(emptyCell());
        }
        dataRows.push(row);
    }

    const table: MarkdownTable = {
        headers,
        rows: dataRows,
        startLine: 0,
        endLine: 0,
    };

    const text = serializeTable(table);
    const position = editor.selection.active;

    await editor.edit(editBuilder => {
        // Insert table with surrounding blank lines for proper markdown separation
        const prefix = position.character === 0 && position.line === 0 ? '' : '\n';
        editBuilder.insert(position, prefix + text + '\n');
    });
}

/**
 * Add a row below the current cursor position.
 */
async function addRow(editor: vscode.TextEditor): Promise<void> {
    const ctx = getTableContext(editor);
    if (!ctx) {
        vscode.window.showWarningMessage('Cursor is not inside a table.');
        return;
    }

    const colCount = ctx.table.headers.length;
    const newRow: TableCell[] = [];
    for (let c = 0; c < colCount; c++) {
        newRow.push(emptyCell(ctx.table.headers[c].alignment));
    }

    // Insert after current data row; if on header or separator, insert at beginning
    const insertIndex = ctx.dataRow >= 0 ? ctx.dataRow + 1 : 0;
    ctx.table.rows.splice(insertIndex, 0, newRow);
    ctx.table.endLine++;

    await replaceTable(editor, ctx.range, ctx.table);
}

/**
 * Remove the row at the cursor position.
 */
async function removeRow(editor: vscode.TextEditor): Promise<void> {
    const ctx = getTableContext(editor);
    if (!ctx) {
        vscode.window.showWarningMessage('Cursor is not inside a table.');
        return;
    }

    if (ctx.dataRow < 0) {
        vscode.window.showWarningMessage('Cannot remove the header or separator row.');
        return;
    }

    if (ctx.table.rows.length <= 1) {
        vscode.window.showWarningMessage('Cannot remove the last data row.');
        return;
    }

    ctx.table.rows.splice(ctx.dataRow, 1);
    ctx.table.endLine--;

    await replaceTable(editor, ctx.range, ctx.table);
}

/**
 * Add a column to the right of the cursor position.
 */
async function addColumn(editor: vscode.TextEditor): Promise<void> {
    const ctx = getTableContext(editor);
    if (!ctx) {
        vscode.window.showWarningMessage('Cursor is not inside a table.');
        return;
    }

    const insertIndex = Math.min(ctx.column + 1, ctx.table.headers.length);

    // Insert header cell
    ctx.table.headers.splice(insertIndex, 0, { content: '', alignment: 'none' });

    // Insert cell in each data row
    for (const row of ctx.table.rows) {
        row.splice(insertIndex, 0, emptyCell());
    }

    await replaceTable(editor, ctx.range, ctx.table);
}

/**
 * Remove the column at the cursor position.
 */
async function removeColumn(editor: vscode.TextEditor): Promise<void> {
    const ctx = getTableContext(editor);
    if (!ctx) {
        vscode.window.showWarningMessage('Cursor is not inside a table.');
        return;
    }

    if (ctx.table.headers.length <= 1) {
        vscode.window.showWarningMessage('Cannot remove the last column.');
        return;
    }

    const colIndex = Math.min(ctx.column, ctx.table.headers.length - 1);

    ctx.table.headers.splice(colIndex, 1);
    for (const row of ctx.table.rows) {
        row.splice(colIndex, 1);
    }

    await replaceTable(editor, ctx.range, ctx.table);
}

/**
 * Re-align all columns in the table under the cursor by re-serializing it.
 */
async function alignTable(editor: vscode.TextEditor): Promise<void> {
    const ctx = getTableContext(editor);
    if (!ctx) {
        vscode.window.showWarningMessage('Cursor is not inside a table.');
        return;
    }

    await replaceTable(editor, ctx.range, ctx.table);
}

/**
 * Align all tables in a document. Used by the on-save handler.
 */
async function alignAllTables(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    const edits: vscode.TextEdit[] = [];
    let line = 0;

    while (line < document.lineCount) {
        const lineText = document.lineAt(line).text;
        if (!lineText.includes('|')) {
            line++;
            continue;
        }

        // Potential table start — collect contiguous pipe-containing lines
        const start = line;
        while (line < document.lineCount && document.lineAt(line).text.includes('|')) {
            line++;
        }
        const end = line - 1;

        const lines: string[] = [];
        for (let i = start; i <= end; i++) {
            lines.push(document.lineAt(i).text);
        }
        const text = lines.join('\n');
        const table = parseTable(text, start);

        if (table) {
            const newText = serializeTable(table);
            if (newText !== text) {
                const range = new vscode.Range(
                    new vscode.Position(start, 0),
                    new vscode.Position(end, document.lineAt(end).text.length),
                );
                edits.push(vscode.TextEdit.replace(range, newText));
            }
        }
    }

    return edits;
}

// ---------------------------------------------------------------------------
// Quick-pick table menu
// ---------------------------------------------------------------------------

async function showTableMenu(editor: vscode.TextEditor): Promise<void> {
    const ctx = getTableContext(editor);
    const inTable = ctx !== null;

    interface TableMenuItem extends vscode.QuickPickItem {
        action: string;
    }

    const items: TableMenuItem[] = [];

    if (!inTable) {
        items.push({ label: '$(add) Insert Table', action: 'insert' });
    } else {
        items.push(
            { label: '$(add) Add Row Below', action: 'addRow' },
            { label: '$(remove) Remove Row', action: 'removeRow' },
            { label: '$(split-horizontal) Add Column Right', action: 'addColumn' },
            { label: '$(close) Remove Column', action: 'removeColumn' },
            { label: '$(whitespace) Align Table', action: 'align' },
        );
    }

    // Always offer insert even when inside a table (at the bottom)
    if (inTable) {
        items.push({ label: '$(add) Insert New Table', action: 'insert' });
    }

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: inTable ? 'Table operations' : 'No table at cursor — insert one?',
    });

    if (!picked) { return; }

    switch (picked.action) {
        case 'insert': await insertTable(editor); break;
        case 'addRow': await addRow(editor); break;
        case 'removeRow': await removeRow(editor); break;
        case 'addColumn': await addColumn(editor); break;
        case 'removeColumn': await removeColumn(editor); break;
        case 'align': await alignTable(editor); break;
    }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerTableCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('markdownCraft.tableMenu', showTableMenu),
        vscode.commands.registerTextEditorCommand('markdownCraft.addTableRow', addRow),
        vscode.commands.registerTextEditorCommand('markdownCraft.removeTableRow', removeRow),
        vscode.commands.registerTextEditorCommand('markdownCraft.addTableColumn', addColumn),
        vscode.commands.registerTextEditorCommand('markdownCraft.removeTableColumn', removeColumn),
        vscode.commands.registerTextEditorCommand('markdownCraft.alignTable', alignTable),
    );

    // Auto-align on save
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument(event => {
            if (event.document.languageId !== 'markdown') { return; }

            const config = vscode.workspace.getConfiguration('markdownCraft.tables');
            if (!config.get<boolean>('autoAlignOnSave', true)) { return; }

            event.waitUntil(alignAllTables(event.document));
        }),
    );
}
