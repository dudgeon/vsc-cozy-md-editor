---
name: release
description: End-to-end release and marketplace management for the Cozy MD Editor VS Code extension. Two modes — (1) Code release: takes committed code through build validation, changelog/README updates, version bump, marketplace publish, git tagging, and post-release verification. (2) Listing update: updates marketplace content (README, description, keywords, categories, icon, screenshots) without cutting a new version. Use this skill whenever the user mentions releasing, publishing, shipping, cutting a version, bumping the version, pushing to the marketplace, updating the store listing, changing marketplace keywords/description/screenshots, or making a new release — even casual phrases like "let's ship it", "update the listing", or "time to publish."
---

# Release & Marketplace Management

Two modes of operation:

- **Code release** — take committed code all the way to a published marketplace
  version, with human checkpoints at every irreversible step.
- **Listing update** — push changes to the marketplace page (README, description,
  keywords, categories, icon, screenshots) without bumping the version or
  shipping new code.

Determine which mode to use based on what the user asks for. If ambiguous, use
AskUserQuestion to clarify. If the user wants both (new code + listing changes),
run the code release flow — listing content changes will be picked up
automatically since `vsce publish` re-uploads everything.

This skill supersedes the old `/publish` skill and incorporates the `/build`
pipeline as a stage (code release mode only).

The philosophy: everything before the `vsce publish` command is reversible. After
that, the version is live. So the skill front-loads all validation and gives the
user clear opt-out points before anything goes to the store.

---

# Mode A: Code Release

## Overview of stages

1. **Pre-flight** — verify git state, load credentials, summarize changes
2. **Release decision** — ask the user whether to cut a release (with change summary)
3. **Version bump decision** — ask what kind of bump (patch/minor/major)
4. **Changelog & README** — update CHANGELOG.md from git history, check README for stale content
5. **Build validation** — run the full build/lint/test/package pipeline
6. **Release commit** — commit changelog, README, and any prep changes
7. **Publish** — push to VS Code Marketplace via `vsce`
8. **Tag & push** — git tag, push commit and tag to remote
9. **Post-release verification** — confirm the marketplace listing updated

---

## Stage 1: Pre-flight

### Node version

The project requires Node 20+ (pinned in `.nvmrc`). Verify the active Node
version before doing anything else — `vsce package` and `vsce publish` will
fail silently or with cryptic errors on Node 18.

```bash
source ~/.nvm/nvm.sh && nvm use
node --version  # must be v20+
```

If `nvm use` fails (Node 20 not installed), stop and tell the user to run
`nvm install 20`. All subsequent `npm` and `npx` commands in this skill must
run under the correct Node version — prefix them with
`source ~/.nvm/nvm.sh && nvm use &&` if needed.

### Git state

Check that the working tree is ready for a release:

```bash
git status --short
git branch --show-current
git log --oneline origin/main..HEAD
```

Requirements:
- Working tree is clean (no uncommitted changes). If dirty, stop and tell the
  user — they need to commit or stash before releasing.
- Current branch is `main`. Releases always ship from main. If on a different
  branch, stop and ask the user if they intended to release from here.
- Local main is in sync with origin/main (no unpushed commits, no commits to
  pull). If there are unpushed commits, ask the user if they want to push first.

### Load the marketplace PAT

Read `.env` from the project root. The token is stored as:

```
'azure-marketplace-key': <token-value>
```

Extract the token value (everything after the colon, trimmed). If the file is
missing or the key isn't found, stop and tell the user they need to add it.

**Security rules:**
- Never print the full token. Confirm it loaded by showing the last 3 characters
  (e.g., "PAT loaded (ends in …d51)").
- Before proceeding, verify that `.env` appears in both `.gitignore` and
  `.vscodeignore`. If either is missing the entry, add it before doing anything
  else — a leaked PAT is worse than a delayed release.

### Summarize changes since last release

Find the most recent version tag:

```bash
git tag --sort=-v:refname | head -1
```

If no tags exist, use the initial commit as the baseline. Generate a change
summary from the git log:

```bash
git log <last-tag>..HEAD --oneline --no-merges
```

Group the commits into categories (features, fixes, chores, docs) by reading
commit messages. This summary will be shown to the user in the next stage and
used to draft the changelog entry.

---

## Stage 2: Release decision

Use AskUserQuestion to present the change summary and ask whether to proceed:

> Here's what's changed since the last release (vX.Y.Z):
>
> **Features:**
> - [list]
>
> **Fixes:**
> - [list]
>
> **Other:**
> - [list]
>
> Do you want to cut a release with these changes? (yes/no)

If the user says no, stop gracefully. The skill is done — nothing was changed.

---

## Stage 3: Version bump decision

Use AskUserQuestion to ask for the version bump type:

> What kind of version bump?
>
> - **patch** (X.Y.Z → X.Y.Z+1) — bug fixes, small tweaks
> - **minor** (X.Y.Z → X.Y+1.0) — new features, non-breaking changes
> - **major** (X.Y.Z → X+1.0.0) — breaking changes
>
> Current version: [read from package.json]. Default: patch

If the user doesn't specify or just says "go ahead," default to patch.

---

## Stage 4: Changelog & README

### Update CHANGELOG.md

Add a new section at the top of CHANGELOG.md (below the `# Changelog` heading)
with the new version number and today's date. Use the change summary from
Stage 1 to populate the entry.

Format (Keep a Changelog style):
```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- feature descriptions...

### Changed
- change descriptions...

### Fixed
- fix descriptions...
```

Omit any section (Added/Changed/Fixed) that has no entries. Write descriptions
that are meaningful to end users — translate commit messages into user-facing
language. "Refactor decoration manager" becomes "Improved editor performance."

### Check README for stale content

Scan README.md for phrases that suggest content needs updating:

- "coming in the next release" / "coming soon" / "planned"
- Version numbers that reference the old version
- Installation instructions that are out of date
- Feature lists that don't reflect what's actually shipping

If stale content is found, use AskUserQuestion to show what was found and ask
whether to update it now. Make the suggested edits if the user approves.

---

## Stage 5: Build validation

Run the full build pipeline under the correct Node version. This is the same
sequence as the `/build` skill:

```bash
source ~/.nvm/nvm.sh && nvm use
npm run build
npm run lint
npm test
npm run package
```

All four stages must pass. If any stage fails:
- Report the failures clearly (file, line, error message)
- Do NOT proceed to publish
- Ask the user if they want to fix the issues and retry, or abort the release

After a successful package step:

1. **Audit the .vsix contents.** Review the file list printed by `vsce package`.
   Flag any files that shouldn't ship to users — common offenders include:
   - Dev config (`.claude/`, `.env`, `skills/`, `.nvmrc`)
   - Documentation not meant for end users (`docs/`, `Initial-prd.md`, `CLAUDE.md`)
   - Source files or test fixtures (`src/`, `test-fixtures/`)

   If unexpected files are found, update `.vscodeignore` to exclude them, then
   re-run `npm run package` to verify the fix before proceeding.

2. Note the .vsix filename and size for the release report.

3. Clean up: `rm -f *.vsix`

---

## Stage 6: Release commit

Stage and commit the release preparation changes:

```bash
git add CHANGELOG.md
# Also add README.md if it was updated in Stage 4
git commit -m "Release vX.Y.Z

Update CHANGELOG and prepare for marketplace release.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Only commit files that were actually changed (CHANGELOG.md, and README.md if
updated). Do not use `git add -A`.

---

## Stage 7: Publish to marketplace

This is the irreversible step. Use AskUserQuestion for final confirmation:

> Ready to publish **vX.Y.Z** to the VS Code Marketplace.
>
> This will make the new version available to all users. Proceed? (yes/no)

If confirmed, publish:

```bash
VSCE_PAT="<token-from-env>"
npx vsce publish <bump-type> --pat "$VSCE_PAT"
```

Where `<bump-type>` is `patch`, `minor`, or `major` as determined in Stage 3.

Note: `vsce publish` runs `vscode:prepublish` (which triggers `npm run build`)
and bumps the version in package.json automatically. This is expected — the
version in package.json will be updated by vsce, not by us manually.

If publishing fails:
- **PAT expired or invalid:** Tell the user to generate a new one at
  https://dev.azure.com/dudgeon/_usersSettings/tokens (scope: All accessible
  organizations, Marketplace > Manage) and update `.env`.
- **Publisher not found:** Direct the user to
  https://marketplace.visualstudio.com/manage to check the publisher `dudgeon`.
- **Network error:** Retry once. If it fails again, report and stop.

After a successful publish, clean up any .vsix files: `rm -f *.vsix`

---

## Stage 8: Tag & push

After successful publish, the version in package.json has been bumped by vsce.
Read the new version from package.json, then fold the version bump into the
release commit and tag it.

```bash
# Stage the vsce-updated package.json (and package-lock.json if changed)
git add package.json package-lock.json

# Amend the release commit — always pass -m to preserve the message,
# because --no-edit can lose the message when vsce sets its own.
git commit --amend -m "Release vX.Y.Z

Update CHANGELOG and prepare for marketplace release.
Bump version to X.Y.Z for marketplace publish.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

# Tag the release — delete any existing tag first (vsce sometimes creates one)
git tag -d v<new-version> 2>/dev/null || true
git tag v<new-version>

# Push commit and tag
git push --force-with-lease && git push --tags
```

The amend is intentional — vsce updated package.json after our release commit,
and we want the tag to point to a commit that includes the correct version
number. Using `--force-with-lease` (not `--force`) ensures we don't overwrite
any concurrent remote changes.

---

## Stage 9: Post-release verification

Confirm the release went through:

1. Report the new version number and marketplace URL:
   https://marketplace.visualstudio.com/items?itemName=dudgeon.cozy-md-editor

2. Note that the marketplace page may take 5-10 minutes to reflect the new
   version.

3. Summarize what was done:
   - Version bumped from X.Y.Z to A.B.C
   - CHANGELOG updated
   - README updated (if applicable)
   - Published to marketplace
   - Tagged and pushed vA.B.C

---

---

# Mode B: Listing Update

Update the VS Code Marketplace page without cutting a new version. Use this when
the user wants to improve discoverability, fix typos in the description, update
screenshots, or refresh the README on the marketplace — without shipping new code.

## What can be updated

The marketplace listing is built from these sources:

| Content | Source | How to change |
|---------|--------|---------------|
| Long description | `README.md` | Edit the file directly |
| Short description | `package.json` → `description` | Edit the field |
| Display name | `package.json` → `displayName` | Edit the field |
| Categories | `package.json` → `categories` | Edit the array (valid: Formatters, Other, Programming Languages, Snippets, Themes, etc.) |
| Keywords | `package.json` → `keywords` (max 5) | Edit the array |
| Icon | `icon.png` (256x256, referenced by `package.json` → `icon`) | Replace the file |
| Gallery banner | `package.json` → `galleryBanner` → `color` and `theme` | Edit the fields |
| Repository / homepage / bugs | `package.json` → `repository`, `homepage`, `bugs` | Edit the fields |
| License | `LICENSE` file + `package.json` → `license` | Edit both |

Screenshots and GIFs are embedded in README.md as images — the marketplace
renders them directly.

## Listing update flow

### 1. Understand what the user wants to change

Use AskUserQuestion if the request is vague (e.g., "update the listing"). Show
the current values of the relevant fields so the user can see what they're
working with.

### 2. Make the edits

Edit `README.md`, `package.json`, `icon.png`, or other source files as needed.
For package.json changes, validate:
- `keywords` has at most 5 entries
- `categories` uses valid VS Code marketplace categories
- `description` is concise (one sentence, <200 chars — this appears in search results)
- `icon` points to a file that exists and is a square PNG (128x128 minimum, 256x256 recommended)

### 3. Preview and confirm

Show the user a summary of all changes. Use AskUserQuestion:

> Here's what will change on the marketplace listing:
>
> - **Description**: "old" → "new"
> - **Keywords**: [old list] → [new list]
> - **README**: [summary of edits]
>
> Push these changes to the marketplace? (yes/no)

### 4. Load PAT and publish

Load the PAT from `.env` (same process as code release Stage 1). Then publish
the listing update without bumping the version:

```bash
VSCE_PAT="<token-from-env>"
npx vsce publish --pat "$VSCE_PAT" --no-update-package-json
```

The `--no-update-package-json` flag publishes the current version with updated
content without incrementing the version number. If this flag isn't supported by
the installed vsce version, use `npx vsce publish patch --pat "$VSCE_PAT"`
instead (a patch bump is acceptable for content-only changes — note this to the
user).

### 5. Commit and push

Commit the listing changes:

```bash
git add README.md package.json icon.png  # only files that changed
git commit -m "Update marketplace listing

[brief description of what changed]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

### 6. Verify

Report the marketplace URL and note that changes may take 5-10 minutes to
appear: https://marketplace.visualstudio.com/items?itemName=dudgeon.cozy-md-editor

---

## Error recovery

If the skill fails partway through, here's what's safe to retry:

**Code release:**

| Failed at | State | Recovery |
|-----------|-------|----------|
| Pre-flight | Nothing changed | Fix the issue, run `/release` again |
| Changelog/README | Local file edits only | `git checkout -- CHANGELOG.md README.md` to reset, fix, retry |
| Build validation | Local file edits only | Fix build errors, run `/release` again |
| Release commit | Local commit, not pushed | `git reset HEAD~1` to undo, fix, retry |
| Publish | Version is live | Cannot un-publish. Fix forward with a new patch release |
| Tag & push | Version is live, tag may be missing | Manually tag and push: `git tag vX.Y.Z && git push --tags` |

**Listing update:**

| Failed at | State | Recovery |
|-----------|-------|----------|
| Editing content | Local file edits only | `git checkout` the changed files, retry |
| Publish | Content is live | Content changes are idempotent — just fix and re-publish |
| Commit & push | Content is live, git may be behind | Commit and push manually |

---

## Quick reference

| What | Where |
|------|-------|
| PAT | `.env` (`azure-marketplace-key` field) |
| PAT management | https://dev.azure.com/dudgeon/_usersSettings/tokens |
| Publisher | `dudgeon` at https://marketplace.visualstudio.com/manage/publishers/dudgeon |
| Marketplace listing | https://marketplace.visualstudio.com/items?itemName=dudgeon.cozy-md-editor |
| Version | `package.json` → `version` field |
| Changelog | `CHANGELOG.md` (Keep a Changelog format) |
| Tags | `vX.Y.Z` format (e.g., `v0.1.0`) |
