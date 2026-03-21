import * as vscode from 'vscode';

/**
 * Decoration provider for markdown polish: heading styling,
 * inline element collapsing (bold, italic, code, links),
 * list/blockquote marker dimming.
 */
export class MarkdownPolishProvider implements vscode.Disposable {
    dispose(): void {}
}
