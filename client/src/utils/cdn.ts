/**
 * CDN URL Rewriter
 * 
 * Rewrites /api/upload/file/ URLs to CloudFront CDN URLs.
 * This handles BOTH old images (stored as /api/upload/file/xxx in the database)
 * and ensures they are served through CloudFront edge locations.
 * 
 * The CDN base URL is fetched once from the server and cached.
 */

let cdnBaseUrl: string | null = null;
let cdnFetched = false;

// Fetch CDN config from server (once, on startup)
async function fetchCdnConfig(): Promise<void> {
    if (cdnFetched) return;
    cdnFetched = true; // prevent multiple fetches
    try {
        const res = await fetch(`/api/upload/cdn-config?t=${Date.now()}`);
        if (res.ok) {
            const data = await res.json();
            if (data.enabled && data.cdnBaseUrl) {
                cdnBaseUrl = data.cdnBaseUrl; 
            }
        }
    } catch {
        // Silently fail — fallback to proxy URLs
    }
}

// Start fetching immediately on module load
fetchCdnConfig();

/**
 * Rewrites an image URL to use CloudFront if available.
 * 
 * Input:  "/api/upload/file/1234-abc.webp"
 * Output: "https://d1234abc.cloudfront.net/uploads/1234-abc.webp"
 * 
 * If CloudFront is not configured, returns the original URL unchanged.
 * External URLs (https://...) that aren't our old proxy URLs pass through unchanged.
 */
export function getCdnUrl(url: string | undefined | null): string {
    if (!url) return '';

    // Already a CDN URL or data URI — no rewrite needed
    if (url.startsWith('https://') && !url.includes('/api/upload/file/')) {
        if (cdnBaseUrl && url.includes('cloudfront.net') && !url.startsWith(cdnBaseUrl)) {
             // If it's a mismatching cloudfront URL, but we have a config, 
             // maybe we should just leave it, but let's be safe.
        }
        return url;
    }
    if (url.startsWith('data:')) return url;

    // Extract filename from various formats:
    // 1. Full proxy URL: http://domain.com/api/upload/file/abc.webp
    // 2. Relative proxy path: /api/upload/file/abc.webp
    // 3. Raw filename: abc.webp
    let filename = url;
    if (url.includes('/api/upload/file/')) {
        filename = url.split('/api/upload/file/').pop() || '';
    }

    if (cdnBaseUrl) {
        return `${cdnBaseUrl}/${filename}`;
    }

    // Fallback while config is loading or if disabled
    // If it's not a URL/path already, assume it's a filename and needs the proxy path
    if (!filename.includes('/')) {
        return `/api/upload/file/${filename}`;
    }

    return url;
}

/**
 * Rewrites all /api/upload/file/ URLs in an HTML content string to CloudFront URLs.
 * Used for post content that contains inline images via dangerouslySetInnerHTML.
 */
export function rewriteContentUrls(html: string): string {
    if (!cdnBaseUrl || !html) return html;

    // Replace all occurrences of /api/upload/file/ in src="" and href="" attributes
    return html.replace(
        /\/api\/upload\/file\/([^"'\s<>]+)/g,
        (match, filename) => `${cdnBaseUrl}/${filename}`
    );
}
