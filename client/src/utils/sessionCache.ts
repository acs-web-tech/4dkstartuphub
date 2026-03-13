
const sessionBlobCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string>>();

/**
 * Fetches an image and creates a local blob URL for the session.
 * Uses deduplication to ensure only ONE fetch per unique URL, even across
 * multiple simultaneous calls from different components.
 */
export const getSessionImage = async (url: string): Promise<string> => {
    if (!url) return '';

    // Skip blob-caching for absolute external URLs to avoid CORS issues
    if (url.startsWith('http') && !url.includes(window.location.host)) {
        return url;
    }

    // Return from cache if exists
    const cached = sessionBlobCache.get(url);
    if (cached) return cached;

    // If already fetching this URL, reuse the same promise (dedup!)
    const pending = pendingFetches.get(url);
    if (pending) return pending;

    // Start a single fetch and store the promise
    const fetchPromise = (async () => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch image');

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            sessionBlobCache.set(url, blobUrl);
            return blobUrl;
        } catch (err) {
            console.warn(`Failed to session-cache image: ${url}`, err);
            return url; // Fallback to original URL
        } finally {
            pendingFetches.delete(url);
        }
    })();

    pendingFetches.set(url, fetchPromise);
    return fetchPromise;
};

/**
 * Synchronous helper to get cached blob URL if it exists
 */
export const getCachedUrl = (url: string): string | null => {
    return sessionBlobCache.get(url) || null;
};

export const isImageCached = (url: string): boolean => {
    return sessionBlobCache.has(url);
};
