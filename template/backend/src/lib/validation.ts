import {z} from 'zod';
import {HttpError} from './http-error.js';

// Preserve the schema's parsed OUTPUT type, including required defaults and coercions.
export function validate<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Invalid request data');
  return result.data;
}
