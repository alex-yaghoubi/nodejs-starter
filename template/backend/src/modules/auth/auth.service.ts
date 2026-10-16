import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {and, desc, eq, gt, isNull} from 'drizzle-orm';
import {db} from '../../db/index.js';
import {refreshSessions, users} from '../../db/schema.js';
import {env} from '../../config/env.js';

export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/v1/auth';

export type RefreshResult = {token: string; userId: string; familyId: string};

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function getRefreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
}

export async function issueRefresh(userId: string): Promise<RefreshResult> {
  const token = generateRefreshToken();
  const familyId = randomUUID();
  await db.insert(refreshSessions).values({
    userId,
    familyId,
    tokenHash: hashToken(token),
    expiresAt: getRefreshExpiry(),
  });
  return {token, userId, familyId};
}

/**
 * One refresh token is valid exactly once. All rotations stay in one family,
 * so logout/revoke can invalidate all tokens, including access JWTs carrying
 * the family ID. A replay of a revoked, unexpired refresh token terminates
 * the family (including any subsequently rotated refresh token).
 * Concurrent refreshes from multiple browser tabs should be serialized on
 * the client. Replayed tokens fail closed instead of creating parallel chains.
 */
export async function rotateRefresh(token: string): Promise<RefreshResult | null> {
  if (!/^[A-Za-z0-9_-]{64}$/.test(token)) return null;
  const digest = hashToken(token);
  return db.transaction(async (tx) => {
    const now = new Date();
    const [old] = await tx.update(refreshSessions)
      .set({revokedAt: now})
      .where(and(
        eq(refreshSessions.tokenHash, digest),
        isNull(refreshSessions.revokedAt),
        gt(refreshSessions.expiresAt, now),
      ))
      .returning({userId: refreshSessions.userId, familyId: refreshSessions.familyId});

    if (!old) {
      const [previous] = await tx.select({
        familyId: refreshSessions.familyId,
        revokedAt: refreshSessions.revokedAt,
        expiresAt: refreshSessions.expiresAt,
      }).from(refreshSessions).where(eq(refreshSessions.tokenHash, digest)).limit(1);
      if (previous?.revokedAt && previous.expiresAt > now) {
        await tx.update(refreshSessions).set({revokedAt: now})
          .where(and(eq(refreshSessions.familyId, previous.familyId), isNull(refreshSessions.revokedAt)));
      }
      return null;
    }

    const [user] = await tx.select({id: users.id}).from(users)
      .where(eq(users.id, old.userId)).limit(1);
    if (!user) return null;

    const newToken = generateRefreshToken();
    await tx.insert(refreshSessions).values({
      userId: user.id,
      familyId: old.familyId,
      tokenHash: hashToken(newToken),
      expiresAt: getRefreshExpiry(),
    });
    return {token: newToken, userId: user.id, familyId: old.familyId};
  });
}

export async function revokeRefresh(token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{64}$/.test(token)) return;
  const [session] = await db.select({familyId: refreshSessions.familyId})
    .from(refreshSessions).where(eq(refreshSessions.tokenHash, hashToken(token))).limit(1);
  if (!session) return;
  await db.update(refreshSessions).set({revokedAt: new Date()})
    .where(and(eq(refreshSessions.familyId, session.familyId), isNull(refreshSessions.revokedAt)));
}

export async function hasActiveSession(userId: string, familyId: string): Promise<boolean> {
  const [session] = await db.select({id: refreshSessions.id}).from(refreshSessions)
    .where(and(eq(refreshSessions.userId, userId), eq(refreshSessions.familyId, familyId),
      isNull(refreshSessions.revokedAt), gt(refreshSessions.expiresAt, new Date())))
    .limit(1);
  return Boolean(session);
}

export async function listActiveSessions(userId: string) {
  return db.select({
    id: refreshSessions.id,
    familyId: refreshSessions.familyId,
    createdAt: refreshSessions.createdAt,
    expiresAt: refreshSessions.expiresAt,
  }).from(refreshSessions)
    .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt),
      gt(refreshSessions.expiresAt, new Date())))
    .orderBy(desc(refreshSessions.createdAt)).limit(100);
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<string | null> {
  const [session] = await db.select({familyId: refreshSessions.familyId})
    .from(refreshSessions)
    .where(and(eq(refreshSessions.id, sessionId), eq(refreshSessions.userId, userId)))
    .limit(1);
  if (!session) return null;
  await db.update(refreshSessions).set({revokedAt: new Date()})
    .where(and(eq(refreshSessions.userId, userId), eq(refreshSessions.familyId, session.familyId),
      isNull(refreshSessions.revokedAt)));
  return session.familyId;
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.update(refreshSessions).set({revokedAt: new Date()})
    .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt)));
}
