import xss from 'xss';

/**
 * Sanitize rich-text HTML content to prevent XSS attacks.
 * Allows safe formatting tags produced by the rich text editor (ReactQuill)
 * while blocking dangerous elements like script, style, and event handlers.
 */
export function sanitizeHtml(input: string): string {
    return xss(input, {
        whiteList: {
            h1: [],
            h2: [],
            h3: [],
            p: [],
            br: [],
            strong: [],
            b: [],
            em: [],
            i: [],
            u: [],
            s: [],
            strike: [],
            ol: [],
            ul: [],
            li: [],
            a: ['href', 'target', 'rel'],
            img: ['src', 'alt', 'width', 'height'],
            blockquote: [],
            pre: [],
            code: [],
            span: ['style'],
            sub: [],
            sup: [],
        },
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style', 'iframe', 'form', 'input'],
        onTagAttr(tag, name, value) {
            // Allow safe styles on span (Quill uses inline styles for color etc.)
            if (tag === 'span' && name === 'style') {
                // Only allow safe CSS properties
                const safeProps = /^(color|background-color|font-size|font-weight|text-decoration|font-style)\s*:/i;
                const parts = value.split(';').filter(p => safeProps.test(p.trim()));
                if (parts.length > 0) {
                    return `style="${parts.join(';')}"`;
                }
                return '';
            }
            // Force links to open in new tab safely
            if (tag === 'a' && name === 'target') {
                return 'target="_blank"';
            }
            if (tag === 'a' && name === 'rel') {
                return 'rel="noopener noreferrer"';
            }
            // Block javascript: URLs
            if (name === 'href' || name === 'src') {
                if (/^javascript:/i.test(value)) {
                    return '';
                }
            }
            return undefined; // use default handling
        },
    });
}

/**
 * Strip ALL HTML tags — use for plain text fields like titles.
 */
export function sanitizePlainText(input: string): string {
    return xss(input, {
        whiteList: {},
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style'],
    });
}

/**
 * Sanitize an object's string values recursively.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
    const sanitized = { ...obj };
    for (const key of Object.keys(sanitized)) {
        const value = sanitized[key];
        if (typeof value === 'string') {
            (sanitized as Record<string, unknown>)[key] = sanitizeHtml(value);
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            (sanitized as Record<string, unknown>)[key] = sanitizeObject(value as Record<string, unknown>);
        }
    }
    return sanitized;
}

/**
 * Strip null bytes and other dangerous characters from input.
 */
export function stripDangerous(input: string): string {
    return input.replace(/\0/g, '').trim();
}
