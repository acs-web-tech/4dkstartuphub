
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

    // We use a transparent gif or nothing while loading if no fallback
    const finalSrc = displaySrc || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    return (
        <div className={`smart-image-wrapper ${loading ? 'loading' : ''}`} style={props.style}>
            {loading && !fallback && (
                <div className="smart-image-loader">
                    <div className="shimmer"></div>
                </div>
            )}

            {(loading && fallback) ? (
                fallback
            ) : (
                <img
                    {...props}
                    src={finalSrc}
                    style={{
                        ...props.style,
                        opacity: loading ? 0 : 1,
                        transition: 'opacity 0.4s ease-out',
                        display: loading ? 'none' : 'block'
                    }}
                />
            )}
        </div>
    );
};
