import mongoose from 'mongoose';
import { config } from './env.js';

/**
 * Connect to MongoDB when MONGO_URI is configured.
 * Returns true when a real MongoDB connection is in use.
 */
export async function connectDatabase() {
  if (!config.mongoUri) return false;
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`[db] connected to MongoDB (${mongoose.connection.name})`);
  return true;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export function databaseReady() {
  return mongoose.connection.readyState === 1;
}
