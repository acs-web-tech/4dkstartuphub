
import React, { useState, useEffect } from 'react';
import { getSessionImage, getCachedUrl } from '../../utils/sessionCache';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    fallback?: React.ReactNode;
}

/**
 * An image component that uses session-level blob caching.
 * Once loaded, the blob URL stays in memory for "immediate"
 * display across the entire session.
 */
export const SmartImage: React.FC<SmartImageProps> = ({ src, fallback, ...props }) => {
    const initialCached = getCachedUrl(src);
    const [displaySrc, setDisplaySrc] = useState<string>(initialCached || '');
    const [loading, setLoading] = useState(!initialCached);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        // If already cached synchronously, nothing to do
        if (getCachedUrl(src)) {
            const cached = getCachedUrl(src)!;
            setDisplaySrc(cached);
            setLoading(false);
            setErrored(false);
            return;
        }

        let isMounted = true;
        setLoading(true);
        setErrored(false);

        getSessionImage(src)
            .then(url => {
                if (isMounted) {
                    setDisplaySrc(url);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setDisplaySrc(src); // Fallback to original URL
                    setLoading(false);
                    setErrored(true);
                }
            });

        return () => { isMounted = false; };
    }, [src]);

    if (loading && fallback) {
        return <>{fallback}</>;
    }

    if (errored && !displaySrc) {
        return null;
    }

    // Use a transparent pixel while loading to avoid browser requesting the original URL
    const finalSrc = displaySrc || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    return (
        <img
            {...props}
            src={finalSrc}
            className={`${props.className || ''} ${loading ? 'smart-image-loading' : 'smart-image-loaded'}`}
            style={{
                ...props.style,
                opacity: loading ? 0 : 1,
                transition: 'opacity 0.4s ease-out'
            }}
        />
    );
};
