import mongoose, { Schema, Document } from 'mongoose';

export interface IChatRoomMember extends Document {
    room_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    is_muted: boolean;
    joined_at: Date;
}

const ChatRoomMemberSchema: Schema = new Schema({
    room_id: { type: Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    is_muted: { type: Boolean, default: false },
}, {
    timestamps: { createdAt: 'joined_at', updatedAt: false },
    toJSON: {
        virtuals: true,
        transform: (_: any, ret: any) => {
            ret.id = ret._id.toString();
            ret.roomId = ret.room_id.toString();
            ret.userId = ret.user_id.toString();
            ret.isMuted = ret.is_muted ? 1 : 0;
            ret.joinedAt = ret.joined_at;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

ChatRoomMemberSchema.index({ room_id: 1, user_id: 1 }, { unique: true });

export default mongoose.model<IChatRoomMember>('ChatRoomMember', ChatRoomMemberSchema);
