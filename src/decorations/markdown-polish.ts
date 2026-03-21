import * as vscode from 'vscode';
import { DecorationProvider, DecoratedRegion, DecorationManager } from './manager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Opacity value used for dimmed syntax markers in collapsed state. */
const MARKER_DIM_OPACITY = '0.3';

/** Opacity value used for the dimmed frontmatter block in collapsed state. */
const FRONTMATTER_DIM_OPACITY = '0.4';

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

// ---------------------------------------------------------------------------
// Sub-provider IDs
// ---------------------------------------------------------------------------

const ID_HEADING_MARKERS = 'markdown-polish-heading-markers';
const ID_HEADING_TEXT_H1 = 'markdown-polish-heading-text-h1';
const ID_HEADING_TEXT_H2 = 'markdown-polish-heading-text-h2';
const ID_HEADING_TEXT_H3 = 'markdown-polish-heading-text-h3';
const ID_SYNTAX = 'markdown-polish-syntax';
const ID_FRONTMATTER = 'markdown-polish-frontmatter';

// ---------------------------------------------------------------------------
// Heading styles
// ---------------------------------------------------------------------------

/**
 * The collapsed style for heading markers (`# `, `## `, etc.) hides them
 * using the transparent-color + negative-letter-spacing trick. This causes
 * the markers to occupy zero visible space.
 */
const HEADING_MARKER_COLLAPSED: vscode.DecorationRenderOptions = {
    color: 'transparent',
    letterSpacing: '-1em',
};

const HEADING_MARKER_EXPANDED: vscode.DecorationRenderOptions = {
    // No overrides — markers rendered normally.
};

/**
 * Heading text styles per level (collapsed).
 *
 * NOTE: VS Code's `DecorationRenderOptions` does not support `fontSize`.
 * We use `fontWeight` for emphasis instead.
 * TODO: Investigate CSS injection via `textDecoration` for font-size
 * scaling, or revisit when VS Code API adds fontSize support.
 */
const HEADING_TEXT_COLLAPSED: Record<string, vscode.DecorationRenderOptions> = {
    [ID_HEADING_TEXT_H1]: { fontWeight: '700' },
    [ID_HEADING_TEXT_H2]: { fontWeight: '700' },
    [ID_HEADING_TEXT_H3]: { fontWeight: '600' },
};

const HEADING_TEXT_EXPANDED: vscode.DecorationRenderOptions = {
    // No overrides — text rendered normally when cursor is on the line.
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
 * (h1, h2, h3). Levels 4-6 get no special text styling and are not
 * registered.
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
// SyntaxDimmingProvider
// ---------------------------------------------------------------------------

/**
 * Provides regions for inline syntax markers (bold/italic asterisks,
 * backticks, link brackets and URLs). In collapsed state the markers are
 * dimmed; in expanded state they are fully visible.
 *
 * Only the *marker characters* get the dimmed decoration. The content
 * between markers is left untouched.
 */
class SyntaxDimmingProvider implements DecorationProvider {
    readonly id = ID_SYNTAX;

    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[] {
        const doc = editor.document;
        const regions: DecoratedRegion[] = [];

        // Detect the frontmatter boundary so we skip those lines.
        const fmEnd = detectFrontmatterEnd(doc);

        // Track fenced code block state so we skip content inside them.
        let inFencedBlock = false;

        for (let i = 0; i < doc.lineCount; i++) {
            // Skip frontmatter lines.
            if (fmEnd !== -1 && i <= fmEnd) {
                continue;
            }

            const line = doc.lineAt(i);
            const text = line.text;
            const trimmed = text.trimStart();

            // Toggle fenced code block state.
            if (trimmed.startsWith('```')) {
                inFencedBlock = !inFencedBlock;
                continue;
            }

            // Skip lines inside fenced code blocks.
            if (inFencedBlock) {
                continue;
            }

            // Skip heading lines (handled by heading providers).
            if (HEADING_RE.test(text)) {
                continue;
            }

            this.parseBoldItalic(i, text, regions);
            this.parseInlineCode(i, text, regions);
            this.parseLinks(i, text, regions);
        }

        return regions;
    }

    /**
     * Parse bold/italic markers and emit regions for the asterisk delimiters.
     */
    private parseBoldItalic(
        lineIndex: number,
        text: string,
        regions: DecoratedRegion[],
    ): void {
        BOLD_ITALIC_RE.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = BOLD_ITALIC_RE.exec(text)) !== null) {
            const fullMatchStart = match.index;
            const markerLen = match[1].length;
            const contentLen = match[2].length;

            // Opening marker
            const openRange = new vscode.Range(
                lineIndex, fullMatchStart,
                lineIndex, fullMatchStart + markerLen,
            );
            regions.push(makeSimpleRegion(openRange));

            // Closing marker
            const closeStart = fullMatchStart + markerLen + contentLen;
            const closeRange = new vscode.Range(
                lineIndex, closeStart,
                lineIndex, closeStart + markerLen,
            );
            regions.push(makeSimpleRegion(closeRange));
        }
    }

    /**
     * Parse inline code backtick markers and emit regions.
     */
    private parseInlineCode(
        lineIndex: number,
        text: string,
        regions: DecoratedRegion[],
    ): void {
        INLINE_CODE_RE.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = INLINE_CODE_RE.exec(text)) !== null) {
            const fullMatchStart = match.index;
            const tickLen = match[1].length;
            const contentLen = match[2].length;

            // Opening backtick(s)
            const openRange = new vscode.Range(
                lineIndex, fullMatchStart,
                lineIndex, fullMatchStart + tickLen,
            );
            regions.push(makeSimpleRegion(openRange));

            // Closing backtick(s)
            const closeStart = fullMatchStart + tickLen + contentLen;
            const closeRange = new vscode.Range(
                lineIndex, closeStart,
                lineIndex, closeStart + tickLen,
            );
            regions.push(makeSimpleRegion(closeRange));
        }
    }

    /**
     * Parse `[text](url)` links and emit regions for brackets, parens,
     * and the URL. The link text itself is NOT dimmed.
     */
    private parseLinks(
        lineIndex: number,
        text: string,
        regions: DecoratedRegion[],
    ): void {
        LINK_RE.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = LINK_RE.exec(text)) !== null) {
            const fullMatchStart = match.index;
            const linkText = match[1];
            const url = match[2];

            // `[` — opening bracket
            const openBracketRange = new vscode.Range(
                lineIndex, fullMatchStart,
                lineIndex, fullMatchStart + 1,
            );
            regions.push(makeSimpleRegion(openBracketRange));

            // `](` — closing bracket + opening paren
            const closeBracketStart = fullMatchStart + 1 + linkText.length;
            const closeBracketRange = new vscode.Range(
                lineIndex, closeBracketStart,
                lineIndex, closeBracketStart + 2,
            );
            regions.push(makeSimpleRegion(closeBracketRange));

            // URL portion
            const urlStart = closeBracketStart + 2;
            const urlRange = new vscode.Range(
                lineIndex, urlStart,
                lineIndex, urlStart + url.length,
            );
            regions.push(makeSimpleRegion(urlRange));

            // `)` — closing paren
            const closeParenPos = urlStart + url.length;
            const closeParenRange = new vscode.Range(
                lineIndex, closeParenPos,
                lineIndex, closeParenPos + 1,
            );
            regions.push(makeSimpleRegion(closeParenRange));
        }
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
 */
function makeSimpleRegion(range: vscode.Range): DecoratedRegion {
    return {
        range,
        collapsedDecoration: { range },
        expandedDecoration: { range },
    };
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
 * marker dimming (bold, italic, code, links), and frontmatter dimming.
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

            // Heading text per level (h1, h2, h3). Levels 4-6 have no
            // special collapsed styling so we skip registering them.
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
                new HeadingTextProvider(ID_HEADING_TEXT_H3, [3, 4, 5, 6]),
                HEADING_TEXT_COLLAPSED[ID_HEADING_TEXT_H3],
                HEADING_TEXT_EXPANDED,
            );
        }

        if (dimSyntaxMarkers) {
            this.register(
                new SyntaxDimmingProvider(),
                { opacity: MARKER_DIM_OPACITY },
                { opacity: '1.0' },
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
