
import React, { useState, useEffect } from 'react';
import { getSessionImage, isImageCached } from '../../utils/sessionCache';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    fallback?: React.ReactNode;
}

/**
 * An image component that uses session-level blob caching.
 * Loads "lazy" on first visit but once loaded, stays in memory
 * for "immediate" display across the entire session.
 */
export const SmartImage: React.FC<SmartImageProps> = ({ src, fallback, ...props }) => {
    const [displaySrc, setDisplaySrc] = useState<string>(isImageCached(src) ? (src) : '');
    const [loading, setLoading] = useState(!isImageCached(src));

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            if (isImageCached(src)) {
                const cachedUrl = await getSessionImage(src);
                if (isMounted) {
                    setDisplaySrc(cachedUrl);
                    setLoading(false);
                }
                return;
            }

            // If not cached, we can either wait for the standard img tag to load 
            // and then cache it, or fetch it now. Fetching now is better for "proper" 
            // session caching control.
            const url = await getSessionImage(src);
            if (isMounted) {
                setDisplaySrc(url);
                setLoading(false);
            }
        };

        load();

        return () => { isMounted = false; };
    }, [src]);

    if (loading && fallback) {
        return <>{fallback}</>;
    }

    const finalSrc = displaySrc || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    return (
        <img
            {...props}
            src={finalSrc}
            className={`${props.className || ''} ${loading ? 'smart-image-loading' : 'smart-image-loaded'}`}
            style={{
                ...props.style,
                opacity: loading ? 0 : (props.style?.opacity ?? 1),
                transition: 'opacity 0.4s ease-out'
            }}
        />
    );
};
