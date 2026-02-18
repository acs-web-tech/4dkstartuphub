
import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

const router = express.Router();

router.get('/preview', async (req, res) => {
    const url = req.query.url as string;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'StartupHub-LinkPreview/1.0 (Mozilla/5.0; Compatible)',
            },
            timeout: 5000,
        });

        const html = response.data;
        const $ = cheerio.load(html);

        const getMeta = (prop: string) =>
            $(`meta[property="${prop}"]`).attr('content') ||
            $(`meta[name="${prop}"]`).attr('content');

        const title = getMeta('og:title') || $('title').text() || '';
        const description = getMeta('og:description') || getMeta('description') || '';
        const image = getMeta('og:image') || '';
        const siteName = getMeta('og:site_name') || '';

        res.json({ title, description, image, siteName, url });
    } catch (error) {
        console.error('Link preview error:', error);
        // Fallback: return basic info if fetch fails
        res.json({ title: '', description: '', image: '', siteName: '', url });
    }
});

export default router;
