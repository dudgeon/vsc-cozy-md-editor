import * as vscode from 'vscode';

/**
 * CodeLens provider for Accept/Reject buttons on CriticMarkup,
 * table operations, @claude tags, and frontmatter actions.
 */

export class MarkdownCraftCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        // TODO: Implement
        return [];
    }
}
