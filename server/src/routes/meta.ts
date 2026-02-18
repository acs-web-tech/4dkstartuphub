
import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

const router = express.Router();

const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

router.get('/preview', async (req, res) => {
    const urlString = req.query.url as string;
    if (!urlString) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache
    if (cache.has(urlString)) {
        const { data, timestamp } = cache.get(urlString)!;
        if (Date.now() - timestamp < CACHE_TTL) {
            return res.json(data);
        }
        cache.delete(urlString);
    }

    const saveToCacheAndRespond = (data: any) => {
        // Limit cache size to avoid memory leaks
        if (cache.size > 1000) {
            const firstKey = cache.keys().next().value;
            if (firstKey) cache.delete(firstKey);
        }
        cache.set(urlString, { data, timestamp: Date.now() });
        res.json(data);
    };

    // YouTube oEmbed Strategy (More reliable for video titles/thumbnails)
    if (urlString.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/)) {
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlString)}&format=json`;
            const { data } = await axios.get(oembedUrl);
            const metaData = {
                title: data.title,
                description: data.author_name ? `By ${data.author_name}` : '',
                image: data.thumbnail_url,
                siteName: 'YouTube',
                favicon: 'https://www.youtube.com/s/desktop/12d6b690/img/favicon.ico',
                type: 'video',
                url: urlString
            };
            return saveToCacheAndRespond(metaData);
        } catch (e) {
            console.error('YouTube oEmbed failed, falling back to scrape');
        }
    }

    try {
        const { data: html } = await axios.get(urlString, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 5000,
        });

        const $ = cheerio.load(html);
        const getMeta = (prop: string) =>
            $(`meta[property="${prop}"]`).attr('content') ||
            $(`meta[name="${prop}"]`).attr('content');

        const title = getMeta('og:title') || $('title').text() || '';
        const description = getMeta('og:description') || getMeta('description') || '';
        const image = getMeta('og:image') || getMeta('twitter:image') || '';
        const siteName = getMeta('og:site_name') || getMeta('application-name') || '';

        // Favicon Logic
        let favicon = $('link[rel="icon"]').attr('href') ||
            $('link[rel="shortcut icon"]').attr('href') ||
            $('link[rel="apple-touch-icon"]').attr('href');

        // Resolve partial URLs
        if (favicon && !favicon.startsWith('http')) {
            try {
                const baseUrl = new URL(urlString);
                if (favicon.startsWith('//')) {
                    favicon = `https:${favicon}`;
                } else if (favicon.startsWith('/')) {
                    favicon = `${baseUrl.origin}${favicon}`;
                } else {
                    favicon = `${baseUrl.origin}/${baseUrl.pathname.split('/').slice(0, -1).join('/')}/${favicon}`;
                }
            } catch (e) { }
        }

        // Fallback favicon using Google's service if none found (reliable)
        if (!favicon) {
            try {
                const hostname = new URL(urlString).hostname;
                favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
            } catch (e) { }
        }

        saveToCacheAndRespond({ title, description, image, siteName, favicon, url: urlString });
    } catch (error) {
        console.error('Link preview error:', error);
        // Fallback: return basic info hostname
        try {
            const hostname = new URL(urlString).hostname;
            const fallbackData = {
                title: hostname,
                description: '',
                image: '',
                siteName: hostname,
                favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
                url: urlString
            };
            saveToCacheAndRespond(fallbackData);
        } catch (e) {
            // Very last fallback, no cache? Or cache empty?
            // Better to not cache errors aggressively or cache them for shorter time.
            // For simplicity, just return.
            res.json({ title: '', description: '', image: '', siteName: '', url: urlString });
        }
    }
});

export default router;
