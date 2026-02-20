import { parentPort, workerData } from 'worker_threads';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import EmailJob, { IEmailJob } from '../models/EmailJob';
import { config } from '../config/env';

// Worker Setup
const BATCH_SIZE = 10;
const POLLING_INTERVAL = 1000;
const MAX_ATTEMPTS = 3;

// Set up transporter
const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
        user: config.email.user,
        pass: config.email.pass,
    },
    pool: true, // Use pooled connections for better performance
    maxConnections: 5,
    maxMessages: 100,
});

async function connectDB() {
    try {
        await mongoose.connect(config.mongodbUri);
        console.log('Email Worker connected to MongoDB');
    } catch (err) {
        console.error('Email Worker DB connection error:', err);
        process.exit(1);
    }
}

async function processJob(job: IEmailJob) {
    try {
        // Double check status to avoid race conditions (optimistic locking handled by findOneAndUpdate)

        await transporter.sendMail({
            from: config.email.from,
            to: job.to,
            subject: job.subject,
            html: job.html,
        });

        job.status = 'completed';
        job.processedAt = new Date();
        await job.save();

        // Notify main thread (optional)
        parentPort?.postMessage({ type: 'job_completed', id: job._id });

    } catch (error: any) {
        console.error(`Failed to process email job ${job._id}:`, error);

        job.attempts += 1;
        if (job.attempts >= MAX_ATTEMPTS) {
            job.status = 'failed';
            job.error = error.message;
        } else {
            job.status = 'pending'; // Retry
            // Add slight backoff? For simplicity, immediate retry next cycle
        }
        await job.save();
    }
}

async function runWorkerLoop() {
    while (true) {
        try {
            // Fetch batch of pending jobs
            // Use findOneAndUpdate to atomically lock jobs?
            // For batch processing, we can find pending jobs and lock them one by one or in bulk.
            // Simple approach: Find pending, iterate, try to lock individually.

            const jobs = await EmailJob.find({ status: 'pending' })
                .sort({ createdAt: 1 })
                .limit(BATCH_SIZE);

            if (jobs.length === 0) {
                // No jobs, sleep
                await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
                continue;
            }

            // Process batch in parallel
            await Promise.all(jobs.map(async (jobDoc) => {
                // Try to lock
                const job = await EmailJob.findOneAndUpdate(
                    { _id: jobDoc._id, status: 'pending' },
                    { status: 'processing' },
                    { new: true }
                );

                if (job) {
                    await processJob(job);
                }
            }));

        } catch (error) {
            console.error('Email Worker Loop Error:', error);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Backoff on error
        }
    }
}

// Start
connectDB().then(runWorkerLoop);
