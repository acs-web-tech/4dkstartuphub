
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
        if (cache.size > 1000) {
            const firstKey = cache.keys().next().value;
            if (firstKey) cache.delete(firstKey);
        }
        cache.set(urlString, { data, timestamp: Date.now() });
        res.json(data);
    };

    // YouTube oEmbed Strategy
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
                author: data.author_name || '',
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
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 8000,
            maxRedirects: 5,
        });

        const $ = cheerio.load(html);

        // Helper: get meta by property OR name
        const getMeta = (...props: string[]) => {
            for (const prop of props) {
                const val = $(`meta[property="${prop}"]`).attr('content') ||
                    $(`meta[name="${prop}"]`).attr('content') ||
                    $(`meta[itemprop="${prop}"]`).attr('content');
                if (val) return val.trim();
            }
            return '';
        };

        // Resolve relative URLs to absolute
        const resolveUrl = (url: string) => {
            if (!url) return '';
            if (url.startsWith('http')) return url;
            try {
                const base = new URL(urlString);
                if (url.startsWith('//')) return `${base.protocol}${url}`;
                if (url.startsWith('/')) return `${base.origin}${url}`;
                return `${base.origin}/${url}`;
            } catch { return url; }
        };

        const title = getMeta('og:title', 'twitter:title') || $('title').text().trim() || '';
        const description = getMeta('og:description', 'twitter:description', 'description') || '';

        // Multiple image fallbacks
        const image = resolveUrl(
            getMeta('og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image')
        );

        const siteName = getMeta('og:site_name', 'application-name') ||
            (() => { try { return new URL(urlString).hostname.replace('www.', ''); } catch { return ''; } })();

        const author = getMeta('author', 'article:author', 'og:author', 'twitter:creator') ||
            $('[rel="author"]').first().text().trim() || '';

        const publishedDate = getMeta('article:published_time', 'og:updated_time', 'datePublished', 'date') || '';

        const contentType = getMeta('og:type') || '';

        const keywords = getMeta('keywords', 'article:tag') || '';

        // Favicon: try multiple selectors
        let favicon = $('link[rel="icon"][href]').attr('href') ||
            $('link[rel="shortcut icon"][href]').attr('href') ||
            $('link[rel="apple-touch-icon"][href]').attr('href') ||
            $('link[rel="apple-touch-icon-precomposed"][href]').attr('href') ||
            $('link[rel="fluid-icon"][href]').attr('href') || '';

        favicon = resolveUrl(favicon);

        // Fallback favicon via Google
        if (!favicon) {
            try {
                const hostname = new URL(urlString).hostname;
                favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
            } catch { }
        }

        saveToCacheAndRespond({
            title,
            description,
            image,
            siteName,
            favicon,
            author,
            publishedDate,
            contentType,
            keywords,
            url: urlString
        });
    } catch (error) {
        console.error('Link preview error:', error);
        try {
            const hostname = new URL(urlString).hostname;
            const fallbackData = {
                title: hostname,
                description: '',
                image: '',
                siteName: hostname.replace('www.', ''),
                favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
                author: '',
                publishedDate: '',
                contentType: '',
                keywords: '',
                url: urlString
            };
            saveToCacheAndRespond(fallbackData);
        } catch (e) {
            res.json({ title: '', description: '', image: '', siteName: '', url: urlString });
        }
    }
});

export default router;
