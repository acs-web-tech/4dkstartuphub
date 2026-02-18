
import express from 'express';
import { getLinkPreview } from '../services/metadata';

const router = express.Router();

router.get('/preview', async (req, res) => {
    const urlString = req.query.url as string;
    if (!urlString) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const data = await getLinkPreview(urlString);
        res.json(data);
    } catch (err) {
        console.error('Meta preview error:', err);
        res.json({ title: '', description: '', image: '', siteName: '', url: urlString });
    }
});

export default router;
