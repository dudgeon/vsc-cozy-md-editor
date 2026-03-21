import * as vscode from 'vscode';
import { MarkdownPolishProvider } from './markdown-polish';

/**
 * Manages decoration lifecycle for the expand-on-cursor pattern.
 *
 * Responsibilities:
 * - Owns decoration providers (MarkdownPolishProvider, later CriticMarkupDecorationProvider)
 * - Listens to editor/cursor/document change events
 * - Triggers full re-parse on document changes, lightweight cursor-swap on selection changes
 * - Only activates for markdown files
 *
 * The cursor-move handler is the hot path: it swaps decoration type pairs
 * rather than rebuilding all decorations from scratch.
 */
export class DecorationManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private polishProvider: MarkdownPolishProvider;

    /** Debounce timer for document changes (re-parse is more expensive). */
    private documentChangeTimer: ReturnType<typeof setTimeout> | undefined;
    private static readonly DOCUMENT_CHANGE_DELAY_MS = 50;

    constructor() {
        this.polishProvider = new MarkdownPolishProvider();

        // Listen for active editor changes.
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor && this.isMarkdown(editor)) {
                    this.polishProvider.invalidateCache();
                    this.polishProvider.updateDecorations(editor);
                }
            })
        );

        // Listen for cursor/selection changes — hot path, no re-parse.
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection((event) => {
                if (this.isMarkdown(event.textEditor)) {
                    this.polishProvider.swapForCursor(event.textEditor);
                }
            })
        );

        // Listen for document content changes — debounced full re-parse.
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.document !== event.document) {
                    return;
                }
                if (!this.isMarkdown(editor)) {
                    return;
                }

                // Debounce: coalesce rapid typing into a single re-parse.
                if (this.documentChangeTimer !== undefined) {
                    clearTimeout(this.documentChangeTimer);
                }
                this.documentChangeTimer = setTimeout(() => {
                    this.documentChangeTimer = undefined;
                    // Re-check that editor is still active and still markdown.
                    const currentEditor = vscode.window.activeTextEditor;
                    if (currentEditor && currentEditor.document === event.document && this.isMarkdown(currentEditor)) {
                        this.polishProvider.invalidateCache();
                        this.polishProvider.updateDecorations(currentEditor);
                    }
                }, DecorationManager.DOCUMENT_CHANGE_DELAY_MS);
            })
        );

        // Listen for configuration changes that affect decorations.
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('markdownCraft.polish')) {
                    this.polishProvider.invalidateCache();
                    const editor = vscode.window.activeTextEditor;
                    if (editor && this.isMarkdown(editor)) {
                        this.polishProvider.updateDecorations(editor);
                    }
                }
            })
        );

        // Decorate the already-active editor on startup.
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && this.isMarkdown(activeEditor)) {
            this.polishProvider.updateDecorations(activeEditor);
        }
    }

    /**
     * Check whether an editor is showing a markdown document.
     */
    private isMarkdown(editor: vscode.TextEditor): boolean {
        return editor.document.languageId === 'markdown';
    }

    dispose(): void {
        if (this.documentChangeTimer !== undefined) {
            clearTimeout(this.documentChangeTimer);
        }
        this.polishProvider.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
