import * as vscode from 'vscode';

export class MarkdownCraftHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | null {
        // TODO: Implement for non-CriticMarkup hover needs
        return null;
    }
}
