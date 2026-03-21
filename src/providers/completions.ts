import * as vscode from 'vscode';

/**
 * Completion provider for frontmatter templates and CriticMarkup shortcuts.
 */

export class MarkdownCraftCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        // TODO: Implement
        return [];
    }
}
