import TurndownService from 'turndown';
import { gfm } from '@truto/turndown-plugin-gfm';

// --- Singleton turndown service ---

const turndownService = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
});

turndownService.use(gfm);

// Fix extra blank lines between list items (Issue #7).
// Google Docs (and other sources) wrap <li> content in <p> tags, which causes
// turndown's paragraph rule to inject \n\n inside list items, producing "loose
// lists" on paste. This override strips those spurious newlines.
turndownService.addRule('compactListItem', {
    filter: 'li',
    replacement: (content: string, node: any, options: any) => {
        // Strip paragraph-induced double newlines inside list items
        let trimmed = content
            .replace(/^\n+/, '')
            .replace(/\n+$/, '')
            .replace(/\n\n+/g, '\n');

        const parent = node.parentNode;
        const suffix = node.nextSibling ? '\n' : '';

        if (parent && parent.nodeName === 'OL') {
            const start = parent.getAttribute('start');
            const siblings = Array.from(parent.children)
                .filter((n: any) => n.nodeName === 'LI');
            const index = siblings.indexOf(node);
            const num = start ? Number(start) + index : index + 1;
            return num + '. ' + trimmed + suffix;
        }

        const prefix = options.bulletListMarker + ' ';
        return prefix + trimmed + suffix;
    },
});

// Google Docs wraps everything in <b> then uses font-weight:normal on non-bold
// text. This rule must come before the bold-span rule so it takes priority.
turndownService.addRule('googleDocsNormalWeight', {
    filter: (node: any) => {
        if (node.nodeName !== 'B') return false;
        const style = node.getAttribute('style') || '';
        return /font-weight\s*:\s*normal/i.test(style);
    },
    replacement: (content: string) => content,
});

// Google Docs bold via <span style="font-weight:700"> or <span style="font-weight:bold">
turndownService.addRule('googleDocsBoldSpan', {
    filter: (node: any) => {
        if (node.nodeName !== 'SPAN') return false;
        const style = node.getAttribute('style') || '';
        return /font-weight\s*:\s*(700|bold)\b/i.test(style);
    },
    replacement: (content: string) => {
        const trimmed = content.trim();
        if (!trimmed) return content;
        return `**${trimmed}**`;
    },
});

// Google Docs italic via <span style="font-style:italic">
turndownService.addRule('googleDocsItalicSpan', {
    filter: (node: any) => {
        if (node.nodeName !== 'SPAN') return false;
        const style = node.getAttribute('style') || '';
        return /font-style\s*:\s*italic/i.test(style);
    },
    replacement: (content: string) => {
        const trimmed = content.trim();
        if (!trimmed) return content;
        return `*${trimmed}*`;
    },
});

// Google Docs pastes checkboxes as <img> with aria-roledescription="...checkbox..."
// inside <li role="checkbox" aria-checked="true|false">. Convert to task list
// syntax instead of letting the default <img> rule produce base64 data URLs.
turndownService.addRule('googleDocsCheckbox', {
    filter: (node: any) => {
        if (node.nodeName !== 'IMG') return false;
        const roleDesc = node.getAttribute('aria-roledescription') || '';
        return roleDesc.includes('checkbox');
    },
    replacement: (_content: string, node: any) => {
        const roleDesc = node.getAttribute('aria-roledescription') || '';
        const isChecked = roleDesc.includes('checked') && !roleDesc.includes('unchecked');
        return isChecked ? '[x] ' : '[ ] ';
    },
});

// --- Helper functions ---

/**
 * Detect Google Docs HTML and apply preprocessing to clean up its quirks.
 */
function normalizeGoogleDocsHtml(html: string): string {
    // Google Docs wraps content in a <b> with docs-internal-guid id.
    // Strip the outer wrapper to let inner formatting rules work properly.
    let processed = html;

    // Remove the outer <b id="docs-internal-guid-..."> wrapper
    processed = processed.replace(
        /<b[^>]*docs-internal-guid[^>]*>([\s\S]*)<\/b>/i,
        '$1'
    );

    return processed;
}

/**
 * Returns true if the HTML contains only basic structural tags with no
 * semantic formatting — meaning a plain text paste is equivalent.
 */
function isTrivialHtml(html: string): boolean {
    const formattingTags = /<(b|strong|i|em|a|table|code|pre|h[1-6]|ul|ol|blockquote|del|s|img)\b/i;
    // Google Docs uses <span style="font-weight:..."> for formatting
    const styledSpans = /style\s*=\s*["'][^"']*(font-weight|font-style|text-decoration)/i;
    return !formattingTags.test(html) && !styledSpans.test(html);
}

// --- Main export ---

/**
 * Convert HTML clipboard content to clean markdown.
 * Returns null if the HTML is trivial (no formatting worth preserving).
 */
export function convertHtmlToMarkdown(html: string): string | null {
    if (!html || isTrivialHtml(html)) return null;

    const processedHtml = html.includes('docs-internal-guid')
        ? normalizeGoogleDocsHtml(html)
        : html;

    // Pass HTML as string — turndown uses its own internal parser.
    // linkedom's DOM doesn't fully support the methods turndown's GFM
    // table plugin needs, so string input is more reliable.
    let markdown = turndownService.turndown(processedHtml);

    // Belt-and-suspenders: collapse any remaining consecutive blank lines
    // between list items that the compactListItem rule didn't catch.
    markdown = markdown.replace(/^([ \t]*[-*+\d]+[.)]\s.*)\n\n+([ \t]*[-*+\d]+[.)]\s)/gm, '$1\n$2');

    return markdown.trim() || null;
}
