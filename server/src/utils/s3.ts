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
    if (url.startsWith('/api/upload/file/')) {
        const filename = url.split('/').pop();
        return filename ? `uploads/${filename}` : null;
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
