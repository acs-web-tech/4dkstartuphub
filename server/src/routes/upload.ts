import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { s3Client as s3 } from '../utils/s3';
import { authenticate, requirePayment, AuthRequest } from '../middleware/auth';
import { config } from '../config/env';
import NodeCache from 'node-cache';
import sharp from 'sharp';

const router = Router();

// ── CloudFront URL builder ────────────────────────────────────
// If CloudFront is configured, builds CDN URLs; otherwise falls back to proxy
function getCdnUrl(s3Key: string): string {
    const cf = config.aws.cloudfrontDomain;
    if (cf) {
        return `https://${cf}/${s3Key}`;
    }
    // Fallback: serve through Node.js proxy
    const filename = s3Key.replace('uploads/', '');
    return `/api/upload/file/${filename}`;
}

// ── In-memory LRU-style cache for serving files ───────────────
// Production: cache up to 200 files for 2 hours, check every 10 min
const fileCache = new NodeCache({ stdTTL: 7200, checkperiod: 600, maxKeys: 200 });

// ── Sharp processing presets (production-grade) ───────────────

interface ImagePreset {
    width: number;
    quality: number;
    suffix: string;
}

const IMAGE_PRESETS: Record<string, ImagePreset> = {
    full: { width: 1200, quality: 80, suffix: '' },           // Full size for detail view
    thumb: { width: 400, quality: 70, suffix: '_thumb' },     // Thumbnail for feed cards
    avatar: { width: 200, quality: 75, suffix: '_avatar' },   // Avatar size
};

/**
 * Process an image with Sharp: resize, compress, convert to WebP
 * Returns the processed buffer and the final content type
 */
async function processImage(
    buffer: Buffer,
    preset: ImagePreset,
    originalMime: string
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
    const pipeline = sharp(buffer, { failOn: 'none', animated: false })
        .rotate() // Auto-rotate based on EXIF
        .resize({
            width: preset.width,
            withoutEnlargement: true,
            fit: 'inside',
        });

    // Convert to WebP for best compression, fall back to JPEG for GIFs (keep original)
    if (originalMime === 'image/gif') {
        // Don't process GIFs – serve as-is
        return { buffer, contentType: 'image/gif', extension: 'gif' };
    }

    // Try WebP first (best compression), fallback to JPEG
    try {
        const webpBuffer = await pipeline
            .webp({
                quality: preset.quality,
                effort: 4,           // Balance between speed and compression
                smartSubsample: true, // Better chroma subsampling
            })
            .toBuffer();

        return { buffer: webpBuffer, contentType: 'image/webp', extension: 'webp' };
    } catch {
        // Fallback to progressive JPEG
        const jpegBuffer = await sharp(buffer, { failOn: 'none' })
            .rotate()
            .resize({ width: preset.width, withoutEnlargement: true, fit: 'inside' })
            .jpeg({
                quality: preset.quality,
                progressive: true,
                mozjpeg: true,  // Use mozjpeg encoder for ~10% better compression
            })
            .toBuffer();

        return { buffer: jpegBuffer, contentType: 'image/jpeg', extension: 'jpg' };
    }
}

// ── Configure Multer ───────────────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFileSize },
    fileFilter: (req: any, file, cb) => {
        const type = req.query.type || 'image';
        let allowedMimes = [];
        if (type === 'doc') {
            allowedMimes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            ];
        } else {
            allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        }

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type. ${type === 'image' ? 'Only images are allowed here.' : 'Only images, PDF, DOC, DOCX, PPT, PPTX are allowed.'}`));
        }
    }
});

// ── GET /api/upload/cdn-config — Expose CDN domain to client ──
// Client uses this to rewrite old /api/upload/file/ URLs to CloudFront
router.get('/cdn-config', (req, res) => {
    const cf = config.aws.cloudfrontDomain;
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.json({
        cdnBaseUrl: cf ? `https://${cf}/uploads` : '',
        enabled: !!cf,
    });
});

// ── GET /api/upload/file/:filename — Fallback proxy (used when CloudFront is NOT configured) ──
router.get('/file/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // Security: no path traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).send('Invalid filename');
        }

        // ── Generate ETag from filename (immutable content) ──
        const etag = `"${Buffer.from(filename).toString('base64url')}"`;

        // If-None-Match: browser already has this file cached
        if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
        }

        // ── Check in-memory cache (instant, no S3 round-trip) ──
        const cached = fileCache.get<{ body: Buffer; contentType: string }>(filename);
        if (cached) {
            res.setHeader('Content-Type', cached.contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('ETag', etag);
            res.setHeader('Vary', 'Accept-Encoding');
            res.setHeader('Content-Length', cached.body.length);
            return res.send(cached.body);
        }

        const key = `uploads/${filename}`;

        if (!config.aws.bucketName) {
            throw new Error('AWS S3 is not configured on the server');
        }

        const command = new GetObjectCommand({
            Bucket: config.aws.bucketName,
            Key: key,
        });

        const response = await s3.send(command);

        if (response.Body) {
            const contentType = response.ContentType || 'application/octet-stream';
            const contentLength = response.ContentLength;

            // Set headers IMMEDIATELY — browser starts preparing before bytes arrive
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('ETag', etag);
            res.setHeader('Vary', 'Accept-Encoding');
            if (contentLength) {
                res.setHeader('Content-Length', contentLength);
            }

            // ── STREAM directly from S3 → Client ──
            // Browser starts receiving bytes IMMEDIATELY instead of waiting
            // for the entire file to buffer in Node.js memory
            const cacheChunks: Buffer[] = [];
            const shouldCache = !contentLength || contentLength < 2 * 1024 * 1024; // Cache files < 2MB

            // @ts-ignore - S3 Body is an async iterable stream
            for await (const chunk of response.Body) {
                const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;

                // Write to client immediately (streaming!)
                res.write(buf);

                // Collect for cache in background
                if (shouldCache) {
                    cacheChunks.push(buf);
                }
            }

            // End the response
            res.end();

            // Cache the file for future requests (async, non-blocking)
            if (shouldCache && cacheChunks.length > 0) {
                const buffer = Buffer.concat(cacheChunks);
                fileCache.set(filename, { body: buffer, contentType });
            }
        } else {
            res.status(404).send('File not found in S3');
        }
    } catch (err: any) {
        console.error('[S3] Download error detail:', {
            message: err.message,
            filename: req.params.filename,
            bucket: config.aws.bucketName,
            key: `uploads/${req.params.filename}`
        });
        if (!res.headersSent) {
            res.status(404).send('File not found or access denied');
        }
    }
});

// ── POST /api/upload — Upload with production-grade image processing ──
router.post('/', authenticate, requirePayment, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: 'File is too large. Maximum size allowed is 5MB.' });
                }
                return res.status(400).json({ error: `Upload error: ${err.message}` });
            }
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req: AuthRequest, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const file = req.file;
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
        const baseName = `${uniqueSuffix}-${safeName.split('.').slice(0, -1).join('.') || safeName}`;

        if (!config.aws.bucketName || !config.aws.accessKeyId || !config.aws.secretAccessKey) {
            throw new Error('AWS S3 is not configured on the server');
        }

        const isImage = file.mimetype.startsWith('image/') && file.mimetype !== 'image/gif';
        const isGif = file.mimetype === 'image/gif';

        if (isImage) {
            // ── Process image: generate full + thumbnail in parallel ──
            const startTime = Date.now();

            const [fullResult, thumbResult] = await Promise.all([
                processImage(file.buffer, IMAGE_PRESETS.full, file.mimetype),
                processImage(file.buffer, IMAGE_PRESETS.thumb, file.mimetype),
            ]);

            const fullFilename = `${baseName}.${fullResult.extension}`;
            const thumbFilename = `${baseName}_thumb.${thumbResult.extension}`;

            // Upload both sizes to S3 in parallel
            await Promise.all([
                s3.send(new PutObjectCommand({
                    Bucket: config.aws.bucketName,
                    Key: `uploads/${fullFilename}`,
                    Body: fullResult.buffer,
                    ContentType: fullResult.contentType,
                    CacheControl: 'public, max-age=31536000, immutable',
                })),
                s3.send(new PutObjectCommand({
                    Bucket: config.aws.bucketName,
                    Key: `uploads/${thumbFilename}`,
                    Body: thumbResult.buffer,
                    ContentType: thumbResult.contentType,
                    CacheControl: 'public, max-age=31536000, immutable',
                })),
            ]);

            const processingTime = Date.now() - startTime;
            const originalSize = (file.buffer.length / 1024).toFixed(1);
            const compressedSize = (fullResult.buffer.length / 1024).toFixed(1);
            const thumbSize = (thumbResult.buffer.length / 1024).toFixed(1);
            const savings = ((1 - fullResult.buffer.length / file.buffer.length) * 100).toFixed(0);

            console.log(
                `[Sharp] Processed ${file.originalname}: ${originalSize}KB → ${compressedSize}KB (${savings}% smaller) + ${thumbSize}KB thumb | ${processingTime}ms`
            );

            const url = getCdnUrl(`uploads/${fullFilename}`);
            const thumbnailUrl = getCdnUrl(`uploads/${thumbFilename}`);
            res.json({ url, thumbnailUrl });
        } else {
            // Non-image files or GIFs: upload as-is
            const extension = isGif ? 'gif' : (safeName.split('.').pop() || 'bin');
            const filename = `${baseName}.${extension}`;
            const key = `uploads/${filename}`;

            console.log(`[S3] Uploading ${isGif ? 'GIF' : 'document'} to bucket: ${config.aws.bucketName}, Key: ${key}`);

            await s3.send(new PutObjectCommand({
                Bucket: config.aws.bucketName,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype,
                CacheControl: isGif ? 'public, max-age=31536000, immutable' : undefined,
            }));

            const url = getCdnUrl(`uploads/${filename}`);
            res.json({ url });
        }
    } catch (err: any) {
        console.error('[S3] Upload error:', err.message);
        res.status(500).json({ error: err.message || 'File upload failed' });
    }
});

export default router;
