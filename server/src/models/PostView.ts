import mongoose, { Schema, Document } from 'mongoose';

export interface IPostView extends Document {
    post_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId | null;
    ip_address: string;
    created_at: Date;
}

const PostViewSchema: Schema = new Schema({
    post_id: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ip_address: { type: String, default: '' },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    toJSON: {
        transform: (_, ret) => {
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

PostViewSchema.index({ post_id: 1 });

export default mongoose.model<IPostView>('PostView', PostViewSchema);
