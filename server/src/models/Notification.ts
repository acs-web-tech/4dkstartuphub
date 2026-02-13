import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    user_id: mongoose.Types.ObjectId;
    sender_id: mongoose.Types.ObjectId | null;
    type: 'like' | 'comment' | 'mention' | 'admin' | 'chat' | 'welcome';
    title: string;
    content: string;
    reference_id: string;
    is_read: boolean;
    created_at: Date;
}

const NotificationSchema: Schema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sender_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
        type: String,
        required: true,
        enum: ['like', 'comment', 'mention', 'admin', 'chat', 'welcome']
    },
    title: { type: String, required: true },
    content: { type: String, required: true },
    reference_id: { type: String, default: '' },
    is_read: { type: Boolean, default: false },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    toJSON: {
        virtuals: true,
        transform: (_: any, ret: any) => {
            ret.id = ret._id.toString();
            ret.userId = ret.user_id.toString();
            if (ret.sender_id) ret.senderId = ret.sender_id.toString();
            ret.referenceId = ret.reference_id;
            ret.isRead = ret.is_read ? 1 : 0;
            ret.createdAt = ret.created_at;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

NotificationSchema.index({ user_id: 1, created_at: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
