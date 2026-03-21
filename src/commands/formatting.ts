import * as vscode from 'vscode';

/**
 * Formatting commands: bold, italic, code, strikethrough, horizontal rules, links, images.
 */

/**
 * Toggle an inline marker (e.g. **, *, `, ~~) around each selection.
 * - If the selection is already wrapped, unwrap it.
 * - If the selection is not wrapped, wrap it.
 * - If nothing is selected, insert the markers and place the cursor between them.
 * Handles multi-cursor via iterating over all selections.
 */
async function toggleInlineMarker(editor: vscode.TextEditor, marker: string): Promise<void> {
    const document = editor.document;
    const markerLen = marker.length;

    await editor.edit(editBuilder => {
        for (const selection of editor.selections) {
            if (selection.isEmpty) {
                // No selection: insert markers at cursor position
                editBuilder.insert(selection.start, marker + marker);
            } else {
                const selectedText = document.getText(selection);

                // Check if already wrapped with the marker
                if (selectedText.startsWith(marker) && selectedText.endsWith(marker) && selectedText.length >= markerLen * 2) {
                    // Unwrap: remove markers from inside the selection
                    const inner = selectedText.slice(markerLen, -markerLen);
                    editBuilder.replace(selection, inner);
                } else {
                    // Check if the surrounding text contains the markers (selection is inside markers)
                    const beforeStart = new vscode.Position(
                        selection.start.line,
                        Math.max(0, selection.start.character - markerLen)
                    );
                    const afterEnd = new vscode.Position(
                        selection.end.line,
                        Math.min(document.lineAt(selection.end.line).text.length, selection.end.character + markerLen)
                    );
                    const beforeText = document.getText(new vscode.Range(beforeStart, selection.start));
                    const afterText = document.getText(new vscode.Range(selection.end, afterEnd));

                    if (beforeText === marker && afterText === marker) {
                        // Unwrap: remove markers from around the selection
                        editBuilder.delete(new vscode.Range(selection.end, afterEnd));
                        editBuilder.delete(new vscode.Range(beforeStart, selection.start));
                    } else {
                        // Wrap: add markers around the selection
                        editBuilder.replace(selection, marker + selectedText + marker);
                    }
                }
            }
        }
    });

    // For empty selections, place cursors between the markers
    if (editor.selections.some(s => s.isEmpty)) {
        editor.selections = editor.selections.map(selection => {
            // After inserting marker+marker, cursor is after both markers.
            // We need to move it back by markerLen to sit between them.
            // But only for selections that were originally empty.
            // Since the edit already happened, the cursor position reflects post-edit state.
            // vscode places cursor at end of inserted text, so we move back by markerLen.
            const pos = new vscode.Position(
                selection.start.line,
                selection.start.character - markerLen
            );
            return new vscode.Selection(pos, pos);
        });
    }
}

/**
 * Insert a horizontal rule (---) on a new line below the current line.
 */
async function insertHorizontalRule(editor: vscode.TextEditor): Promise<void> {
    await editor.edit(editBuilder => {
        for (const selection of editor.selections) {
            const line = editor.document.lineAt(selection.active.line);
            const insertPos = line.range.end;
            // Insert newline + rule. Add a trailing newline so cursor ends below the rule.
            editBuilder.insert(insertPos, '\n\n---\n');
        }
    });
}

/**
 * Insert a markdown link. If text is selected, use it as the link text.
 * Otherwise insert a full placeholder.
 */
async function insertLink(editor: vscode.TextEditor): Promise<void> {
    await editor.edit(editBuilder => {
        for (const selection of editor.selections) {
            if (selection.isEmpty) {
                editBuilder.insert(selection.start, '[link text](url)');
            } else {
                const selectedText = editor.document.getText(selection);
                editBuilder.replace(selection, `[${selectedText}](url)`);
            }
        }
    });

    // Place cursor(s) on the "url" placeholder so the user can type the URL
    const newSelections: vscode.Selection[] = [];
    for (const selection of editor.selections) {
        // Find "url)" near the cursor to select "url"
        const line = editor.document.lineAt(selection.start.line);
        const lineText = line.text;
        // Search backward from cursor for "(url)"
        const urlIndex = lineText.lastIndexOf('(url)', selection.start.character + 5);
        if (urlIndex !== -1) {
            const urlStart = new vscode.Position(selection.start.line, urlIndex + 1);
            const urlEnd = new vscode.Position(selection.start.line, urlIndex + 4);
            newSelections.push(new vscode.Selection(urlStart, urlEnd));
        } else {
            newSelections.push(selection);
        }
    }
    if (newSelections.length > 0) {
        editor.selections = newSelections;
    }
}

/**
 * Insert a markdown image. If text is selected, use it as alt text.
 * Otherwise insert a full placeholder.
 */
async function insertImage(editor: vscode.TextEditor): Promise<void> {
    await editor.edit(editBuilder => {
        for (const selection of editor.selections) {
            if (selection.isEmpty) {
                editBuilder.insert(selection.start, '![alt text](image-url)');
            } else {
                const selectedText = editor.document.getText(selection);
                editBuilder.replace(selection, `![${selectedText}](image-url)`);
            }
        }
    });

    // Place cursor(s) on the "image-url" placeholder
    const newSelections: vscode.Selection[] = [];
    for (const selection of editor.selections) {
        const line = editor.document.lineAt(selection.start.line);
        const lineText = line.text;
        const urlIndex = lineText.lastIndexOf('(image-url)', selection.start.character + 11);
        if (urlIndex !== -1) {
            const urlStart = new vscode.Position(selection.start.line, urlIndex + 1);
            const urlEnd = new vscode.Position(selection.start.line, urlIndex + 10);
            newSelections.push(new vscode.Selection(urlStart, urlEnd));
        } else {
            newSelections.push(selection);
        }
    }
    if (newSelections.length > 0) {
        editor.selections = newSelections;
    }
}

export function registerFormattingCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownCraft.toggleBold', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { toggleInlineMarker(editor, '**'); }
        }),
        vscode.commands.registerCommand('markdownCraft.toggleItalic', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { toggleInlineMarker(editor, '*'); }
        }),
        vscode.commands.registerCommand('markdownCraft.toggleCode', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { toggleInlineMarker(editor, '`'); }
        }),
        vscode.commands.registerCommand('markdownCraft.toggleStrikethrough', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { toggleInlineMarker(editor, '~~'); }
        }),
        vscode.commands.registerCommand('markdownCraft.insertHorizontalRule', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { insertHorizontalRule(editor); }
        }),
        vscode.commands.registerCommand('markdownCraft.insertLink', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { insertLink(editor); }
        }),
        vscode.commands.registerCommand('markdownCraft.insertImage', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { insertImage(editor); }
        })
    );
}
