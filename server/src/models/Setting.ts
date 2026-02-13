import mongoose, { Schema, Document } from 'mongoose';

export interface ISetting extends Document {
    key: string;
    value: string;
    updated_at: Date;
}

const SettingSchema: Schema = new Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
}, {
    timestamps: { createdAt: false, updatedAt: 'updated_at' },
    toJSON: {
        transform: (_, ret) => {
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

export default mongoose.model<ISetting>('Setting', SettingSchema);
