# Cozy MD Editor

<p align="center">
  <img src="cozy-md-editor-fleece.png" width="200" alt="Cozy MD Editor logo — a fleece blanket with a markdown hash symbol" />
</p>

A VS Code extension that makes markdown easier to work with — especially if you're more used to Google Docs than to code editors.

A lot of people are coming to VS Code for the first time because it's the main way to use Claude Code. If that's you, and you're staring at a bunch of `**` and `#` symbols wondering what happened to your formatting — this extension should help.

## What it does

**Hides the syntax, shows the formatting.** Markdown uses symbols like `**` for bold and `#` for headings. Cozy MD Editor hides those symbols and shows you what the formatting actually looks like — sized headings, bold text, underlined links. If you need to edit the raw syntax, move your cursor to it and the symbols reappear.

**Keyboard shortcuts that match Google Docs.** Cmd+B bolds, Cmd+I italicizes, Cmd+K inserts a link. If you've used a word processor before, the shortcuts work the way you'd expect.

**Lists and tables behave normally.** Hit Enter at the end of a bullet point and you get a new bullet. Tab indents. Tables have a toolbar for adding rows and columns, and Tab moves between cells. Tables auto-align when you save.

**Track changes.** You can turn on change tracking (using a format called CriticMarkup) that marks additions, deletions, and substitutions right in the file. Changes show up color-coded — green for additions, red strikethrough for deletions — and you can accept or reject them individually. Useful for reviewing your own drafts, working with Claude as an editor, or collaborating with other people.

**Frontmatter.** Structured metadata (title, author, tags, status) can go at the top of any markdown file. The extension has templates and shortcuts so you don't have to remember the formatting rules.

## Google Docs pairing

If you keep local markdown copies of Google Docs in your repo, you can record the relationship in each file's frontmatter:

~~~markdown
```yaml
google_doc_url: https://docs.google.com/document/d/your-doc-id
```
~~~

This also works for Google Slides — if you generate a presentation from a markdown file, store the Slides URL the same way. It's just metadata in the file, so it doesn't affect anything else. Full round-trip sync between markdown and Google Docs is planned but not built yet.

## Installation

Cozy MD Editor isn't in the VS Code marketplace yet, so you install it from a `.vsix` file. If you've never done that before, here's the whole process:

1. **Open VS Code.** If you don't have it yet, download it from [code.visualstudio.com](https://code.visualstudio.com).

2. **Open the Extensions panel.** Click the square icon in the left sidebar (it looks like four small blocks), or press **Cmd+Shift+X** on Mac / **Ctrl+Shift+X** on Windows or Linux.

3. **Click the "..." menu** at the top-right of the Extensions panel.

4. **Choose "Install from VSIX..."** from the dropdown.

5. **Find and select the `.vsix` file** you were given.

6. **That's it.** VS Code may ask you to reload — go ahead. After that, the extension activates automatically whenever you open a `.md` file.

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

This is under active development. If something doesn't work, feels weird, or you wish it did something it doesn't — open an issue:

**[github.com/dudgeon/vsc-cozy-md-editor/issues](https://github.com/dudgeon/vsc-cozy-md-editor/issues)**

You don't need to be technical. Just describe what happened or what you want, and a screenshot if you have one.

## License

MIT
