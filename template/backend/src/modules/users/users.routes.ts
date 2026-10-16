import type {FastifyPluginAsync} from 'fastify';
import {asc, count} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '../../db/index.js';
import {users} from '../../db/schema.js';
import {validate} from '../../lib/validation.js';
import {requireAdmin} from '../auth/auth.guard.js';

const userListResponseSchema = {
  type: 'object',
  required: ['data', 'pagination'],
  properties: {
    data: {type: 'array', items: {
      type: 'object', required: ['id', 'email', 'role', 'createdAt'],
      properties: {
        id: {type: 'string', format: 'uuid'}, email: {type: 'string', format: 'email'},
        role: {type: 'string', enum: ['user', 'admin']},
        createdAt: {type: 'string', format: 'date-time'},
      },
    }},
    pagination: {type: 'object', required: ['limit', 'offset', 'total', 'hasMore'],
      properties: {limit: {type: 'integer'}, offset: {type: 'integer'},
        total: {type: 'integer'}, hasMore: {type: 'boolean'}}},
  },
} as const;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
}).strict();

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', {
    schema: {
      tags: ['Users'], security: [{bearerAuth: []}],
      querystring: {type: 'object', properties: {
        limit: {type: 'integer', minimum: 1, maximum: 100},
        offset: {type: 'integer', minimum: 0, maximum: 10000},
      }},
      response: {200: userListResponseSchema},
    },
  }, async (request) => {
    await requireAdmin(request);
    const {limit, offset} = validate(querySchema, request.query);
    const rows = await db.select({id: users.id, email: users.email, role: users.role, createdAt: users.createdAt})
      .from(users).orderBy(asc(users.createdAt), asc(users.id)).limit(limit).offset(offset);
    const [summary] = await db.select({total: count()}).from(users);
    return {data: rows, pagination: {limit, offset, total: summary?.total ?? 0, hasMore: offset + rows.length < (summary?.total ?? 0)}};
  });
};
