import * as vscode from 'vscode';

/**
 * @claude annotation detection and dispatch.
 * Finds @claude mentions in CriticMarkup comments and HTML comments.
 */

export function findAnnotations(text: string): Array<{
    index: number;
    instruction: string;
}> {
    // TODO: Implement
    return [];
}
