import mongoose, { Schema, Document } from 'mongoose';

export interface IPitchRequest extends Document {
    user_id: mongoose.Types.ObjectId;
    title: string;
    description: string;
    deck_url: string;
    status: 'pending' | 'approved' | 'disapproved';
    admin_message: string;
    reviewed_by: mongoose.Types.ObjectId;
    created_at: Date;
    updated_at: Date;
}

const PitchRequestSchema: Schema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    deck_url: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'disapproved'], default: 'pending' },
    admin_message: { type: String, default: '' },
    reviewed_by: { type: String, default: '' },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
        virtuals: true,
        transform: (_, ret: any) => {
            ret.id = ret._id.toString();
            ret.userId = ret.user_id?.toString();
            ret.deckUrl = ret.deck_url;
            ret.adminMessage = ret.admin_message;
            ret.reviewedBy = ret.reviewed_by?.toString();
            ret.createdAt = ret.created_at;
            ret.updatedAt = ret.updated_at;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

PitchRequestSchema.index({ user_id: 1 });
PitchRequestSchema.index({ status: 1 });

export default mongoose.model<IPitchRequest>('PitchRequest', PitchRequestSchema);
