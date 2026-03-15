import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env';

export const s3Client = new S3Client({
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
    },
});

/**
 * Extracts the S3 Key from a platform URL
 * Example: /api/upload/file/123-abc.png -> uploads/123-abc.png
 */
export const getS3KeyFromUrl = (url: string): string | null => {
    if (!url) return null;
    // Old proxy URLs format
    if (url.startsWith('/api/upload/file/')) {
        const filename = url.split('/').pop();
        return filename ? `uploads/${filename}` : null;
    }
    // Extract using standard /uploads/ path pattern commonly used for CloudFront or S3
    const match = url.match(/\/uploads\/([^?#]+)/);
    if (match && match[1]) {
        return `uploads/${match[1]}`;
    }
    return null;
};

/**
 * Deletes a file from S3 bucket
 */
export const deleteFileFromS3 = async (key: string): Promise<boolean> => {
    if (!key || !config.aws.bucketName) return false;
    try {
        await s3Client.send(new DeleteObjectCommand({
            Bucket: config.aws.bucketName,
            Key: key,
        }));
        console.log(`[S3] Successfully deleted key: ${key}`);
        return true;
    } catch (err) {
        console.error(`[S3] Failed to delete key: ${key}`, err);
        return false;
    }
};

/**
 * Deletes a file from S3 by its platform URL
 */
export const deleteFileByUrl = async (url: string): Promise<boolean> => {
    const key = getS3KeyFromUrl(url);
    if (key) {
        return deleteFileFromS3(key);
    }
    return false;
};

/**
 * Extracts all valid S3 keys embedded inside an HTML string (like post content)
 */
export const extractS3KeysFromHtml = (html: string | undefined | null): string[] => {
    if (!html) return [];
    const keys = new Set<string>();
    // Match any src="" or href="" that might contain our uploads
    const regex = /(?:src|href)=["'](.*?)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (match[1]) {
            const key = getS3KeyFromUrl(match[1]);
            if (key) keys.add(key);
        }
    }
    return Array.from(keys);
};

/**
 * Parses HTML and asynchronously deletes every S3 object it finds.
 */
export const deleteHtmlImagesFromS3 = async (html: string | undefined | null): Promise<void> => {
    const keys = extractS3KeysFromHtml(html);
    for (const key of keys) {
        await deleteFileFromS3(key);
    }
};
