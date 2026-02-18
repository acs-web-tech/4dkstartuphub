
import { useState, useEffect } from 'react';

interface MetaData {
    title: string;
    description: string;
    image: string;
    siteName: string;
    url: string;
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

    if (loading) return null; // Don't show anything while loading to avoid layout shift jerkiness or show skeleton
    if (error || !meta) return null;

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="link-preview-card"
            onClick={e => e.stopPropagation()} // Prevent parent click
        >
            {meta.image && (
                <div className="preview-image-container">
                    <img src={meta.image} alt="" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                </div>
            )}
            <div className="preview-content">
                {meta.siteName && <div className="preview-site">{meta.siteName}</div>}
                <div className="preview-title">{meta.title}</div>
                {meta.description && <div className="preview-desc">{meta.description}</div>}
            </div>
        </a>
    );
}
