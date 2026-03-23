import * as vscode from 'vscode';
import { convertHtmlToMarkdown } from './turndown-config';

const PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'richText');

export class RichTextPasteProvider implements vscode.DocumentPasteEditProvider {
    async provideDocumentPasteEdits(
        _document: vscode.TextDocument,
        _ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        _context: vscode.DocumentPasteEditContext,
        token: vscode.CancellationToken,
    ): Promise<vscode.DocumentPasteEdit[] | undefined> {
        const enabled = vscode.workspace.getConfiguration('cozyMd.paste')
            .get<boolean>('convertHtmlToMarkdown', true);
        if (!enabled) return undefined;

        const htmlItem = dataTransfer.get('text/html');
        if (!htmlItem) return undefined;

        const html = await htmlItem.asString();
        if (token.isCancellationRequested) return undefined;

        const markdown = convertHtmlToMarkdown(html);
        if (!markdown) return undefined;

        const edit = new vscode.DocumentPasteEdit(markdown, 'Paste as Markdown', PASTE_KIND);
        edit.yieldTo = [
            vscode.DocumentDropOrPasteEditKind.Empty.append('text', 'uri'),
        ];
        return [edit];
    }
}

/**
 * Register the paste provider. Call from extension.ts activate().
 */
export function registerPasteProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerDocumentPasteEditProvider(
            { language: 'markdown' },
            new RichTextPasteProvider(),
            { providedPasteEditKinds: [PASTE_KIND], pasteMimeTypes: ['text/html'] }
        )
    );
}
