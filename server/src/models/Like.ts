import mongoose, { Schema, Document } from 'mongoose';

export interface ILike extends Document {
    post_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    created_at: Date;
}

const LikeSchema: Schema = new Schema({
    post_id: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    toJSON: {
        virtuals: true,
        transform: (_: any, ret: any) => {
            ret.id = ret._id.toString();
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

LikeSchema.index({ post_id: 1, user_id: 1 }, { unique: true });

export default mongoose.model<ILike>('Like', LikeSchema);
