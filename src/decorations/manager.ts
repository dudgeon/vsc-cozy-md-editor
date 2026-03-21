import * as vscode from 'vscode';

/**
 * Manages decoration lifecycle for the expand-on-cursor pattern.
 * Each decoration provider registers collapsed/expanded decoration pairs.
 * The manager swaps between them based on cursor position.
 */
export class DecorationManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Register cursor change listener
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
