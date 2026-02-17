import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/editor.css';
import './styles/admin.css'
import './styles/post-media.css';
import './styles/members.css';

// Register Service Worker for "Immediate" Image Caching
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            // Success
            if (reg.active) {
                reg.active.postMessage({ type: 'CLEAR_CACHE' });
            }
        }).catch(() => { });
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
