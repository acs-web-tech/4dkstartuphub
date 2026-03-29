import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
    embedUrl: string;
    onClose: () => void;
}

/**
 * CSS-based fullscreen video overlay using React Portal.
 * Portal ensures position:fixed works correctly even when parent
 * elements have CSS transforms (which break fixed positioning).
 */
export default function VideoFullscreen({ embedUrl, onClose }: Props) {
    // Lock body scroll while overlay is open
    useEffect(() => {
        const scrollY = window.scrollY;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';

        return () => {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, scrollY);
        };
    }, []);

    // Close on Escape key
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Render via Portal to document.body — bypasses any parent transforms
    return createPortal(
        <div className="video-fullscreen-overlay" onClick={onClose}>
            <button className="video-fullscreen-close" onClick={onClose} aria-label="Close">
                <X size={24} />
            </button>
            <div className="video-fullscreen-container" onClick={e => e.stopPropagation()}>
                <iframe
                    src={embedUrl}
                    title="Video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                    allowFullScreen
                    style={{ width: '100%', height: '100%', border: 'none' }}
                />
            </div>
        </div>,
        document.body
    );
}
