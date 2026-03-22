/**
 * Auto-format markdown tables on save.
 *
 * Registers a `workspace.onWillSaveTextDocument` handler that detects
 * contiguous pipe-delimited table regions, parses them, and replaces
 * them with column-padded versions produced by serializeTable().
 */

import * as vscode from 'vscode';
import { parseTable, serializeTable } from '../parsers/markdown-table';

/**
 * Identify contiguous blocks of lines that each contain at least one `|`.
 * Returns an array of [startLine, endLine] pairs (inclusive).
 */
function findTableRegions(document: vscode.TextDocument): Array<[number, number]> {
    const regions: Array<[number, number]> = [];
    let regionStart: number | null = null;

    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.includes('|')) {
            if (regionStart === null) {
                regionStart = i;
            }
        } else {
            if (regionStart !== null) {
                regions.push([regionStart, i - 1]);
                regionStart = null;
            }
        }
    }

    // Close any region that extends to the end of the document
    if (regionStart !== null) {
        regions.push([regionStart, document.lineCount - 1]);
    }

    return regions;
}

/**
 * Build TextEdits that replace each table region with its formatted version.
 * Only produces an edit when the serialized output differs from the original text.
 */
function computeTableEdits(document: vscode.TextDocument): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    const regions = findTableRegions(document);

    for (const [start, end] of regions) {
        const rangeText = document.getText(
            new vscode.Range(start, 0, end, document.lineAt(end).text.length),
        );

        const table = parseTable(rangeText, start);
        if (!table) {
            continue;
        }

        const formatted = serializeTable(table);

        // Only replace if the formatted text actually differs
        if (formatted === rangeText) {
            continue;
        }

        const range = new vscode.Range(start, 0, end, document.lineAt(end).text.length);
        edits.push(vscode.TextEdit.replace(range, formatted));
    }

    return edits;
}

/**
 * Register the on-save table formatter.
 * Respects the `cozyMd.tables.autoAlignOnSave` setting (default: true).
 */
export function registerTableFormatter(context: vscode.ExtensionContext): void {
    const disposable = vscode.workspace.onWillSaveTextDocument((event) => {
        if (event.document.languageId !== 'markdown') {
            return;
        }

        const config = vscode.workspace.getConfiguration('cozyMd.tables');
        if (!config.get<boolean>('autoAlignOnSave', true)) {
            return;
        }

        event.waitUntil(Promise.resolve(computeTableEdits(event.document)));
    });

    context.subscriptions.push(disposable);
}
