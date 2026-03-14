
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    fallback?: React.ReactNode;
    /** If true, eagerly load (above-the-fold). Default: lazy */
    priority?: boolean;
}

// ── Global observer for lazy-loading images ──────────────────
let globalObserver: IntersectionObserver | null = null;
const observerCallbacks = new WeakMap<Element, () => void>();

function getGlobalObserver() {
    if (!globalObserver && typeof IntersectionObserver !== 'undefined') {
        globalObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const cb = observerCallbacks.get(entry.target);
                        if (cb) {
                            cb();
                            observerCallbacks.delete(entry.target);
                            globalObserver?.unobserve(entry.target);
                        }
                    }
                });
            },
            {
                rootMargin: '200px 0px', // Start loading 200px before visible
                threshold: 0.01,
            }
        );
    }
    return globalObserver;
}

/**
 * Production-grade SmartImage component:
 * - Lazy loading via IntersectionObserver (loads 200px before viewport)
 * - Blur-up reveal animation
 * - Native `loading="lazy"` + `decoding="async"` for browser optimization
 * - Error fallback support
 * - Priority flag for above-the-fold images
 */
export const SmartImage: React.FC<SmartImageProps> = ({ src, fallback, priority = false, ...props }) => {
    const [isVisible, setIsVisible] = useState(priority); // Priority images visible immediately
    const [loaded, setLoaded] = useState(false);
    const [errored, setErrored] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    // ── Intersection Observer for lazy loading ──
    useEffect(() => {
        if (priority || isVisible) return; // Already visible
        const el = containerRef.current;
        if (!el) return;

        const observer = getGlobalObserver();
        if (!observer) {
            // Fallback: no IntersectionObserver support, load immediately
            setIsVisible(true);
            return;
        }

        observerCallbacks.set(el, () => setIsVisible(true));
        observer.observe(el);

        return () => {
            observer.unobserve(el);
            observerCallbacks.delete(el);
        };
    }, [priority, isVisible]);

    // Reset state when src changes
    useEffect(() => {
        setLoaded(false);
        setErrored(false);
        // Check if already cached by browser
        if (imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
            setLoaded(true);
        }
    }, [src]);

    const handleLoad = useCallback(() => {
        setLoaded(true);
    }, []);

    const handleError = useCallback(() => {
        setLoaded(false);
        setErrored(true);
    }, []);

    if (errored) {
        return fallback ? <>{fallback}</> : null;
    }

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                overflow: 'hidden',
                width: props.width || '100%',
                height: props.height || '100%',
                display: props.style?.display || 'block',
                backgroundColor: 'var(--bg-secondary, #1a1a2e)', // Placeholder color
            }}
        >
            {/* Show fallback/shimmer while not loaded */}
            {!loaded && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1,
                        background: 'linear-gradient(110deg, var(--bg-secondary, #1a1a2e) 8%, var(--bg-tertiary, #252545) 18%, var(--bg-secondary, #1a1a2e) 33%)',
                        backgroundSize: '200% 100%',
                        animation: isVisible ? 'shimmer 1.5s linear infinite' : 'none',
                    }}
                >
                    {fallback}
                </div>
            )}

            {/* Only render <img> when element is near viewport */}
            {isVisible && (
                <img
                    {...props}
                    ref={imgRef}
                    src={src}
                    loading={priority ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={priority ? 'high' : 'low'}
                    onLoad={handleLoad}
                    onError={handleError}
                    style={{
                        ...props.style,
                        filter: loaded ? 'blur(0)' : 'blur(15px)',
                        transform: loaded ? 'scale(1)' : 'scale(1.03)',
                        transition: 'filter 0.4s ease-out, transform 0.4s ease-out',
                        opacity: loaded ? 1 : 0.6,
                        width: '100%',
                        height: '100%',
                        objectFit: (props.style?.objectFit as any) || 'cover',
                    }}
                />
            )}
        </div>
    );
};
