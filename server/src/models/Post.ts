import mongoose, { Schema, Document } from 'mongoose';

export interface IPost extends Document {
    user_id: mongoose.Types.ObjectId;
    title: string;
    content: string;
    category: 'hiring' | 'cofounder' | 'promote' | 'recommendation' | 'events' | 'general' | 'writeup';
    image_url: string;
    video_url: string;
    event_date?: Date;
    is_pinned: boolean;
    is_locked: boolean;
    view_count: number;
    link_preview?: any;
    created_at: Date;
    updated_at: Date;
}

const PostSchema: Schema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: {
        type: String,
        required: true,
        enum: ['hiring', 'cofounder', 'promote', 'recommendation', 'events', 'general', 'writeup']
    },
    image_url: { type: String, default: '' },
    video_url: { type: String, default: '' },
    event_date: { type: Date },
    is_pinned: { type: Boolean, default: false },
    is_locked: { type: Boolean, default: false },
    view_count: { type: Number, default: 0 },
    link_preview: {
        title: String,
        description: String,
        image: String,
        siteName: String,
        favicon: String,
        author: String,
        publishedDate: String,
        contentType: String,
        keywords: String,
        url: String
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
        virtuals: true,
        transform: (_: any, ret: any) => {
            ret.id = ret._id.toString();
            ret.userId = ret.user_id.toString();
            ret.imageUrl = ret.image_url;
            ret.videoUrl = ret.video_url;
            ret.eventDate = ret.event_date;
            ret.isPinned = ret.is_pinned ? 1 : 0;
            ret.isLocked = ret.is_locked ? 1 : 0;
            ret.viewCount = ret.view_count;
            ret.linkPreview = ret.link_preview;
            delete ret.link_preview;
            ret.createdAt = ret.created_at;
            ret.updatedAt = ret.updated_at;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

// Indexes for performance
PostSchema.index({ user_id: 1 });
PostSchema.index({ category: 1 });
PostSchema.index({ created_at: -1 });
PostSchema.index({ is_pinned: -1, created_at: -1 });

export default mongoose.model<IPost>('Post', PostSchema);
