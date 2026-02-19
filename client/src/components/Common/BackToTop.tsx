import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export default function BackToTop() {
    const [showUp, setShowUp] = useState(false);
    const [showDown, setShowDown] = useState(true);

    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;

            // Show 'Up' if scrolled down more than 300px
            setShowUp(scrollY > 300);

            // Show 'Down' if not at the very bottom (with 100px buffer)
            // But only if content is scrollable
            if (documentHeight > windowHeight + 100) {
                setShowDown(scrollY + windowHeight < documentHeight - 100);
            } else {
                setShowDown(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        // Also listen to resize/DOM changes if possible, but scroll is main trigger
        handleScroll();

        // Polling for height changes (e.g. infinite scroll loading more posts)
        const interval = setInterval(handleScroll, 1000);

        return () => {
            window.removeEventListener('scroll', handleScroll);
            clearInterval(interval);
        };
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const scrollToBottom = () => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    };

    if (!showUp && !showDown) return null;

    return (
        <div className="back-to-top-container">
            {showUp && (
                <button
                    onClick={scrollToTop}
                    className="scroll-btn"
                    title="Scroll to Top"
                >
                    <ChevronUp size={22} />
                </button>
            )}
            {showDown && (
                <button
                    onClick={scrollToBottom}
                    className="scroll-btn"
                    title="Scroll to Bottom"
                >
                    <ChevronDown size={22} />
                </button>
            )}
        </div>
    );
}
