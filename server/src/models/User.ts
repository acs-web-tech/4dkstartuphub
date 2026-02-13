import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    username: string;
    email: string;
    password_hash: string;
    display_name: string;
    bio: string;
    avatar_url: string;
    role: 'user' | 'admin' | 'moderator';
    is_active: boolean;
    profile_completed: boolean;
    location: string;
    website: string;
    linkedin: string;
    twitter: string;
    user_type: 'startup' | 'investor';
    payment_status: string;
    razorpay_payment_id: string;
    razorpay_order_id: string;
    premium_expiry: Date | null;
    created_at: Date;
    updated_at: Date;
}

const UserSchema: Schema = new Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    display_name: { type: String, required: true },
    bio: { type: String, default: '' },
    avatar_url: { type: String, default: '' },
    role: { type: String, enum: ['user', 'admin', 'moderator'], default: 'user' },
    is_active: { type: Boolean, default: true },
    profile_completed: { type: Boolean, default: false },
    location: { type: String, default: '' },
    website: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    twitter: { type: String, default: '' },
    user_type: { type: String, enum: ['startup', 'investor'] },
    payment_status: { type: String, default: 'pending' },
    razorpay_payment_id: { type: String, default: '' },
    razorpay_order_id: { type: String, default: '' },
    premium_expiry: { type: Date, default: null },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
        virtuals: true,
        transform: (_: any, ret: any) => {
            ret.id = ret._id.toString();
            ret.displayName = ret.display_name;
            ret.avatarUrl = ret.avatar_url;
            ret.role = ret.role;
            ret.isActive = ret.is_active ? 1 : 0;
            ret.profileCompleted = ret.profile_completed ? 1 : 0;
            ret.userType = ret.user_type;
            ret.paymentStatus = ret.payment_status;
            ret.premiumExpiry = ret.premium_expiry;
            ret.createdAt = ret.created_at;
            ret.updatedAt = ret.updated_at;
            delete ret._id;
            delete ret.__v;
            delete ret.password_hash;
            return ret;
        }
    }
});

export default mongoose.model<IUser>('User', UserSchema);
