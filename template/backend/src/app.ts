import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {env} from './config/env.js';
import {sqlClient} from './db/index.js';
import {HttpError} from './lib/http-error.js';
import {authRoutes} from './modules/auth/auth.routes.js';
import {usersRoutes} from './modules/users/users.routes.js';
import {healthRoutes} from './modules/health/health.routes.js';
import {tasksRoutes} from './modules/tasks/tasks.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    genReqId: () => randomUUID(),
  });

  await app.register(helmet);
  await app.register(cookie);
  const origins = env.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
  await app.register(cors, {origin: origins.length ? origins : false, credentials: true});
  await app.register(rateLimit, {max: 120, timeWindow: '1 minute'});
  await app.register(jwt, {secret: env.JWT_SECRET});
  await app.register(swagger, {
    openapi: {
      info: {title: 'Standard API', description: 'Modular Fastify REST API starter', version: '0.3.0'},
      components: {securitySchemes: {bearerAuth: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'}}},
    },
  });
  if (env.ENABLE_DOCS && env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, {routePrefix: '/docs', staticCSP: true});
  }

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, {prefix: '/v1/auth'});
  await app.register(usersRoutes, {prefix: '/v1/users'});
  await app.register(tasksRoutes, {prefix: '/v1/tasks'});

  app.setNotFoundHandler((request, reply) => reply.code(404).send({
    error: {code: 'NOT_FOUND', message: 'Route not found', requestId: request.id},
  }));
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({error: {code: error.code, message: error.message, requestId: request.id}});
    }
    // Let the client know if it exceeded rate limits, without leaking internals.
    if (error instanceof Error && 'statusCode' in error && error.statusCode === 429) {
      return reply.code(429).send({error: {code: 'RATE_LIMITED', message: 'Too many requests', requestId: request.id}});
    }
    if (error instanceof Error && 'statusCode' in error && error.statusCode === 400) {
      return reply.code(400).send({error: {code: 'BAD_REQUEST', message: 'Invalid request', requestId: request.id}});
    }
    request.log.error({err: error}, 'Unhandled request failure');
    return reply.code(500).send({error: {code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.id}});
  });

  app.addHook('onClose', async () => {await sqlClient.end({timeout: 5});});
  return app;
}
