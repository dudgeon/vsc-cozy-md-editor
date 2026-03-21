---
name: build
description: Run the full build/lint/test/package pipeline for the Cozy MD Editor VS Code extension. Use when the user wants to build, test, lint, package, or verify the extension, or after making code changes that should be validated.
---

# Build & Validate Pipeline

Run the full build pipeline for the Cozy MD Editor VS Code extension and report
results. Each stage runs sequentially so that earlier failures are caught before
later stages waste time.

## Pipeline Stages

Run stages in this order. If a stage fails, still run the remaining stages so
the user gets the full picture — but mark the overall result as FAILED.

### 1. Build (`npm run build`)

Run `npm run build` in the project root.

**Parse the output:**
- esbuild prints the output file and bundle size on success (e.g., `dist/extension.js  1.2kb`)
- Errors appear as lines with file path, line, and column (e.g., `src/foo.ts:12:5: ERROR: ...`)
- Warnings appear similarly with `WARNING:` prefix

**Report:** bundle file, size, build time. On error, quote each error with file location.

### 2. Lint (`npm run lint`)

Run `npm run lint` in the project root.

**Parse the output:**
- ESLint outputs lines like `file:line:col  severity  message  rule-name`
- Exit code 0 = clean or warnings only; exit code 1 = errors present

**Report:** count of errors and warnings. If there are errors, list each with file location
and the rule name. For warnings, summarize the count and most common rule — don't list
every warning individually unless there are fewer than 5.

### 3. Unit Tests (`npm test`)

Run `npm test` in the project root.

**Parse the output:**
- Mocha outputs passing/failing counts (e.g., `5 passing`, `11 failing`)
- Each failure includes the test name and assertion details

**Report:** pass/fail counts. For each failure, show the test name and a one-line summary
of what went wrong (expected vs actual). Don't dump full stack traces.

### 4. Package (`npm run package`)

Run `npm run package` in the project root.

**Parse the output:**
- `vsce package` creates a `.vsix` file and prints its name
- It may warn about missing fields in package.json or README
- It exits non-zero if packaging fails

**Report:** .vsix file name and size if produced. Surface any warnings. On failure, quote
the error.

After packaging, clean up by removing the .vsix file so it doesn't clutter the repo —
run `rm -f *.vsix` in the project root.

## Integration Tests (optional)

Skip `npm run test:integration` by default — it requires the VS Code Extension
Development Host and cannot run headlessly in a terminal. Only run it if the user
explicitly asks.

## Output Format

Present results as a summary table, then detail any failures:

```
## Build Results

| Stage      | Status | Details              |
|------------|--------|----------------------|
| Build      | PASS   | dist/extension.js 1.2kb (3ms) |
| Lint       | WARN   | 0 errors, 24 warnings |
| Unit Tests | FAIL   | 5 passing, 11 failing |
| Package    | PASS   | cozy-md-editor-0.1.0.vsix (12kb) |

**Overall: FAIL** (unit tests have failures)
```

Then for each failed or warned stage, add a details section with the actionable
information described above.

## Important

- Always run from the project root directory
- Run `npm install` first only if `node_modules/` doesn't exist
- Don't attempt to fix failures automatically — report them and let the user decide
- The pipeline gives the user a clear snapshot; they choose what to act on next
