
import { createClient } from 'redis';

// Prefer configured REDIS_URL; fall back to IPv4 localhost to avoid IPv6 ::1 connection issues
const envUrl = process.env.REDIS_URL;
const url = envUrl ? envUrl.replace('localhost', '127.0.0.1') : 'redis://127.0.0.1:6379';

const redisClient = createClient({ url });

redisClient.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
  try {
    await redisClient.connect();
    console.log('Redis connected to', url);
  } catch (err) {
    console.log('Redis connection failed', err);
  }
})();

export default redisClient;
