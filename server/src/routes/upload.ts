import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { s3Client as s3 } from '../utils/s3';
import { authenticate, requirePayment, AuthRequest } from '../middleware/auth';
import { config } from '../config/env';
import sharp from 'sharp';

const router = Router();

// ── CloudFront URL builder ────────────────────────────────────
// If CloudFront is configured, builds CDN URLs; otherwise falls back to proxy
function getCdnUrl(s3Key: string): string {
    const cf = config.aws.cloudfrontDomain;
    if (cf) {
        return `https://${cf}/${s3Key}`;
    }
    // Fallback: serve through old path (will 404 if route is removed)
    const filename = s3Key.replace('uploads/', '');
    return `/api/upload/file/${filename}`;
}

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
                    CacheControl: 'public, max-age=18000',
                })),
                s3.send(new PutObjectCommand({
                    Bucket: config.aws.bucketName,
                    Key: `uploads/${thumbFilename}`,
                    Body: thumbResult.buffer,
                    ContentType: thumbResult.contentType,
                    CacheControl: 'public, max-age=18000',
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
                CacheControl: isGif ? 'public, max-age=18000' : undefined,
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
