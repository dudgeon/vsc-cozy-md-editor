import * as vscode from 'vscode';

/**
 * A decorated range with its line number cached for fast cursor-proximity checks.
 */
interface DecoratedRange {
    range: vscode.Range;
    /** The line(s) this element spans — used for expand-on-cursor checks. */
    startLine: number;
    endLine: number;
}

/**
 * A paired decoration type: one for when the cursor is away (dimmed/collapsed)
 * and one for when the cursor is on the element (expanded/visible).
 */
interface DecorationPair {
    dimmed: vscode.TextEditorDecorationType;
    expanded: vscode.TextEditorDecorationType;
}

/**
 * Heading decoration: the full line gets a font-size style,
 * and the hash markers get a dimmed/expanded pair.
 */
interface HeadingLevel {
    lineStyle: vscode.TextEditorDecorationType;
    markerPair: DecorationPair;
}

/** Regex patterns for markdown elements. */
const HEADING_RE = /^(#{1,6})\s/;
const BOLD_RE = /(\*\*|__)(.*?)\1/g;
const ITALIC_RE = /(?<!\*)\*(?!\*)(.*?)\*(?!\*)|(?<!_)_(?!_)(.*?)_(?!_)/g;
const INLINE_CODE_RE = /(`)(.*?)`/g;
const LINK_RE = /\[([^\]]*)\]\(([^)]*)\)/g;
const STRIKETHROUGH_RE = /(~~)(.*?)~~/g;

/** Font scale factors for heading levels relative to editor font size. */
const HEADING_SCALES: Record<number, number> = {
    1: 2.0,
    2: 1.6,
    3: 1.3,
    4: 1.1,
    5: 1.0,
    6: 0.9,
};

const HEADING_WEIGHTS: Record<number, string> = {
    1: 'bold',
    2: 'bold',
    3: '600',
    4: '600',
    5: '600',
    6: 'normal',
};

/** Opacity value used for dimmed syntax markers. */
const DIM_OPACITY = '0.35';

/**
 * Decoration provider for markdown polish: heading styling,
 * inline element collapsing (bold, italic, code, links),
 * list/blockquote marker dimming, and frontmatter dimming.
 *
 * Follows the expand-on-cursor pattern: syntax markers are dimmed when
 * the cursor is away, fully visible when the cursor enters the element.
 */
export class MarkdownPolishProvider implements vscode.Disposable {
    private headingLevels: Map<number, HeadingLevel> = new Map();
    private syntaxMarkerPair: DecorationPair;
    private frontmatterDimType: vscode.TextEditorDecorationType;
    private frontmatterExpandedType: vscode.TextEditorDecorationType;

    /** Cached parse results — rebuilt on document change, reused on cursor move. */
    private cachedHeadingLines: Map<number, { markerRanges: DecoratedRange[]; lineRange: vscode.Range; level: number }> = new Map();
    private cachedSyntaxRanges: DecoratedRange[] = [];
    private cachedFrontmatterRange: DecoratedRange | null = null;

    /** The document version these caches correspond to. */
    private cachedDocVersion: number = -1;
    private cachedDocUri: string = '';

    constructor() {
        // Create heading decoration types for each level (H1-H6).
        for (let level = 1; level <= 6; level++) {
            const scale = HEADING_SCALES[level];
            const weight = HEADING_WEIGHTS[level];
            const letterSpacing = level <= 2 ? '-0.02em' : undefined;

            const lineStyle = vscode.window.createTextEditorDecorationType({
                textDecoration: `none; font-size: ${scale}em; font-weight: ${weight}${letterSpacing ? `; letter-spacing: ${letterSpacing}` : ''}`,
                isWholeLine: false,
            });

            const markerDimmed = vscode.window.createTextEditorDecorationType({
                opacity: DIM_OPACITY,
                textDecoration: `none; font-size: ${scale}em; font-weight: ${weight}`,
            });

            const markerExpanded = vscode.window.createTextEditorDecorationType({
                opacity: '1',
                textDecoration: `none; font-size: ${scale}em; font-weight: ${weight}`,
            });

            this.headingLevels.set(level, {
                lineStyle,
                markerPair: { dimmed: markerDimmed, expanded: markerExpanded },
            });
        }

        // Generic syntax marker pair (for bold **, italic *, code `, link [](), ~~).
        this.syntaxMarkerPair = {
            dimmed: vscode.window.createTextEditorDecorationType({
                opacity: DIM_OPACITY,
            }),
            expanded: vscode.window.createTextEditorDecorationType({
                opacity: '1',
            }),
        };

        // Frontmatter dimming.
        this.frontmatterDimType = vscode.window.createTextEditorDecorationType({
            opacity: DIM_OPACITY,
        });
        this.frontmatterExpandedType = vscode.window.createTextEditorDecorationType({
            opacity: '1',
        });
    }

    /**
     * Full re-parse of the document. Called on document change or when the
     * active editor switches. Caches the results for cursor-move swaps.
     */
    updateDecorations(editor: vscode.TextEditor): void {
        const doc = editor.document;
        if (doc.languageId !== 'markdown') {
            return;
        }

        const config = vscode.workspace.getConfiguration('markdownCraft.polish');
        const styleHeadings = config.get<boolean>('styleHeadings', true);
        const dimSyntax = config.get<boolean>('dimSyntaxMarkers', true);
        const dimFrontmatter = config.get<boolean>('dimFrontmatter', true);

        // Re-parse only if the document version changed.
        const docVersion = doc.version;
        const docUri = doc.uri.toString();
        if (docVersion === this.cachedDocVersion && docUri === this.cachedDocUri) {
            // Just swap decorations based on cursor.
            this.applyCursorSwap(editor, styleHeadings, dimSyntax, dimFrontmatter);
            return;
        }

        this.cachedDocVersion = docVersion;
        this.cachedDocUri = docUri;
        this.cachedHeadingLines.clear();
        this.cachedSyntaxRanges = [];
        this.cachedFrontmatterRange = null;

        const text = doc.getText();
        const lines = text.split('\n');

        // --- Parse frontmatter ---
        if (dimFrontmatter) {
            this.parseFrontmatterBlock(lines, doc);
        }

        // --- Parse headings and inline syntax ---
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Skip lines inside frontmatter.
            if (this.cachedFrontmatterRange &&
                i >= this.cachedFrontmatterRange.startLine &&
                i <= this.cachedFrontmatterRange.endLine) {
                continue;
            }

            // Headings
            if (styleHeadings) {
                const headingMatch = HEADING_RE.exec(line);
                if (headingMatch) {
                    const level = headingMatch[1].length;
                    const markerEnd = headingMatch[1].length; // end of "##" part
                    const markerRange: DecoratedRange = {
                        range: new vscode.Range(i, 0, i, markerEnd + 1), // include the space after #
                        startLine: i,
                        endLine: i,
                    };
                    const lineRange = new vscode.Range(i, markerEnd + 1, i, line.length);
                    this.cachedHeadingLines.set(i, {
                        markerRanges: [markerRange],
                        lineRange,
                        level,
                    });
                }
            }

            // Inline syntax markers
            if (dimSyntax) {
                this.parseInlineSyntax(line, i);
            }
        }

        this.applyCursorSwap(editor, styleHeadings, dimSyntax, dimFrontmatter);
    }

    /**
     * Swap decorations based on current cursor position. This is the hot path
     * called on every cursor move — it does NOT re-parse the document.
     */
    swapForCursor(editor: vscode.TextEditor): void {
        const doc = editor.document;
        if (doc.languageId !== 'markdown') {
            return;
        }

        const config = vscode.workspace.getConfiguration('markdownCraft.polish');
        const styleHeadings = config.get<boolean>('styleHeadings', true);
        const dimSyntax = config.get<boolean>('dimSyntaxMarkers', true);
        const dimFrontmatter = config.get<boolean>('dimFrontmatter', true);

        this.applyCursorSwap(editor, styleHeadings, dimSyntax, dimFrontmatter);
    }

    /**
     * Core swap logic. Sorts each cached range into dimmed vs expanded bucket
     * based on whether any cursor is on its line(s).
     */
    private applyCursorSwap(
        editor: vscode.TextEditor,
        styleHeadings: boolean,
        dimSyntax: boolean,
        dimFrontmatter: boolean
    ): void {
        // Collect the set of lines that have a cursor on them.
        const cursorLines = new Set<number>();
        for (const sel of editor.selections) {
            for (let line = sel.start.line; line <= sel.end.line; line++) {
                cursorLines.add(line);
            }
        }

        // --- Headings ---
        if (styleHeadings) {
            // Per-level: accumulate line style ranges, dimmed marker ranges, expanded marker ranges.
            for (const [level, headingDeco] of this.headingLevels) {
                const lineRanges: vscode.DecorationOptions[] = [];
                const dimmedMarkers: vscode.DecorationOptions[] = [];
                const expandedMarkers: vscode.DecorationOptions[] = [];

                for (const [lineNum, heading] of this.cachedHeadingLines) {
                    if (heading.level !== level) {
                        continue;
                    }
                    // Line content always gets the heading style.
                    lineRanges.push({ range: heading.lineRange });

                    const cursorOnLine = cursorLines.has(lineNum);
                    for (const mr of heading.markerRanges) {
                        if (cursorOnLine) {
                            expandedMarkers.push({ range: mr.range });
                        } else {
                            dimmedMarkers.push({ range: mr.range });
                        }
                    }
                }

                editor.setDecorations(headingDeco.lineStyle, lineRanges);
                editor.setDecorations(headingDeco.markerPair.dimmed, dimmedMarkers);
                editor.setDecorations(headingDeco.markerPair.expanded, expandedMarkers);
            }
        } else {
            // Clear all heading decorations when disabled.
            for (const [, headingDeco] of this.headingLevels) {
                editor.setDecorations(headingDeco.lineStyle, []);
                editor.setDecorations(headingDeco.markerPair.dimmed, []);
                editor.setDecorations(headingDeco.markerPair.expanded, []);
            }
        }

        // --- Inline syntax markers ---
        if (dimSyntax) {
            const dimmedSyntax: vscode.DecorationOptions[] = [];
            const expandedSyntax: vscode.DecorationOptions[] = [];

            for (const dr of this.cachedSyntaxRanges) {
                let cursorNearby = false;
                for (let line = dr.startLine; line <= dr.endLine; line++) {
                    if (cursorLines.has(line)) {
                        cursorNearby = true;
                        break;
                    }
                }
                if (cursorNearby) {
                    expandedSyntax.push({ range: dr.range });
                } else {
                    dimmedSyntax.push({ range: dr.range });
                }
            }

            editor.setDecorations(this.syntaxMarkerPair.dimmed, dimmedSyntax);
            editor.setDecorations(this.syntaxMarkerPair.expanded, expandedSyntax);
        } else {
            editor.setDecorations(this.syntaxMarkerPair.dimmed, []);
            editor.setDecorations(this.syntaxMarkerPair.expanded, []);
        }

        // --- Frontmatter ---
        if (dimFrontmatter && this.cachedFrontmatterRange) {
            const fm = this.cachedFrontmatterRange;
            let cursorInFrontmatter = false;
            for (let line = fm.startLine; line <= fm.endLine; line++) {
                if (cursorLines.has(line)) {
                    cursorInFrontmatter = true;
                    break;
                }
            }
            if (cursorInFrontmatter) {
                editor.setDecorations(this.frontmatterDimType, []);
                editor.setDecorations(this.frontmatterExpandedType, [{ range: fm.range }]);
            } else {
                editor.setDecorations(this.frontmatterDimType, [{ range: fm.range }]);
                editor.setDecorations(this.frontmatterExpandedType, []);
            }
        } else {
            editor.setDecorations(this.frontmatterDimType, []);
            editor.setDecorations(this.frontmatterExpandedType, []);
        }
    }

    /**
     * Parse the frontmatter block at the top of the document.
     * Supports both code fence (```) and triple-dash (---) delimiters.
     */
    private parseFrontmatterBlock(lines: string[], doc: vscode.TextDocument): void {
        if (lines.length < 2) {
            return;
        }

        const firstLine = lines[0].trim();
        let openDelimiter: string | null = null;
        let closeDelimiter: string | null = null;

        if (firstLine === '```' || firstLine.startsWith('```yaml') || firstLine.startsWith('```yml')) {
            openDelimiter = firstLine;
            closeDelimiter = '```';
        } else if (firstLine === '---') {
            openDelimiter = '---';
            closeDelimiter = '---';
        }

        if (!openDelimiter) {
            return;
        }

        for (let i = 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed === closeDelimiter || (closeDelimiter === '```' && trimmed === '```')) {
                this.cachedFrontmatterRange = {
                    range: new vscode.Range(0, 0, i, lines[i].length),
                    startLine: 0,
                    endLine: i,
                };
                return;
            }
        }
    }

    /**
     * Parse inline syntax markers on a single line and append to cachedSyntaxRanges.
     */
    private parseInlineSyntax(line: string, lineNum: number): void {
        // Bold: ** or __
        this.matchMarkerPairs(BOLD_RE, line, lineNum, 2);

        // Italic: * or _  (single)
        this.matchMarkerPairs(ITALIC_RE, line, lineNum, 1);

        // Inline code: `
        this.matchMarkerPairs(INLINE_CODE_RE, line, lineNum, 1);

        // Strikethrough: ~~
        this.matchMarkerPairs(STRIKETHROUGH_RE, line, lineNum, 2);

        // Links: [text](url) — dim the []() structure
        let linkMatch: RegExpExecArray | null;
        LINK_RE.lastIndex = 0;
        while ((linkMatch = LINK_RE.exec(line)) !== null) {
            const matchStart = linkMatch.index;
            const linkText = linkMatch[1];
            const url = linkMatch[2];

            // Opening [
            this.cachedSyntaxRanges.push({
                range: new vscode.Range(lineNum, matchStart, lineNum, matchStart + 1),
                startLine: lineNum,
                endLine: lineNum,
            });
            // ]( between text and url
            const closeBracketPos = matchStart + 1 + linkText.length;
            this.cachedSyntaxRanges.push({
                range: new vscode.Range(lineNum, closeBracketPos, lineNum, closeBracketPos + 2),
                startLine: lineNum,
                endLine: lineNum,
            });
            // URL itself
            const urlStart = closeBracketPos + 2;
            this.cachedSyntaxRanges.push({
                range: new vscode.Range(lineNum, urlStart, lineNum, urlStart + url.length),
                startLine: lineNum,
                endLine: lineNum,
            });
            // Closing )
            const closeParenPos = urlStart + url.length;
            this.cachedSyntaxRanges.push({
                range: new vscode.Range(lineNum, closeParenPos, lineNum, closeParenPos + 1),
                startLine: lineNum,
                endLine: lineNum,
            });
        }
    }

    /**
     * Generic helper: find marker pairs (opening + closing delimiter of `markerLen` chars)
     * and push them as dimmed syntax ranges.
     */
    private matchMarkerPairs(regex: RegExp, line: string, lineNum: number, markerLen: number): void {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
            const matchStart = match.index;
            const fullLen = match[0].length;

            // Opening marker
            this.cachedSyntaxRanges.push({
                range: new vscode.Range(lineNum, matchStart, lineNum, matchStart + markerLen),
                startLine: lineNum,
                endLine: lineNum,
            });
            // Closing marker
            const closeStart = matchStart + fullLen - markerLen;
            this.cachedSyntaxRanges.push({
                range: new vscode.Range(lineNum, closeStart, lineNum, closeStart + markerLen),
                startLine: lineNum,
                endLine: lineNum,
            });
        }
    }

    /**
     * Clear all decorations from the given editor.
     */
    clearDecorations(editor: vscode.TextEditor): void {
        for (const [, headingDeco] of this.headingLevels) {
            editor.setDecorations(headingDeco.lineStyle, []);
            editor.setDecorations(headingDeco.markerPair.dimmed, []);
            editor.setDecorations(headingDeco.markerPair.expanded, []);
        }
        editor.setDecorations(this.syntaxMarkerPair.dimmed, []);
        editor.setDecorations(this.syntaxMarkerPair.expanded, []);
        editor.setDecorations(this.frontmatterDimType, []);
        editor.setDecorations(this.frontmatterExpandedType, []);
    }

    /**
     * Invalidate cached parse data so the next update does a full re-parse.
     */
    invalidateCache(): void {
        this.cachedDocVersion = -1;
        this.cachedDocUri = '';
    }

    dispose(): void {
        for (const [, headingDeco] of this.headingLevels) {
            headingDeco.lineStyle.dispose();
            headingDeco.markerPair.dimmed.dispose();
            headingDeco.markerPair.expanded.dispose();
        }
        this.syntaxMarkerPair.dimmed.dispose();
        this.syntaxMarkerPair.expanded.dispose();
        this.frontmatterDimType.dispose();
        this.frontmatterExpandedType.dispose();
    }
}
