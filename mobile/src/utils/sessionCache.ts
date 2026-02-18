
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

    // Rewrite localhost/127.0.0.1 to production URL to fix legacy/dev data
    let finalUrl = url;
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
        finalUrl = url.replace(/http:\/\/localhost:\d+/, 'https://startup.4dk.in')
            .replace(/http:\/\/127.0.0.1:\d+/, 'https://startup.4dk.in');
    }

    // Prepend base URL if relative
    const fetchUrl = finalUrl.startsWith('http') ? finalUrl : `https://startup.4dk.in${finalUrl.startsWith('/') ? '' : '/'}${finalUrl}`;

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
