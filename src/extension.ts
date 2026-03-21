import * as vscode from 'vscode';
import { DecorationManager } from './decorations/manager';
import { MarkdownPolishProvider } from './decorations/markdown-polish';
import { registerFormattingCommands } from './commands/formatting';
import { registerTableCommands } from './commands/tables';
import { registerFrontmatterCommands } from './commands/frontmatter';

let decorationManager: DecorationManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
    console.log('Cozy MD Editor is now active');

    // Phase 1: Decoration manager + markdown polish
    decorationManager = new DecorationManager();
    context.subscriptions.push(decorationManager);

    const polishProvider = new MarkdownPolishProvider(decorationManager);
    context.subscriptions.push(polishProvider);

    // Phase 1: Commands
    registerFormattingCommands(context);
    registerTableCommands(context);
    registerFrontmatterCommands(context);

    // Trigger initial decoration update for the active editor
    if (vscode.window.activeTextEditor) {
        decorationManager.update();
    }

    // Phase 2: Register CriticMarkup decorations
    // Phase 2: Register CodeLens provider
    // Phase 3: Register track changes
    // Phase 3: Register Claude dispatch commands
}

export function deactivate(): void {
    decorationManager = undefined;
}
