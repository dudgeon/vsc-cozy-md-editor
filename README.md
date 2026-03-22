# Cozy MD Editor

<p align="center">
  <img src="cozy-md-editor-fleece.png" width="200" alt="Cozy MD Editor logo — a fleece blanket with a markdown hash symbol" />
</p>

A VS Code extension that makes markdown feel less like code and more like writing in Google Docs.

If you're a product manager (or anyone, really) who landed in VS Code because it's the best way to work with Claude Code, Cozy MD Editor is here to make you feel at home. You don't need to know markdown syntax — the extension handles the formatting for you while you focus on the words.

## What it does

**Clean, readable view.** Markdown is full of symbols — `**`, `#`, `[]()`  — that are useful but visually noisy. Cozy MD Editor hides those markers while you're writing and only reveals them when your cursor is nearby. Headings display at different sizes, bold looks bold, links are underlined, and blockquotes are styled — all without leaving the normal text editor.

**Familiar keyboard shortcuts.** Cmd+B for bold, Cmd+I for italic, Cmd+K for links — the same shortcuts you already know from Google Docs and other writing tools.

**Smart editing behaviors.** Press Enter at the end of a bullet point, and the next line starts a new bullet. Tab indents list items. Tables auto-align when you save. These small things add up to a writing experience that just feels right.

**Track changes.** Cozy MD Editor uses a format called CriticMarkup to track additions, deletions, and substitutions directly in your file. Changes are color-coded — green for additions, red with strikethrough for deletions — and you can accept or reject each one. This works great for reviewing your own drafts, getting edits from Claude, or collaborating with teammates.

**Table tools.** Insert a table and get a toolbar right above it with buttons to add rows, add columns, align columns, and more. Tab moves between cells, just like a spreadsheet.

**Frontmatter management.** Every document can have structured metadata at the top (title, author, tags, etc.). Cozy MD Editor gives you templates and shortcuts to insert and edit this metadata without worrying about the formatting rules.

## Google Docs connection

If you keep local markdown copies of Google Docs in your repo, you can record the relationship in each file's frontmatter:

~~~markdown
```yaml
google_doc_url: https://docs.google.com/document/d/your-doc-id
```
~~~

This works for Google Slides too — if you generate a presentation from a markdown file, store the Slides URL the same way. The pairing is just metadata in the file, so it won't interfere with anything. Full round-trip sync between markdown and Google Docs is on the roadmap.

## Installation

If this is your first time installing a VS Code extension, here's the full walkthrough:

1. **Open VS Code.** If you don't have it yet, download it from [code.visualstudio.com](https://code.visualstudio.com).

2. **Open the Extensions panel.** Click the square icon in the left sidebar (it looks like four small blocks), or press **Cmd+Shift+X** (Mac) / **Ctrl+Shift+X** (Windows/Linux).

3. **Search for "Cozy MD Editor."** Type the name into the search bar at the top of the panel.

4. **Click Install.** That's it. The extension activates automatically whenever you open a markdown file (any file ending in `.md`).

### Installing from a .vsix file

If you received Cozy MD Editor as a `.vsix` file instead of from the marketplace:

1. Open VS Code.
2. Open the Extensions panel (Cmd+Shift+X / Ctrl+Shift+X).
3. Click the **"..."** menu at the top of the Extensions panel.
4. Choose **"Install from VSIX..."**
5. Find and select the `.vsix` file you downloaded.
6. Done — reload VS Code if prompted.

## Keyboard shortcuts

| Action | Mac | Windows / Linux |
|---|---|---|
| Bold | Cmd+B | Ctrl+B |
| Italic | Cmd+I | Ctrl+I |
| Inline code | Cmd+` | Ctrl+` |
| Link | Cmd+K | Ctrl+K |
| Cycle heading level | Cmd+Shift+H | Ctrl+Shift+H |
| Insert frontmatter | Cmd+Alt+F | Ctrl+Alt+F |
| Table menu | Cmd+Alt+T | Ctrl+Alt+T |
| Toggle track changes | Cmd+Shift+T | Ctrl+Shift+T |
| Add comment | Cmd+Alt+C | Ctrl+Alt+C |
| Accept change | Cmd+Alt+A | Ctrl+Alt+A |
| Next change | Cmd+Alt+] | Ctrl+Alt+] |
| Previous change | Cmd+Alt+[ | Ctrl+Alt+[ |

## Feedback and feature requests

This extension is actively being developed and we'd genuinely like to hear what's working and what isn't. If you have a feature idea, run into a bug, or something just feels off — please open an issue:

**[github.com/dudgeon/vsc-cozy-md-editor/issues](https://github.com/dudgeon/vsc-cozy-md-editor/issues)**

You don't need to be technical to file an issue. Just describe what you expected to happen and what actually happened. Screenshots are always helpful.

## License

MIT
