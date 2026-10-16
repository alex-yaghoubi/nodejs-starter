import type {FastifyPluginAsync} from 'fastify';
import {sqlClient} from '../../db/index.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', {schema: {tags: ['Health']}}, async () => ({status: 'ok'}));
  app.get('/ready', {schema: {tags: ['Health']}}, async (_request, reply) => {
    try {
      await sqlClient`select 1`;
      return {status: 'ready'};
    } catch {
      return reply.code(503).send({status: 'not-ready'});
    }
  });
};
