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
    last_seen: Date;
    post_count: number;
    created_at: Date;
    updated_at: Date;
    fcm_tokens: string[];
    is_email_verified: boolean;
    email_verification_token?: string;
    email_verification_otp?: string;
    email_verification_otp_expires?: Date;
    reset_password_token?: string;
    reset_password_otp?: string;
    reset_password_expires?: Date;
    email_preferences: {
        likes: boolean;
        comments: boolean;
        mentions: boolean;
        broadcasts: boolean;
    };
    reset_record: {
        last_request_date: string;
        request_count: number;
        reset_count: number;
    };
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
    last_seen: { type: Date, default: Date.now },
    post_count: { type: Number, default: 0 },
    fcm_tokens: { type: [String], default: [] },
    is_email_verified: { type: Boolean, default: false },
    email_verification_token: { type: String },
    email_verification_otp: { type: String },
    email_verification_otp_expires: { type: Date },
    reset_password_token: { type: String },
    reset_password_otp: { type: String },
    reset_password_expires: { type: Date },
    email_preferences: {
        likes: { type: Boolean, default: true },
        comments: { type: Boolean, default: true },
        mentions: { type: Boolean, default: true },
        broadcasts: { type: Boolean, default: true }
    },
    reset_record: {
        last_request_date: { type: String, default: '' },
        request_count: { type: Number, default: 0 },
        reset_count: { type: Number, default: 0 }
    }
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
            ret.lastSeen = ret.last_seen;
            ret.postCount = ret.post_count;
            ret.createdAt = ret.created_at;
            ret.updatedAt = ret.updated_at;

            // Remove sensitive or redundant fields
            delete ret._id;
            delete ret.__v;
            delete ret.password_hash;
            delete ret.razorpay_payment_id;
            delete ret.razorpay_order_id;
            delete ret.display_name;
            delete ret.avatar_url;
            delete ret.is_active;
            delete ret.profile_completed;
            delete ret.user_type;
            delete ret.payment_status;
            delete ret.premium_expiry;
            delete ret.last_seen;
            delete ret.post_count;
            delete ret.created_at;
            delete ret.updated_at;
            delete ret.email_verification_otp;
            delete ret.email_verification_token;
            delete ret.reset_password_otp;
            delete ret.reset_password_token;
            delete ret.fcm_tokens;

            return ret;
        }
    }
});

export default mongoose.model<IUser>('User', UserSchema);
