
// This file should only be imported on the server side
// Client-side imports will cause bundling errors

import { createClient } from 'redis';

// Use the configured REDIS_URL from environment, ensuring IPv4 localhost
const envUrl = process.env.REDIS_URL;
const url = envUrl ? envUrl.replace('localhost', '127.0.0.1') : 'redis://127.0.0.1:6380';

const redisClient = createClient({ url });

redisClient.on('error', (err) => console.log('Redis Client Error', err));

let isConnected = false;
let isConnecting = false;

export const getRedisClient = async () => {
  // If already connected, return the client
  if (isConnected) {
    return redisClient;
  }

  // If currently connecting, wait for it to complete
  if (isConnecting) {
    // Wait for connection to be established
    let attempts = 0;
    while (isConnecting && attempts < 50) { // 5 second timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (isConnected) {
      return redisClient;
    }
  }

  // Start connection process
  isConnecting = true;
  try {
    await redisClient.connect();
    console.log('Redis connected to', url);
    isConnected = true;
    return redisClient;
  } catch (err) {
    console.log('Redis connection failed', err);
    isConnecting = false;
    throw err;
  }
};

// Initialize connection for server-side usage only
if (typeof window === 'undefined') {
  // Server-side only - this prevents client-side bundling
  getRedisClient().catch(err => {
    console.error('Failed to initialize Redis connection:', err);
  });
}

export default redisClient;
