import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Typography Bundle Types
// ---------------------------------------------------------------------------

export interface HeadingStyle {
    size: string;
    weight: string;
    letterSpacing?: string;
    style?: string;
}

export interface TypographyBundle {
    bodyFont: string;
    headingFont: string;
    bodySize: number;
    bodyLineHeight: number;
    h1: HeadingStyle;
    h2: HeadingStyle;
    h3: HeadingStyle;
}

// ---------------------------------------------------------------------------
// Built-in Bundles
// ---------------------------------------------------------------------------

/**
 * Clean bundle — knowledge work default.
 * Inter for everything, tight heading sizes, strong weight contrast.
 */
export const CLEAN_BUNDLE: TypographyBundle = {
    bodyFont: "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Arial, sans-serif",
    headingFont: "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Arial, sans-serif",
    bodySize: 16,
    bodyLineHeight: 1.7,
    h1: { size: '1.875em', weight: '700', letterSpacing: '-0.02em' },
    h2: { size: '1.375em', weight: '600', letterSpacing: '-0.01em' },
    h3: { size: '1em', weight: '600', style: 'normal' },
};

/**
 * Cozy bundle — literary/editorial writing.
 * Newsreader headings (serif), Plus Jakarta Sans body (geometric sans).
 * Heading fonts must be installed on the user's system.
 */
export const COZY_BUNDLE: TypographyBundle = {
    bodyFont: "'Plus Jakarta Sans', 'Avenir Next', -apple-system, 'Helvetica Neue', sans-serif",
    headingFont: "'Newsreader', 'New York', Charter, Georgia, serif",
    bodySize: 16,
    bodyLineHeight: 1.8,
    h1: { size: '1.875em', weight: '700', letterSpacing: '-0.01em' },
    h2: { size: '1.375em', weight: '600', letterSpacing: '0' },
    h3: { size: '1em', weight: '500', style: 'italic' },
};

// ---------------------------------------------------------------------------
// Bundle Lookup
// ---------------------------------------------------------------------------

/**
 * Look up the active typography bundle from user configuration.
 * Returns the matching built-in bundle, defaulting to Clean.
 */
export function getActiveBundle(): TypographyBundle {
    const name = vscode.workspace.getConfiguration('cozyMd.typography')
        .get<string>('activeBundle', 'cozy');
    return name === 'clean' ? CLEAN_BUNDLE : COZY_BUNDLE;
}

// ---------------------------------------------------------------------------
// Apply Bundle to Editor Settings
// ---------------------------------------------------------------------------

/**
 * Apply the active typography bundle to the `[markdown]` language-scoped
 * editor settings at the Global (User) level.
 *
 * Called on activation and whenever `cozyMd.typography.activeBundle` changes.
 */
export async function applyTypographyBundle(): Promise<void> {
    const bundle = getActiveBundle();

    const config = vscode.workspace.getConfiguration();
    // VS Code's language-scoped overrides use the `[markdown]` key.
    // Passing the whole object replaces the override block, so we merge with
    // any existing values the user may have set (e.g. editor.lineNumbers).
    const existing = config.get<Record<string, unknown>>('[markdown]') ?? {};
    await config.update('[markdown]', {
        ...existing,
        'editor.fontFamily': bundle.bodyFont,
        'editor.fontSize': bundle.bodySize,
        'editor.lineHeight': bundle.bodyLineHeight,
    }, vscode.ConfigurationTarget.Global);
}
