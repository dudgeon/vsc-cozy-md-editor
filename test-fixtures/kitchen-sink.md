```
title: Kitchen Sink Test Document
date: 2026-03-21
author: Test Author
tags: [markdown, testing, decorations]
status: draft
google-doc-url: https://docs.google.com/document/d/example
```

# Heading Level 1

This is a paragraph under a level-1 heading. It contains **bold text** and
*italic text* and ***bold italic text*** for testing inline decoration.

## Heading Level 2

Here is some `inline code` in the middle of a sentence. And here is a
[link to the CriticMarkup spec](https://criticmarkup.com/spec.php) that
should show expand-on-cursor behavior for the URL portion.

### Heading Level 3

Multiple inline styles in one paragraph: **bold**, *italic*, `code`,
[a link](https://example.com), and even **bold with `code` inside**.

#### Heading Level 4

A deeply nested heading to test heading-level cycling and font weight.

##### Heading Level 5

Even deeper.

###### Heading Level 6

The deepest heading level.

---

## Tables

A simple table:

| Feature | Status | Notes |
| --- | --- | --- |
| Bold toggle | Done | Cmd+B |
| Italic toggle | Done | Cmd+I |
| Heading cycle | Done | Cmd+Shift+H |

A table with alignment:

| Left-aligned | Center-aligned | Right-aligned |
| :--- | :---: | ---: |
| apples | 12 | $1.50 |
| bananas | 6 | $0.75 |
| cherries | 200 | $8.00 |

## Blockquotes

> This is a simple blockquote. It should have a `>` marker that dims
> when the cursor is elsewhere.

> This blockquote has **bold** and *italic* and `code` inside it,
> testing that inline decorations work correctly nested in quotes.

## Code Blocks

```javascript
function hello() {
    console.log("This is a fenced code block");
    // Syntax dimming should NOT apply inside here
    const bold = "**not bold**";
    const italic = "*not italic*";
}
```

## Lists

- Item one with **bold**
- Item two with *italic*
- Item three with `inline code`
- Item four with [a link](https://example.com)

1. Numbered item one
2. Numbered item two
3. Numbered item three

## Links — Multiple Styles

An inline link: [VS Code Marketplace](https://marketplace.visualstudio.com)

A bare URL (no decoration expected): https://example.com

A link with bold text: [**Bold Link Text**](https://example.com)

## CriticMarkup Examples

This sentence has an {++ addition that was inserted ++} into it.

This sentence has a {-- deletion that was removed --} from it.

This sentence has a {~~ substitution ~> replacement ~~} in it.

This sentence has a {>> comment about the writing style <<} attached.

This sentence has a {== highlighted phrase ==}{>> with an attached comment <<}.

Multiple CriticMarkup in one line: {++ new ++} and {-- old --} and {>> note <<}.

## Horizontal Rules

Above the rule.

---

Below the rule.

## Mixed Content Stress Test

> ### Blockquoted Heading
>
> A paragraph inside a blockquote with **bold**, *italic*, `code`, and
> a [link](https://example.com). This tests decoration nesting.

| Column A | Column B |
| --- | --- |
| **Bold cell** | *Italic cell* |
| `Code cell` | [Link cell](https://example.com) |
| {++ Added ++} | {-- Removed --} |

The end.
