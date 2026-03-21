import * as vscode from 'vscode';

/**
 * Context buffer for staging multiple selections before dispatching to Claude.
 */

export interface ContextEntry {
    filePath: string;
    startLine: number;
    endLine: number;
    text: string;
}

export class ContextBuffer implements vscode.Disposable {
    private entries: ContextEntry[] = [];

    dispose(): void {}
}
