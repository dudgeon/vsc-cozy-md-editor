import * as vscode from 'vscode';
import { parseCriticMarkup, CriticMarkupRange } from '../parsers/criticmarkup';

/**
 * Track changes commands: accept/reject CriticMarkup changes,
 * accept/reject all, and next/previous change navigation.
 */

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Find the CriticMarkup range that contains the cursor position.
 */
function findChangeAtCursor(
    document: vscode.TextDocument,
    position: vscode.Position
): CriticMarkupRange | null {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const ranges = parseCriticMarkup(text);
    return ranges.find(r => offset >= r.start && offset <= r.end) || null;
}

/**
 * Compute the replacement text when accepting a CriticMarkup range.
 */
function getAcceptText(range: CriticMarkupRange): string {
    switch (range.type) {
        case 'addition':
            return range.content;       // keep added text
        case 'deletion':
            return '';                   // remove deleted text
        case 'substitution':
            return range.newText ?? '';  // keep new text
        case 'comment':
            return '';                   // remove comment
        case 'highlight':
            return range.content;       // keep highlighted text
    }
}

/**
 * Compute the replacement text when rejecting a CriticMarkup range.
 */
function getRejectText(range: CriticMarkupRange): string {
    switch (range.type) {
        case 'addition':
            return '';                   // remove added text
        case 'deletion':
            return range.content;       // restore deleted text
        case 'substitution':
            return range.oldText ?? '';  // keep old text
        case 'comment':
            return '';                   // remove comment (same as accept)
        case 'highlight':
            return range.content;       // keep highlighted text (same as accept)
    }
}

/**
 * Replace a single CriticMarkup range in the editor with the given text.
 */
async function replaceRange(
    editor: vscode.TextEditor,
    range: CriticMarkupRange,
    replacement: string
): Promise<void> {
    const document = editor.document;
    const startPos = document.positionAt(range.start);
    const endPos = document.positionAt(range.end);
    const vsRange = new vscode.Range(startPos, endPos);

    await editor.edit(editBuilder => {
        editBuilder.replace(vsRange, replacement);
    });
}

/**
 * Apply accept or reject to ALL CriticMarkup ranges in reverse order
 * so that earlier offsets remain valid as we edit from bottom to top.
 */
async function applyAll(
    editor: vscode.TextEditor,
    getTextFn: (range: CriticMarkupRange) => string
): Promise<void> {
    const text = editor.document.getText();
    const ranges = parseCriticMarkup(text);

    if (ranges.length === 0) {
        vscode.window.showInformationMessage('No CriticMarkup changes found.');
        return;
    }

    // Process in reverse order (bottom to top) to preserve offsets
    const reversed = [...ranges].reverse();

    await editor.edit(editBuilder => {
        for (const range of reversed) {
            const startPos = editor.document.positionAt(range.start);
            const endPos = editor.document.positionAt(range.end);
            const vsRange = new vscode.Range(startPos, endPos);
            editBuilder.replace(vsRange, getTextFn(range));
        }
    });
}

/**
 * Find a CriticMarkup range by explicit character offset (from CodeLens argument)
 * or fall back to cursor position.
 */
function findChangeByOffsetOrCursor(
    editor: vscode.TextEditor,
    offsetArg: unknown
): CriticMarkupRange | null {
    const text = editor.document.getText();
    const ranges = parseCriticMarkup(text);

    if (typeof offsetArg === 'number') {
        return ranges.find(r => r.start === offsetArg) || null;
    }

    // Fall back to cursor position
    const cursorOffset = editor.document.offsetAt(editor.selection.active);
    return ranges.find(r => cursorOffset >= r.start && cursorOffset <= r.end) || null;
}

// ── Command Registration ─────────────────────────────────────────────────

export function registerTrackChangesCommands(context: vscode.ExtensionContext): void {
    // Accept single change at cursor (or at a specific offset passed from CodeLens)
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.acceptChange',
            async (editor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ...args: unknown[]) => {
                const change = findChangeByOffsetOrCursor(editor, args[0]);
                if (!change) {
                    vscode.window.showInformationMessage('No CriticMarkup change at cursor.');
                    return;
                }
                await replaceRange(editor, change, getAcceptText(change));
            }
        )
    );

    // Reject single change at cursor (or at a specific offset passed from CodeLens)
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.rejectChange',
            async (editor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ...args: unknown[]) => {
                const change = findChangeByOffsetOrCursor(editor, args[0]);
                if (!change) {
                    vscode.window.showInformationMessage('No CriticMarkup change at cursor.');
                    return;
                }
                await replaceRange(editor, change, getRejectText(change));
            }
        )
    );

    // Accept all changes in document
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.acceptAllChanges',
            async (editor: vscode.TextEditor) => {
                await applyAll(editor, getAcceptText);
            }
        )
    );

    // Reject all changes in document
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.rejectAllChanges',
            async (editor: vscode.TextEditor) => {
                await applyAll(editor, getRejectText);
            }
        )
    );

    // Navigate to next change
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.nextChange',
            (editor: vscode.TextEditor) => {
                const text = editor.document.getText();
                const ranges = parseCriticMarkup(text);
                if (ranges.length === 0) {
                    vscode.window.showInformationMessage('No CriticMarkup changes found.');
                    return;
                }

                const offset = editor.document.offsetAt(editor.selection.active);

                // Find the first range that starts after the current offset
                const next = ranges.find(r => r.start > offset);
                // Wrap around to the first if none found
                const target = next ?? ranges[0];

                const pos = editor.document.positionAt(target.start);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(
                    new vscode.Range(pos, pos),
                    vscode.TextEditorRevealType.InCenterIfOutsideViewport
                );
            }
        )
    );

    // Navigate to previous change
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.previousChange',
            (editor: vscode.TextEditor) => {
                const text = editor.document.getText();
                const ranges = parseCriticMarkup(text);
                if (ranges.length === 0) {
                    vscode.window.showInformationMessage('No CriticMarkup changes found.');
                    return;
                }

                const offset = editor.document.offsetAt(editor.selection.active);

                // Find the last range that starts before the current offset
                const reversed = [...ranges].reverse();
                const prev = reversed.find(r => r.start < offset);
                // Wrap around to the last if none found
                const target = prev ?? ranges[ranges.length - 1];

                const pos = editor.document.positionAt(target.start);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(
                    new vscode.Range(pos, pos),
                    vscode.TextEditorRevealType.InCenterIfOutsideViewport
                );
            }
        )
    );
}
