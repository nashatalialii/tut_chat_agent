import { Redis } from 'ioredis';
import { env } from '../env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  lazyConnect: false
});

redis.on('error', (err: Error) => {
  console.error('[redis] connection error', err.message);
});
