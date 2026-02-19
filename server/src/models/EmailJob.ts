import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailJob extends Document {
    to: string;
    subject: string;
    html: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    attempts: number;
    error?: string;
    createdAt: Date;
    processedAt?: Date;
}

const EmailJobSchema: Schema = new Schema({
    to: { type: String, required: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    error: { type: String },
    processedAt: { type: Date }
}, {
    timestamps: true
});

// Index for finding pending jobs quickly
EmailJobSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model<IEmailJob>('EmailJob', EmailJobSchema);
