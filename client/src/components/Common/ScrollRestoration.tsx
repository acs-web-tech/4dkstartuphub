
import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Global Scroll Restoration component.
 * Handles scrolling to top on new navigations and restoring
 * scroll position on back/forward (POP) actions.
 */
export default function ScrollRestoration() {
    const { pathname, search, key } = useLocation();
    const navType = useNavigationType();
    const lastScrollY = useRef<{ [key: string]: number }>({});
    const currentLocKey = useRef(key);

    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
    }, []);

    // Track scroll position continuously
    useEffect(() => {
        const handleScroll = () => {
            lastScrollY.current[key] = window.scrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        // When key changes, we are on a new page/entry in history
        if (navType === 'PUSH') {
            window.scrollTo(0, 0);
        } else if (navType === 'POP') {
            const savedScroll = lastScrollY.current[key] || parseInt(sessionStorage.getItem(`scroll_${key}`) || '0');
            if (savedScroll > 0) {
                // Use multiple attempts to overcome async rendering delays
                setTimeout(() => window.scrollTo({ top: savedScroll, behavior: 'auto' }), 10);
                setTimeout(() => window.scrollTo({ top: savedScroll, behavior: 'auto' }), 50);
                setTimeout(() => window.scrollTo({ top: savedScroll, behavior: 'auto' }), 150);
            }
        }

        currentLocKey.current = key;

        return () => {
            window.removeEventListener('scroll', handleScroll);
            // Backup to session storage
            try {
                sessionStorage.setItem(`scroll_${currentLocKey.current}`, (window.scrollY || 0).toString());
            } catch (e) { }
        };
    }, [pathname, search, key, navType]);

    return null;
}
