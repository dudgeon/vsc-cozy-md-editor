import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Represents a region that has collapsed/expanded states */
export interface DecoratedRegion {
    range: vscode.Range;
    /** The collapsed (dimmed/hidden) decoration to show when cursor is away */
    collapsedDecoration: vscode.DecorationOptions;
    /** The expanded (full visibility) decoration to show when cursor is inside */
    expandedDecoration: vscode.DecorationOptions;
    /** Optional group ID — when any region in a group expands, all do */
    groupId?: string;
    /** Full span range for proximity check — e.g., covers `**bold**` entirely.
     *  When set, cursor anywhere in this range triggers expansion. */
    spanRange?: vscode.Range;
}

/** A decoration provider registers regions with the manager */
export interface DecorationProvider {
    /** Unique ID for this provider (must be stable across calls) */
    id: string;
    /** Called when the document changes or needs a full reparse */
    provideDecorations(editor: vscode.TextEditor): DecoratedRegion[];
}

// ---------------------------------------------------------------------------
// DecorationManager
// ---------------------------------------------------------------------------

/**
 * Manages decoration lifecycle for the expand-on-cursor pattern.
 *
 * Each decoration provider registers collapsed/expanded decoration pairs.
 * The manager swaps between them based on cursor position, **without**
 * re-parsing the document on every cursor move.
 *
 * Performance target: decoration swap < 16 ms on a 500-line / 50+ region doc.
 */
export class DecorationManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private providers: Map<string, DecorationProvider> = new Map();

    // Two TextEditorDecorationTypes per provider — one for collapsed, one for expanded.
    // These are long-lived VS Code objects; we dispose them when the provider is
    // unregistered or when the manager is disposed.
    private collapsedTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private expandedTypes: Map<string, vscode.TextEditorDecorationType> = new Map();

    // Cached regions from the last provideDecorations() call, keyed by provider id.
    private regions: Map<string, DecoratedRegion[]> = new Map();

    // Debounce handle for document-change triggered updates.
    private documentChangeTimer: ReturnType<typeof setTimeout> | undefined;

    // The debounce interval (ms) for document change events.
    private static readonly DOCUMENT_CHANGE_DEBOUNCE_MS = 100;

    constructor() {
        // Cursor movement — NOT debounced (must feel instant).
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(
                this.onCursorChange,
                this,
            ),
        );

        // Document content changes — debounced.
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(
                this.onDocumentChange,
                this,
            ),
        );

        // Active editor switch — immediate full update.
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(
                this.onActiveEditorChange,
                this,
            ),
        );
    }

    // ------------------------------------------------------------------
    // Provider registration
    // ------------------------------------------------------------------

    /**
     * Register a decoration provider together with its collapsed/expanded
     * render styles.  The manager owns the resulting `TextEditorDecorationType`
     * instances and will dispose them when appropriate.
     *
     * If a provider with the same `id` is already registered, the previous one
     * is replaced (and its decoration types disposed).
     */
    registerProvider(
        provider: DecorationProvider,
        collapsedStyle: vscode.DecorationRenderOptions,
        expandedStyle: vscode.DecorationRenderOptions,
    ): void {
        // Clean up previous registration if any.
        this.unregisterProvider(provider.id);

        this.providers.set(provider.id, provider);
        this.collapsedTypes.set(
            provider.id,
            vscode.window.createTextEditorDecorationType(collapsedStyle),
        );
        this.expandedTypes.set(
            provider.id,
            vscode.window.createTextEditorDecorationType(expandedStyle),
        );

        // Kick off an initial update for the active editor.
        this.update();
    }

    /**
     * Remove a previously registered provider and dispose its decoration
     * types.  No-op if the id is not found.
     */
    unregisterProvider(id: string): void {
        this.providers.delete(id);
        this.regions.delete(id);

        const collapsed = this.collapsedTypes.get(id);
        if (collapsed) {
            collapsed.dispose();
            this.collapsedTypes.delete(id);
        }

        const expanded = this.expandedTypes.get(id);
        if (expanded) {
            expanded.dispose();
            this.expandedTypes.delete(id);
        }
    }

    // ------------------------------------------------------------------
    // Full update (re-parse)
    // ------------------------------------------------------------------

    /**
     * Trigger a full decoration update for the active editor.
     *
     * This calls every registered provider's `provideDecorations`, caches the
     * results, and then performs the cursor-based swap so that the display is
     * immediately correct.
     */
    update(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        // Only operate on markdown files.
        if (editor.document.languageId !== 'markdown') {
            this.clearAllDecorations(editor);
            return;
        }

        for (const [id, provider] of this.providers) {
            try {
                const newRegions = provider.provideDecorations(editor);
                this.regions.set(id, newRegions);
            } catch (err) {
                // TODO: surface provider errors via output channel logging
                console.error(
                    `DecorationManager: provider "${id}" threw during provideDecorations`,
                    err,
                );
                // Keep stale regions so the display doesn't blank on transient errors.
            }
        }

        // Apply the cached regions with cursor-awareness.
        this.applyDecorations(editor);
    }

    // ------------------------------------------------------------------
    // Event handlers
    // ------------------------------------------------------------------

    /**
     * Handle cursor position changes.
     *
     * This MUST NOT re-parse the document. It only re-partitions the cached
     * regions into collapsed vs. expanded sets and calls setDecorations.
     */
    private onCursorChange(event: vscode.TextEditorSelectionChangeEvent): void {
        const editor = event.textEditor;

        if (editor.document.languageId !== 'markdown') {
            return;
        }

        this.applyDecorations(editor);
    }

    /**
     * Handle document content changes.  Debounced to avoid excessive
     * re-parsing during rapid typing.
     */
    private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) {
            return;
        }

        if (this.documentChangeTimer !== undefined) {
            clearTimeout(this.documentChangeTimer);
        }

        this.documentChangeTimer = setTimeout(() => {
            this.documentChangeTimer = undefined;
            this.update();
        }, DecorationManager.DOCUMENT_CHANGE_DEBOUNCE_MS);
    }

    /**
     * Handle active editor switch.  Performs an immediate full update so
     * decorations are visible the moment the user switches tabs.
     */
    private onActiveEditorChange(
        editor: vscode.TextEditor | undefined,
    ): void {
        if (!editor) {
            return;
        }
        this.update();
    }

    // ------------------------------------------------------------------
    // Core decoration swap logic
    // ------------------------------------------------------------------

    /**
     * Partition every provider's cached regions into "expanded" (cursor nearby)
     * and "collapsed" (cursor away) sets, then call `setDecorations` for each
     * decoration type.
     *
     * This is the hot path — it runs on every cursor move and must complete
     * well within a single frame (< 16 ms).
     */
    private applyDecorations(editor: vscode.TextEditor): void {
        // Pre-compute the set of lines that have a cursor / selection.
        // Using a Set<number> for O(1) line lookup.
        const cursorLines = this.buildCursorLineSet(editor.selections);
        // Also keep selection ranges for precise intersection checks on
        // multi-line regions.
        const selections = editor.selections;

        for (const [id, regionList] of this.regions) {
            const collapsedType = this.collapsedTypes.get(id);
            const expandedType = this.expandedTypes.get(id);

            if (!collapsedType || !expandedType) {
                // Provider was unregistered between cache and apply — skip.
                continue;
            }

            // --- Pass 1: check each region for direct cursor proximity and
            // collect the set of group IDs that should be expanded. ---
            const expandedGroupIds = new Set<string>();
            const directlyExpanded = new Uint8Array(regionList.length);

            for (let i = 0; i < regionList.length; i++) {
                const region = regionList[i];
                // Use spanRange (full construct) for proximity when available;
                // fall back to the marker's own range otherwise.
                const proximityRange = region.spanRange ?? region.range;
                if (this.isCursorNearRegion(proximityRange, cursorLines, selections)) {
                    directlyExpanded[i] = 1;
                    if (region.groupId) {
                        expandedGroupIds.add(region.groupId);
                    }
                }
            }

            // --- Pass 2: partition into collapsed/expanded, expanding any
            // region whose groupId is in the expanded set. ---
            const collapsedOptions: vscode.DecorationOptions[] = [];
            const expandedOptions: vscode.DecorationOptions[] = [];

            for (let i = 0; i < regionList.length; i++) {
                const region = regionList[i];
                const isExpanded = directlyExpanded[i] === 1
                    || (region.groupId !== undefined && expandedGroupIds.has(region.groupId));

                if (isExpanded) {
                    expandedOptions.push(region.expandedDecoration);
                } else {
                    collapsedOptions.push(region.collapsedDecoration);
                }
            }

            editor.setDecorations(collapsedType, collapsedOptions);
            editor.setDecorations(expandedType, expandedOptions);
        }
    }

    /**
     * Build a set of line numbers that are "active" — i.e., they contain a
     * cursor or are within a selection.
     *
     * For single-cursor / collapsed selections this is just one line per
     * selection.  For ranged selections we include every line in the range.
     */
    private buildCursorLineSet(
        selections: readonly vscode.Selection[],
    ): Set<number> {
        const lines = new Set<number>();
        for (let s = 0; s < selections.length; s++) {
            const sel = selections[s];
            const startLine = sel.start.line;
            const endLine = sel.end.line;
            for (let l = startLine; l <= endLine; l++) {
                lines.add(l);
            }
        }
        return lines;
    }

    /**
     * Determine whether a cursor/selection is "near" a region.
     *
     * A region is considered expanded if ANY cursor position is:
     *   - Inside the region's range, OR
     *   - Directly adjacent (within 1 character) of the region's start or end
     *
     * The 1-character adjacency buffer prevents decoration flickering when
     * the user types at the boundary of a decorated region.
     *
     * Uses a two-phase approach for performance:
     *   Phase 1: Fast reject via cursorLines Set (O(1) per line). If no cursor
     *            is on any line the region spans, skip the expensive checks.
     *   Phase 2: Precise range/adjacency check for regions on cursor lines.
     *
     * Complexity: O(regions * cursors) per cursor move for regions sharing a
     * cursor line. This is acceptable for typical documents (< 200 regions,
     * 1–3 cursors) but could become a concern for extremely decorated files
     * with many active cursors.
     *
     * TODO: F5-validate this in Extension Development Host to confirm the
     * expand/collapse feel is right — the 1-char adjacency buffer may need
     * tuning based on real typing cadence.
     */
    private isCursorNearRegion(
        range: vscode.Range,
        cursorLines: Set<number>,
        selections: readonly vscode.Selection[],
    ): boolean {
        // Phase 1: Fast reject — if no cursor is on any line this region
        // spans, skip the expensive per-cursor range checks.
        const startLine = range.start.line;
        const endLine = range.end.line;
        let onSameLine = false;
        for (let l = startLine; l <= endLine; l++) {
            if (cursorLines.has(l)) {
                onSameLine = true;
                break;
            }
        }
        if (!onSameLine) {
            return false;
        }

        // Phase 2: Precise check — is any cursor within or directly adjacent
        // to this region's range?
        for (const sel of selections) {
            const cursor = sel.active;

            // Check if cursor is inside the region (covers typing within
            // a decorated span).
            if (range.contains(cursor)) {
                return true;
            }

            // Check adjacency: cursor is within 1 character of the region's
            // start or end. This prevents flicker when the cursor sits just
            // outside a boundary (e.g., immediately after typing `**`).
            if (this.isAdjacentToRange(cursor, range)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check whether a cursor position is within 1 character of a range's
     * start or end boundary (adjacency check).
     *
     * Adjacency is defined on the same line only — a cursor on the line
     * above or below is NOT adjacent (the fast line pre-filter already
     * handles cross-line proximity).
     */
    private isAdjacentToRange(
        cursor: vscode.Position,
        range: vscode.Range,
    ): boolean {
        // Adjacent to the start of the range:
        // Cursor is on the same line as range.start and within 1 char.
        if (
            cursor.line === range.start.line &&
            cursor.character >= range.start.character - 1 &&
            cursor.character <= range.start.character + 1
        ) {
            return true;
        }

        // Adjacent to the end of the range:
        // Cursor is on the same line as range.end and within 1 char.
        if (
            cursor.line === range.end.line &&
            cursor.character >= range.end.character - 1 &&
            cursor.character <= range.end.character + 1
        ) {
            return true;
        }

        return false;
    }

    /**
     * Check whether two ranges intersect.
     * Two ranges intersect unless one ends before the other starts.
     */
    private rangesIntersect(a: vscode.Range, b: vscode.Range): boolean {
        // a ends before b starts  OR  b ends before a starts  →  no intersection
        if (a.end.isBefore(b.start) || b.end.isBefore(a.start)) {
            return false;
        }
        return true;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Clear all managed decorations from the given editor.
     * Used when switching away from a markdown file.
     */
    private clearAllDecorations(editor: vscode.TextEditor): void {
        const emptyOptions: vscode.DecorationOptions[] = [];
        for (const type of this.collapsedTypes.values()) {
            editor.setDecorations(type, emptyOptions);
        }
        for (const type of this.expandedTypes.values()) {
            editor.setDecorations(type, emptyOptions);
        }
    }

    // ------------------------------------------------------------------
    // Dispose
    // ------------------------------------------------------------------

    dispose(): void {
        // Cancel pending debounce timer.
        if (this.documentChangeTimer !== undefined) {
            clearTimeout(this.documentChangeTimer);
            this.documentChangeTimer = undefined;
        }

        // Dispose all decoration types.
        for (const type of this.collapsedTypes.values()) {
            type.dispose();
        }
        for (const type of this.expandedTypes.values()) {
            type.dispose();
        }

        this.collapsedTypes.clear();
        this.expandedTypes.clear();
        this.providers.clear();
        this.regions.clear();

        // Dispose event subscriptions.
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
