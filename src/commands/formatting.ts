import * as vscode from 'vscode';

/**
 * Formatting commands: bold, italic, code, headings, links,
 * horizontal rules, blockquotes.
 *
 * All commands honour multi-cursor and use
 * `registerTextEditorCommand` so the active editor is injected.
 */

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/**
 * Generic wrap/unwrap toggle for symmetric markers (**, *, `).
 *
 * Behaviour:
 * - Selection already wrapped with `marker` → remove the markers.
 * - Selection exists but not wrapped → wrap it.
 * - Empty selection → insert paired markers and place cursor between them.
 *
 * Handles every selection in `editor.selections` (multi-cursor).
 */
function toggleWrap(
    editor: vscode.TextEditor,
    marker: string,
): void {
    const doc = editor.document;
    const len = marker.length;

    // We need to compute all edits up-front so we can set selections
    // after the edit resolves.
    editor.edit(editBuilder => {
        for (const sel of editor.selections) {
            if (sel.isEmpty) {
                // No selection — insert marker pair at cursor
                editBuilder.insert(sel.start, marker + marker);
            } else {
                const text = doc.getText(sel);

                if (text.startsWith(marker) && text.endsWith(marker) && text.length >= len * 2) {
                    // Already wrapped — unwrap
                    const inner = text.slice(len, text.length - len);
                    editBuilder.replace(sel, inner);
                } else {
                    // Check if the markers exist just outside the selection
                    const beforeStart = sel.start.character >= len
                        ? new vscode.Position(sel.start.line, sel.start.character - len)
                        : null;
                    const afterEnd = sel.end.character + len <= doc.lineAt(sel.end.line).text.length
                        ? new vscode.Position(sel.end.line, sel.end.character + len)
                        : null;

                    if (beforeStart !== null && afterEnd !== null) {
                        const expandedRange = new vscode.Range(beforeStart, afterEnd);
                        const expandedText = doc.getText(expandedRange);

                        if (expandedText.startsWith(marker) && expandedText.endsWith(marker)) {
                            // Markers exist around the selection — remove them
                            editBuilder.replace(expandedRange, doc.getText(sel));
                            continue;
                        }
                    }

                    // Not wrapped — wrap
                    editBuilder.replace(sel, marker + text + marker);
                }
            }
        }
    }).then(success => {
        if (!success) { return; }

        // Fix up cursors for the "empty selection" case:
        // place each cursor between the marker pair we just inserted.
        const newSelections: vscode.Selection[] = [];
        let needsUpdate = false;

        for (const sel of editor.selections) {
            // After an insert of `marker + marker` at an empty selection the
            // cursor lands after the second marker. Move it back by `len`.
            if (sel.isEmpty) {
                const pos = new vscode.Position(sel.start.line, sel.start.character);
                // The cursor is already placed by VS Code after the edit;
                // we want it between the two markers.
                // After `editBuilder.insert` at an empty selection, VS Code
                // places the cursor at the end of the inserted text. So for
                // `**|**` the cursor is after the second `**`. We need to
                // move it back by `len`.
                const adjusted = new vscode.Position(pos.line, Math.max(pos.character - len, 0));
                newSelections.push(new vscode.Selection(adjusted, adjusted));
                needsUpdate = true;
            } else {
                newSelections.push(sel);
            }
        }

        if (needsUpdate) {
            editor.selections = newSelections;
        }
    });
}

// ────────────────────────────────────────────
// Command implementations
// ────────────────────────────────────────────

function toggleBold(editor: vscode.TextEditor): void {
    toggleWrap(editor, '**');
}

function toggleItalic(editor: vscode.TextEditor): void {
    toggleWrap(editor, '*');
}

function toggleCode(editor: vscode.TextEditor): void {
    toggleWrap(editor, '`');
}

/**
 * Cycle the current line(s) through heading levels:
 *   (no heading) → # → ## → ### → #### → (no heading)
 *
 * Works on every line that contains a cursor/selection.
 */
function cycleHeading(editor: vscode.TextEditor): void {
    const doc = editor.document;

    // Collect unique line numbers across all selections
    const lineNumbers = new Set<number>();
    for (const sel of editor.selections) {
        for (let line = sel.start.line; line <= sel.end.line; line++) {
            lineNumbers.add(line);
        }
    }

    editor.edit(editBuilder => {
        for (const lineNum of lineNumbers) {
            const line = doc.lineAt(lineNum);
            const text = line.text;

            // Match existing heading prefix: one or more # followed by a space
            const match = text.match(/^(#{1,4})\s/);

            if (!match) {
                // No heading → add #
                editBuilder.insert(new vscode.Position(lineNum, 0), '# ');
            } else {
                const currentLevel = match[1].length; // 1-4
                const prefixLength = match[0].length;  // "## ".length etc.

                if (currentLevel >= 4) {
                    // #### → remove heading
                    editBuilder.replace(
                        new vscode.Range(lineNum, 0, lineNum, prefixLength),
                        '',
                    );
                } else {
                    // Increase level: replace existing prefix with one more #
                    const newPrefix = '#'.repeat(currentLevel + 1) + ' ';
                    editBuilder.replace(
                        new vscode.Range(lineNum, 0, lineNum, prefixLength),
                        newPrefix,
                    );
                }
            }
        }
    });
}

/**
 * Wrap the selection as a markdown link: `[selection](url)`
 *
 * - If text is selected, it becomes the link text and the cursor lands on `url`.
 * - If nothing is selected, inserts `[](url)` and places cursor inside `[]`.
 *
 * TODO: Detect if clipboard contains a URL and pre-fill it as the link target.
 */
function insertLink(editor: vscode.TextEditor): void {
    const doc = editor.document;

    // Build snippets per selection so SnippetString handles cursor placement.
    // We process one selection at a time because `insertSnippet` with
    // multi-cursor is handled natively by VS Code when we pass all
    // selections.

    // For multi-cursor, VS Code's insertSnippet handles it correctly
    // when called once — it applies the snippet at every selection.
    const sel = editor.selection; // primary selection for logic, but snippet applies to all

    if (sel.isEmpty) {
        // No selection — insert [text](url) with tab stops
        const snippet = new vscode.SnippetString('[${1:text}](${2:url})');
        editor.insertSnippet(snippet);
    } else {
        // Use selection as link text, cursor goes to url placeholder
        // We need to read each selection's text individually for multi-cursor.
        // VS Code's insertSnippet replaces each selection with the snippet,
        // but the snippet is the same for all cursors. We use a variable
        // to capture the selected text.
        //
        // Unfortunately SnippetString doesn't have a "selected text" variable
        // that works reliably across all VS Code versions, so we use
        // TM_SELECTED_TEXT which VS Code populates.
        const snippet = new vscode.SnippetString('[$TM_SELECTED_TEXT](${1:url})');
        editor.insertSnippet(snippet);
    }
}

/**
 * Insert a horizontal rule (`---`) on a new line below the cursor.
 *
 * If the current line is not empty, a blank line is inserted first
 * so the rule doesn't merge with preceding text.
 */
function insertHorizontalRule(editor: vscode.TextEditor): void {
    const doc = editor.document;

    editor.edit(editBuilder => {
        for (const sel of editor.selections) {
            const line = doc.lineAt(sel.active.line);
            const lineEnd = line.range.end;

            if (line.isEmptyOrWhitespace) {
                // Current line is empty — replace it with the rule
                editBuilder.replace(line.range, '---\n');
            } else {
                // Insert after the current line, with a blank line separator
                editBuilder.insert(lineEnd, '\n\n---\n');
            }
        }
    });
}

/**
 * Toggle blockquote prefix (`> `) on all lines in the selection.
 *
 * - If ALL selected lines already start with `> `, remove the prefix.
 * - Otherwise, add `> ` to every selected line.
 * - Works per-selection for multi-cursor.
 */
function toggleBlockquote(editor: vscode.TextEditor): void {
    const doc = editor.document;

    // Collect unique line numbers across all selections and determine
    // whether we are adding or removing.
    const lineNumbers = new Set<number>();
    for (const sel of editor.selections) {
        const startLine = sel.start.line;
        const endLine = sel.end.line;
        for (let i = startLine; i <= endLine; i++) {
            lineNumbers.add(i);
        }
    }

    // Check if ALL lines are already quoted
    let allQuoted = true;
    for (const lineNum of lineNumbers) {
        const text = doc.lineAt(lineNum).text;
        if (!text.startsWith('> ')) {
            // Also accept a bare `>` at the start of an otherwise empty quoted line
            if (text !== '>') {
                allQuoted = false;
                break;
            }
        }
    }

    editor.edit(editBuilder => {
        for (const lineNum of lineNumbers) {
            const line = doc.lineAt(lineNum);
            const text = line.text;

            if (allQuoted) {
                // Remove blockquote prefix
                if (text.startsWith('> ')) {
                    editBuilder.replace(
                        new vscode.Range(lineNum, 0, lineNum, 2),
                        '',
                    );
                } else if (text === '>') {
                    editBuilder.replace(
                        new vscode.Range(lineNum, 0, lineNum, 1),
                        '',
                    );
                }
            } else {
                // Add blockquote prefix
                editBuilder.insert(new vscode.Position(lineNum, 0), '> ');
            }
        }
    });
}

// ────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────

export function registerFormattingCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('cozyMd.toggleBold', toggleBold),
        vscode.commands.registerTextEditorCommand('cozyMd.toggleItalic', toggleItalic),
        vscode.commands.registerTextEditorCommand('cozyMd.toggleCode', toggleCode),
        vscode.commands.registerTextEditorCommand('cozyMd.cycleHeading', cycleHeading),
        vscode.commands.registerTextEditorCommand('cozyMd.insertLink', insertLink),
        vscode.commands.registerTextEditorCommand('cozyMd.insertHorizontalRule', insertHorizontalRule),
        vscode.commands.registerTextEditorCommand('cozyMd.toggleBlockquote', toggleBlockquote),
    );
}
