import * as vscode from 'vscode';

/**
 * Editing behavior commands: Enter key continuation, Tab indent/outdent,
 * Cmd+[/] indent/outdent, table cell navigation, and reserved keybindings.
 *
 * These make markdown feel like a word processor for users new to VS Code.
 * All commands use `registerTextEditorCommand` so the active editor is injected.
 */

// ────────────────────────────────────────────
// Regex patterns for line detection
// ────────────────────────────────────────────

/** Matches bullet list lines: optional indent + `- ` or `* ` + optional content */
const BULLET_RE = /^(\s*)([-*])\s(.*)$/;

/** Matches bullet list lines that are ONLY the marker (empty continuation) */
const BULLET_EMPTY_RE = /^(\s*)([-*])\s$/;

/** Matches ordered list lines: optional indent + number + `. ` + optional content */
const ORDERED_RE = /^(\s*)(\d+)\.\s(.*)$/;

/** Matches ordered list lines that are ONLY the marker (empty continuation) */
const ORDERED_EMPTY_RE = /^(\s*)(\d+)\.\s$/;

/** Matches task list lines: optional indent + `- [ ] ` or `- [x] ` + optional content */
const TASK_RE = /^(\s*)- \[([ x])\]\s(.*)$/;

/** Matches task list lines that are ONLY the marker (empty continuation) */
const TASK_EMPTY_RE = /^(\s*)- \[([ x])\]\s$/;

/** Matches blockquote lines: `> ` + optional content */
const BLOCKQUOTE_RE = /^(>\s?)(.*)$/;

/** Matches blockquote lines that are ONLY the marker (empty continuation) */
const BLOCKQUOTE_EMPTY_RE = /^>\s?$/;

/** Matches any list line (bullet, ordered, or task) for Tab indent detection */
const ANY_LIST_RE = /^(\s*)([-*]|\d+\.|- \[[ x]\])\s/;

// ────────────────────────────────────────────
// Table helpers
// ────────────────────────────────────────────

/**
 * Check if a line is inside a markdown table.
 * A table line contains at least one `|` character.
 */
function isTableLine(lineText: string): boolean {
    return lineText.includes('|');
}

/**
 * Check if a line is a table separator row (e.g., `| --- | --- |`).
 */
function isSeparatorRow(lineText: string): boolean {
    return /^\|?[\s:]*-{3,}[\s:]*(\|[\s:]*-{3,}[\s:]*)*\|?\s*$/.test(lineText.trim());
}

/**
 * Find cell boundaries (pipe positions) in a table line.
 * Returns an array of character positions where `|` appears.
 */
function findPipePositions(lineText: string): number[] {
    const positions: number[] = [];
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') {
            positions.push(i);
        }
    }
    return positions;
}

/**
 * Find the start and end line of the table surrounding the given line.
 */
function findTableBounds(
    doc: vscode.TextDocument,
    line: number,
): { startLine: number; endLine: number } | null {
    if (!isTableLine(doc.lineAt(line).text)) {
        return null;
    }

    let startLine = line;
    while (startLine > 0 && isTableLine(doc.lineAt(startLine - 1).text)) {
        startLine--;
    }

    let endLine = line;
    while (endLine < doc.lineCount - 1 && isTableLine(doc.lineAt(endLine + 1).text)) {
        endLine++;
    }

    return { startLine, endLine };
}

/**
 * Navigate to the next cell in a table. Returns true if navigation occurred.
 */
function navigateToNextCell(
    editor: vscode.TextEditor,
): boolean {
    const doc = editor.document;
    const pos = editor.selection.active;
    const lineText = doc.lineAt(pos.line).text;

    if (!isTableLine(lineText)) {
        return false;
    }

    const bounds = findTableBounds(doc, pos.line);
    if (!bounds) {
        return false;
    }

    const pipes = findPipePositions(lineText);
    if (pipes.length < 2) {
        return false;
    }

    // Find the next pipe after cursor position
    let nextPipeIndex = -1;
    for (let i = 0; i < pipes.length; i++) {
        if (pipes[i] > pos.character) {
            nextPipeIndex = i;
            break;
        }
    }

    // If we found a next pipe and it's not the last pipe on the line,
    // move to just after that pipe
    if (nextPipeIndex !== -1 && nextPipeIndex < pipes.length - 1) {
        // Move to the content area after the next pipe (skip the leading space)
        const targetChar = pipes[nextPipeIndex] + 1;
        const cellEnd = pipes[nextPipeIndex + 1];
        // Position cursor after leading space in the cell
        const cellContent = lineText.substring(targetChar, cellEnd);
        const leadingSpaces = cellContent.match(/^\s*/)?.[0].length ?? 0;
        const cursorPos = new vscode.Position(pos.line, targetChar + leadingSpaces);
        editor.selection = new vscode.Selection(cursorPos, cursorPos);
        return true;
    }

    // We're at or past the last cell — try to move to the next row
    let nextDataLine = pos.line + 1;

    // Skip separator row
    if (nextDataLine <= bounds.endLine && isSeparatorRow(doc.lineAt(nextDataLine).text)) {
        nextDataLine++;
    }

    if (nextDataLine <= bounds.endLine) {
        // Move to the first cell of the next row
        return moveToFirstCell(editor, nextDataLine);
    }

    // We're at the last row of the table — create a new row
    return createNewRowAndNavigate(editor, bounds.endLine);
}

/**
 * Navigate to the previous cell in a table. Returns true if navigation occurred.
 */
function navigateToPreviousCell(
    editor: vscode.TextEditor,
): boolean {
    const doc = editor.document;
    const pos = editor.selection.active;
    const lineText = doc.lineAt(pos.line).text;

    if (!isTableLine(lineText)) {
        return false;
    }

    const bounds = findTableBounds(doc, pos.line);
    if (!bounds) {
        return false;
    }

    const pipes = findPipePositions(lineText);
    if (pipes.length < 2) {
        return false;
    }

    // Find the pipe before cursor position (the one that starts our current cell)
    let prevPipeIndex = -1;
    for (let i = pipes.length - 1; i >= 0; i--) {
        if (pipes[i] < pos.character) {
            prevPipeIndex = i;
            break;
        }
    }

    // If we can move to a previous cell on this line
    if (prevPipeIndex > 0) {
        // Move to the content area of the previous cell
        const targetPipe = pipes[prevPipeIndex - 1];
        const cellEnd = pipes[prevPipeIndex];
        const cellContent = lineText.substring(targetPipe + 1, cellEnd);
        const leadingSpaces = cellContent.match(/^\s*/)?.[0].length ?? 0;
        const cursorPos = new vscode.Position(pos.line, targetPipe + 1 + leadingSpaces);
        editor.selection = new vscode.Selection(cursorPos, cursorPos);
        return true;
    }

    // We're at the first cell — try to move to the previous row's last cell
    let prevDataLine = pos.line - 1;

    // Skip separator row
    if (prevDataLine >= bounds.startLine && isSeparatorRow(doc.lineAt(prevDataLine).text)) {
        prevDataLine--;
    }

    if (prevDataLine >= bounds.startLine) {
        return moveToLastCell(editor, prevDataLine);
    }

    return false;
}

/**
 * Move cursor to the first content cell of a given line.
 */
function moveToFirstCell(editor: vscode.TextEditor, line: number): boolean {
    const lineText = editor.document.lineAt(line).text;
    const pipes = findPipePositions(lineText);
    if (pipes.length < 2) {
        return false;
    }

    const targetChar = pipes[0] + 1;
    const cellEnd = pipes[1];
    const cellContent = lineText.substring(targetChar, cellEnd);
    const leadingSpaces = cellContent.match(/^\s*/)?.[0].length ?? 0;
    const cursorPos = new vscode.Position(line, targetChar + leadingSpaces);
    editor.selection = new vscode.Selection(cursorPos, cursorPos);
    return true;
}

/**
 * Move cursor to the last content cell of a given line.
 */
function moveToLastCell(editor: vscode.TextEditor, line: number): boolean {
    const lineText = editor.document.lineAt(line).text;
    const pipes = findPipePositions(lineText);
    if (pipes.length < 3) {
        // Need at least: | cell | (leading pipe, separator, trailing pipe)
        return false;
    }

    // Last content cell is between pipes[length-2] and pipes[length-1]
    const targetPipe = pipes[pipes.length - 2];
    const cellEnd = pipes[pipes.length - 1];
    const cellContent = lineText.substring(targetPipe + 1, cellEnd);
    const leadingSpaces = cellContent.match(/^\s*/)?.[0].length ?? 0;
    const cursorPos = new vscode.Position(line, targetPipe + 1 + leadingSpaces);
    editor.selection = new vscode.Selection(cursorPos, cursorPos);
    return true;
}

/**
 * Create a new empty row at the end of the table and move cursor to its first cell.
 */
function createNewRowAndNavigate(
    editor: vscode.TextEditor,
    lastLine: number,
): boolean {
    const doc = editor.document;
    const lastLineText = doc.lineAt(lastLine).text;
    const pipes = findPipePositions(lastLineText);

    if (pipes.length < 2) {
        return false;
    }

    // Build a new row matching the column count
    // Count cells = number of pipes - 1 (for leading/trailing pipes)
    const cellCount = pipes.length - 1;
    const cells = Array(cellCount).fill('   ').join('|');
    const newRow = '|' + cells + '|';

    const lineEnd = doc.lineAt(lastLine).range.end;

    // We need to do this async but return true synchronously to signal we handled it
    editor.edit(editBuilder => {
        editBuilder.insert(lineEnd, '\n' + newRow);
    }).then(success => {
        if (success) {
            moveToFirstCell(editor, lastLine + 1);
        }
    });

    return true;
}

// ────────────────────────────────────────────
// Enter key handler
// ────────────────────────────────────────────

async function onEnterKey(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    const sel = editor.selection;
    const line = doc.lineAt(sel.active.line);
    const lineText = line.text;

    // --- Task list continuation ---
    const taskEmptyMatch = lineText.match(TASK_EMPTY_RE);
    if (taskEmptyMatch) {
        // Empty task item — remove the marker and insert blank line
        await editor.edit(editBuilder => {
            editBuilder.replace(line.range, taskEmptyMatch[1]); // keep only indent (which becomes blank-ish)
        });
        return;
    }

    const taskMatch = lineText.match(TASK_RE);
    if (taskMatch) {
        const indent = taskMatch[1];
        const newMarker = `${indent}- [ ] `;
        await editor.edit(editBuilder => {
            editBuilder.insert(line.range.end, '\n' + newMarker);
        });
        // Move cursor to end of the new marker
        const newLine = sel.active.line + 1;
        const newPos = new vscode.Position(newLine, newMarker.length);
        editor.selection = new vscode.Selection(newPos, newPos);
        return;
    }

    // --- Bullet list continuation ---
    const bulletEmptyMatch = lineText.match(BULLET_EMPTY_RE);
    if (bulletEmptyMatch) {
        // Empty bullet — remove the marker, leave blank line
        await editor.edit(editBuilder => {
            editBuilder.replace(line.range, bulletEmptyMatch[1]);
        });
        return;
    }

    const bulletMatch = lineText.match(BULLET_RE);
    if (bulletMatch) {
        const indent = bulletMatch[1];
        const marker = bulletMatch[2];
        const newMarker = `${indent}${marker} `;
        await editor.edit(editBuilder => {
            editBuilder.insert(line.range.end, '\n' + newMarker);
        });
        const newLine = sel.active.line + 1;
        const newPos = new vscode.Position(newLine, newMarker.length);
        editor.selection = new vscode.Selection(newPos, newPos);
        return;
    }

    // --- Ordered list continuation ---
    const orderedEmptyMatch = lineText.match(ORDERED_EMPTY_RE);
    if (orderedEmptyMatch) {
        // Empty ordered item — remove the marker
        await editor.edit(editBuilder => {
            editBuilder.replace(line.range, orderedEmptyMatch[1]);
        });
        return;
    }

    const orderedMatch = lineText.match(ORDERED_RE);
    if (orderedMatch) {
        const indent = orderedMatch[1];
        const num = parseInt(orderedMatch[2], 10);
        const newMarker = `${indent}${num + 1}. `;
        await editor.edit(editBuilder => {
            editBuilder.insert(line.range.end, '\n' + newMarker);
        });
        const newLine = sel.active.line + 1;
        const newPos = new vscode.Position(newLine, newMarker.length);
        editor.selection = new vscode.Selection(newPos, newPos);
        return;
    }

    // --- Blockquote continuation ---
    const blockquoteEmptyMatch = lineText.match(BLOCKQUOTE_EMPTY_RE);
    if (blockquoteEmptyMatch) {
        // Empty blockquote — remove the marker
        await editor.edit(editBuilder => {
            editBuilder.replace(line.range, '');
        });
        return;
    }

    const blockquoteMatch = lineText.match(BLOCKQUOTE_RE);
    if (blockquoteMatch) {
        const newMarker = '> ';
        await editor.edit(editBuilder => {
            editBuilder.insert(line.range.end, '\n' + newMarker);
        });
        const newLine = sel.active.line + 1;
        const newPos = new vscode.Position(newLine, newMarker.length);
        editor.selection = new vscode.Selection(newPos, newPos);
        return;
    }

    // --- Default: fall through to normal Enter ---
    await vscode.commands.executeCommand('default:type', { text: '\n' });
}

// ────────────────────────────────────────────
// Tab key handler (unified: table nav > list indent > default)
// ────────────────────────────────────────────

async function onTabKey(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    const sel = editor.selection;
    const lineText = doc.lineAt(sel.active.line).text;

    // 1. Table cell navigation (highest priority)
    if (isTableLine(lineText)) {
        if (navigateToNextCell(editor)) {
            return;
        }
    }

    // 2. List indent
    if (ANY_LIST_RE.test(lineText)) {
        await editor.edit(editBuilder => {
            // Indent all selected lines
            const startLine = sel.start.line;
            const endLine = sel.end.line;
            for (let i = startLine; i <= endLine; i++) {
                editBuilder.insert(new vscode.Position(i, 0), '  ');
            }
        });
        return;
    }

    // 3. Default tab behavior
    await vscode.commands.executeCommand('tab');
}

// ────────────────────────────────────────────
// Shift+Tab key handler (unified: table nav > list outdent > default)
// ────────────────────────────────────────────

async function onShiftTabKey(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    const sel = editor.selection;
    const lineText = doc.lineAt(sel.active.line).text;

    // 1. Table cell navigation (highest priority)
    if (isTableLine(lineText)) {
        if (navigateToPreviousCell(editor)) {
            return;
        }
    }

    // 2. List outdent
    if (ANY_LIST_RE.test(lineText)) {
        await editor.edit(editBuilder => {
            const startLine = sel.start.line;
            const endLine = sel.end.line;
            for (let i = startLine; i <= endLine; i++) {
                const text = doc.lineAt(i).text;
                // Remove up to 2 leading spaces
                const spacesToRemove = text.startsWith('  ') ? 2 : (text.startsWith(' ') ? 1 : 0);
                if (spacesToRemove > 0) {
                    editBuilder.delete(new vscode.Range(i, 0, i, spacesToRemove));
                }
            }
        });
        return;
    }

    // 3. Default outdent behavior
    await vscode.commands.executeCommand('outdent');
}

// ────────────────────────────────────────────
// Cmd+] / Cmd+[ indent/outdent (works on any line, not just lists)
// ────────────────────────────────────────────

async function indentLines(editor: vscode.TextEditor): Promise<void> {
    const sel = editor.selection;
    await editor.edit(editBuilder => {
        const startLine = sel.start.line;
        const endLine = sel.end.line;
        for (let i = startLine; i <= endLine; i++) {
            editBuilder.insert(new vscode.Position(i, 0), '  ');
        }
    });
}

async function outdentLines(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    const sel = editor.selection;
    await editor.edit(editBuilder => {
        const startLine = sel.start.line;
        const endLine = sel.end.line;
        for (let i = startLine; i <= endLine; i++) {
            const text = doc.lineAt(i).text;
            // Remove up to 2 leading spaces
            const spacesToRemove = text.startsWith('  ') ? 2 : (text.startsWith(' ') ? 1 : 0);
            if (spacesToRemove > 0) {
                editBuilder.delete(new vscode.Range(i, 0, i, spacesToRemove));
            }
        }
    });
}

// ────────────────────────────────────────────
// Stub: CriticMarkup comment (reserved keybinding)
// ────────────────────────────────────────────

function addCriticComment(): void {
    vscode.window.showInformationMessage(
        'CriticMarkup comments coming in a future update',
    );
}

// ────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────

export function registerEditingCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.onEnterKey',
            (editor) => { onEnterKey(editor); },
        ),
        vscode.commands.registerTextEditorCommand(
            'cozyMd.onTabKey',
            (editor) => { onTabKey(editor); },
        ),
        vscode.commands.registerTextEditorCommand(
            'cozyMd.onShiftTabKey',
            (editor) => { onShiftTabKey(editor); },
        ),
        vscode.commands.registerTextEditorCommand(
            'cozyMd.indentLines',
            (editor) => { indentLines(editor); },
        ),
        vscode.commands.registerTextEditorCommand(
            'cozyMd.outdentLines',
            (editor) => { outdentLines(editor); },
        ),
        vscode.commands.registerCommand(
            'cozyMd.addCriticComment',
            addCriticComment,
        ),
    );
}
