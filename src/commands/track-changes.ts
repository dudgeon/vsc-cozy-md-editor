import * as vscode from 'vscode';
import { diffWords } from 'diff';
import { parseCriticMarkup, CriticMarkupRange } from '../parsers/criticmarkup';

/**
 * Track changes commands: accept/reject CriticMarkup changes,
 * accept/reject all, next/previous change navigation, and
 * snapshot+diff track-changes recording.
 */

// ── Track Changes Recording State ────────────────────────────────────────

let isTracking = false;
let snapshot: string | undefined;
let trackedDocUri: string | undefined;

/**
 * Convert a diff between old and new text into CriticMarkup.
 *
 * Uses `diffWords()` from the `diff` package. Adjacent remove+add pairs
 * are collapsed into substitutions ({~~ old ~> new ~~}).
 */
function generateCriticMarkup(oldText: string, newText: string): string {
    const changes = diffWords(oldText, newText);
    let result = '';
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (change.added) {
            result += `{++${change.value}++}`;
        } else if (change.removed) {
            // Check if next change is an addition (substitution pattern)
            const next = changes[i + 1];
            if (next && next.added) {
                result += `{~~${change.value}~>${next.value}~~}`;
                i++; // skip the addition, consumed as substitution
            } else {
                result += `{--${change.value}--}`;
            }
        } else {
            result += change.value;
        }
    }
    return result;
}

/**
 * Start tracking changes: snapshot the document and set state.
 */
function startTracking(editor: vscode.TextEditor): void {
    snapshot = editor.document.getText();
    trackedDocUri = editor.document.uri.toString();
    isTracking = true;
    vscode.commands.executeCommand('setContext', 'cozyMd.isTrackingChanges', true);
    vscode.window.showInformationMessage('Track Changes: ON — edit freely, then press Done or Cancel.');
}

/**
 * Commit tracked changes: diff snapshot against current text, generate
 * CriticMarkup, and replace document content in a single `editor.edit()`.
 */
async function commitTracking(editor: vscode.TextEditor): Promise<void> {
    if (!isTracking || snapshot === undefined) {
        vscode.window.showWarningMessage('Track changes is not active.');
        return;
    }

    // Ensure we're operating on the same document
    if (editor.document.uri.toString() !== trackedDocUri) {
        vscode.window.showWarningMessage('Track changes is active on a different document.');
        return;
    }

    const currentText = editor.document.getText();

    // If nothing changed, just stop tracking
    if (currentText === snapshot) {
        clearTrackingState();
        vscode.window.showInformationMessage('Track Changes: no changes detected.');
        return;
    }

    const criticMarkupText = generateCriticMarkup(snapshot, currentText);

    // Replace the entire document content in a single edit so Cmd+Z undoes
    // the whole CriticMarkup generation at once.
    const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(currentText.length)
    );

    const success = await editor.edit(editBuilder => {
        editBuilder.replace(fullRange, criticMarkupText);
    });

    if (success) {
        clearTrackingState();
        vscode.window.showInformationMessage('Track Changes: changes committed as CriticMarkup.');
    } else {
        vscode.window.showErrorMessage('Track Changes: failed to apply CriticMarkup.');
    }
}

/**
 * Cancel tracking: clear state without generating CriticMarkup.
 * Edits remain as-is in the document.
 */
function cancelTracking(): void {
    if (!isTracking) {
        vscode.window.showInformationMessage('Track changes is not active.');
        return;
    }
    clearTrackingState();
    vscode.window.showInformationMessage('Track Changes: cancelled. Edits remain as-is.');
}

/**
 * Clear all tracking state and update the `when`-clause context.
 */
function clearTrackingState(): void {
    isTracking = false;
    snapshot = undefined;
    trackedDocUri = undefined;
    vscode.commands.executeCommand('setContext', 'cozyMd.isTrackingChanges', false);
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

    // ── Track Changes Recording Commands ─────────────────────────────────

    // Toggle track changes (start tracking, or commit if already tracking)
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.toggleTrackChanges',
            async (editor: vscode.TextEditor) => {
                if (!isTracking) {
                    startTracking(editor);
                } else {
                    await commitTracking(editor);
                }
            }
        )
    );

    // Done — commit tracked changes as CriticMarkup
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.commitTrackChanges',
            async (editor: vscode.TextEditor) => {
                await commitTracking(editor);
            }
        )
    );

    // Cancel — stop tracking without generating CriticMarkup
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'cozyMd.cancelTrackChanges',
            () => {
                cancelTracking();
            }
        )
    );

    // ── Add Comment on Change (CodeLens command) ─────────────────────────

    // Inserts a CriticMarkup comment {>>  <<} right after the CriticMarkup
    // range at the given offset, and positions cursor between the delimiters.
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.addCommentOnChange',
            async (editor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ...args: unknown[]) => {
                const change = findChangeByOffsetOrCursor(editor, args[0]);
                if (!change) {
                    vscode.window.showInformationMessage('No CriticMarkup change at cursor.');
                    return;
                }

                // Insert {>>  <<} right after the closing delimiter of the range
                const insertPos = editor.document.positionAt(change.end);
                const commentText = '{>>  <<}';

                const success = await editor.edit(editBuilder => {
                    editBuilder.insert(insertPos, commentText);
                });

                if (success) {
                    // Position cursor between the delimiters: after "{>> " (4 chars)
                    const cursorOffset = change.end + 4;
                    const cursorPos = editor.document.positionAt(cursorOffset);
                    editor.selection = new vscode.Selection(cursorPos, cursorPos);
                }
            }
        )
    );
}
