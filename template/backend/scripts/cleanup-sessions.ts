import {lt} from 'drizzle-orm';
import {db, sqlClient} from '../src/db/index.js';
import {refreshSessions} from '../src/db/schema.js';

/** Safe to schedule daily. Only expired refresh tokens are deleted. */
try {
  await db.delete(refreshSessions).where(lt(refreshSessions.expiresAt, new Date()));
  console.log('Expired refresh-session cleanup completed');
} catch (error) {
  console.error('Session cleanup failed', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sqlClient.end({timeout: 5});
}
