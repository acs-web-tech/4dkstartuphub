
/**
 * Escape special characters in a string for use in a regular expression.
 * This prevents ReDoS attacks and unintended regex matching.
 */
export function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
