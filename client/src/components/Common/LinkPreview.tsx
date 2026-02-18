
import { useState, useEffect } from 'react';


interface MetaData {
    title: string;
    description: string;
    image: string;
    siteName: string;
    url: string;
    favicon?: string;
    author?: string;
    publishedDate?: string;
    contentType?: string;
}

export default function LinkPreview({ url, compact = false, initialData }: { url: string; compact?: boolean; initialData?: MetaData | null }) {
    const [meta, setMeta] = useState<MetaData | null>(initialData || null);
    const [loading, setLoading] = useState(!initialData);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (initialData) {
            setMeta(initialData);
            setLoading(false);
            return;
        }

        if (!url) return;
        setLoading(true);
        setError(false);
        setMeta(null);

        const controller = new AbortController();

        fetch(`/api/meta/preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error('Failed');
                return res.json();
            })
            .then(data => {
                if (!data.title && !data.description) throw new Error('No metadata');
                setMeta(data);
            })
            .catch(() => {
                setError(true);
                if (initialData) setMeta(initialData);
            })
            .finally(() => setLoading(false));

        return () => controller.abort();
    }, [url, initialData]);

    if (loading) return (
        <div className="link-preview-card link-preview-loading">
            <div className="preview-skeleton-img" />
            <div className="preview-content">
                <div className="preview-skeleton-line short" />
                <div className="preview-skeleton-line" />
                <div className="preview-skeleton-line medium" />
            </div>
        </div>
    );
    if (error || !meta) return null;

    // Format display URL
    let displayUrl = url;
    try {
        const parsed = new URL(url);
        displayUrl = parsed.hostname.replace('www.', '') + (parsed.pathname !== '/' ? parsed.pathname : '');
        if (displayUrl.length > 60) displayUrl = displayUrl.slice(0, 57) + '...';
    } catch { }

    const siteName = meta.siteName || (() => { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } })();

    // Format published date nicely
    let formattedDate = '';
    if (meta.publishedDate) {
        try {
            formattedDate = new Date(meta.publishedDate).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
        } catch { }
    }

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`link-preview-card${compact ? ' compact' : ''}`}
            onClick={e => e.stopPropagation()}
        >
            {meta.image && (
                <div className="preview-image-container">
                    <img
                        src={meta.image}
                        alt=""
                        onError={e => {
                            const el = e.target as HTMLImageElement;
                            el.parentElement!.style.display = 'none';
                        }}
                    />
                </div>
            )}
            <div className="preview-content">
                <div className="preview-meta-header">
                    {meta.favicon && (
                        <img
                            src={meta.favicon}
                            alt=""
                            className="preview-favicon"
                            onError={e => (e.target as HTMLImageElement).style.display = 'none'}
                        />
                    )}
                    <span className="preview-site">{siteName}</span>
                    {formattedDate && <span className="preview-date">· {formattedDate}</span>}
                </div>
                <div className="preview-title">{meta.title}</div>
                {meta.description && (
                    <div className="preview-desc">{meta.description}</div>
                )}
                {meta.author && (
                    <div className="preview-author">By {meta.author}</div>
                )}
                <div className="preview-url">{displayUrl}</div>
            </div>
        </a>
    );
}
