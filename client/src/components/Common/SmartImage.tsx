
import React, { useState, useRef, useEffect } from 'react';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    fallback?: React.ReactNode;
}

/**
 * A SmartImage component that implements a "blur-up" effect.
 * It shows the image immediately (leveraging progressive JPEGs)
 * and clears a blur filter as the image becomes fully ready.
 */
export const SmartImage: React.FC<SmartImageProps> = ({ src, fallback, ...props }) => {
    const [loaded, setLoaded] = useState(false);
    const [errored, setErrored] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

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
        <div style={{ 
            position: 'relative', 
            overflow: 'hidden', 
            width: props.width || '100%', 
            height: props.height || '100%',
            display: props.style?.display || 'block'
        }}>
            {!loaded && fallback && (
                <div style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    zIndex: 1
                }}>
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
                    filter: loaded ? 'blur(0)' : 'blur(20px)',
                    transform: loaded ? 'scale(1)' : 'scale(1.05)',
                    transition: 'filter 0.5s ease-out, transform 0.5s ease-out',
                    width: '100%',
                    height: '100%',
                    objectFit: (props.style?.objectFit as any) || 'cover',
                }}
            />
        </div>
    );
};



