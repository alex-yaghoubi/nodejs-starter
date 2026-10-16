import type {FastifyPluginAsync} from 'fastify';
import {and, asc, count, desc, eq, ilike} from 'drizzle-orm';
import {db} from '../../db/index.js';
import {tasks} from '../../db/schema.js';
import {HttpError} from '../../lib/http-error.js';
import {validate} from '../../lib/validation.js';
import {escapeLikePattern} from '../../lib/search.js';
import {requireUser} from '../auth/auth.guard.js';
import {
  createTaskSchema, createTaskJsonSchema, updateTaskSchema, updateTaskJsonSchema,
  taskParamsSchema, listTasksSchema, taskResponseSchema, taskListResponseSchema,
} from './tasks.schemas.js';

const taskView = {
  id: tasks.id, title: tasks.title, description: tasks.description,
  status: tasks.status, priority: tasks.priority,
  createdAt: tasks.createdAt, updatedAt: tasks.updatedAt,
};

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', {
    schema: {
      tags: ['Tasks'], security: [{bearerAuth: []}],
      querystring: {type: 'object', additionalProperties: false, properties: {
        limit: {type: 'integer', minimum: 1, maximum: 100},
        offset: {type: 'integer', minimum: 0, maximum: 10000},
        status: {type: 'string', enum: ['todo', 'in_progress', 'done']},
        priority: {type: 'string', enum: ['low', 'normal', 'high']},
        search: {type: 'string', minLength: 1, maxLength: 100},
        sort: {type: 'string', enum: ['newest', 'oldest']},
      }},
      response: {200: taskListResponseSchema},
    },
  }, async (request) => {
    const user = await requireUser(request);
    const {limit, offset, status, priority, search, sort} = validate(listTasksSchema, request.query);
    const scope = and(
      eq(tasks.ownerId, user.id),
      status ? eq(tasks.status, status) : undefined,
      priority ? eq(tasks.priority, priority) : undefined,
      search ? ilike(tasks.title, `%${escapeLikePattern(search)}%`) : undefined,
    );
    const rows = await db.select(taskView).from(tasks).where(scope)
      .orderBy(
        sort === 'oldest' ? asc(tasks.createdAt) : desc(tasks.createdAt),
        sort === 'oldest' ? asc(tasks.id) : desc(tasks.id),
      ).limit(limit).offset(offset);
    const [summary] = await db.select({total: count()}).from(tasks).where(scope);
    const total = summary?.total ?? 0;
    return {data: rows, pagination: {limit, offset, total, hasMore: offset + rows.length < total}};
  });

  app.post('/', {
    schema: {tags: ['Tasks'], security: [{bearerAuth: []}], body: createTaskJsonSchema,
      response: {201: taskResponseSchema}},
  }, async (request, reply) => {
    const user = await requireUser(request);
    const body = validate(createTaskSchema, request.body);
    const [task] = await db.insert(tasks).values({...body, ownerId: user.id})
      .returning(taskView);
    if (!task) throw new Error('Unable to create task');
    return reply.code(201).send(task);
  });

  app.get('/:id', {
    schema: {tags: ['Tasks'], security: [{bearerAuth: []}],
      params: {type: 'object', required: ['id'], properties: {id: {type: 'string', format: 'uuid'}}},
      response: {200: taskResponseSchema}},
  }, async (request) => {
    const user = await requireUser(request);
    const {id} = validate(taskParamsSchema, request.params);
    const [task] = await db.select(taskView).from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, user.id))).limit(1);
    if (!task) throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
    return task;
  });

  app.patch('/:id', {
    schema: {tags: ['Tasks'], security: [{bearerAuth: []}],
      params: {type: 'object', required: ['id'], properties: {id: {type: 'string', format: 'uuid'}}},
      body: updateTaskJsonSchema, response: {200: taskResponseSchema}},
  }, async (request) => {
    const user = await requireUser(request);
    const {id} = validate(taskParamsSchema, request.params);
    const body = validate(updateTaskSchema, request.body);
    const [task] = await db.update(tasks).set({...body, updatedAt: new Date()})
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, user.id))).returning(taskView);
    if (!task) throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
    return task;
  });

  app.delete('/:id', {
    schema: {tags: ['Tasks'], security: [{bearerAuth: []}],
      params: {type: 'object', required: ['id'], properties: {id: {type: 'string', format: 'uuid'}}}},
  }, async (request, reply) => {
    const user = await requireUser(request);
    const {id} = validate(taskParamsSchema, request.params);
    const [deleted] = await db.delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, user.id)))
      .returning({id: tasks.id});
    if (!deleted) throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
    return reply.code(204).send();
  });
};
