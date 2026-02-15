import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { authenticate, AuthRequest } from '../middleware/auth';
import { config } from '../config/env';
import NodeCache from 'node-cache';

const router = Router();
const fileCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, maxKeys: 100 }); // Cache up to 100 files for 1 hour

// Configure storage (Memory for processing manually)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFileSize },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: Images, PDF, DOC, DOCX, PPT, PPTX'));
        }
    }
});

// Initialize S3 Client
const s3 = new S3Client({
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
    },
});

// Proxy download route for private S3 files
router.get('/file/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // Security check
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).send('Invalid filename');
        }

        // Check Cache
        const cached = fileCache.get<{ body: Buffer, contentType: string }>(filename);
        if (cached) {
            res.setHeader('Content-Type', cached.contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000');
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
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000');

            // Collect stream to buffer for caching
            const chunks: Buffer[] = [];
            // @ts-ignore
            for await (const chunk of response.Body) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const buffer = Buffer.concat(chunks);

            // Store in cache
            fileCache.set(filename, { body: buffer, contentType });

            res.send(buffer);
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
        res.status(404).send('File not found or access denied');
    }
});

// POST /api/upload
router.post('/', authenticate, upload.single('file'), async (req: AuthRequest, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const file = req.file;
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
        const filename = `${uniqueSuffix}-${safeName}`;

        if (!config.aws.bucketName || !config.aws.accessKeyId || !config.aws.secretAccessKey) {
            throw new Error('AWS S3 is not configured on the server');
        }

        // Upload to S3
        const key = `uploads/${filename}`;
        console.log(`[S3] Uploading to bucket: ${config.aws.bucketName}, Region: ${config.aws.region}, Key: ${key}`);

        await s3.send(new PutObjectCommand({
            Bucket: config.aws.bucketName,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            // ACL: 'public-read', // Uncomment if bucket permissions allow it
        }));

        console.log(`[S3] Upload success: ${filename}`);

        // Return our proxy URL
        const url = `/api/upload/file/${filename}`;
        res.json({ url });
    } catch (err: any) {
        console.error('[S3] Upload error detail:', {
            message: err.message,
            code: err.code,
            requestId: err.$metadata?.requestId,
            bucket: config.aws.bucketName
        });
        res.status(500).json({ error: err.message || 'File upload failed' });
    }
});

export default router;
