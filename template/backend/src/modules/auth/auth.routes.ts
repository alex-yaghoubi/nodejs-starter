import type {FastifyPluginAsync, FastifyReply} from 'fastify';
import {and, eq, isNull} from 'drizzle-orm';
import {db} from '../../db/index.js';
import {users, refreshSessions} from '../../db/schema.js';
import {env} from '../../config/env.js';
import {HttpError} from '../../lib/http-error.js';
import {hashPassword, verifyPassword} from '../../lib/password.js';
import {validate} from '../../lib/validation.js';
import {requireTrustedCookieOrigin} from '../../lib/request-origin.js';
import {requireUser} from './auth.guard.js';
import {
  accessResponseSchema, credentialsJsonSchema, credentialsSchema,
  changePasswordSchema, changePasswordJsonSchema, sessionParamsSchema,
  deleteAccountSchema, deleteAccountJsonSchema,
} from './auth.schemas.js';
import {
  getRefreshExpiry, issueRefresh, REFRESH_COOKIE, REFRESH_COOKIE_PATH,
  revokeRefresh, rotateRefresh, revokeAllSessions, revokeSessionById, listActiveSessions,
} from './auth.service.js';

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: getRefreshExpiry(),
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, {path: REFRESH_COOKIE_PATH});
}

const protectedResponse = {
  type: 'object',
  required: ['id', 'email', 'role'],
  properties: {id: {type: 'string'}, email: {type: 'string'}, role: {type: 'string'}},
} as const;

const sessionListResponse = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'createdAt', 'expiresAt', 'current'],
        properties: {
          id: {type: 'string'},
          createdAt: {type: 'string', format: 'date-time'},
          expiresAt: {type: 'string', format: 'date-time'},
          current: {type: 'boolean'},
        },
      },
    },
  },
} as const;

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', {
    schema: {tags: ['Auth'], body: credentialsJsonSchema, response: {201: protectedResponse}},
    config: {rateLimit: {max: 5, timeWindow: '1 minute'}},
  }, async (request, reply) => {
    const input = validate(credentialsSchema, request.body);
    const [existing] = await db.select({id: users.id}).from(users)
      .where(eq(users.email, input.email)).limit(1);
    if (existing) throw new HttpError(409, 'EMAIL_IN_USE', 'Email already registered');
    const passwordHash = await hashPassword(input.password);
    // The unique database constraint is the final defense against races.
    try {
      const [user] = await db.insert(users).values({email: input.email, passwordHash})
        .returning({id: users.id, email: users.email, role: users.role});
      if (!user) throw new Error('Unable to create user');
      return reply.code(201).send(user);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        throw new HttpError(409, 'EMAIL_IN_USE', 'Email already registered');
      }
      throw error;
    }
  });

  app.post('/login', {
    schema: {tags: ['Auth'], body: credentialsJsonSchema, response: {200: accessResponseSchema}},
    config: {rateLimit: {max: 8, timeWindow: '1 minute'}},
  }, async (request, reply) => {
    const input = validate(credentialsSchema, request.body);
    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    // A dummy hash balances authentication timing for unknown accounts.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    const session = await issueRefresh(user.id);
    setRefreshCookie(reply, session.token);
    return {
      accessToken: app.jwt.sign({sub: user.id, sid: session.familyId}, {expiresIn: env.ACCESS_TOKEN_TTL}),
      tokenType: 'Bearer', expiresIn: env.ACCESS_TOKEN_TTL,
    };
  });

  app.post('/refresh', {
    schema: {tags: ['Auth'], response: {200: accessResponseSchema}},
    config: {rateLimit: {max: 15, timeWindow: '1 minute'}},
  }, async (request, reply) => {
    requireTrustedCookieOrigin(request);
    const old = request.cookies[REFRESH_COOKIE];
    const renewed = old ? await rotateRefresh(old) : null;
    if (!renewed) {
      clearRefreshCookie(reply);
      throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh session invalid or expired');
    }
    setRefreshCookie(reply, renewed.token);
    return {
      accessToken: app.jwt.sign({sub: renewed.userId, sid: renewed.familyId}, {expiresIn: env.ACCESS_TOKEN_TTL}),
      tokenType: 'Bearer', expiresIn: env.ACCESS_TOKEN_TTL,
    };
  });

  app.post('/logout', {schema: {tags: ['Auth']}}, async (request, reply) => {
    requireTrustedCookieOrigin(request);
    const cookie = request.cookies[REFRESH_COOKIE];
    if (cookie) await revokeRefresh(cookie);
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.get('/me', {
    schema: {tags: ['Auth'], security: [{bearerAuth: []}], response: {200: protectedResponse}},
  }, async (request) => {
    const {id, email, role} = await requireUser(request);
    return {id, email, role};
  });

  app.get('/sessions', {
    schema: {tags: ['Auth'], security: [{bearerAuth: []}], response: {200: sessionListResponse}},
  }, async (request) => {
    const user = await requireUser(request);
    const sessions = await listActiveSessions(user.id);
    return {data: sessions.map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      current: session.familyId === user.familyId,
    }))};
  });

  app.delete('/sessions/:id', {
    schema: {
      tags: ['Auth'], security: [{bearerAuth: []}],
      params: {type: 'object', required: ['id'], properties: {id: {type: 'string', format: 'uuid'}}},
    },
  }, async (request, reply) => {
    const user = await requireUser(request);
    const {id} = validate(sessionParamsSchema, request.params);
    const revokedFamily = await revokeSessionById(user.id, id);
    if (!revokedFamily) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found');
    if (revokedFamily === user.familyId) clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.post('/logout-all', {
    schema: {tags: ['Auth'], security: [{bearerAuth: []}]},
  }, async (request, reply) => {
    const user = await requireUser(request);
    await revokeAllSessions(user.id);
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.delete('/account', {
    schema: {
      tags: ['Auth'], security: [{bearerAuth: []}], body: deleteAccountJsonSchema,
      description: 'Permanently delete the authenticated account, owned tasks and sessions (irreversible)',
    },
    config: {rateLimit: {max: 3, timeWindow: '1 minute'}},
  }, async (request, reply) => {
    const user = await requireUser(request);
    const input = validate(deleteAccountSchema, request.body);
    // Lock against a simultaneous password change. Foreign-key cascade
    // removes all owned tasks and refresh sessions in this transaction.
    await db.transaction(async tx => {
      const [account] = await tx.select({passwordHash: users.passwordHash})
        .from(users).where(eq(users.id, user.id)).for('update').limit(1);
      if (!account || !(await verifyPassword(input.password, account.passwordHash))) {
        throw new HttpError(403, 'WRONG_PASSWORD', 'Current password is incorrect');
      }
      await tx.delete(users).where(eq(users.id, user.id));
    });
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.post('/change-password', {
    schema: {tags: ['Auth'], security: [{bearerAuth: []}], body: changePasswordJsonSchema},
    config: {rateLimit: {max: 5, timeWindow: '1 minute'}},
  }, async (request, reply) => {
    const user = await requireUser(request);
    const input = validate(changePasswordSchema, request.body);
    if (input.currentPassword === input.newPassword) {
      throw new HttpError(400, 'INVALID_PASSWORD', 'New password must be different');
    }

    // Serialize password changes against this account and revoke its sessions
    // in the same transaction. Stale access tokens fail requireUser immediately.
    await db.transaction(async tx => {
      const [account] = await tx.select({passwordHash: users.passwordHash})
        .from(users).where(eq(users.id, user.id)).for('update').limit(1);
      if (!account || !(await verifyPassword(input.currentPassword, account.passwordHash))) {
        throw new HttpError(403, 'WRONG_PASSWORD', 'Current password is incorrect');
      }
      const passwordHash = await hashPassword(input.newPassword);
      await tx.update(users).set({passwordHash}).where(eq(users.id, user.id));
      await tx.update(refreshSessions).set({revokedAt: new Date()})
        .where(and(eq(refreshSessions.userId, user.id), /* check active rows only */ isNull(refreshSessions.revokedAt)));
    });
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });
};

// An arbitrary, correctly formatted scrypt hash ensures unknown accounts pay
// approximately the same derivation cost as a real account.
const DUMMY_HASH = 'scrypt$16384$0123456789abcdef0123456789abcdef0123456789abcdef$' + '0'.repeat(128);
