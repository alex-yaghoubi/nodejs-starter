import 'dotenv/config';
import {z} from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32).refine(value => value !== 'replace-with-a-long-random-secret-before-starting', 'Generate a unique JWT_SECRET first'),
  ACCESS_TOKEN_TTL: z.string().regex(/^[1-9]\d*(s|m|h|d)$/, 'Use a duration such as 15m or 1h').default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  CORS_ORIGINS: z.string().default(''),
  ENABLE_DOCS: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  throw new Error('Invalid environment: ' + result.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; '));
}
export const env = result.data;
