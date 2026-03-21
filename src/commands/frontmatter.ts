import * as vscode from 'vscode';
import { parseFrontmatter, serializeFrontmatter } from '../parsers/frontmatter';

/**
 * Frontmatter insertion and editing commands.
 * Always writes code fence delimiters (```), never triple-dash (---).
 */

/**
 * Insert a frontmatter template at the top of the document.
 * If frontmatter already exists, show an informational message instead.
 */
async function insertFrontmatter(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const text = document.getText();
    const existing = parseFrontmatter(text);

    if (existing) {
        vscode.window.showInformationMessage('Frontmatter already exists in this document.');
        return;
    }

    const today = new Date();
    const dateStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

    const template = serializeFrontmatter({
        title: 'Untitled',
        date: dateStr,
        tags: [],
    });

    // Insert at the very top, followed by a blank line
    await editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(0, 0), template + '\n\n');
    });
}

/**
 * Show a quick pick of existing frontmatter fields, then an input box
 * to edit the selected field's value.
 */
async function editFrontmatterField(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const text = document.getText();
    const result = parseFrontmatter(text);

    if (!result) {
        vscode.window.showWarningMessage('No frontmatter found. Insert frontmatter first.');
        return;
    }

    const fields = Object.keys(result.data);
    if (fields.length === 0) {
        vscode.window.showInformationMessage('Frontmatter has no fields to edit.');
        return;
    }

    const picked = await vscode.window.showQuickPick(fields, {
        placeHolder: 'Select a frontmatter field to edit',
    });

    if (!picked) {
        return;
    }

    const currentValue = result.data[picked];
    const currentStr = typeof currentValue === 'string'
        ? currentValue
        : JSON.stringify(currentValue);

    const newValue = await vscode.window.showInputBox({
        prompt: `Edit value for "${picked}"`,
        value: currentStr,
    });

    if (newValue === undefined) {
        return;
    }

    // Parse the input value: try JSON first (for arrays/objects/numbers/booleans),
    // fall back to plain string
    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(newValue);
    } catch {
        parsedValue = newValue;
    }

    const updatedData = { ...result.data, [picked]: parsedValue };
    await replaceFrontmatter(editor, result, updatedData);
}

/**
 * Prompt for a new field name and value, then add to existing frontmatter.
 */
async function addFrontmatterField(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const text = document.getText();
    const result = parseFrontmatter(text);

    if (!result) {
        vscode.window.showWarningMessage('No frontmatter found. Insert frontmatter first.');
        return;
    }

    const fieldName = await vscode.window.showInputBox({
        prompt: 'Enter the field name',
        placeHolder: 'e.g. author, status, category',
    });

    if (!fieldName) {
        return;
    }

    if (result.data[fieldName] !== undefined) {
        vscode.window.showWarningMessage(`Field "${fieldName}" already exists. Use Edit Field to change it.`);
        return;
    }

    const fieldValue = await vscode.window.showInputBox({
        prompt: `Enter value for "${fieldName}"`,
        placeHolder: 'Value (use JSON syntax for arrays/objects, e.g. ["a","b"])',
    });

    if (fieldValue === undefined) {
        return;
    }

    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(fieldValue);
    } catch {
        parsedValue = fieldValue;
    }

    const updatedData = { ...result.data, [fieldName]: parsedValue };
    await replaceFrontmatter(editor, result, updatedData);
}

/**
 * Show a quick pick of existing fields and remove the selected one.
 */
async function removeFrontmatterField(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const text = document.getText();
    const result = parseFrontmatter(text);

    if (!result) {
        vscode.window.showWarningMessage('No frontmatter found.');
        return;
    }

    const fields = Object.keys(result.data);
    if (fields.length === 0) {
        vscode.window.showInformationMessage('Frontmatter has no fields to remove.');
        return;
    }

    const picked = await vscode.window.showQuickPick(fields, {
        placeHolder: 'Select a frontmatter field to remove',
    });

    if (!picked) {
        return;
    }

    const updatedData = { ...result.data };
    delete updatedData[picked];
    await replaceFrontmatter(editor, result, updatedData);
}

/**
 * Replace the existing frontmatter block in the document with new data.
 * Uses serializeFrontmatter which always writes code fence delimiters.
 */
async function replaceFrontmatter(
    editor: vscode.TextEditor,
    existing: { startLine: number; endLine: number },
    newData: Record<string, unknown>
): Promise<void> {
    const document = editor.document;
    const startPos = new vscode.Position(existing.startLine, 0);
    const endPos = new vscode.Position(
        existing.endLine,
        document.lineAt(existing.endLine).text.length
    );
    const range = new vscode.Range(startPos, endPos);

    const serialized = serializeFrontmatter(newData);

    await editor.edit(editBuilder => {
        editBuilder.replace(range, serialized);
    });
}

export function registerFrontmatterCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownCraft.insertFrontmatter', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { insertFrontmatter(editor); }
        }),
        vscode.commands.registerCommand('markdownCraft.editFrontmatterField', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { editFrontmatterField(editor); }
        }),
        vscode.commands.registerCommand('markdownCraft.addFrontmatterField', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { addFrontmatterField(editor); }
        }),
        vscode.commands.registerCommand('markdownCraft.removeFrontmatterField', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { removeFrontmatterField(editor); }
        })
    );
}
