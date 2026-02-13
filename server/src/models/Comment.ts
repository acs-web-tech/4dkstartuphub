import mongoose, { Schema, Document } from 'mongoose';

export interface IComment extends Document {
    post_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    content: string;
    parent_id: mongoose.Types.ObjectId | null;
    created_at: Date;
    updated_at: Date;
}

const CommentSchema: Schema = new Schema({
    post_id: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    parent_id: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
        virtuals: true,
        transform: (_: any, ret: any) => {
            ret.id = ret._id.toString();
            ret.postId = ret.post_id.toString();
            ret.userId = ret.user_id.toString();
            if (ret.parent_id) ret.parentId = ret.parent_id.toString();
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

CommentSchema.index({ post_id: 1 });
CommentSchema.index({ user_id: 1 });

export default mongoose.model<IComment>('Comment', CommentSchema);
