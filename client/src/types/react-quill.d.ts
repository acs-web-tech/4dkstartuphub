declare module 'react-quill' {
    import React from 'react';
    export interface ReactQuillProps {
        theme?: string;
        modules?: any;
        formats?: string[];
        value?: string;
        defaultValue?: string;
        placeholder?: string;
        readOnly?: boolean;
        scrollingContainer?: string | HTMLElement;
        onChange?: (content: string, delta: any, source: any, editor: any) => void;
        onChangeSelection?: (range: any, source: any, editor: any) => void;
        onFocus?: (range: any, source: any, editor: any) => void;
        onBlur?: (previousRange: any, source: any, editor: any) => void;
        onKeyPress?: React.EventHandler<any>;
        onKeyDown?: React.EventHandler<any>;
        onKeyUp?: React.EventHandler<any>;
        className?: string;
        style?: React.CSSProperties;
        tabIndex?: number;
        preserveWhitespace?: boolean;
    }
    export class Quill extends React.Component<ReactQuillProps> {
        focus(): void;
        blur(): void;
        getEditor(): any;
    }
    export default class ReactQuill extends React.Component<ReactQuillProps> {
        focus(): void;
        blur(): void;
        getEditor(): any;
    }
}
