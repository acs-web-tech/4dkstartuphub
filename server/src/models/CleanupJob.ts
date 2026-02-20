import mongoose, { Schema, Document } from 'mongoose';

export interface ICleanupJob extends Document {
    userId: mongoose.Types.ObjectId;
    type: 'user_deletion' | 'file_cleanup';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error?: string;
    details?: any;
    processedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const CleanupJobSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['user_deletion', 'file_cleanup'], default: 'user_deletion' },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    error: { type: String },
    details: { type: Schema.Types.Mixed },
    processedAt: { type: Date }
}, {
    timestamps: true
});

export default mongoose.model<ICleanupJob>('CleanupJob', CleanupJobSchema);
