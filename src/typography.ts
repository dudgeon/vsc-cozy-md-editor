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
 * Clean bundle — knowledge work.
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
 */
export const READER_BUNDLE: TypographyBundle = {
    bodyFont: "'Plus Jakarta Sans', 'Avenir Next', -apple-system, 'Helvetica Neue', sans-serif",
    headingFont: "'Newsreader', 'New York', Charter, Georgia, serif",
    bodySize: 16,
    bodyLineHeight: 1.8,
    h1: { size: '1.875em', weight: '700', letterSpacing: '-0.01em' },
    h2: { size: '1.375em', weight: '600', letterSpacing: '0' },
    h3: { size: '1em', weight: '500', style: 'italic' },
};

const BUILT_IN_BUNDLES: Record<string, TypographyBundle> = {
    clean: CLEAN_BUNDLE,
    reader: READER_BUNDLE,
};

// ---------------------------------------------------------------------------
// Bundle Lookup
// ---------------------------------------------------------------------------

/**
 * Merge a partial user-defined bundle with the clean bundle defaults.
 * Any property not specified by the user falls back to the clean bundle.
 */
function mergeWithDefaults(partial: Record<string, unknown>): TypographyBundle {
    const base = CLEAN_BUNDLE;

    const mergeHeading = (
        baseH: HeadingStyle,
        userH?: Record<string, unknown>,
    ): HeadingStyle => {
        if (!userH) return baseH;
        return {
            size: typeof userH.size === 'string' ? userH.size : baseH.size,
            weight: typeof userH.weight === 'string' ? userH.weight : baseH.weight,
            letterSpacing: typeof userH.letterSpacing === 'string' ? userH.letterSpacing : baseH.letterSpacing,
            style: typeof userH.style === 'string' ? userH.style : baseH.style,
        };
    };

    return {
        bodyFont: typeof partial.bodyFont === 'string' ? partial.bodyFont : base.bodyFont,
        headingFont: typeof partial.headingFont === 'string' ? partial.headingFont : base.headingFont,
        bodySize: typeof partial.bodySize === 'number' ? partial.bodySize : base.bodySize,
        bodyLineHeight: typeof partial.bodyLineHeight === 'number' ? partial.bodyLineHeight : base.bodyLineHeight,
        h1: mergeHeading(base.h1, partial.h1 as Record<string, unknown> | undefined),
        h2: mergeHeading(base.h2, partial.h2 as Record<string, unknown> | undefined),
        h3: mergeHeading(base.h3, partial.h3 as Record<string, unknown> | undefined),
    };
}

/**
 * Look up the active typography bundle from user configuration.
 *
 * Resolution order:
 * 1. If the name matches a built-in bundle ("clean", "cozy"), return it
 * 2. If the name matches a key in `cozyMd.typography.customBundles`, merge
 *    that bundle with clean defaults and return it
 * 3. Fall back to the cozy bundle (the default)
 */
export function getActiveBundle(): TypographyBundle {
    const config = vscode.workspace.getConfiguration('cozyMd.typography');
    const name = config.get<string>('activeBundle', 'reader');

    // Check custom bundles first (includes the built-in defaults which are
    // externalized into the setting so users can see and edit them)
    const customBundles = config.get<Record<string, Record<string, unknown>>>('customBundles', {});
    if (name in customBundles) {
        return mergeWithDefaults(customBundles[name]);
    }

    // Fall back to hardcoded built-ins (in case customBundles was cleared)
    if (name in BUILT_IN_BUNDLES) {
        return BUILT_IN_BUNDLES[name];
    }

    // Ultimate fallback
    return READER_BUNDLE;
}

// ---------------------------------------------------------------------------
// Apply Bundle to Editor Settings
// ---------------------------------------------------------------------------

/**
 * Apply the active typography bundle to the `[markdown]` language-scoped
 * editor settings at the Global (User) level.
 *
 * Called on activation and whenever typography config changes.
 */
export async function applyTypographyBundle(): Promise<void> {
    const bundle = getActiveBundle();

    const config = vscode.workspace.getConfiguration();
    const existing = config.get<Record<string, unknown>>('[markdown]') ?? {};
    await config.update('[markdown]', {
        ...existing,
        'editor.fontFamily': bundle.bodyFont,
        'editor.fontSize': bundle.bodySize,
        'editor.lineHeight': bundle.bodyLineHeight,
    }, vscode.ConfigurationTarget.Global);

    // Write built-in bundles into user settings.json so they're visible
    // and editable. VS Code package.json defaults are invisible in the
    // user's file — this makes them discoverable.
    const typoConfig = vscode.workspace.getConfiguration('cozyMd.typography');
    const current = typoConfig.inspect<Record<string, unknown>>('customBundles');
    const userValue = current?.globalValue as Record<string, unknown> | undefined;
    // Seed or migrate: write bundles if missing, or rename 'cozy' → 'reader'
    const needsSeed = !userValue || Object.keys(userValue).length === 0;
    const needsMigration = userValue && 'cozy' in userValue && !('reader' in userValue);
    if (needsSeed || needsMigration) {
        await typoConfig.update('customBundles', {
            clean: CLEAN_BUNDLE,
            reader: READER_BUNDLE,
        }, vscode.ConfigurationTarget.Global);
    }

    // Migrate activeBundle from 'cozy' to 'reader'
    const activeName = typoConfig.get<string>('activeBundle');
    if (activeName === 'cozy') {
        await typoConfig.update('activeBundle', 'reader', vscode.ConfigurationTarget.Global);
    }
}
