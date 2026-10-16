import {eq} from 'drizzle-orm';
import {db, sqlClient} from '../src/db/index.js';
import {users} from '../src/db/schema.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run admin:promote -- person@example.com');
  process.exitCode = 1;
} else {
  try {
    const [user] = await db.update(users).set({role: 'admin'})
      .where(eq(users.email, email)).returning({id: users.id});
    if (!user) throw new Error('User not found. Register the account first.');
    console.log('Administrator granted to account:', user.id);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
await sqlClient.end({timeout: 5});
