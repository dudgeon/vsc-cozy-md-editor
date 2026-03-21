import * as vscode from 'vscode';

/**
 * Hover provider for CriticMarkup comment tooltips and change details.
 */

export class MarkdownCraftHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | null {
        // TODO: Implement
        return null;
    }
}
