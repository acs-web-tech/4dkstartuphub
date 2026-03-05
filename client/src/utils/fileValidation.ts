
/**
 * Utility for validating files before upload
 */
export const validateFile = (file: File, options: { maxSizeMB?: number, allowedTypes?: string[] } = {}) => {
    const { maxSizeMB = 5, allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ] } = options;

    const sizeLimit = maxSizeMB * 1024 * 1024;

    if (file.size > sizeLimit) {
        throw new Error(`File is too large. Maximum size allowed is ${maxSizeMB}MB.`);
    }

    if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Allowed: Images, PDF, Word, PowerPoint.');
    }

    return true;
};
