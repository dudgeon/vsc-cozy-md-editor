# Cozy MD Editor

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=dudgeon.cozy-md-editor">
    <img src="docs/cozy-md-editor-fleece.png" width="200" alt="Cozy MD Editor logo — a fleece blanket with a markdown hash symbol" />
  </a>
  <br/>
  <a href="https://marketplace.visualstudio.com/items?itemName=dudgeon.cozy-md-editor">
    <img src="https://img.shields.io/visual-studio-marketplace/v/dudgeon.cozy-md-editor?label=VS%20Code%20Marketplace&color=blue" alt="VS Code Marketplace" />
  </a>
</p>

A VS Code extension that makes markdown easier to work with — especially if you're more used to Google Docs than to code editors.

A lot of people are coming to VS Code for the first time because it's the main way to use Claude Code. If that's you, and you're staring at a bunch of `**` and `#` symbols wondering what happened to your formatting — this extension should help.

## What it does

**Hides the syntax, shows the formatting.** Markdown uses symbols like `**` for bold and `#` for headings. Cozy MD Editor hides those symbols and shows you what the formatting actually looks like — sized headings, bold text, underlined links. If you need to edit the raw syntax, move your cursor to it and the symbols reappear.

**Keyboard shortcuts that match Google Docs.** Cmd+B bolds, Cmd+I italicizes, Cmd+K inserts a link. If you've used a word processor before, the shortcuts work the way you'd expect.

**Lists and tables behave normally.** Hit Enter at the end of a bullet point and you get a new bullet. Tab indents. Tables have a toolbar for adding rows and columns, and Tab moves between cells. Tables auto-align when you save.

**Track changes.** The extension reads and renders [CriticMarkup](https://criticmarkup.com) — a format for marking additions, deletions, and substitutions right in the file. Changes show up color-coded — green for additions, red strikethrough for deletions — and you can accept or reject them individually. Move your cursor to a change to see the full syntax and Accept/Reject controls.

Track changes *recording* is built in — toggle it on and your edits are automatically wrapped in CriticMarkup. Claude Code integration lets you ask Claude about your file or selection directly from the editor.

**Frontmatter.** Structured metadata (title, author, tags, status) can go at the top of any markdown file. The extension has templates and shortcuts so you don't have to remember the formatting rules.

## Google Docs pairing

If you keep local markdown copies of Google Docs in your repo, you can record the relationship in each file's frontmatter:

~~~markdown
```yaml
google_doc_url: https://docs.google.com/document/d/your-doc-id
```
~~~

This also works for Google Slides — if you generate a presentation from a markdown file, store the Slides URL the same way. It's just metadata in the file, so it doesn't affect anything else. Full round-trip sync between markdown and Google Docs is on the roadmap.

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=dudgeon.cozy-md-editor) or search for **Cozy MD Editor** in the Extensions panel (`Cmd+Shift+X` / `Ctrl+Shift+X`).

### Build from source (for contributors)

1. **Clone the repo** and install dependencies:
   ```bash
   git clone https://github.com/dudgeon/vsc-cozy-md-editor.git
   cd vsc-cozy-md-editor
   nvm use          # requires Node 20+
   npm install
   ```

2. **Press F5** in VS Code to launch the Extension Development Host with the extension loaded. Open any `.md` file to see it in action.

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
| Indent lines | Cmd+] | Ctrl+] |
| Outdent lines | Cmd+[ | Ctrl+[ |
| Toggle track changes | Cmd+Shift+T | Ctrl+Shift+T |
| Add comment | Cmd+Alt+M | Ctrl+Alt+M |
| Accept change | Cmd+Alt+A | Ctrl+Alt+A |
| Next change | Cmd+Alt+] | Ctrl+Alt+] |
| Previous change | Cmd+Alt+[ | Ctrl+Alt+[ |

## Feedback and feature requests

This is under active development. If something doesn't work, feels weird, or you wish it did something it doesn't — open an issue:

**[github.com/dudgeon/vsc-cozy-md-editor/issues](https://github.com/dudgeon/vsc-cozy-md-editor/issues)**

You don't need to be technical. Just describe what happened or what you want, and a screenshot if you have one.

## License

MIT
