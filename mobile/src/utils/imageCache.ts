
const sessionRegistry = new Set<string>();

export const markImageAsLoaded = (src: string) => {
    if (src) sessionRegistry.add(src);
};

export const isImageInSession = (src: string) => {
    return src ? sessionRegistry.has(src) : false;
};

export const preloadImage = (src: string): Promise<void> => {
    return new Promise((resolve) => {
        if (!src || sessionRegistry.has(src)) {
            resolve();
            return;
        }

        const img = new Image();
        img.src = src;
        img.onload = () => {
            sessionRegistry.add(src);
            resolve();
        };
        img.onerror = () => {
            // Even on error, we resolve to avoid blocking
            resolve();
        };
    });
};
