import * as vscode from 'vscode';
import { DecorationProvider, DecoratedRegion, DecorationManager } from './manager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Opacity value used for the dimmed frontmatter block in collapsed state. */
const FRONTMATTER_DIM_OPACITY = '0.4';

/** Opacity value used for dimmed fence markers in code blocks. */
const CODE_BLOCK_FENCE_DIM_OPACITY = '0.4';

// ---------------------------------------------------------------------------
// Shared hiding style
// ---------------------------------------------------------------------------

/**
 * The "hiding" collapsed style makes characters invisible and occupy zero
 * visual space by combining transparent color with negative letter-spacing.
 * Used for heading markers, bold/italic markers, link syntax, backticks.
 */
const HIDDEN_COLLAPSED: vscode.DecorationRenderOptions = {
    color: 'transparent',
    letterSpacing: '-1em',
};

/** Expanded style with no overrides — renders markers normally. */
const VISIBLE_EXPANDED: vscode.DecorationRenderOptions = {
    // No overrides — markers rendered normally.
};

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches ATX headings at the start of a line: `# ` through `###### `.
 * Captures: (1) the `# ` markers, (2) the heading text.
 */
const HEADING_RE = /^(#{1,6})\s+(.*\S.*)$/;

/**
 * Matches bold-italic (`***...***`), bold (`**...**`), or italic (`*...*`).
 * Non-greedy, avoids empty delimiters.
 *
 * Captures: (1) opening marker, (2) content, (3) closing marker (same as 1).
 */
const BOLD_ITALIC_RE = /(\*{1,3})([^\s*](?:.*?[^\s*])?\s*)\1/g;

/**
 * Matches inline code: single or multiple backtick delimiters.
 * Does NOT match fenced code block lines (handled separately).
 *
 * Captures: (1) opening backtick(s), (2) content, (3) closing backtick(s).
 */
const INLINE_CODE_RE = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g;

/**
 * Matches inline links: `[text](url)`.
 * Captures: (1) link text, (2) URL.
 */
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Matches blockquote lines: optional leading whitespace, one or more `>`
 * characters (possibly separated by spaces), then a space and content.
 *
 * Captures: (1) the full blockquote prefix including all `>` markers and
 * the trailing space (e.g. `> `, `>> `, `> > `).
 */
const BLOCKQUOTE_RE = /^(\s*(?:>\s*)+)/;

// ---------------------------------------------------------------------------
// Sub-provider IDs
// ---------------------------------------------------------------------------

const ID_HEADING_MARKERS = 'markdown-polish-heading-markers';
const ID_HEADING_TEXT_H1 = 'markdown-polish-heading-text-h1';
const ID_HEADING_TEXT_H2 = 'markdown-polish-heading-text-h2';
const ID_HEADING_TEXT_H3 = 'markdown-polish-heading-text-h3';
const ID_HEADING_TEXT_H46 = 'markdown-polish-heading-text-h46';
const ID_BOLD_ITALIC_MARKERS = 'markdown-polish-bold-italic-markers';
const ID_LINK_MARKERS = 'markdown-polish-link-markers';
const ID_LINK_TEXT = 'markdown-polish-link-text';
const ID_INLINE_CODE_MARKERS = 'markdown-polish-inline-code-markers';
const ID_INLINE_CODE_CONTENT = 'markdown-polish-inline-code-content';
const ID_CODE_BLOCK_FENCES = 'markdown-polish-code-block-fences';
const ID_CODE_BLOCK_CONTENT = 'markdown-polish-code-block-content';
const ID_FRONTMATTER = 'markdown-polish-frontmatter';
const ID_BLOCKQUOTE_MARKERS = 'markdown-polish-blockquote-markers';
const ID_BLOCKQUOTE_CONTENT = 'markdown-polish-blockquote-content';

// ---------------------------------------------------------------------------
// Heading styles
// ---------------------------------------------------------------------------

/**
 * The collapsed style for heading markers (`# `, `## `, etc.) hides them
 * using the transparent-color + negative-letter-spacing trick. This causes
 * the markers to occupy zero visible space.
 */
const HEADING_MARKER_COLLAPSED: vscode.DecorationRenderOptions = {
    ...HIDDEN_COLLAPSED,
};

const HEADING_MARKER_EXPANDED: vscode.DecorationRenderOptions = {
    // No overrides — markers rendered normally.
};

/**
 * Heading text styles per level (collapsed).
 *
 * Uses the `textDecoration` CSS injection hack to set font-size. VS Code
 * passes the `textDecoration` value as raw CSS, so injecting after a
 * semicolon lets us set arbitrary CSS properties.
 *
 * TODO: The textDecoration CSS injection for font-size needs F5 validation.
 * If VS Code strips or sanitizes the injected CSS, the fontWeight fallback
 * is still in effect and headings will still look differentiated.
 */
const HEADING_TEXT_COLLAPSED: Record<string, vscode.DecorationRenderOptions> = {
    [ID_HEADING_TEXT_H1]: {
        textDecoration: 'none; font-size: 1.6em',
        fontWeight: '700',
    },
    [ID_HEADING_TEXT_H2]: {
        textDecoration: 'none; font-size: 1.3em',
        fontWeight: '700',
    },
    [ID_HEADING_TEXT_H3]: {
        textDecoration: 'none; font-size: 1.1em',
        fontWeight: '600',
    },
    [ID_HEADING_TEXT_H46]: {
        fontWeight: '600',
    },
};

const HEADING_TEXT_EXPANDED: vscode.DecorationRenderOptions = {
    // No overrides — text rendered normally when cursor is on the line.
};

// ---------------------------------------------------------------------------
// Link text style (collapsed = underline so it looks like a link)
// ---------------------------------------------------------------------------

const LINK_TEXT_COLLAPSED: vscode.DecorationRenderOptions = {
    textDecoration: 'underline',
};

const LINK_TEXT_EXPANDED: vscode.DecorationRenderOptions = {
    // No overrides — link text rendered normally when cursor is on the line.
};

// ---------------------------------------------------------------------------
// Inline code content style (collapsed = background highlight)
// ---------------------------------------------------------------------------

/**
 * Inline code content gets a subtle background when collapsed.
 *
 * Uses the theme color `textCodeBlock.background` for theme-aware styling.
 * TODO: If `textCodeBlock.background` doesn't produce visible results in F5
 * testing, fall back to `'rgba(128, 128, 128, 0.15)'`.
 */
const INLINE_CODE_CONTENT_COLLAPSED: vscode.DecorationRenderOptions = {
    backgroundColor: new vscode.ThemeColor('textCodeBlock.background'),
    // Fallback if the ThemeColor isn't visible — uncomment and remove the line above:
    // backgroundColor: 'rgba(128, 128, 128, 0.15)',
};

const INLINE_CODE_CONTENT_EXPANDED: vscode.DecorationRenderOptions = {
    // No overrides — code content rendered normally when cursor is on the line.
};

// ---------------------------------------------------------------------------
// Code block styles
// ---------------------------------------------------------------------------

const CODE_BLOCK_FENCE_COLLAPSED: vscode.DecorationRenderOptions = {
    opacity: CODE_BLOCK_FENCE_DIM_OPACITY,
};

const CODE_BLOCK_FENCE_EXPANDED: vscode.DecorationRenderOptions = {
    opacity: '1.0',
};

/**
 * Code block content lines get a subtle whole-line background when collapsed.
 *
 * TODO: Needs F5 validation — the isWholeLine option is set per-decoration
 * in provideDecorations, not in the base style here.
 */
const CODE_BLOCK_CONTENT_COLLAPSED: vscode.DecorationRenderOptions = {
    backgroundColor: new vscode.ThemeColor('textCodeBlock.background'),
    isWholeLine: true,
    // Fallback if the ThemeColor isn't visible — uncomment and remove the line above:
    // backgroundColor: 'rgba(128, 128, 128, 0.10)',
};

const CODE_BLOCK_CONTENT_EXPANDED: vscode.DecorationRenderOptions = {
    isWholeLine: true,
    // No overrides — content rendered normally when cursor is inside the block.
};

// ---------------------------------------------------------------------------
// Blockquote styles
// ---------------------------------------------------------------------------

/**
 * Collapsed style for blockquote `> ` markers — hidden using the same
 * transparent-color + negative-letter-spacing trick as other syntax markers.
 */
const BLOCKQUOTE_MARKER_COLLAPSED: vscode.DecorationRenderOptions = {
    opacity: '0.3',
};

const BLOCKQUOTE_MARKER_EXPANDED: vscode.DecorationRenderOptions = {
    // No overrides — markers rendered normally when cursor is on the line.
};

/**
 * Collapsed style for blockquote content — a left border to visually indicate
 * the quote, plus subtle italic to differentiate from normal text.
 *
 * TODO: The textDecoration CSS injection for border-left and padding-left
 * needs F5 validation. VS Code may strip or sanitize the injected CSS. The
 * fontStyle: 'italic' will definitely work as a fallback visual indicator.
 */
const BLOCKQUOTE_CONTENT_COLLAPSED: vscode.DecorationRenderOptions = {
    // border-left via textDecoration CSS injection does NOT work in VS Code —
    // it renders as literal pipe characters. Using italic + subtle background instead.
    fontStyle: 'italic',
    backgroundColor: 'rgba(128, 128, 128, 0.06)',
    isWholeLine: true,
};

const BLOCKQUOTE_CONTENT_EXPANDED: vscode.DecorationRenderOptions = {
    isWholeLine: true,
    // No overrides — content rendered normally when cursor is on the line.
};

// ---------------------------------------------------------------------------
// HeadingMarkersProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for heading `# ` markers. In collapsed state the markers
 * are hidden; in expanded state they are visible.
 */
class HeadingMarkersProvider implements DecorationProvider {
    readonly id = ID_HEADING_MARKERS;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];

        for (let i = 0; i < doc.lineCount; i++) {
            const line = doc.lineAt(i);
            const match = HEADING_RE.exec(line.text);
            if (!match) {
                continue;
            }

            const level = match[1].length;
            const markerLength = level + 1; // e.g. `### ` = 4 chars
            const markerRange = new vscode.Range(i, 0, i, markerLength);

            regions.push({
                range: markerRange,
                collapsedDecoration: { range: markerRange },
                expandedDecoration: { range: markerRange },
            });
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// HeadingTextProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for heading text (after the `# ` marker) at a specific
 * set of heading levels. One instance is created per style bucket
 * (h1, h2, h3, h4-6).
 */
class HeadingTextProvider implements DecorationProvider {
    constructor(
        readonly id: string,
        private readonly levels: number[],
    ) {}

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];

        for (let i = 0; i < doc.lineCount; i++) {
            const line = doc.lineAt(i);
            const match = HEADING_RE.exec(line.text);
            if (!match) {
                continue;
            }

            const level = match[1].length;
            if (!this.levels.includes(level)) {
                continue;
            }

            const markerLength = level + 1;
            const textRange = new vscode.Range(
                i, markerLength,
                i, line.text.length,
            );

            regions.push({
                range: textRange,
                collapsedDecoration: { range: textRange },
                expandedDecoration: { range: textRange },
            });
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// BoldItalicMarkersProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for bold/italic asterisk markers (`*`, `**`, `***`).
 * In collapsed state the markers are hidden (transparent + zero width);
 * in expanded state they are fully visible.
 */
class BoldItalicMarkersProvider implements DecorationProvider {
    readonly id = ID_BOLD_ITALIC_MARKERS;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let inFencedBlock = false;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const text = line.text;
            const trimmed = text.trimStart();

            if (trimmed.startsWith('```')) {
                inFencedBlock = !inFencedBlock;
                continue;
            }
            if (inFencedBlock) {
                continue;
            }
            if (HEADING_RE.test(text)) {
                continue;
            }

            BOLD_ITALIC_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            let matchIndex = 0;

            while ((match = BOLD_ITALIC_RE.exec(text)) !== null) {
                const fullMatchStart = match.index;
                const markerLen = match[1].length;
                const contentLen = match[2].length;
                const groupId = `bold-italic-${i}-${matchIndex}`;

                // Full span from opening marker start through closing marker end.
                const fullMatchEnd = fullMatchStart + markerLen + contentLen + markerLen;
                const spanRange = new vscode.Range(
                    i, fullMatchStart,
                    i, fullMatchEnd,
                );

                // Opening marker
                const openRange = new vscode.Range(
                    i, fullMatchStart,
                    i, fullMatchStart + markerLen,
                );
                regions.push(makeSimpleRegion(openRange, groupId, spanRange));

                // Closing marker
                const closeStart = fullMatchStart + markerLen + contentLen;
                const closeRange = new vscode.Range(
                    i, closeStart,
                    i, closeStart + markerLen,
                );
                regions.push(makeSimpleRegion(closeRange, groupId, spanRange));

                matchIndex++;
            }
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// LinkMarkersProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for link syntax markers: `[`, `](`, URL, and `)`.
 * In collapsed state these are hidden (transparent + zero width);
 * in expanded state they are fully visible.
 */
class LinkMarkersProvider implements DecorationProvider {
    readonly id = ID_LINK_MARKERS;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let inFencedBlock = false;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const text = line.text;
            const trimmed = text.trimStart();

            if (trimmed.startsWith('```')) {
                inFencedBlock = !inFencedBlock;
                continue;
            }
            if (inFencedBlock) {
                continue;
            }
            if (HEADING_RE.test(text)) {
                continue;
            }

            LINK_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            let matchIndex = 0;

            while ((match = LINK_RE.exec(text)) !== null) {
                const fullMatchStart = match.index;
                const linkText = match[1];
                const url = match[2];
                const groupId = `link-${i}-${matchIndex}`;

                // Full span from `[` through `)` — the entire [text](url) construct.
                // Total length: 1 ([) + linkText + 2 (]() + url + 1 ())
                const fullMatchEnd = fullMatchStart + 1 + linkText.length + 2 + url.length + 1;
                const spanRange = new vscode.Range(
                    i, fullMatchStart,
                    i, fullMatchEnd,
                );

                // `[` — opening bracket
                const openBracketRange = new vscode.Range(
                    i, fullMatchStart,
                    i, fullMatchStart + 1,
                );
                regions.push(makeSimpleRegion(openBracketRange, groupId, spanRange));

                // `](` — closing bracket + opening paren
                const closeBracketStart = fullMatchStart + 1 + linkText.length;
                const closeBracketRange = new vscode.Range(
                    i, closeBracketStart,
                    i, closeBracketStart + 2,
                );
                regions.push(makeSimpleRegion(closeBracketRange, groupId, spanRange));

                // URL portion
                const urlStart = closeBracketStart + 2;
                const urlRange = new vscode.Range(
                    i, urlStart,
                    i, urlStart + url.length,
                );
                regions.push(makeSimpleRegion(urlRange, groupId, spanRange));

                // `)` — closing paren
                const closeParenPos = urlStart + url.length;
                const closeParenRange = new vscode.Range(
                    i, closeParenPos,
                    i, closeParenPos + 1,
                );
                regions.push(makeSimpleRegion(closeParenRange, groupId, spanRange));

                matchIndex++;
            }
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// LinkTextProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for link display text (the text between `[` and `]`).
 * In collapsed state the text is underlined so it remains recognizable as
 * a link even when all surrounding syntax is hidden.
 * In expanded state, no special styling is applied.
 */
class LinkTextProvider implements DecorationProvider {
    readonly id = ID_LINK_TEXT;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let inFencedBlock = false;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const text = line.text;
            const trimmed = text.trimStart();

            if (trimmed.startsWith('```')) {
                inFencedBlock = !inFencedBlock;
                continue;
            }
            if (inFencedBlock) {
                continue;
            }
            if (HEADING_RE.test(text)) {
                continue;
            }

            LINK_RE.lastIndex = 0;
            let match: RegExpExecArray | null;

            while ((match = LINK_RE.exec(text)) !== null) {
                const fullMatchStart = match.index;
                const linkText = match[1];

                // Link text content (between [ and ])
                const textRange = new vscode.Range(
                    i, fullMatchStart + 1,
                    i, fullMatchStart + 1 + linkText.length,
                );
                regions.push(makeSimpleRegion(textRange));
            }
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// InlineCodeMarkersProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for inline code backtick markers.
 * In collapsed state the backticks are hidden (transparent + zero width);
 * in expanded state they are fully visible.
 */
class InlineCodeMarkersProvider implements DecorationProvider {
    readonly id = ID_INLINE_CODE_MARKERS;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let inFencedBlock = false;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const text = line.text;
            const trimmed = text.trimStart();

            if (trimmed.startsWith('```')) {
                inFencedBlock = !inFencedBlock;
                continue;
            }
            if (inFencedBlock) {
                continue;
            }
            if (HEADING_RE.test(text)) {
                continue;
            }

            INLINE_CODE_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            let matchIndex = 0;

            while ((match = INLINE_CODE_RE.exec(text)) !== null) {
                const fullMatchStart = match.index;
                const tickLen = match[1].length;
                const contentLen = match[2].length;
                const groupId = `inline-code-${i}-${matchIndex}`;

                // Full span from opening backtick(s) through closing backtick(s).
                const fullMatchEnd = fullMatchStart + tickLen + contentLen + tickLen;
                const spanRange = new vscode.Range(
                    i, fullMatchStart,
                    i, fullMatchEnd,
                );

                // Opening backtick(s)
                const openRange = new vscode.Range(
                    i, fullMatchStart,
                    i, fullMatchStart + tickLen,
                );
                regions.push(makeSimpleRegion(openRange, groupId, spanRange));

                // Closing backtick(s)
                const closeStart = fullMatchStart + tickLen + contentLen;
                const closeRange = new vscode.Range(
                    i, closeStart,
                    i, closeStart + tickLen,
                );
                regions.push(makeSimpleRegion(closeRange, groupId, spanRange));

                matchIndex++;
            }
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// InlineCodeContentProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for inline code content (text between backticks).
 * In collapsed state the content gets a background color to visually
 * distinguish it as code; in expanded state no special styling is applied.
 */
class InlineCodeContentProvider implements DecorationProvider {
    readonly id = ID_INLINE_CODE_CONTENT;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let inFencedBlock = false;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const text = line.text;
            const trimmed = text.trimStart();

            if (trimmed.startsWith('```')) {
                inFencedBlock = !inFencedBlock;
                continue;
            }
            if (inFencedBlock) {
                continue;
            }
            if (HEADING_RE.test(text)) {
                continue;
            }

            INLINE_CODE_RE.lastIndex = 0;
            let match: RegExpExecArray | null;

            while ((match = INLINE_CODE_RE.exec(text)) !== null) {
                const fullMatchStart = match.index;
                const tickLen = match[1].length;
                const contentLen = match[2].length;

                // Code content (between backticks)
                const contentStart = fullMatchStart + tickLen;
                const contentRange = new vscode.Range(
                    i, contentStart,
                    i, contentStart + contentLen,
                );
                regions.push(makeSimpleRegion(contentRange));
            }
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// CodeBlockFenceProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for fenced code block fence lines (opening and closing
 * ``` delimiters). In collapsed state the fences are dimmed; in expanded
 * state they are fully visible.
 */
class CodeBlockFenceProvider implements DecorationProvider {
    readonly id = ID_CODE_BLOCK_FENCES;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let fenceOpenLine = -1;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const trimmed = line.text.trimStart();

            if (trimmed.startsWith('```')) {
                const fenceRange = new vscode.Range(
                    i, 0,
                    i, line.text.length,
                );
                regions.push(makeSimpleRegion(fenceRange));

                if (fenceOpenLine === -1) {
                    fenceOpenLine = i;
                } else {
                    fenceOpenLine = -1;
                }
            }
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// CodeBlockContentProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for fenced code block content lines (between the opening
 * and closing ``` delimiters, exclusive). In collapsed state the content
 * gets a subtle whole-line background; in expanded state no special styling.
 */
class CodeBlockContentProvider implements DecorationProvider {
    readonly id = ID_CODE_BLOCK_CONTENT;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let fenceOpenLine = -1;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const trimmed = line.text.trimStart();

            if (trimmed.startsWith('```')) {
                if (fenceOpenLine === -1) {
                    // Opening fence — start tracking.
                    fenceOpenLine = i;
                } else {
                    // Closing fence — emit regions for all content lines
                    // between the fences (exclusive of fence lines).
                    for (let j = fenceOpenLine + 1; j < i; j++) {
                        const contentLine = doc.lineAt(j);
                        const contentRange = new vscode.Range(
                            j, 0,
                            j, contentLine.text.length,
                        );
                        regions.push(makeSimpleRegion(contentRange));
                    }
                    fenceOpenLine = -1;
                }
            }
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// BlockquoteMarkerProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for blockquote `> ` prefix markers (including nested `>> `).
 * In collapsed state the markers are hidden (transparent + zero width);
 * in expanded state they are fully visible.
 */
class BlockquoteMarkerProvider implements DecorationProvider {
    readonly id = ID_BLOCKQUOTE_MARKERS;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let inFencedBlock = false;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const text = line.text;
            const trimmed = text.trimStart();

            if (trimmed.startsWith('```')) {
                inFencedBlock = !inFencedBlock;
                continue;
            }
            if (inFencedBlock) {
                continue;
            }

            const match = BLOCKQUOTE_RE.exec(text);
            if (!match) {
                continue;
            }

            const markerLength = match[1].length;
            const markerRange = new vscode.Range(i, 0, i, markerLength);
            regions.push(makeSimpleRegion(markerRange));
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// BlockquoteContentProvider
// ---------------------------------------------------------------------------

/**
 * Provides whole-line regions for blockquote content (the text after the `> `
 * prefix). In collapsed state the content gets a left border and italic
 * styling to visually indicate a quoted block; in expanded state no special
 * styling is applied.
 */
class BlockquoteContentProvider implements DecorationProvider {
    readonly id = ID_BLOCKQUOTE_CONTENT;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];
        const fmEnd = detectFrontmatterEnd(doc);
        let inFencedBlock = false;

        for (let i = 0; i < doc.lineCount; i++) {
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const text = line.text;
            const trimmed = text.trimStart();

            if (trimmed.startsWith('```')) {
                inFencedBlock = !inFencedBlock;
                continue;
            }
            if (inFencedBlock) {
                continue;
            }

            const match = BLOCKQUOTE_RE.exec(text);
            if (!match) {
                continue;
            }

            // Whole-line region for the content portion of the blockquote line.
            const contentRange = new vscode.Range(
                i, 0,
                i, text.length,
            );
            regions.push(makeSimpleRegion(contentRange));
        }

        return regions;
    }
}

// ---------------------------------------------------------------------------
// FrontmatterProvider
// ---------------------------------------------------------------------------

/**
 * Provides a single region for the YAML frontmatter block at the top of
 * the file. Collapsed = dimmed, expanded = fully visible.
 */
class FrontmatterProvider implements DecorationProvider {
    readonly id = ID_FRONTMATTER;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const fmEnd = detectFrontmatterEnd(doc);

        if (fmEnd === -1) {
            return [];
        }

        const range = new vscode.Range(
            0, 0,
            fmEnd, doc.lineAt(fmEnd).text.length,
        );

        return [{
            range,
            collapsedDecoration: { range },
            expandedDecoration: { range },
        }];
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a simple region where collapsed and expanded decorations carry no
 * per-instance overrides — all styling comes from the base type registered
 * with the DecorationManager.
 *
 * @param groupId Optional group ID — when any region in a group expands, all do.
 * @param spanRange Optional full-span range for cursor proximity checks.
 *   When set, the cursor anywhere inside this range triggers expansion of
 *   this region (and its group). The actual decoration is still applied to
 *   `range` — `spanRange` only affects the "should this expand?" decision.
 */
function makeSimpleRegion(range: vscode.Range, groupId?: string, spanRange?: vscode.Range): DecoratedRegion {
    const region: DecoratedRegion = {
        range,
        collapsedDecoration: { range },
        expandedDecoration: { range },
    };
    if (groupId !== undefined) {
        region.groupId = groupId;
    }
    if (spanRange !== undefined) {
        region.spanRange = spanRange;
    }
    return region;
}

/**
 * Detect the closing line index of a YAML frontmatter block at the top of
 * the document.
 *
 * Supports both triple-dash (`---`) and code-fence (`` ``` ``) delimiters
 * per project convention (read both, write code fences only).
 *
 * Returns the line index of the closing delimiter, or -1 if no frontmatter
 * is found.
 */
function detectFrontmatterEnd(doc: vscode.TextDocument): number {
    if (doc.lineCount < 2) {
        return -1;
    }

    const firstLine = doc.lineAt(0).text.trim();

    let closingDelimiter: string;
    if (firstLine === '---') {
        closingDelimiter = '---';
    } else if (firstLine === '```') {
        closingDelimiter = '```';
    } else {
        return -1;
    }

    for (let i = 1; i < doc.lineCount; i++) {
        if (doc.lineAt(i).text.trim() === closingDelimiter) {
            return i;
        }
    }

    // Unclosed frontmatter — treat as absent to avoid dimming the whole doc.
    return -1;
}

// ---------------------------------------------------------------------------
// MarkdownPolishProvider — public facade
// ---------------------------------------------------------------------------

/**
 * Decoration provider for markdown polish: heading styling, inline syntax
 * marker hiding (bold, italic, code, links), link underline, inline code
 * background, fenced code block styling, and frontmatter dimming.
 *
 * Registers multiple internal sub-providers with the {@link DecorationManager},
 * each with its own collapsed/expanded `TextEditorDecorationType` pair.
 * Respects `cozyMd.polish.*` user configuration settings.
 *
 * Usage:
 * ```ts
 * const manager = new DecorationManager();
 * const polish = new MarkdownPolishProvider(manager);
 * context.subscriptions.push(manager, polish);
 * ```
 */
export class MarkdownPolishProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private registeredIds: string[] = [];

    constructor(private manager: DecorationManager) {
        this.registerFromConfig();

        // Re-register when the user changes polish settings.
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('cozyMd.polish')) {
                    this.unregisterAll();
                    this.registerFromConfig();
                    this.manager.update();
                }
            }),
        );
    }

    // ------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------

    /**
     * Read user configuration and register the appropriate sub-providers.
     */
    private registerFromConfig(): void {
        const config = vscode.workspace.getConfiguration('cozyMd.polish');

        const styleHeadings = config.get<boolean>('styleHeadings', true);
        const dimSyntaxMarkers = config.get<boolean>('dimSyntaxMarkers', true);
        const dimFrontmatter = config.get<boolean>('dimFrontmatter', true);

        if (styleHeadings) {
            // Heading markers: hidden when collapsed, visible when expanded.
            this.register(
                new HeadingMarkersProvider(),
                HEADING_MARKER_COLLAPSED,
                HEADING_MARKER_EXPANDED,
            );

            // Heading text per level (h1, h2, h3 each get font-size + weight).
            this.register(
                new HeadingTextProvider(ID_HEADING_TEXT_H1, [1]),
                HEADING_TEXT_COLLAPSED[ID_HEADING_TEXT_H1],
                HEADING_TEXT_EXPANDED,
            );
            this.register(
                new HeadingTextProvider(ID_HEADING_TEXT_H2, [2]),
                HEADING_TEXT_COLLAPSED[ID_HEADING_TEXT_H2],
                HEADING_TEXT_EXPANDED,
            );
            this.register(
                new HeadingTextProvider(ID_HEADING_TEXT_H3, [3]),
                HEADING_TEXT_COLLAPSED[ID_HEADING_TEXT_H3],
                HEADING_TEXT_EXPANDED,
            );
            // h4-h6 get fontWeight only (no font-size change).
            this.register(
                new HeadingTextProvider(ID_HEADING_TEXT_H46, [4, 5, 6]),
                HEADING_TEXT_COLLAPSED[ID_HEADING_TEXT_H46],
                HEADING_TEXT_EXPANDED,
            );
        }

        if (dimSyntaxMarkers) {
            // Bold/italic markers: hidden when collapsed.
            this.register(
                new BoldItalicMarkersProvider(),
                HIDDEN_COLLAPSED,
                VISIBLE_EXPANDED,
            );

            // Link syntax markers ([, ](, URL, )): hidden when collapsed.
            this.register(
                new LinkMarkersProvider(),
                HIDDEN_COLLAPSED,
                VISIBLE_EXPANDED,
            );

            // Link text: underlined when collapsed so it's recognizable as a link.
            this.register(
                new LinkTextProvider(),
                LINK_TEXT_COLLAPSED,
                LINK_TEXT_EXPANDED,
            );

            // Inline code backtick markers: hidden when collapsed.
            this.register(
                new InlineCodeMarkersProvider(),
                HIDDEN_COLLAPSED,
                VISIBLE_EXPANDED,
            );

            // Inline code content: background highlight when collapsed.
            this.register(
                new InlineCodeContentProvider(),
                INLINE_CODE_CONTENT_COLLAPSED,
                INLINE_CODE_CONTENT_EXPANDED,
            );

            // Fenced code block fence lines: dimmed when collapsed.
            this.register(
                new CodeBlockFenceProvider(),
                CODE_BLOCK_FENCE_COLLAPSED,
                CODE_BLOCK_FENCE_EXPANDED,
            );

            // Fenced code block content lines: background when collapsed.
            this.register(
                new CodeBlockContentProvider(),
                CODE_BLOCK_CONTENT_COLLAPSED,
                CODE_BLOCK_CONTENT_EXPANDED,
            );

            // Blockquote `> ` markers: hidden when collapsed.
            this.register(
                new BlockquoteMarkerProvider(),
                BLOCKQUOTE_MARKER_COLLAPSED,
                BLOCKQUOTE_MARKER_EXPANDED,
            );

            // Blockquote content lines: left border + italic when collapsed.
            this.register(
                new BlockquoteContentProvider(),
                BLOCKQUOTE_CONTENT_COLLAPSED,
                BLOCKQUOTE_CONTENT_EXPANDED,
            );
        }

        if (dimFrontmatter) {
            this.register(
                new FrontmatterProvider(),
                { opacity: FRONTMATTER_DIM_OPACITY },
                { opacity: '1.0' },
            );
        }
    }

    /**
     * Register a sub-provider and track its ID for later cleanup.
     */
    private register(
        provider: DecorationProvider,
        collapsed: vscode.DecorationRenderOptions,
        expanded: vscode.DecorationRenderOptions,
    ): void {
        this.manager.registerProvider(provider, collapsed, expanded);
        this.registeredIds.push(provider.id);
    }

    /**
     * Unregister all sub-providers from the manager.
     */
    private unregisterAll(): void {
        for (const id of this.registeredIds) {
            this.manager.unregisterProvider(id);
        }
        this.registeredIds = [];
    }

    // ------------------------------------------------------------------
    // Dispose
    // ------------------------------------------------------------------

    dispose(): void {
        this.unregisterAll();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
