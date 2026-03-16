
import ReactQuill from 'react-quill';
// @ts-ignore
import quillEmoji from 'quill-emoji';
import 'quill-emoji/dist/quill-emoji.css';

const Quill = (ReactQuill as any).Quill;

// Allow blob: URLs for images in Quill editor
const ImageFormat = Quill.import('formats/image');
const originalImageSanitize = ImageFormat.sanitize;
ImageFormat.sanitize = function(url: string) {
    if (url && url.startsWith('blob:')) {
        return url;
    }
    return originalImageSanitize.call(this, url);
};
Quill.register(ImageFormat, true);

// Register the emoji module
// @ts-ignore
if (quillEmoji) {
    Quill.register(
        {
            'formats/emoji': quillEmoji.EmojiBlot,
            'modules/emoji-toolbar': quillEmoji.ToolbarEmoji,
            'modules/emoji-textarea': quillEmoji.TextAreaEmoji,
            'modules/emoji-shortname': quillEmoji.ShortNameEmoji,
        },
        true
    );
}

export const editorModules = {
    toolbar: {
        container: [
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            [{ 'script': 'sub' }, { 'script': 'super' }],
            [{ 'indent': '-1' }, { 'indent': '+1' }],
            [{ 'direction': 'rtl' }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'align': [] }],
            ['link', 'image', 'video'],
            ['emoji'],
            ['clean']
        ]
    },
    'emoji-toolbar': true,
    'emoji-textarea': false,
    'emoji-shortname': true,
};

export const editorFormats = [
    'header', 'size',
    'bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block',
    'list', 'bullet', 'indent',
    'script', 'align', 'direction',
    'link', 'image', 'video', 'color', 'background',
    'emoji'
];
