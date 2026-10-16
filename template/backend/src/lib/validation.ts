import type {ZodType} from 'zod';
import {HttpError} from './http-error.js';

export function validate<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Invalid request data');
  return result.data;
}
