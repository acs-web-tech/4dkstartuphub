
import axios from 'axios';
import * as cheerio from 'cheerio';

const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface LinkPreviewData {
    title: string;
    description: string;
    image: string;
    siteName: string;
    favicon: string;
    author: string;
    publishedDate: string;
    contentType: string;
    keywords: string;
    url: string;
}

const UAGENTS = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Twitterbot/1.0'
];

export const getLinkPreview = async (urlString: string): Promise<LinkPreviewData> => {
    if (!urlString) throw new Error('URL is required');

    // Check cache
    if (cache.has(urlString)) {
        const { data, timestamp } = cache.get(urlString)!;
        if (Date.now() - timestamp < CACHE_TTL) {
            return data;
        }
        cache.delete(urlString);
    }

    const saveToCache = (data: LinkPreviewData) => {
        if (cache.size > 1000) {
            const firstKey = cache.keys().next().value;
            if (firstKey) cache.delete(firstKey);
        }
        cache.set(urlString, { data, timestamp: Date.now() });
        return data;
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
                author: data.author_name || '',
                publishedDate: '',
                contentType: 'video',
                keywords: '',
                url: urlString
            } as any;
            return saveToCache(metaData);
        } catch (e) {
            console.error('YouTube oEmbed failed, falling back to scrape');
        }
    }

    let lastError = null;

    // Try multiple User Agents
    for (const ua of UAGENTS) {
        try {
            const { data: html } = await axios.get(urlString, {
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
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

            // Favicon
            let favicon = $('link[rel="icon"][href]').attr('href') ||
                $('link[rel="shortcut icon"][href]').attr('href') ||
                $('link[rel="apple-touch-icon"][href]').attr('href') || '';
            favicon = resolveUrl(favicon);

            if (!favicon) {
                try {
                    const hostname = new URL(urlString).hostname;
                    favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
                } catch { }
            }

            // Quality Check: If we got a generic title and no image, and this isn't the last UA, retry
            // Instagram/Login specific check
            const isGenericTitle = !title || title.toLowerCase() === 'instagram' || title.toLowerCase() === 'login' ||
                title.toLowerCase().includes('login') || title === new URL(urlString).hostname;

            // If we have minimal data and not the last UA, continue to try getting better data
            if ((isGenericTitle || !image) && ua !== UAGENTS[UAGENTS.length - 1]) {
                // Determine if we should really skip... 
                // If title is "Instagram" it's definitely a fail.
                if (title.toLowerCase() === 'instagram' || title.toLowerCase().includes('login')) continue;
                // If generic hostname title and no image, also weak.
                if (title === new URL(urlString).hostname && !image) continue;
            }

            return saveToCache({
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
            lastError = error;
            // Try next UA
        }
    }

    // Fallback if all UAs failed
    console.error('Link preview all methods failed:', lastError);
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
        return saveToCache(fallbackData);
    } catch (e) {
        return {
            title: '',
            description: '',
            image: '',
            siteName: '',
            favicon: '',
            author: '',
            publishedDate: '',
            contentType: '',
            keywords: '',
            url: urlString
        };
    }
};
