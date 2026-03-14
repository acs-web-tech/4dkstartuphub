
import React, { useState, useRef, useEffect } from 'react';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    fallback?: React.ReactNode;
}

/**
 * A simplified SmartImage component that behaves exactly like a native <img>
 * but with a smooth fade-in and support for a loading fallback.
 */
export const SmartImage: React.FC<SmartImageProps> = ({ src, fallback, ...props }) => {
    const [loaded, setLoaded] = useState(false);
    const [errored, setErrored] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    // If the image is already in browser cache, onLoad might not fire in some cases
    // unless we check the .complete property on mount/src change.
    useEffect(() => {
        if (imgRef.current?.complete) {
            setLoaded(true);
        } else {
            setLoaded(false);
        }
        setErrored(false);
    }, [src]);

    const handleLoad = () => {
        setLoaded(true);
    };

    const handleError = () => {
        setLoaded(false);
        setErrored(true);
    };

    if (errored) {
        return fallback ? <>{fallback}</> : null;
    }

    return (
        <>
            {!loaded && fallback && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', minHeight: '100px' }}>
                    {fallback}
                </div>
            )}
            <img
                {...props}
                ref={imgRef}
                src={src}
                onLoad={handleLoad}
                onError={handleError}
                style={{
                    ...props.style,
                    display: loaded ? (props.style?.display || 'block') : 'none',
                    opacity: loaded ? 1 : 0,
                    transition: 'opacity 0.3s ease-in-out'
                }}
            />
        </>
    );
};


