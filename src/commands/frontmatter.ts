import * as vscode from 'vscode';
import * as path from 'path';
import { parseFrontmatter, serializeFrontmatter } from '../parsers/frontmatter';

/**
 * Frontmatter insertion and editing commands.
 * Templates: blank, blog post, PRD, research note, Google Doc paired.
 */

/** Today's date in YYYY-MM-DD format. */
function todayString(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Derive a human-friendly title from the active editor's filename. */
function titleFromFilename(editor: vscode.TextEditor): string {
    const basename = path.basename(editor.document.fileName);
    // Strip .md / .markdown extension
    return basename.replace(/\.(md|markdown)$/i, '');
}

// ── Template definitions ───────────────────────────────────────────

interface FrontmatterTemplate {
    label: string;
    description: string;
    build: (title: string, today: string) => Record<string, unknown>;
}

const TEMPLATES: FrontmatterTemplate[] = [
    {
        label: 'Blank',
        description: 'Just a title',
        build: (title) => ({ title }),
    },
    {
        label: 'Blog Post',
        description: 'title, date, author, tags, draft',
        build: (title, today) => ({
            title,
            date: today,
            author: '',
            tags: [],
            draft: true,
        }),
    },
    {
        label: 'PRD',
        description: 'title, status, author, reviewers, last-updated',
        build: (title, today) => ({
            title,
            status: 'draft',
            author: '',
            reviewers: [],
            'last-updated': today,
        }),
    },
    {
        label: 'Research Note',
        description: 'title, date, topic, sources',
        build: (title, today) => ({
            title,
            date: today,
            topic: '',
            sources: [],
        }),
    },
    {
        label: 'Google Doc Paired',
        description: 'title, google-doc-url',
        build: (title) => ({
            title,
            'google-doc-url': '',
        }),
    },
];

// ── Editing existing frontmatter ───────────────────────────────────

/**
 * Format a frontmatter value for display in the quick pick list.
 * Keeps it short and readable for non-technical users.
 */
function formatValueForDisplay(value: unknown): string {
    if (value === null || value === undefined) {
        return '(empty)';
    }
    if (Array.isArray(value)) {
        return value.length === 0 ? '(empty list)' : value.join(', ');
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    const str = String(value);
    return str === '' ? '(empty)' : str;
}

/**
 * Prompt the user to edit a single field value.
 * Returns the updated value, or `undefined` if the user cancelled.
 */
async function editFieldValue(
    key: string,
    currentValue: unknown,
): Promise<unknown | undefined> {
    // For boolean fields, toggle via quick pick
    if (typeof currentValue === 'boolean') {
        const picked = await vscode.window.showQuickPick(
            [
                { label: 'true', picked: currentValue === true },
                { label: 'false', picked: currentValue === false },
            ],
            { title: `Set "${key}"`, placeHolder: `Current value: ${currentValue}` },
        );
        if (!picked) {
            return undefined;
        }
        return picked.label === 'true';
    }

    // For arrays, let the user edit as a comma-separated string
    if (Array.isArray(currentValue)) {
        const current = currentValue.join(', ');
        const input = await vscode.window.showInputBox({
            title: `Edit "${key}"`,
            prompt: 'Enter values separated by commas',
            value: current,
            placeHolder: 'value1, value2, value3',
        });
        if (input === undefined) {
            return undefined;
        }
        if (input.trim() === '') {
            return [];
        }
        return input.split(',').map((s) => s.trim());
    }

    // Everything else → plain text input
    const input = await vscode.window.showInputBox({
        title: `Edit "${key}"`,
        prompt: `Enter a new value for "${key}"`,
        value: currentValue == null ? '' : String(currentValue),
    });
    if (input === undefined) {
        return undefined;
    }
    return input;
}

/**
 * Prompt the user for a brand-new field name and value, then return them.
 * Returns `undefined` if the user cancelled at any step.
 */
async function promptNewField(): Promise<{ key: string; value: unknown } | undefined> {
    const key = await vscode.window.showInputBox({
        title: 'New field name',
        prompt: 'Enter the name for the new frontmatter field',
        placeHolder: 'e.g. category',
        validateInput: (v) => {
            if (!v || v.trim() === '') {
                return 'Field name cannot be empty';
            }
            return null;
        },
    });
    if (!key) {
        return undefined;
    }

    const value = await vscode.window.showInputBox({
        title: `Value for "${key}"`,
        prompt: `Enter the value for "${key}" (leave blank for empty)`,
    });
    if (value === undefined) {
        return undefined;
    }

    return { key: key.trim(), value };
}

// ── Command registration ───────────────────────────────────────────

export function registerFrontmatterCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.insertFrontmatter',
            async (editor) => {
                const document = editor.document;
                const text = document.getText();
                const existing = parseFrontmatter(text);

                if (existing) {
                    await handleExistingFrontmatter(editor, existing);
                } else {
                    await handleNewFrontmatter(editor);
                }
            },
        ),
    );
}

// ── No frontmatter → insert from template ──────────────────────────

async function handleNewFrontmatter(editor: vscode.TextEditor): Promise<void> {
    const items = TEMPLATES.map((t) => ({
        label: t.label,
        description: t.description,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Choose a frontmatter template',
        placeHolder: 'What kind of document is this?',
    });

    if (!picked) {
        return; // user cancelled
    }

    const template = TEMPLATES.find((t) => t.label === picked.label);
    if (!template) {
        return;
    }

    const title = titleFromFilename(editor);
    const today = todayString();
    const data = template.build(title, today);
    const serialized = serializeFrontmatter(data);

    // Insert at the very top of the document, followed by a blank line
    // so the body content is visually separated.
    const insertText = serialized + '\n\n';

    await editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(0, 0), insertText);
    });
}

// ── Existing frontmatter → edit fields ─────────────────────────────

async function handleExistingFrontmatter(
    editor: vscode.TextEditor,
    existing: import('../parsers/frontmatter').FrontmatterResult,
): Promise<void> {
    // Build quick pick items: one per existing field + an "Add Field" action
    const fieldItems: (vscode.QuickPickItem & { fieldKey?: string })[] = Object.entries(
        existing.data,
    ).map(([key, value]) => ({
        label: key,
        description: formatValueForDisplay(value),
        fieldKey: key,
    }));

    fieldItems.push({
        label: '$(add) Add Field',
        description: 'Add a new frontmatter field',
        fieldKey: undefined,
    });

    const picked = await vscode.window.showQuickPick(fieldItems, {
        title: 'Edit Frontmatter',
        placeHolder: 'Select a field to edit, or add a new one',
    });

    if (!picked) {
        return; // user cancelled
    }

    const updatedData = { ...existing.data };

    if (picked.fieldKey) {
        // Edit an existing field
        const newValue = await editFieldValue(picked.fieldKey, updatedData[picked.fieldKey]);
        if (newValue === undefined) {
            return; // user cancelled
        }
        updatedData[picked.fieldKey] = newValue;
    } else {
        // Add a new field
        const result = await promptNewField();
        if (!result) {
            return; // user cancelled
        }
        updatedData[result.key] = result.value;
    }

    // Serialize with code fences (converts --- → ``` if needed)
    const serialized = serializeFrontmatter(updatedData);

    // Replace the old frontmatter range (startLine through endLine, inclusive)
    const startPos = new vscode.Position(existing.startLine, 0);
    const endPos = new vscode.Position(
        existing.endLine,
        editor.document.lineAt(existing.endLine).text.length,
    );
    const replaceRange = new vscode.Range(startPos, endPos);

    await editor.edit((editBuilder) => {
        editBuilder.replace(replaceRange, serialized);
    });
}
