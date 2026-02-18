import mongoose, { Schema, Document } from 'mongoose';

export interface IChatMessage extends Document {
    room_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    content: string;
    link_preview?: any;
    created_at: Date;
}

const ChatMessageSchema: Schema = new Schema({
    room_id: { type: Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
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
    timestamps: { createdAt: 'created_at', updatedAt: false },
    toJSON: {
        virtuals: true,
        transform: (_: any, ret: any) => {
            ret.id = ret._id.toString();
            ret.userId = ret.user_id.toString();
            ret.roomId = ret.room_id.toString();
            ret.linkPreview = ret.link_preview;
            delete ret.link_preview;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

ChatMessageSchema.index({ room_id: 1, created_at: -1 });

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
