
import { useState, useEffect } from 'react';

interface MetaData {
    title: string;
    description: string;
    image: string;
    siteName: string;
    url: string;
    favicon?: string;
}

export default function LinkPreview({ url }: { url: string }) {
    const [meta, setMeta] = useState<MetaData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!url) return;
        setLoading(true);
        setError(false);

        const controller = new AbortController();

        fetch(`/api/meta/preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error('Failed');
                return res.json();
            })
            .then(data => {
                if (!data.title) throw new Error('No metadata');
                setMeta(data);
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false));

        return () => controller.abort();
    }, [url]);

    if (loading) return null;
    if (error || !meta) return null;

    // Format display URL: strip protocol, trim long paths
    let displayUrl = url;
    try {
        const parsed = new URL(url);
        displayUrl = parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
        if (displayUrl.length > 60) displayUrl = displayUrl.slice(0, 57) + '...';
    } catch { }

    const siteName = meta.siteName || (() => { try { return new URL(url).hostname; } catch { return url; } })();

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="link-preview-card"
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
                </div>
                <div className="preview-title">{meta.title}</div>
                {meta.description && (
                    <div className="preview-desc">{meta.description}</div>
                )}
                <div className="preview-url">{displayUrl}</div>
            </div>
        </a>
    );
}
