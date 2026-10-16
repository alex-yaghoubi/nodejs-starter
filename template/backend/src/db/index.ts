import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
import {env} from '../config/env.js';

export const sqlClient = postgres(env.DATABASE_URL, {max: 10, idle_timeout: 20, connect_timeout: 5});
export const db = drizzle(sqlClient, {schema});
