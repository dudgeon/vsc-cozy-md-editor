import * as vscode from 'vscode';
import { parseCriticMarkup, CriticMarkupRange } from '../parsers/criticmarkup';

/**
 * A cached decorated range with line span for fast cursor-proximity checks.
 */
interface DecoratedCriticRange {
    range: vscode.Range;
    startLine: number;
    endLine: number;
    type: CriticMarkupRange['type'];
    /** Sub-ranges for marker syntax (e.g., {++ and ++}) */
    markerRanges: vscode.Range[];
    /** For substitutions: range of the ~> separator */
    separatorRange?: vscode.Range;
    /** For substitutions: range covering old text */
    oldTextRange?: vscode.Range;
    /** For substitutions: range covering new text */
    newTextRange?: vscode.Range;
}

/**
 * Paired decoration types: dimmed when cursor is away, expanded when cursor is on the element.
 */
interface DecorationPair {
    dimmed: vscode.TextEditorDecorationType;
    expanded: vscode.TextEditorDecorationType;
}

/** Opacity used for dimmed CriticMarkup syntax markers. */
const DIM_OPACITY = '0.35';

/**
 * Decoration provider for CriticMarkup rendering.
 * Handles all 5 CriticMarkup patterns with expand-on-cursor behavior.
 *
 * When cursor is away:
 *   - Syntax markers ({++ ++}, {-- --}, etc.) are dimmed
 *   - Content gets colored background/styling based on type
 * When cursor is on the element:
 *   - Full syntax is visible at normal opacity
 *   - Content styling remains for context
 */
export class CriticMarkupDecorationProvider implements vscode.Disposable {
    /** Background decoration types for each CriticMarkup type. */
    private additionBgType: vscode.TextEditorDecorationType;
    private deletionBgType: vscode.TextEditorDecorationType;
    private substitutionOldType: vscode.TextEditorDecorationType;
    private substitutionNewType: vscode.TextEditorDecorationType;
    private highlightBgType: vscode.TextEditorDecorationType;
    private commentBgType: vscode.TextEditorDecorationType;

    /** Marker dimming pair — shared across all CriticMarkup types. */
    private markerPair: DecorationPair;

    /** Cached parse results — rebuilt on document change, reused on cursor move. */
    private cachedRanges: DecoratedCriticRange[] = [];
    private cachedDocVersion: number = -1;
    private cachedDocUri: string = '';

    constructor() {
        const config = vscode.workspace.getConfiguration('markdownCraft.criticmarkup');
        const additionColor = config.get<string>('additionColor', 'rgba(0, 128, 0, 0.3)');
        const deletionColor = config.get<string>('deletionColor', 'rgba(255, 0, 0, 0.3)');
        const highlightColor = config.get<string>('highlightColor', 'rgba(255, 255, 0, 0.3)');

        this.additionBgType = vscode.window.createTextEditorDecorationType({
            backgroundColor: additionColor,
        });

        this.deletionBgType = vscode.window.createTextEditorDecorationType({
            backgroundColor: deletionColor,
            textDecoration: 'line-through',
        });

        this.substitutionOldType = vscode.window.createTextEditorDecorationType({
            backgroundColor: deletionColor,
            textDecoration: 'line-through',
        });

        this.substitutionNewType = vscode.window.createTextEditorDecorationType({
            backgroundColor: additionColor,
        });

        this.highlightBgType = vscode.window.createTextEditorDecorationType({
            backgroundColor: highlightColor,
        });

        this.commentBgType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 100, 255, 0.15)',
            fontStyle: 'italic',
        });

        this.markerPair = {
            dimmed: vscode.window.createTextEditorDecorationType({
                opacity: DIM_OPACITY,
            }),
            expanded: vscode.window.createTextEditorDecorationType({
                opacity: '1',
            }),
        };
    }

    /**
     * Full re-parse of the document. Called on document change or editor switch.
     */
    updateDecorations(editor: vscode.TextEditor): void {
        const doc = editor.document;
        const docVersion = doc.version;
        const docUri = doc.uri.toString();

        if (docVersion === this.cachedDocVersion && docUri === this.cachedDocUri) {
            this.applyCursorSwap(editor);
            return;
        }

        this.cachedDocVersion = docVersion;
        this.cachedDocUri = docUri;
        this.cachedRanges = [];

        const text = doc.getText();
        const parsed = parseCriticMarkup(text);

        for (const cm of parsed) {
            const startPos = doc.positionAt(cm.start);
            const endPos = doc.positionAt(cm.end);
            const fullRange = new vscode.Range(startPos, endPos);

            const markerRanges: vscode.Range[] = [];
            let separatorRange: vscode.Range | undefined;
            let oldTextRange: vscode.Range | undefined;
            let newTextRange: vscode.Range | undefined;

            // Calculate marker positions based on type.
            // All types have opening and closing markers of 3 chars each.
            const openEnd = doc.positionAt(cm.start + 3);   // {++ or {-- or {~~ or {>> or {==
            const closeStart = doc.positionAt(cm.end - 3);  // ++} or --} or ~~} or <<} or ==}
            markerRanges.push(new vscode.Range(startPos, openEnd));
            markerRanges.push(new vscode.Range(closeStart, endPos));

            if (cm.type === 'substitution' && cm.oldText !== undefined && cm.newText !== undefined) {
                // Find the ~> separator position within the full match
                const separatorOffset = cm.fullMatch.indexOf('~>');
                if (separatorOffset >= 0) {
                    const sepStart = doc.positionAt(cm.start + separatorOffset);
                    const sepEnd = doc.positionAt(cm.start + separatorOffset + 2);
                    separatorRange = new vscode.Range(sepStart, sepEnd);
                    markerRanges.push(separatorRange); // dim the ~> too

                    // Old text: between {~~ and ~>
                    oldTextRange = new vscode.Range(openEnd, sepStart);
                    // New text: between ~> and ~~}
                    newTextRange = new vscode.Range(sepEnd, closeStart);
                }
            }

            this.cachedRanges.push({
                range: fullRange,
                startLine: startPos.line,
                endLine: endPos.line,
                type: cm.type,
                markerRanges,
                separatorRange,
                oldTextRange,
                newTextRange,
            });
        }

        this.applyCursorSwap(editor);
    }

    /**
     * Swap decorations based on current cursor position. Hot path — no re-parse.
     */
    swapForCursor(editor: vscode.TextEditor): void {
        this.applyCursorSwap(editor);
    }

    /**
     * Core swap logic. Sorts markers into dimmed vs expanded based on cursor proximity.
     * Content styling (backgrounds, strikethrough) always applies regardless of cursor.
     */
    private applyCursorSwap(editor: vscode.TextEditor): void {
        const cursorLines = new Set<number>();
        for (const sel of editor.selections) {
            for (let line = sel.start.line; line <= sel.end.line; line++) {
                cursorLines.add(line);
            }
        }

        const additions: vscode.DecorationOptions[] = [];
        const deletions: vscode.DecorationOptions[] = [];
        const subOld: vscode.DecorationOptions[] = [];
        const subNew: vscode.DecorationOptions[] = [];
        const highlights: vscode.DecorationOptions[] = [];
        const comments: vscode.DecorationOptions[] = [];
        const dimmedMarkers: vscode.DecorationOptions[] = [];
        const expandedMarkers: vscode.DecorationOptions[] = [];

        for (const cr of this.cachedRanges) {
            // Determine if cursor is on this element.
            let cursorNearby = false;
            for (let line = cr.startLine; line <= cr.endLine; line++) {
                if (cursorLines.has(line)) {
                    cursorNearby = true;
                    break;
                }
            }

            // Markers: dimmed when cursor away, expanded when nearby.
            const markerBucket = cursorNearby ? expandedMarkers : dimmedMarkers;
            for (const mr of cr.markerRanges) {
                markerBucket.push({ range: mr });
            }

            // Content styling: apply background/strikethrough based on type.
            // For the content range (between markers), calculate it.
            const openEnd = cr.markerRanges[0]?.range.end;
            const closeStart = cr.markerRanges[1]?.range.start;

            if (!openEnd || !closeStart) {
                continue;
            }

            switch (cr.type) {
                case 'addition': {
                    const contentRange = new vscode.Range(openEnd, closeStart);
                    additions.push({ range: contentRange });
                    break;
                }
                case 'deletion': {
                    const contentRange = new vscode.Range(openEnd, closeStart);
                    deletions.push({ range: contentRange });
                    break;
                }
                case 'substitution': {
                    if (cr.oldTextRange) {
                        subOld.push({ range: cr.oldTextRange });
                    }
                    if (cr.newTextRange) {
                        subNew.push({ range: cr.newTextRange });
                    }
                    break;
                }
                case 'highlight': {
                    const contentRange = new vscode.Range(openEnd, closeStart);
                    highlights.push({ range: contentRange });
                    break;
                }
                case 'comment': {
                    const contentRange = new vscode.Range(openEnd, closeStart);
                    comments.push({ range: contentRange });
                    break;
                }
            }
        }

        // Apply all decoration sets.
        editor.setDecorations(this.additionBgType, additions);
        editor.setDecorations(this.deletionBgType, deletions);
        editor.setDecorations(this.substitutionOldType, subOld);
        editor.setDecorations(this.substitutionNewType, subNew);
        editor.setDecorations(this.highlightBgType, highlights);
        editor.setDecorations(this.commentBgType, comments);
        editor.setDecorations(this.markerPair.dimmed, dimmedMarkers);
        editor.setDecorations(this.markerPair.expanded, expandedMarkers);
    }

    /**
     * Clear all CriticMarkup decorations.
     */
    clearDecorations(editor: vscode.TextEditor): void {
        editor.setDecorations(this.additionBgType, []);
        editor.setDecorations(this.deletionBgType, []);
        editor.setDecorations(this.substitutionOldType, []);
        editor.setDecorations(this.substitutionNewType, []);
        editor.setDecorations(this.highlightBgType, []);
        editor.setDecorations(this.commentBgType, []);
        editor.setDecorations(this.markerPair.dimmed, []);
        editor.setDecorations(this.markerPair.expanded, []);
    }

    /**
     * Invalidate cached parse data so next update does a full re-parse.
     */
    invalidateCache(): void {
        this.cachedDocVersion = -1;
        this.cachedDocUri = '';
    }

    dispose(): void {
        this.additionBgType.dispose();
        this.deletionBgType.dispose();
        this.substitutionOldType.dispose();
        this.substitutionNewType.dispose();
        this.highlightBgType.dispose();
        this.commentBgType.dispose();
        this.markerPair.dimmed.dispose();
        this.markerPair.expanded.dispose();
    }
}
