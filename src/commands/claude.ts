import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Claude Code dispatch commands.
 * All dispatch works via VS Code terminal with sendText.
 * Gracefully degrades when Claude is not installed or disabled via settings.
 */

/**
 * Find an existing Claude terminal or create a new one.
 * Priority: named terminal > most recent terminal > new terminal.
 */
function findOrCreateClaudeTerminal(): vscode.Terminal {
    const config = vscode.workspace.getConfiguration('cozyMd.claude');
    const terminalName = config.get<string>('terminalName', 'Claude');

    // 1. Find existing terminal with the configured name
    const existing = vscode.window.terminals.find(t => t.name === terminalName);
    if (existing) { return existing; }

    // 2. Fall back to most recent terminal
    if (vscode.window.terminals.length > 0) {
        return vscode.window.terminals[vscode.window.terminals.length - 1];
    }

    // 3. Create a new terminal
    return vscode.window.createTerminal(terminalName);
}

/**
 * Check whether Claude dispatch is enabled. Shows a message if disabled.
 * Returns true if enabled, false if disabled.
 */
function isClaudeEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('cozyMd.claude');
    const enabled = config.get<boolean>('enabled', true);
    if (!enabled) {
        vscode.window.showInformationMessage(
            'Claude integration is disabled. Enable it in Settings → Cozy MD → Claude → Enabled.'
        );
    }
    return enabled;
}

/**
 * Escape double quotes in a string for safe shell interpolation.
 */
function escapeForShell(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

export function registerClaudeCommands(context: vscode.ExtensionContext): void {

    // 1. Ask Claude About File — sends the active file for review
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.askClaudeAboutFile',
            (editor: vscode.TextEditor) => {
                if (!isClaudeEnabled()) { return; }

                const filePath = editor.document.uri.fsPath;
                if (!filePath) {
                    vscode.window.showWarningMessage('No file is open.');
                    return;
                }

                const terminal = findOrCreateClaudeTerminal();
                terminal.show();
                terminal.sendText(`claude "Review this file and provide feedback" "${filePath}"`);
            }
        )
    );

    // 2. Ask Claude About Selection — prompts for instruction, sends selection as context
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.askClaudeAboutSelection',
            async (editor: vscode.TextEditor) => {
                if (!isClaudeEnabled()) { return; }

                const selection = editor.selection;
                const selectedText = editor.document.getText(selection);
                if (!selectedText) {
                    vscode.window.showWarningMessage('No text is selected.');
                    return;
                }

                const prompt = await vscode.window.showInputBox({
                    prompt: 'What should Claude do with this selection?',
                    placeHolder: 'e.g., "Rewrite this paragraph for clarity"',
                });
                if (!prompt) { return; } // User cancelled

                const filename = path.basename(editor.document.uri.fsPath);
                const escapedPrompt = escapeForShell(prompt);
                const escapedSelection = escapeForShell(selectedText);

                const terminal = findOrCreateClaudeTerminal();
                terminal.show();
                terminal.sendText(
                    `claude "${escapedPrompt}\n\nContext from ${filename}:\n${escapedSelection}"`
                );
            }
        )
    );

    // 3. Send File to Claude Context — adds the file via /add
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'cozyMd.sendFileToClaudeContext',
            (editor: vscode.TextEditor) => {
                if (!isClaudeEnabled()) { return; }

                const filePath = editor.document.uri.fsPath;
                if (!filePath) {
                    vscode.window.showWarningMessage('No file is open.');
                    return;
                }

                const terminal = findOrCreateClaudeTerminal();
                terminal.show();
                terminal.sendText(`/add "${filePath}"`);

                const filename = path.basename(filePath);
                vscode.window.showInformationMessage(`Added ${filename} to Claude's context`);
            }
        )
    );
}
