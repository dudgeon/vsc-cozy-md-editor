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
import { registerClaudeCommands } from './commands/claude';
import { registerPasteProvider } from './paste/provider';
import { applyTypographyBundle } from './typography';

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

    // Typography bundle: apply on activation and watch for changes
    applyTypographyBundle();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cozyMd.typography')) {
                applyTypographyBundle();
            }
        })
    );

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
    // Phase 4: MD/Cozy decoration toggle
    vscode.commands.executeCommand('setContext', 'cozyMd.decorationsEnabled', true);
    context.subscriptions.push(
        vscode.commands.registerCommand('cozyMd.enableDecorations', () => {
            decorationManager?.setEnabled(true);
            vscode.commands.executeCommand('setContext', 'cozyMd.decorationsEnabled', true);
        }),
        vscode.commands.registerCommand('cozyMd.disableDecorations', () => {
            decorationManager?.setEnabled(false);
            vscode.commands.executeCommand('setContext', 'cozyMd.decorationsEnabled', false);
        }),
    );

    // Phase 3: Toggle preview (one-line wrapper)
    context.subscriptions.push(
        vscode.commands.registerCommand('cozyMd.togglePreview', () => {
            vscode.commands.executeCommand('markdown.showPreviewToSide');
        })
    );

    // Phase 3: Register Claude dispatch commands
    registerClaudeCommands(context);

    // Phase 4: Rich text paste → markdown conversion
    registerPasteProvider(context);

    // Phase 4: Light/dark mode toggle (cycles Light → Dark → Auto)
    // Uses setContext to swap which button label is visible in the toolbar.
    function updateThemeContext(): void {
        const autoDetect = vscode.workspace.getConfiguration('window')
            .get<boolean>('autoDetectColorScheme', false);
        if (autoDetect) {
            vscode.commands.executeCommand('setContext', 'cozyMd.themeMode', 'auto');
        } else {
            const theme = vscode.workspace.getConfiguration('workbench')
                .get<string>('colorTheme', '');
            const isLight = theme.toLowerCase().includes('light');
            vscode.commands.executeCommand('setContext', 'cozyMd.themeMode', isLight ? 'light' : 'dark');
        }
    }
    updateThemeContext();

    // Listen for theme/setting changes to keep context in sync
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.colorTheme') ||
                e.affectsConfiguration('window.autoDetectColorScheme')) {
                updateThemeContext();
            }
        })
    );

    // Three commands, one per state → each shows what clicking will switch TO
    context.subscriptions.push(
        vscode.commands.registerCommand('cozyMd.themeToDark', async () => {
            await vscode.workspace.getConfiguration('window')
                .update('autoDetectColorScheme', false, vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration('workbench')
                .update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
        }),
        vscode.commands.registerCommand('cozyMd.themeToAuto', async () => {
            await vscode.workspace.getConfiguration('window')
                .update('autoDetectColorScheme', true, vscode.ConfigurationTarget.Global);
        }),
        vscode.commands.registerCommand('cozyMd.themeToLight', async () => {
            await vscode.workspace.getConfiguration('window')
                .update('autoDetectColorScheme', false, vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration('workbench')
                .update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
        }),
    );
}

export function deactivate(): void {
    decorationManager = undefined;
}
