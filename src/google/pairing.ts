/**
 * Google Workspace pairing management.
 * Reads/writes google_doc_url and google_sheet_url from frontmatter.
 */

export interface GooglePairing {
    docUrl?: string;
    sheetUrl?: string;
    syncStatus?: 'synced' | 'local-ahead' | 'remote-ahead' | 'conflict' | 'unsynced';
    lastSynced?: string;
}
