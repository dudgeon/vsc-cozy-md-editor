import * as vscode from 'vscode';
import { parseCriticMarkup, CriticMarkupRange } from '../parsers/criticmarkup';
import { DecorationManager, DecorationProvider, DecoratedRegion } from './manager';

// ---------------------------------------------------------------------------
// Sub-provider IDs
// ---------------------------------------------------------------------------

const ID_DELIMITERS = 'criticmarkup-delimiters';
const ID_ADDITION_CONTENT = 'criticmarkup-addition-content';
const ID_DELETION_CONTENT = 'criticmarkup-deletion-content';
const ID_SUB_OLD = 'criticmarkup-substitution-old';
const ID_SUB_NEW = 'criticmarkup-substitution-new';
const ID_SUB_ARROW = 'criticmarkup-substitution-arrow';
const ID_COMMENT = 'criticmarkup-comment';
const ID_HIGHLIGHT_CONTENT = 'criticmarkup-highlight-content';

// ---------------------------------------------------------------------------
// Styles — collapsed (cursor away) / expanded (cursor on)
// ---------------------------------------------------------------------------

/**
 * Hidden style: transparent color + negative letter-spacing collapses
 * characters to zero visual width. Used for delimiters, old text in
 * substitutions, arrows, and comments when cursor is away.
 */
const HIDDEN: vscode.DecorationRenderOptions = {
    color: 'transparent',
    letterSpacing: '-1em',
};

/** Dimmed style for expanded delimiters/arrows — visible but low contrast. */
const DIMMED: vscode.DecorationRenderOptions = {
    opacity: '0.4',
};

// --- Addition ---

const ADDITION_CONTENT_COLLAPSED: vscode.DecorationRenderOptions = {
    color: 'rgba(0, 180, 0, 1)',
    textDecoration: 'underline rgba(0, 180, 0, 0.4)',
};

const ADDITION_CONTENT_EXPANDED: vscode.DecorationRenderOptions = {
    backgroundColor: 'rgba(0, 180, 0, 0.15)',
};

// --- Deletion ---

const DELETION_CONTENT_COLLAPSED: vscode.DecorationRenderOptions = {
    color: 'rgba(220, 50, 50, 1)',
    textDecoration: 'line-through rgba(220, 50, 50, 0.6)',
};

const DELETION_CONTENT_EXPANDED: vscode.DecorationRenderOptions = {
    backgroundColor: 'rgba(255, 0, 0, 0.12)',
    textDecoration: 'line-through',
};

// --- Substitution old text ---

const SUB_OLD_COLLAPSED: vscode.DecorationRenderOptions = {
    ...HIDDEN,
};

const SUB_OLD_EXPANDED: vscode.DecorationRenderOptions = {
    backgroundColor: 'rgba(255, 0, 0, 0.12)',
    textDecoration: 'line-through',
};

// --- Substitution new text ---

const SUB_NEW_COLLAPSED: vscode.DecorationRenderOptions = {
    color: 'rgba(0, 180, 0, 1)',
};

const SUB_NEW_EXPANDED: vscode.DecorationRenderOptions = {
    backgroundColor: 'rgba(0, 180, 0, 0.15)',
};

// --- Comment ---

// TODO: Emoji choice (💬) may need tuning based on user feedback — consider
// alternatives like 🗨, 📝, or a themed icon if emoji rendering is inconsistent.
const COMMENT_COLLAPSED: vscode.DecorationRenderOptions = {
    // Comment text stays visible — only delimiters are hidden (handled by
    // the delimiter provider). Show italic + subtle background + icon.
    fontStyle: 'italic',
    backgroundColor: 'rgba(255, 200, 0, 0.08)',
    before: {
        contentText: '💬',
        color: 'rgba(255, 180, 0, 0.7)',
        margin: '0 4px 0 0',
    },
};

const COMMENT_EXPANDED: vscode.DecorationRenderOptions = {
    backgroundColor: 'rgba(255, 200, 0, 0.15)',
    fontStyle: 'italic',
};

// --- Highlight content ---

// TODO: Emoji choice (✎) may need tuning based on user feedback — consider
// alternatives or a themed icon if rendering is inconsistent across platforms.
const HIGHLIGHT_CONTENT_COLLAPSED: vscode.DecorationRenderOptions = {
    backgroundColor: 'rgba(255, 255, 0, 0.15)',
    before: {
        contentText: '✎',
        color: 'rgba(200, 180, 0, 0.7)',
        margin: '0 2px 0 0',
    },
};

const HIGHLIGHT_CONTENT_EXPANDED: vscode.DecorationRenderOptions = {
    backgroundColor: 'rgba(255, 255, 0, 0.2)',
};

// ---------------------------------------------------------------------------
// Shared parse helper
// ---------------------------------------------------------------------------

/**
 * Parse the active document and return CriticMarkup ranges.
 * Returns an empty array for non-markdown documents.
 */
function parseDocument(editor: vscode.TextEditor): CriticMarkupRange[] {
    if (editor.document.languageId !== 'markdown') {
        return [];
    }
    return parseCriticMarkup(editor.document.getText());
}

/**
 * Convert a character offset to a VS Code Position using the document.
 */
function pos(doc: vscode.TextDocument, offset: number): vscode.Position {
    return doc.positionAt(offset);
}

// ---------------------------------------------------------------------------
// Sub-providers
// ---------------------------------------------------------------------------

/**
 * Delimiter provider — targets all delimiter characters across every
 * CriticMarkup type ({++, ++}, {--, --}, {~~, ~~}, {>>, <<}, {==, ==}).
 * Collapsed: hidden. Expanded: dimmed (opacity 0.4).
 */
class DelimiterProvider implements DecorationProvider {
    readonly id = ID_DELIMITERS;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const ranges = parseDocument(editor);
        const regions: DecoratedRegion[] = [];

        for (const r of ranges) {
            const groupId = `cm-${r.start}`;
            const spanRange = new vscode.Range(pos(doc, r.start), pos(doc, r.end));

            // All types have a 3-char opening delimiter and 3-char closing delimiter
            const openRange = new vscode.Range(pos(doc, r.start), pos(doc, r.start + 3));
            const closeRange = new vscode.Range(pos(doc, r.end - 3), pos(doc, r.end));

            regions.push({
                range: openRange,
                collapsedDecoration: { range: openRange },
                expandedDecoration: { range: openRange },
                groupId,
                spanRange,
            });

            // For comments, the closing delimiter is part of the comment provider
            // since the entire construct is hidden. We still register delimiters
            // here so they are dimmed when expanded.
            regions.push({
                range: closeRange,
                collapsedDecoration: { range: closeRange },
                expandedDecoration: { range: closeRange },
                groupId,
                spanRange,
            });
        }

        return regions;
    }
}

/**
 * Addition content provider — targets the text between {++ and ++}.
 * Collapsed: green color + subtle underline. Expanded: green background.
 */
class AdditionContentProvider implements DecorationProvider {
    readonly id = ID_ADDITION_CONTENT;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const ranges = parseDocument(editor);
        const regions: DecoratedRegion[] = [];

        for (const r of ranges) {
            if (r.type !== 'addition') {
                continue;
            }

            const groupId = `cm-${r.start}`;
            const spanRange = new vscode.Range(pos(doc, r.start), pos(doc, r.end));
            const contentStart = pos(doc, r.start + 3);
            const contentEnd = pos(doc, r.end - 3);

            if (contentStart.isBefore(contentEnd)) {
                const contentRange = new vscode.Range(contentStart, contentEnd);
                regions.push({
                    range: contentRange,
                    collapsedDecoration: { range: contentRange },
                    expandedDecoration: { range: contentRange },
                    groupId,
                    spanRange,
                });
            }
        }

        return regions;
    }
}

/**
 * Deletion content provider — targets the text between {-- and --}.
 * Collapsed: red color + strikethrough. Expanded: red background + strikethrough.
 */
class DeletionContentProvider implements DecorationProvider {
    readonly id = ID_DELETION_CONTENT;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const ranges = parseDocument(editor);
        const regions: DecoratedRegion[] = [];

        for (const r of ranges) {
            if (r.type !== 'deletion') {
                continue;
            }

            const groupId = `cm-${r.start}`;
            const spanRange = new vscode.Range(pos(doc, r.start), pos(doc, r.end));
            const contentStart = pos(doc, r.start + 3);
            const contentEnd = pos(doc, r.end - 3);

            if (contentStart.isBefore(contentEnd)) {
                const contentRange = new vscode.Range(contentStart, contentEnd);
                regions.push({
                    range: contentRange,
                    collapsedDecoration: { range: contentRange },
                    expandedDecoration: { range: contentRange },
                    groupId,
                    spanRange,
                });
            }
        }

        return regions;
    }
}

/**
 * Substitution old text provider — targets old text in {~~ old ~> new ~~}.
 * Collapsed: hidden (transparent + negative letter-spacing).
 * Expanded: red background + strikethrough.
 */
class SubstitutionOldProvider implements DecorationProvider {
    readonly id = ID_SUB_OLD;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const ranges = parseDocument(editor);
        const regions: DecoratedRegion[] = [];

        for (const r of ranges) {
            if (r.type !== 'substitution') {
                continue;
            }

            const oldText = r.oldText ?? '';
            const groupId = `cm-${r.start}`;
            const spanRange = new vscode.Range(pos(doc, r.start), pos(doc, r.end));
            const oldStart = pos(doc, r.start + 3);
            const oldEnd = pos(doc, r.start + 3 + oldText.length);

            if (oldStart.isBefore(oldEnd)) {
                const oldRange = new vscode.Range(oldStart, oldEnd);
                regions.push({
                    range: oldRange,
                    collapsedDecoration: { range: oldRange },
                    expandedDecoration: { range: oldRange },
                    groupId,
                    spanRange,
                });
            }
        }

        return regions;
    }
}

/**
 * Substitution new text provider — targets new text in {~~ old ~> new ~~}.
 * Collapsed: green color. Expanded: green background.
 */
class SubstitutionNewProvider implements DecorationProvider {
    readonly id = ID_SUB_NEW;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const ranges = parseDocument(editor);
        const regions: DecoratedRegion[] = [];

        for (const r of ranges) {
            if (r.type !== 'substitution') {
                continue;
            }

            const oldText = r.oldText ?? '';
            const groupId = `cm-${r.start}`;
            const spanRange = new vscode.Range(pos(doc, r.start), pos(doc, r.end));
            // new text starts after `{~~` + oldText + `~>` = start + 3 + oldLen + 2
            const newStart = pos(doc, r.start + 3 + oldText.length + 2);
            const newEnd = pos(doc, r.end - 3);

            if (newStart.isBefore(newEnd)) {
                const newRange = new vscode.Range(newStart, newEnd);
                regions.push({
                    range: newRange,
                    collapsedDecoration: { range: newRange },
                    expandedDecoration: { range: newRange },
                    groupId,
                    spanRange,
                });
            }
        }

        return regions;
    }
}

/**
 * Substitution arrow provider — targets the `~>` in {~~ old ~> new ~~}.
 * Collapsed: hidden. Expanded: dimmed (opacity 0.4).
 */
class SubstitutionArrowProvider implements DecorationProvider {
    readonly id = ID_SUB_ARROW;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const ranges = parseDocument(editor);
        const regions: DecoratedRegion[] = [];

        for (const r of ranges) {
            if (r.type !== 'substitution') {
                continue;
            }

            const oldText = r.oldText ?? '';
            const groupId = `cm-${r.start}`;
            const spanRange = new vscode.Range(pos(doc, r.start), pos(doc, r.end));
            const arrowStart = pos(doc, r.start + 3 + oldText.length);
            const arrowEnd = pos(doc, r.start + 3 + oldText.length + 2);
            const arrowRange = new vscode.Range(arrowStart, arrowEnd);

            regions.push({
                range: arrowRange,
                collapsedDecoration: { range: arrowRange },
                expandedDecoration: { range: arrowRange },
                groupId,
                spanRange,
            });
        }

        return regions;
    }
}

/**
 * Comment provider — targets the ENTIRE comment construct {>> text <<}.
 * Collapsed: completely hidden (transparent + negative letter-spacing).
 * Expanded: amber background + italic.
 *
 * Note: We target the comment content only (between delimiters). The
 * delimiters are handled by the delimiter provider (hidden/dimmed).
 */
class CommentContentProvider implements DecorationProvider {
    readonly id = ID_COMMENT;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const ranges = parseDocument(editor);
        const regions: DecoratedRegion[] = [];

        for (const r of ranges) {
            if (r.type !== 'comment') {
                continue;
            }

            const groupId = `cm-${r.start}`;
            const spanRange = new vscode.Range(pos(doc, r.start), pos(doc, r.end));
            const contentStart = pos(doc, r.start + 3);
            const contentEnd = pos(doc, r.end - 3);

            if (contentStart.isBefore(contentEnd)) {
                const contentRange = new vscode.Range(contentStart, contentEnd);
                regions.push({
                    range: contentRange,
                    collapsedDecoration: { range: contentRange },
                    expandedDecoration: { range: contentRange },
                    groupId,
                    spanRange,
                });
            }
        }

        return regions;
    }
}

/**
 * Highlight content provider — targets the text between {== and ==}.
 * Collapsed: subtle yellow background. Expanded: slightly stronger yellow.
 */
class HighlightContentProvider implements DecorationProvider {
    readonly id = ID_HIGHLIGHT_CONTENT;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const ranges = parseDocument(editor);
        const regions: DecoratedRegion[] = [];

        for (const r of ranges) {
            if (r.type !== 'highlight') {
                continue;
            }

            const groupId = `cm-${r.start}`;
            const spanRange = new vscode.Range(pos(doc, r.start), pos(doc, r.end));
            const contentStart = pos(doc, r.start + 3);
            const contentEnd = pos(doc, r.end - 3);

            if (contentStart.isBefore(contentEnd)) {
                const contentRange = new vscode.Range(contentStart, contentEnd);
                regions.push({
                    range: contentRange,
                    collapsedDecoration: { range: contentRange },
                    expandedDecoration: { range: contentRange },
                    groupId,
                    spanRange,
                });
            }
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

/**
 * CriticMarkup decoration provider using the DecorationManager's
 * expand-on-cursor system for Google Docs-style track changes rendering.
 *
 * When the cursor is AWAY from a CriticMarkup span:
 *   - Additions: green text with subtle underline, delimiters hidden
 *   - Deletions: red text with strikethrough, delimiters hidden
 *   - Substitutions: old text + delimiters + arrow hidden, new text in green
 *   - Comments: entirely invisible
 *   - Highlights: subtle yellow background, delimiters hidden
 *
 * When the cursor is ON a CriticMarkup span:
 *   - All delimiters visible but dimmed (opacity 0.4)
 *   - Content shown with colored backgrounds
 *   - Full syntax revealed for editing
 */
export class CriticMarkupDecorationProvider implements vscode.Disposable {
    private readonly registeredIds: string[] = [];

    constructor(private readonly manager: DecorationManager) {
        // 1. Delimiters — shared across all CriticMarkup types
        //    Collapsed: hidden. Expanded: dimmed.
        this.register(new DelimiterProvider(), HIDDEN, DIMMED);

        // 2. Addition content
        this.register(
            new AdditionContentProvider(),
            ADDITION_CONTENT_COLLAPSED,
            ADDITION_CONTENT_EXPANDED,
        );

        // 3. Deletion content
        this.register(
            new DeletionContentProvider(),
            DELETION_CONTENT_COLLAPSED,
            DELETION_CONTENT_EXPANDED,
        );

        // 4. Substitution old text
        this.register(
            new SubstitutionOldProvider(),
            SUB_OLD_COLLAPSED,
            SUB_OLD_EXPANDED,
        );

        // 5. Substitution new text
        this.register(
            new SubstitutionNewProvider(),
            SUB_NEW_COLLAPSED,
            SUB_NEW_EXPANDED,
        );

        // 6. Substitution arrow (~>)
        this.register(new SubstitutionArrowProvider(), HIDDEN, DIMMED);

        // 7. Comment content
        this.register(
            new CommentContentProvider(),
            COMMENT_COLLAPSED,
            COMMENT_EXPANDED,
        );

        // 8. Highlight content
        this.register(
            new HighlightContentProvider(),
            HIGHLIGHT_CONTENT_COLLAPSED,
            HIGHLIGHT_CONTENT_EXPANDED,
        );
    }

    private register(
        provider: DecorationProvider,
        collapsed: vscode.DecorationRenderOptions,
        expanded: vscode.DecorationRenderOptions,
    ): void {
        this.manager.registerProvider(provider, collapsed, expanded);
        this.registeredIds.push(provider.id);
    }

    dispose(): void {
        for (const id of this.registeredIds) {
            this.manager.unregisterProvider(id);
        }
    }
}
