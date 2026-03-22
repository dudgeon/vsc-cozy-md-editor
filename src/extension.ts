import * as vscode from 'vscode';
import { DecorationManager } from './decorations/manager';
import { MarkdownPolishProvider } from './decorations/markdown-polish';
import { registerFormattingCommands } from './commands/formatting';
import { registerTableCommands } from './commands/tables';
import { registerFrontmatterCommands } from './commands/frontmatter';
import { registerTableFormatter } from './commands/table-formatter';
import { registerEditingCommands } from './commands/editing';
import { MarkdownCraftCodeLensProvider, registerTableCodeLensCommands } from './providers/codelens';
import { CriticMarkupDecorationProvider } from './decorations/criticmarkup';
import { registerTrackChangesCommands } from './commands/track-changes';

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
    registerTableFormatter(context);
    registerEditingCommands(context);

    // Trigger initial decoration update for the active editor
    if (vscode.window.activeTextEditor) {
        decorationManager.update();
    }

    // Phase 1: Table CodeLens (toolbar above tables)
    const codeLensProvider = new MarkdownCraftCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'markdown' },
            codeLensProvider
        )
    );
    context.subscriptions.push(codeLensProvider);
    registerTableCodeLensCommands(context);

    // Phase 2: CriticMarkup decorations (Google Docs-style expand-on-cursor)
    const criticMarkupProvider = new CriticMarkupDecorationProvider(decorationManager);
    context.subscriptions.push(criticMarkupProvider);

    // Phase 2: Register CriticMarkup decorations (done above)
    // Phase 2: CodeLens provider now includes CriticMarkup accept/reject (in codelens.ts)
    // Phase 3: Track changes commands (accept/reject, navigation)
    registerTrackChangesCommands(context);
    // Phase 3: Register Claude dispatch commands
}

export function deactivate(): void {
    decorationManager = undefined;
}
