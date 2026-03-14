
import React, { useState, useEffect } from 'react';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    fallback?: React.ReactNode;
}

/**
 * A simplified SmartImage component that uses native browser caching
 * but provides a smooth fade-in effect for a premium feel.
 */
export const SmartImage: React.FC<SmartImageProps> = ({ src, fallback, ...props }) => {
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        // Reset state when src changes
        setLoading(true);
        setErrored(false);
    }, [src]);

    const handleLoad = () => {
        setLoading(false);
    };

    const handleError = () => {
        setLoading(false);
        setErrored(true);
    };

    if (errored) {
        return fallback ? <>{fallback}</> : null;
    }

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {loading && fallback && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                    {fallback}
                </div>
            )}
            <img
                {...props}
                src={src}
                onLoad={handleLoad}
                onError={handleError}
                className={`${props.className || ''} ${loading ? 'opacity-0' : 'opacity-100'}`}
                style={{
                    ...props.style,
                    transition: 'opacity 0.4s ease-out',
                    visibility: loading ? 'hidden' : 'visible'
                }}
            />
        </div>
    );
};

