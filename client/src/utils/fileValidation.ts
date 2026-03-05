
/**
 * Utility for validating files before upload
 */
export const validateFile = (file: File, options: { maxSizeMB?: number, allowedTypes?: string[], customMessage?: string } = {}) => {
    const { maxSizeMB = 5, allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ], customMessage } = options;

    const sizeLimit = maxSizeMB * 1024 * 1024;

    if (file.size > sizeLimit) {
        throw new Error(`File is too large. Maximum size allowed is ${maxSizeMB}MB.`);
    }

    if (!allowedTypes.includes(file.type)) {
        if (customMessage) throw new Error(customMessage);

        const isImageOnly = allowedTypes.every(t => t.startsWith('image/'));
        const message = isImageOnly
            ? 'Invalid file type. Only images (JPG, PNG, GIF, WebP) are allowed here.'
            : 'Invalid file type. Allowed: Images, PDF, Word, PowerPoint.';

        throw new Error(message);
    }

    return true;
};
