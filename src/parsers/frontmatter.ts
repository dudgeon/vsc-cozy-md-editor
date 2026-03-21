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

    if (firstLine === '```' || firstLine === '```yaml') {
        delimiter = 'codefence';
        closingMarker = '```';
    } else if (firstLine === '---') {
        delimiter = 'dashes';
        closingMarker = '---';
    } else {
        return null;
    }

    // Find closing delimiter (start searching from line 1)
    let endLineIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === closingMarker) {
            endLineIndex = i;
            break;
        }
    }

    if (endLineIndex === -1) {
        return null;
    }

    const yamlLines = lines.slice(1, endLineIndex);
    const rawYaml = yamlLines.join('\n');

    let data: Record<string, unknown>;
    try {
        data = parseYaml(rawYaml) || {};
    } catch {
        return null;
    }

    return {
        data,
        rawYaml,
        startLine: 0,
        endLine: endLineIndex,
        delimiter,
    };
}

export function serializeFrontmatter(data: Record<string, unknown>): string {
    const yamlStr = stringifyYaml(data).trimEnd();
    return '```\n' + yamlStr + '\n```';
}
