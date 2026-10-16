import {z} from 'zod';

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export const taskPrioritySchema = z.enum(['low', 'normal', 'high']);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
}).strict();

export const updateTaskSchema = createTaskSchema.partial().refine(
  value => Object.keys(value).length > 0, 'At least one field is required',
);

export const taskParamsSchema = z.object({id: z.string().uuid()}).strict();
export const listTasksSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
}).strict();

const taskStatusJson = {type: 'string', enum: ['todo', 'in_progress', 'done']} as const;
const taskPriorityJson = {type: 'string', enum: ['low', 'normal', 'high']} as const;

export const createTaskJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    title: {type: 'string', minLength: 1, maxLength: 160},
    description: {anyOf: [{type: 'string', maxLength: 5000}, {type: 'null'}]},
    status: taskStatusJson,
    priority: taskPriorityJson,
  },
} as const;

export const updateTaskJsonSchema = {
  ...createTaskJsonSchema,
  required: [],
  minProperties: 1,
} as const;

export const taskResponseSchema = {
  type: 'object',
  required: ['id', 'title', 'status', 'priority', 'createdAt', 'updatedAt'],
  properties: {
    id: {type: 'string', format: 'uuid'},
    title: {type: 'string'},
    description: {anyOf: [{type: 'string'}, {type: 'null'}]},
    status: taskStatusJson,
    priority: taskPriorityJson,
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
  },
} as const;

export const taskListResponseSchema = {
  type: 'object',
  required: ['data', 'pagination'],
  properties: {
    data: {type: 'array', items: taskResponseSchema},
    pagination: {
      type: 'object',
      required: ['limit', 'offset', 'total', 'hasMore'],
      properties: {
        limit: {type: 'integer'}, offset: {type: 'integer'},
        total: {type: 'integer'}, hasMore: {type: 'boolean'},
      },
    },
  },
} as const;
