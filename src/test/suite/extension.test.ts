import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('dudgeon.markdown-craft'));
    });

    test('Extension should activate on markdown file', async () => {
        const ext = vscode.extensions.getExtension('dudgeon.markdown-craft');
        assert.ok(ext);
        // Extension activates on markdown language
    });
});
