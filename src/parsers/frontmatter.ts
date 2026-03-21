/**
 * Parse and serialize YAML frontmatter.
 * Reads both code fence (```) and triple-dash (---) delimiters.
 * Always writes code fence delimiters (Google Docs compatibility).
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface FrontmatterResult {
    data: Record<string, unknown>;
    rawYaml: string;
    startLine: number;
    endLine: number;
    delimiter: 'codefence' | 'dashes';
}

export function parseFrontmatter(text: string): FrontmatterResult | null {
    const lines = text.split('\n');
    if (lines.length === 0) {
        return null;
    }

    const firstLine = lines[0].trim();

    let delimiter: 'codefence' | 'dashes';
    let closingMarker: string;

    if (firstLine === '```') {
        delimiter = 'codefence';
        closingMarker = '```';
    } else if (firstLine === '---') {
        delimiter = 'dashes';
        closingMarker = '---';
    } else {
        return null;
    }

    // Find the closing delimiter (start searching from line 1)
    let endLine = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === closingMarker) {
            endLine = i;
            break;
        }
    }

    if (endLine === -1) {
        return null;
    }

    const rawYaml = lines.slice(1, endLine).join('\n');
    const data = parseYaml(rawYaml) as Record<string, unknown> ?? {};

    return {
        data,
        rawYaml,
        startLine: 0,
        endLine,
        delimiter,
    };
}

export function serializeFrontmatter(data: Record<string, unknown>): string {
    const yamlContent = stringifyYaml(data);
    // stringifyYaml appends a trailing newline; use it as the separator before closing fence
    return '```\n' + yamlContent + '```';
}
