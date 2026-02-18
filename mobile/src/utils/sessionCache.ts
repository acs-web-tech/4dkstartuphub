
const sessionBlobCache = new Map<string, string>();

/**
 * Fetches an image and creates a local blob URL for the session.
 * This makes image loading "immediate" for subsequent renders and navigations,
 * but naturally clears from memory when the tab/website is closed.
 */
export const getSessionImage = async (url: string): Promise<string> => {
    if (!url) return '';

    // Return from cache if exists
    const cached = sessionBlobCache.get(url);
    if (cached) return cached;

    // 1. Handle data/blob URIs immediately
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;

    // 2. Normalize slashes (Windows paths)
    let finalUrl = url.replace(/\\/g, '/').trim();

    // 3. Rewrite localhost/127.0.0.1 to production URL
    if (finalUrl.includes('localhost') || finalUrl.includes('127.0.0.1')) {
        finalUrl = finalUrl.replace(/http:\/\/localhost:\d+/, 'https://startup.4dk.in')
            .replace(/http:\/\/127.0.0.1:\d+/, 'https://startup.4dk.in')
            .replace(/https:\/\/localhost:\d+/, 'https://startup.4dk.in');
    }

    // 4. Resolve relative URLs (ensure https protocol)
    const fetchUrl = finalUrl.startsWith('http')
        ? finalUrl
        : `https://startup.4dk.in${finalUrl.startsWith('/') ? '' : '/'}${finalUrl}`;

    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error('Failed to fetch image');

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        sessionBlobCache.set(url, blobUrl);
        return blobUrl;
    } catch (err) {
        console.warn(`Failed to session-cache image: ${url}`, err);
        return url; // Fallback to original URL
    }
};

/**
 * Helper to check if an image is already cached in the session
 */
export const isImageCached = (url: string): boolean => {
    return sessionBlobCache.has(url);
};
