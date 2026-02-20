import { Worker } from 'worker_threads';
import path from 'path';
import CleanupJob from '../models/CleanupJob';
import mongoose from 'mongoose';

export const cleanupService = {
    async queueUserDeletion(userId: string) {
        // Create a job record
        const job = await CleanupJob.create({
            userId: new mongoose.Types.ObjectId(userId),
            type: 'user_deletion',
            status: 'pending'
        });

        // Launch worker thread
        // In development with tsx, we might need a different path or loader
        // But assuming standard build process:
        const workerPath = process.env.NODE_ENV === 'production'
            ? path.join(__dirname, '../workers/cleanupWorker.js')
            : path.join(__dirname, '../workers/cleanupWorker.ts');

        try {
            const worker = new Worker(workerPath, {
                workerData: { userId, jobId: job._id.toString() },
                execArgv: process.env.NODE_ENV === 'production' ? [] : ['--loader', 'tsx']
            });

            worker.on('message', (msg) => {
                console.log(`🧹 Worker message:`, msg);
            });

            worker.on('error', (err) => {
                console.error(`🧹 Worker error:`, err);
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`🧹 Worker stopped with exit code ${code}`);
                }
            });

            return { success: true, jobId: job._id };
        } catch (err) {
            console.error('🧹 Failed to start cleanup worker:', err);
            job.status = 'failed';
            job.error = 'Failed to launch worker thread';
            await job.save();
            return { success: false, error: 'Failed to launch background worker' };
        }
    }
};
