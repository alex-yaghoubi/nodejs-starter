import type {FastifyRequest} from 'fastify';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '../../db/index.js';
import {users, type Role} from '../../db/schema.js';
import {HttpError} from '../../lib/http-error.js';
import {hasActiveSession} from './auth.service.js';

export type AuthenticatedUser = {id: string; email: string; role: Role; familyId: string};
const claimsSchema = z.object({sub: z.string().uuid(), sid: z.string().uuid()});

/** Database-verified session families make logout and revoke effective immediately. */
export async function requireUser(request: FastifyRequest): Promise<AuthenticatedUser> {
  try { await request.jwtVerify(); }
  catch { throw new HttpError(401, 'UNAUTHORIZED', 'Valid access token required'); }
  const claims = claimsSchema.safeParse(request.user);
  if (!claims.success) throw new HttpError(401, 'UNAUTHORIZED', 'Invalid token claims');
  const {sub: userId, sid: familyId} = claims.data;
  const [user] = await db.select({id: users.id, email: users.email, role: users.role})
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await hasActiveSession(userId, familyId))) {
    throw new HttpError(401, 'SESSION_REVOKED', 'Session expired or revoked');
  }
  return {...user, familyId};
}

export async function requireAdmin(request: FastifyRequest): Promise<AuthenticatedUser> {
  const user = await requireUser(request);
  if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Administrator permission required');
  return user;
}
