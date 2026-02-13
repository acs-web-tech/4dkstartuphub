import mongoose, { Schema, Document } from 'mongoose';

export interface IChatRoom extends Document {
    name: string;
    description: string;
    created_by: mongoose.Types.ObjectId;
    access_type: 'open' | 'invite';
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

const ChatRoomSchema: Schema = new Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    access_type: { type: String, enum: ['open', 'invite'], default: 'open' },
    is_active: { type: Boolean, default: true },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
        virtuals: true,
        transform: (_: any, ret: any) => {
            ret.id = ret._id.toString();
            ret.createdBy = ret.created_by.toString();
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

export default mongoose.model<IChatRoom>('ChatRoom', ChatRoomSchema);
