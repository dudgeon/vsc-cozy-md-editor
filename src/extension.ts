import * as vscode from 'vscode';
import { DecorationManager } from './decorations/manager';
import { registerFormattingCommands } from './commands/formatting';
import { registerTableCommands } from './commands/tables';
import { registerFrontmatterCommands } from './commands/frontmatter';

export function activate(context: vscode.ExtensionContext): void {
    console.log('Markdown Craft is now active');

    // Phase 1: Decoration manager (markdown polish, expand-on-cursor)
    const decorationManager = new DecorationManager();
    context.subscriptions.push(decorationManager);

    // Phase 1: Commands
    registerFormattingCommands(context);
    registerTableCommands(context);
    registerFrontmatterCommands(context);

    // Phase 2: CriticMarkup decorations — integrated into DecorationManager
    // Phase 2: Register CodeLens provider (TODO)
    // Phase 3: Register track changes
    // Phase 3: Register Claude dispatch commands
}

export function deactivate(): void {
    // Cleanup
}
