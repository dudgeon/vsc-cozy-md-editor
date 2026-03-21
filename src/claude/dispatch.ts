import * as vscode from 'vscode';

/**
 * Claude Code terminal dispatch.
 * Finds or creates a terminal named "Claude Code" and sends commands.
 * Designed to be swappable if Claude Code exposes a programmatic API.
 */

export class ClaudeDispatch implements vscode.Disposable {
    dispose(): void {}
}
