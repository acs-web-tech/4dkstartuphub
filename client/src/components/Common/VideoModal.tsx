import { X } from 'lucide-react';

interface Props {
    embedUrl: string;
    onClose: () => void;
}

export function VideoModal({ embedUrl, onClose }: Props) {
    return (
        <div 
            className="lightbox-overlay" 
            style={{ zIndex: 999999 }}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }}
        >
            <button className="lightbox-close-btn" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }}>
                <X size={24} />
            </button>
            <div 
                className="lightbox-content"
                style={{ width: '90vw', maxWidth: '1200px', aspectRatio: '16/9', background: '#000' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div 
                    style={{ width: '100%', height: '100%' }}
                    dangerouslySetInnerHTML={{
                        __html: `<iframe src="${embedUrl.includes('?') ? embedUrl + '&autoplay=1' : embedUrl + '?autoplay=1'}" style="width: 100%; height: 100%;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen></iframe>`
                    }}
                />
            </div>
        </div>
    );
}
