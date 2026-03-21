import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
    console.log('Cozy MD Editor is now active');

    // Phase 1: Register decoration manager
    // Phase 1: Register commands (tables, frontmatter, formatting)
    // Phase 1: Register toolbar actions
    // Phase 2: Register CriticMarkup decorations
    // Phase 2: Register CodeLens provider
    // Phase 3: Register track changes
    // Phase 3: Register Claude dispatch commands
}

export function deactivate(): void {
    // Cleanup
}
