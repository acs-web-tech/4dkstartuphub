import mongoose, { Schema, Document } from 'mongoose';

export interface IPushSubscription extends Document {
    user_id: mongoose.Types.ObjectId;
    subscription: {
        endpoint: string;
        expirationTime: number | null;
        keys: {
            p256dh: string;
            auth: string;
        };
    };
    device_type: string;
    created_at: Date;
}

const PushSubscriptionSchema: Schema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subscription: {
        endpoint: { type: String, required: true, unique: true },
        expirationTime: { type: Number, default: null },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    },
    device_type: { type: String, default: 'web' },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Index by user_id for fast lookup
PushSubscriptionSchema.index({ user_id: 1 });

export default mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
