import * as vscode from 'vscode';

/**
 * File watcher for detecting external mutations (Claude Code edits).
 * Handles dirty-buffer conflict detection.
 */

export class ClaudeFileWatcher implements vscode.Disposable {
    dispose(): void {}
}
