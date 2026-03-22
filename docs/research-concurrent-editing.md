# Concurrent Editing: Human + Claude Code in VS Code

Research report on how a VS Code extension can safely handle concurrent editing
between a human user and Claude Code (which edits files via the terminal/filesystem).

**Date:** 2026-03-22
**Context:** Cozy MD Editor extension, Phase 4 planning (Claude as Collaborator)

---

## 1. VS Code APIs for Detecting External File Changes

### 1.1 `workspace.createFileSystemWatcher` (FileSystemWatcher)

The [FileSystemWatcher API](https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher)
monitors file system events (create, change, delete) for files matching a glob
pattern within the workspace.

```ts
const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
watcher.onDidChange(uri => { /* file changed on disk */ });
watcher.onDidCreate(uri => { /* file created */ });
watcher.onDidDelete(uri => { /* file deleted */ });
```

**What it provides:**
- Fires when a file matching the pattern is created, changed, or deleted on
  disk — including changes made by external processes (terminal, Claude Code,
  git operations).
- Returns the `Uri` of the changed file, but NOT the content or a diff.
- The newer overload (VS Code 1.84+) accepts `FileSystemWatcherOptions` with
  custom exclude patterns, giving extensions full control over which events
  they receive.

**Key limitations:**
- **Fires before the TextDocument is updated.** If you immediately call
  `workspace.openTextDocument(uri)` in the handler, you may get stale content.
  A short `setTimeout` or waiting for the next `onDidChangeTextDocument` is
  needed ([Issue #72831](https://github.com/microsoft/vscode/issues/72831)).
- **Inconsistent on some platforms.** Network mounts (NFS/SMB) may produce
  incorrect events ([Issue #201103](https://github.com/microsoft/vscode/issues/201103)).
  Some users report `onDidChange` not firing for external modifications at all
  ([Issue #137574](https://github.com/microsoft/vscode/issues/137574)).
- **Does not fire for `workspace.fs` API calls.** Only real disk I/O triggers
  events.
- Events are scoped to the workspace by default when using string patterns.
  Use `RelativePattern` for precise folder targeting.

**Verdict:** Useful as the primary detection mechanism for Claude Code's disk
writes, but requires a fallback strategy and careful timing to read updated content.

### 1.2 `workspace.onDidChangeTextDocument`

The [onDidChangeTextDocument](https://code.visualstudio.com/api/references/vscode-api#workspace.onDidChangeTextDocument)
event fires whenever a `TextDocument`'s content changes in memory.

```ts
workspace.onDidChangeTextDocument(event => {
    event.document;       // the TextDocument
    event.contentChanges; // array of TextDocumentContentChangeEvent
    event.reason;         // TextDocumentChangeReason (optional)
});
```

**What it provides:**
- Fires for ALL content changes: user typing, undo/redo, extension edits via
  `TextEditor.edit()` or `workspace.applyEdit()`, AND external disk changes
  that VS Code auto-reloads into the buffer.
- The `contentChanges` array gives exact ranges and replacement text.
- The `reason` field ([TextDocumentChangeReason](https://vscode-api.js.org/enums/vscode.TextDocumentChangeReason.html))
  distinguishes `Undo` and `Redo` from other changes.

**Can it distinguish external from user edits?**

| `reason` value | Meaning |
|---|---|
| `undefined` | Normal user typing or extension edit |
| `TextDocumentChangeReason.Undo` | Undo operation |
| `TextDocumentChangeReason.Redo` | Redo operation |

**There is no `ExternalChange` reason value.** The `reason` field was added in
VS Code 1.59 ([Issue #120617](https://github.com/microsoft/vscode/issues/120617))
but only exposes Undo/Redo. When VS Code reloads a clean buffer from disk after
an external change, the event fires with `reason === undefined` — identical to a
user typing.

**Workaround for distinguishing external changes:** Combine a
`FileSystemWatcher.onDidChange` event with the next `onDidChangeTextDocument`
event. When a file-watcher event fires for a URI and is followed shortly by a
text-document-change event for the same document, the change is external.
This is a heuristic, not a guarantee.

**Gotcha — double firing:** The event may fire twice for a single edit: once
with empty `contentChanges` (dirty-state change), then again with actual content
([Issue #166138](https://github.com/microsoft/vscode/issues/166138)). Filter
on `event.contentChanges.length > 0`.

### 1.3 `workspace.onDidSaveTextDocument`

Fires when a `TextDocument` is saved to disk from within VS Code.

**Critical limitation:** This event does NOT fire for external saves. If Claude
Code writes a file via the terminal, `onDidSaveTextDocument` will not fire. It
only fires for saves initiated by VS Code (user Cmd+S, auto-save, extension
calling `document.save()`).

**Verdict:** Not useful for detecting Claude Code's edits. Use
`FileSystemWatcher` instead.

### 1.4 Summary Table

| API | Detects external disk changes? | Provides content/diff? | Distinguishes source? |
|---|---|---|---|
| `FileSystemWatcher.onDidChange` | Yes (usually) | No (URI only) | Yes — only fires for disk I/O |
| `onDidChangeTextDocument` | Yes (after buffer reload) | Yes (contentChanges) | No — `reason` only has Undo/Redo |
| `onDidSaveTextDocument` | **No** | No | N/A |
| `FileSystemWatcher` + `onDidChangeTextDocument` combo | Yes | Yes | Yes (heuristic) |

---

## 2. Failure Mode Analysis

### Scenario A: User has unsaved edits, Claude modifies the file on disk

**VS Code default behavior:**
- If the buffer is dirty (unsaved changes), VS Code does NOT auto-reload from
  disk. The user's in-memory edits take priority.
- Claude's disk changes are silently ignored until the user saves.
- When the user saves, VS Code detects the conflict and shows a "file has been
  modified on disk" notification with options: **Compare**, **Overwrite**, or
  **Revert** ([`files.saveConflictResolution`](https://code.visualstudio.com/docs/editing/codebasics)).
- If `files.saveConflictResolution` is set to `overwriteFileOnDisk`, Claude's
  changes are lost without warning.

**Risk level:** **HIGH.** Claude's work is invisible and easily overwritten.
For a PM who doesn't understand dirty buffers, this is a silent data loss trap.

**What an extension could do:**
- Force-save before dispatching to Claude (prevents this scenario entirely).
- Watch for `FileSystemWatcher.onDidChange` on the dispatched file. If the
  buffer is dirty, show a prominent warning: "Claude has edited this file, but
  you have unsaved changes. Review the diff?"
- Snapshot the user's buffer before dispatch; snapshot the disk after Claude
  finishes; three-way merge.

### Scenario B: User sends stale (unsaved) file content to Claude

**VS Code default behavior:**
- Nothing — VS Code has no concept of "dispatching" content to an external
  tool. The extension controls what gets sent.

**Risk level:** **MEDIUM.** Claude operates on outdated content, generates edits
that don't apply cleanly, or misses recent user changes. The user gets confused
results but no data loss.

**What an extension could do:**
- Auto-save the document before every dispatch command (`document.save()`).
- Show a warning if the document is dirty: "Save before sending to Claude?"
- Send the in-memory buffer text instead of the file path (avoids disk staleness,
  but Claude Code CLI expects file paths, not piped content).

### Scenario C: Claude writes to a file while the user is actively typing

**VS Code default behavior:**
- If the buffer is dirty, Claude's disk write is ignored (see Scenario A).
- If the user saves between keystrokes and the buffer is momentarily clean,
  VS Code auto-reloads Claude's version — wiping the user's most recent unsaved
  keystrokes.
- The user sees their text suddenly change, with no undo path back to their
  version (undo history is reset on external reload).

**Risk level:** **HIGH.** Extremely disorienting for a non-technical user.
Undo history loss makes recovery impossible.

**What an extension could do:**
- Lock the editor to read-only while Claude is working (see Section 3).
- Show a status bar indicator: "Claude is editing this file..."
- Queue Claude's changes and present them as a diff for review after Claude
  finishes, rather than allowing auto-reload.

### Scenario D: User saves, overwriting Claude's recent disk changes

**VS Code default behavior:**
- VS Code detects the conflict and shows the save-conflict dialog (Compare /
  Overwrite / Revert) — but only if the user saves manually.
- With `files.autoSave` enabled, auto-save may fire before VS Code detects
  the external change, silently overwriting Claude's work.

**Risk level:** **HIGH** with auto-save, **MEDIUM** without. Claude's work
disappears. The user may not even know Claude made changes.

**What an extension could do:**
- Disable auto-save for the specific file while Claude is working.
- Intercept save via `workspace.onWillSaveTextDocument` and check if Claude
  has pending unreviewed changes.
- Show a merge UI before allowing the save to proceed.

### Scenario E: Both user and Claude edit different parts of the same file simultaneously

**VS Code default behavior:**
- This is a combination of Scenarios A and C. Because VS Code has a single
  buffer model (not a CRDT/OT collaborative model), there is no merging.
  Either the user's version wins (dirty buffer blocks reload) or Claude's
  version wins (clean buffer auto-reloads, wiping user edits).

**Risk level:** **HIGH.** The "last writer wins" behavior means one person's
work is always lost. There is no automatic merge.

**What an extension could do:**
- Prevent simultaneous editing entirely (lock the file while Claude works).
- Snapshot both versions and present a diff/merge UI after Claude finishes.
- Have Claude write to a temporary file, then the extension merges changes into
  the user's buffer as CriticMarkup.

### Failure Mode Summary

| Scenario | Default behavior | Risk | Data loss? |
|---|---|---|---|
| A. Dirty buffer + Claude edits disk | Save-conflict dialog | High | Claude's work lost if user overwrites |
| B. Stale content sent to Claude | N/A (extension controls) | Medium | No, but Claude's output may be wrong |
| C. Claude writes while user types | Auto-reload wipes keystrokes OR ignored | High | User's recent keystrokes or Claude's work |
| D. User saves over Claude's changes | Save-conflict dialog (maybe) | High | Claude's work lost |
| E. Both edit different parts | No merge — last writer wins | High | One side always lost |

---

## 3. Mitigation Strategies

### Strategy 1: Auto-save before dispatch

**How it works:** Call `document.save()` before every Claude dispatch command.
Ensures Claude always reads the latest content from disk.

| Dimension | Assessment |
|---|---|
| Addresses scenarios | B (stale content) — fully solves it |
| Effort | Trivial — one line added to each dispatch command |
| Risk reduction | Low-moderate — only fixes one failure mode |
| Drawbacks | Forces a save the user may not want; triggers `onWillSave` formatters |
| User experience | Transparent if combined with auto-save; slightly surprising if user has auto-save off |

**Verdict:** Do this unconditionally. It is zero-cost and eliminates the most
common "why did Claude ignore my changes?" complaint.

### Strategy 2: File watcher + snapshot + diff as CriticMarkup

**How it works:**
1. When the extension dispatches to Claude, snapshot the document text.
2. Start a `FileSystemWatcher` on that specific file.
3. When `onDidChange` fires, read the new disk content.
4. Diff the snapshot against the new disk content using `diffWords()`.
5. Convert the diff to CriticMarkup and apply it to the user's buffer via
   `editor.edit()`.
6. The user sees Claude's changes as tracked changes (green additions, red
   deletions) that they can accept/reject with the existing CodeLens buttons.

| Dimension | Assessment |
|---|---|
| Addresses scenarios | A, C, D, E — turns all external changes into reviewable CriticMarkup |
| Effort | Medium (~150-200 lines). Reuses existing `diffWords` + `generateCriticMarkup` from `track-changes.ts` |
| Risk reduction | **High** — transforms a silent data loss problem into a visible review workflow |
| Drawbacks | Requires the buffer to be saved before dispatch (Strategy 1). If the user has unsaved edits when Claude finishes, the diff base is wrong. Undo behavior needs care. |
| User experience | Excellent for PMs — they see "Claude's suggestions" in the same track-changes UI they already know. Matches the "Me + Claude" collaboration model in the PRD. |

**Verdict:** This is the highest-value strategy. It integrates naturally with
the existing CriticMarkup review flow and makes Claude's edits visible and
reversible. Recommended as the primary approach.

### Strategy 3: Prompt Claude to use CriticMarkup directly

**How it works:** Instead of letting Claude write plain text to the file,
instruct Claude (via the prompt) to output its changes wrapped in CriticMarkup
syntax. Claude writes `{++added text++}` and `{--deleted text--}` directly.

| Dimension | Assessment |
|---|---|
| Addresses scenarios | A, C, D, E — if Claude writes CriticMarkup, the user's original text is preserved inline |
| Effort | Low — prompt engineering, no extension code changes |
| Risk reduction | Medium-high, but depends on Claude's compliance |
| Drawbacks | Claude may not perfectly follow CriticMarkup syntax in all cases. Substitutions (`{~~ old ~> new ~~}`) are hard to get right. Claude would need to read the current file, understand the format, and produce valid markup — fragile for long documents. If Claude makes a mistake, the file is corrupted. |
| User experience | Good when it works. Bad when Claude produces malformed CriticMarkup. |

**Verdict:** Attractive in theory but unreliable in practice. CriticMarkup
syntax is niche; LLMs sometimes hallucinate delimiters or nest them incorrectly.
Better as a complement to Strategy 2 (tell Claude about the format so it
understands why it sees CriticMarkup in files) than as the primary mechanism.

### Strategy 4: Lock the file in VS Code while Claude is working

**How it works:** When dispatching to Claude, set the file as read-only using
[`files.readonlyInclude`](https://code.visualstudio.com/docs/getstarted/settings)
or the session-scoped "Set Active Editor Readonly in Session" command. Unlock
when Claude finishes.

| Dimension | Assessment |
|---|---|
| Addresses scenarios | C, E — prevents the user from creating a dirty buffer while Claude works |
| Effort | Low — a few API calls |
| Risk reduction | Medium — prevents conflicts but doesn't help with review |
| Drawbacks | **No reliable way to know when Claude finishes.** Claude Code runs in a terminal; the extension cannot detect command completion. Locking indefinitely or requiring manual unlock is a terrible UX for PMs. |
| User experience | Bad. "Why can't I type?" is the worst possible experience for a new VS Code user. |

**Verdict:** Only viable if combined with a reliable "Claude is done" signal.
Even then, locking is hostile UX for the target audience. Not recommended as a
primary strategy.

### Strategy 5: Warning/confirmation dialogs

**How it works:** Show modal dialogs at critical moments:
- Before dispatch: "Save and send to Claude?"
- When Claude changes the file: "Claude has edited this file. Review changes?"
- Before user saves over Claude's edits: "Claude made changes you haven't
  reviewed. Save anyway?"

| Dimension | Assessment |
|---|---|
| Addresses scenarios | A, B, D — gives the user a chance to act |
| Effort | Low-medium |
| Risk reduction | Medium — depends on the user making the right choice |
| Drawbacks | Dialog fatigue. PMs will click through warnings without reading them. Dialogs don't prevent data loss, they just warn about it. |
| User experience | Acceptable for rare events; annoying for frequent editing. Non-technical users often dismiss dialogs reflexively. |

**Verdict:** Use sparingly for truly destructive operations (saving over
unreviewed Claude changes). Do not use as the primary safety mechanism.

### Strategy Comparison Matrix

| Strategy | Solves scenarios | Effort | Risk reduction | UX quality | Recommended? |
|---|---|---|---|---|---|
| 1. Auto-save before dispatch | B | Trivial | Low | Good | **Yes** (always) |
| 2. File watcher → CriticMarkup | A, C, D, E | Medium | **High** | **Excellent** | **Yes** (primary) |
| 3. Claude writes CriticMarkup | A, C, D, E | Low | Medium | Variable | Complement only |
| 4. File locking | C, E | Low | Medium | **Bad** | No |
| 5. Warning dialogs | A, B, D | Low | Medium | Okay | Sparingly |

---

## 4. What Other Extensions Do

### 4.1 GitHub Copilot (Copilot Edits / Agent Mode)

**Architecture:** Copilot operates entirely within VS Code's process. It uses
the `WorkspaceEdit` API to apply changes directly to the in-memory buffer — no
disk writes, no external process conflict.

**How it handles edits:**
- Changes are applied via `workspace.applyEdit()` and shown as inline diffs
  with green/red decorations.
- Each change has **Keep** / **Undo** hover controls.
- Files with pending edits show a "squared-dot" icon in the Explorer and tabs.
- The user reviews all changes before they are saved to disk.
- A "Working Set" UI lets the user scope which files the AI can edit.

**Concurrency approach:** Copilot serializes its edits and shows them in a
pending state. The user cannot simultaneously type in a region that Copilot is
editing — the inline diff UI effectively locks those ranges.

**Key insight for Cozy MD:** Copilot avoids the external-change problem entirely
by staying in-process. This is not available to Cozy MD because Claude Code
operates via the terminal/filesystem. But the **review-before-save** pattern is
directly applicable.

**References:**
- [Review AI-generated code edits](https://code.visualstudio.com/docs/copilot/chat/review-code-edits)
- [Introducing Copilot Edits](https://code.visualstudio.com/blogs/2024/11/12/introducing-copilot-edits)

### 4.2 Cursor

**Architecture:** Cursor is a fork of VS Code with deep modifications to the
editor core. It has direct control over the document model.

**How it handles edits:**
- **Composer/Agent mode** applies edits inline with accept/reject UI.
- Cursor 2.0 introduced **parallel agents** using git worktrees or remote
  sandboxes — each agent operates on an isolated copy of the codebase.
- The apply system gives **per-agent undo**: reverting one agent's work leaves
  other results intact.
- Changes are streamed in real-time with inline diff visualization.

**Concurrency approach:** Isolation via worktrees. Each agent gets its own
branch/copy. Conflicts are resolved at merge time, not edit time.

**Key insight for Cozy MD:** The worktree/sandbox approach is overkill for
single-file markdown editing, but the principle — **prevent concurrent mutation
of the same buffer** — is sound. For Cozy MD, the analog is: let Claude edit
the disk copy while the extension holds a snapshot, then merge.

### 4.3 Continue (continue.dev)

**Architecture:** A VS Code extension that communicates with LLM backends and
applies changes through VS Code's extension API.

**How it handles edits:**
- **Edit mode:** The user selects code, describes the change, and the LLM
  streams a diff inline. The `VerticalDiffManager` renders additions/deletions
  as editor decorations with accept/reject buttons per block.
- **Agent mode:** Uses an `edit_existing_file` tool that applies changes via
  the extension API (not disk writes).
- Diffs are divided into **logical blocks** that can be individually
  accepted/rejected.

**Concurrency approach:** Continue applies edits via the extension API
(`TextEditor.edit`), not via disk writes. It does NOT handle external file
mutations — if another process modifies the file, Continue's pending diffs
become invalid.

**Key insight for Cozy MD:** Continue's `VerticalDiffManager` pattern — stream
changes as reviewable blocks — is a good UX model. But it only works for
in-process edits. For external (Claude Code terminal) edits, Cozy MD needs the
file-watcher approach.

**Reference:**
- [Diff Management (DeepWiki)](https://deepwiki.com/continuedev/continue/6.8-diff-management)
- [How Agent Mode Works](https://docs.continue.dev/ide-extensions/agent/how-it-works)

### 4.4 Aider

**Architecture:** A terminal-based coding assistant. The VS Code extensions
(multiple community forks) act as thin wrappers around the CLI.

**How it handles edits:**
- Aider writes directly to disk, similar to Claude Code.
- Shows a diff editor in VS Code for review (accept/reject at the file level).
- **Automatically commits each modification** with a descriptive git message.
- Stages uncommitted changes before making its own modifications.

**Concurrency approach:** Git as the safety net. Every Aider edit is a commit.
If something goes wrong, `git diff` and `git checkout` recover the previous
state.

**Key insight for Cozy MD:** The git-commit-per-edit pattern is a strong safety
net that Cozy MD could adopt, especially for the target audience. However, PMs
may not understand git. The CriticMarkup approach is a better fit because it is
visible in the document itself.

### 4.5 Claude Code (Official VS Code Extension)

**Architecture:** The official Claude Code VS Code extension by Anthropic acts
as a bridge between the CLI and VS Code.

**How it handles edits:**
- Creates **file snapshots before every edit**, enabling undo/rewind at any
  point in the conversation.
- Shows changes in real-time through a sidebar panel with inline diffs.
- Colored gutter indicators show which lines changed; clicking opens the diff
  viewer.
- Uses VS Code's native diff viewer for accept/reject.

**Concurrency approach:** The snapshot-before-edit model gives a known-good
baseline for diffing. The extension detects Claude's filesystem writes and
presents them for review rather than auto-applying them.

**Key insight for Cozy MD:** This is the closest analog to what Cozy MD needs.
The key difference: Cozy MD should convert Claude's diffs to CriticMarkup
(which the user reviews with the existing accept/reject CodeLens) rather than
using VS Code's native diff viewer.

### Extension Comparison

| Extension | Edits via | External disk writes? | Conflict strategy | Review UI |
|---|---|---|---|---|
| GitHub Copilot | `WorkspaceEdit` API | No | Serialized, in-process | Inline diff with Keep/Undo |
| Cursor | Direct editor control | No (worktrees for parallel) | Isolation via worktrees | Inline diff, per-agent undo |
| Continue | `TextEditor.edit` API | No | In-process only | VerticalDiffManager blocks |
| Aider | Disk writes (CLI) | **Yes** | Git commits as safety net | VS Code diff editor |
| Claude Code (official) | Disk writes (CLI) | **Yes** | Snapshot + diff viewer | Native diff viewer |
| **Cozy MD (proposed)** | Disk writes (CLI) | **Yes** | Snapshot + CriticMarkup | CriticMarkup CodeLens |

---

## 5. Recommendation

### The Simplest, Safest Approach

Given the target audience (PMs new to VS Code who do not understand dirty
buffers, git, or terminals), the recommendation is a **layered approach** that
prioritizes prevention over recovery:

#### Tier 1: Prevention (implement immediately in Phase 3)

1. **Auto-save before dispatch.** Every Claude dispatch command (`askClaudeAboutFile`,
   `askClaudeAboutSelection`, `sendFileToClaudeContext`) calls `document.save()`
   before sending anything to the terminal.
   - **Effort:** 3 lines of code.
   - **Eliminates:** Scenario B (stale content).

2. **Status bar indicator.** Show "Claude is working..." in the status bar after
   dispatch. Clear it when the file watcher detects a change (heuristic) or
   after a configurable timeout.
   - **Effort:** ~30 lines.
   - **Reduces:** User confusion in Scenarios C and E.

#### Tier 2: Detection + Review (implement in Phase 4)

3. **File watcher → CriticMarkup pipeline.** The core safety mechanism:
   - On dispatch: snapshot the document text.
   - Create a `FileSystemWatcher` for the dispatched file.
   - On `onDidChange`: wait a tick (100ms), read the new disk content,
     diff against the snapshot using `diffWords()`, generate CriticMarkup,
     and apply it to the buffer via `editor.edit()`.
   - The user sees Claude's changes as green additions / red deletions with
     Accept / Reject CodeLens — the same UI they already know from track
     changes.
   - **Effort:** ~150-200 lines, reusing `generateCriticMarkup()` from
     `track-changes.ts`.
   - **Eliminates:** Scenarios A, C, D, E — Claude's changes are always
     visible and reversible.

4. **"Review Claude's Changes" notification.** When the file watcher detects
   Claude's edit, show an information message: "Claude edited [filename].
   Review the tracked changes." with a button to navigate to the first change.
   - **Effort:** ~20 lines.
   - **Improves:** Discoverability for users who aren't watching the editor.

#### Tier 3: Refinement (Phase 6+)

5. **Dirty-buffer guard.** If the user has unsaved edits when Claude changes
   the file, show a warning with options: "Save my changes first", "Discard
   my changes", "Show diff". This is the only scenario where a dialog is
   justified.
   - **Effort:** ~50 lines.

6. **Claude completion detection.** Investigate whether Claude Code's terminal
   output includes a reliable "done" signal (e.g., prompt reappearing, exit
   code). If so, replace the timeout-based status indicator with a real
   completion event.

7. **CriticMarkup author attribution.** Tag Claude's changes with author
   metadata in the CriticMarkup (e.g., `{++added text++}{>> @claude <<}`).
   This supports the multi-author collaboration model described in the PRD.

### Ranked by Effort vs. Risk Reduction

| Rank | Strategy | Effort | Risk eliminated | Priority |
|---|---|---|---|---|
| 1 | Auto-save before dispatch | Trivial (3 lines) | Stale content → Claude | Phase 3 |
| 2 | File watcher → CriticMarkup | Medium (~150 lines) | All concurrent edit failures | Phase 4 |
| 3 | Status bar indicator | Low (~30 lines) | User confusion | Phase 3 |
| 4 | Review notification | Low (~20 lines) | Missed changes | Phase 4 |
| 5 | Dirty-buffer guard dialog | Low (~50 lines) | Save-over-Claude risk | Phase 6 |
| 6 | Claude completion detection | Medium (unknown) | Status indicator accuracy | Phase 6 |
| 7 | Author attribution | Low (~20 lines) | Authorship ambiguity | Phase 6 |

### Why NOT the Other Approaches

- **File locking:** Hostile UX. PMs will think VS Code is broken.
- **Claude writes CriticMarkup directly:** Unreliable. LLMs hallucinate
  delimiters. One malformed `{~~` corrupts the document.
- **Git-based recovery (Aider model):** Requires the user to understand git.
  The target audience does not.
- **In-process edits (Copilot/Continue model):** Not possible. Claude Code
  operates via the terminal/filesystem, not the extension API.

### Implementation Sketch for the File Watcher → CriticMarkup Pipeline

```
dispatch command
  │
  ├─ document.save()                    ← Tier 1
  ├─ snapshot = document.getText()
  ├─ start FileSystemWatcher on file
  ├─ show status bar: "Claude is working..."
  │
  └─ terminal.sendText(claude ...)
       │
       ▼
  [Claude edits file on disk]
       │
       ▼
  FileSystemWatcher.onDidChange fires
       │
       ├─ setTimeout(100ms)             ← wait for disk flush
       ├─ newContent = fs.readFile()
       ├─ diff = diffWords(snapshot, newContent)
       ├─ criticMarkup = generateCriticMarkup(snapshot, newContent)
       ├─ editor.edit(replace entire content with criticMarkup)
       ├─ show notification: "Claude edited this file. Review changes."
       └─ clear status bar
```

This pipeline is the recommended focus for Phase 4. It reuses the existing
CriticMarkup infrastructure (parser, decorations, CodeLens accept/reject),
requires no new UI components, and turns an invisible concurrent-editing hazard
into a visible, reviewable track-changes workflow that matches the "Me + Claude"
collaboration model.

---

## Appendix: Key VS Code API References

- [FileSystemWatcher](https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher)
- [workspace.onDidChangeTextDocument](https://code.visualstudio.com/api/references/vscode-api#workspace.onDidChangeTextDocument)
- [TextDocumentChangeReason](https://vscode-api.js.org/enums/vscode.TextDocumentChangeReason.html)
- [workspace.onDidSaveTextDocument](https://code.visualstudio.com/api/references/vscode-api#workspace.onDidSaveTextDocument)
- [workspace.applyEdit](https://code.visualstudio.com/api/references/vscode-api#workspace.applyEdit)
- [files.saveConflictResolution setting](https://code.visualstudio.com/docs/editing/codebasics)

## Appendix: Relevant VS Code GitHub Issues

- [#114656 — Make workspace.applyEdit / TextEditor.edit race-condition free](https://github.com/microsoft/vscode/issues/114656)
- [#279589 — "Strict Mode" for WorkspaceEdit to prevent concurrent AI agent corruption](https://github.com/microsoft/vscode/issues/279589)
- [#120617 — onDidChangeTextDocument: differentiate between user input and redo/undo](https://github.com/microsoft/vscode/issues/120617)
- [#72831 — FileSystemWatcher fires events before text documents are updated](https://github.com/microsoft/vscode/issues/72831)
- [#137574 — FileSystemWatcher.onChange not firing for external changes](https://github.com/microsoft/vscode/issues/137574)
- [#169942 — Please make VSCode respond to external file changes](https://github.com/microsoft/vscode/issues/169942)
- [#17773 — VS Code allows external file changes to overwrite current file state](https://github.com/microsoft/vscode/issues/17773)
- [Discussion #90 — What triggers workspace.onDidChangeTextDocument?](https://github.com/microsoft/vscode-discussions/discussions/90)
- [Discussion #1157 — Detect user vs plugin file edits](https://github.com/microsoft/vscode-discussions/discussions/1157)
