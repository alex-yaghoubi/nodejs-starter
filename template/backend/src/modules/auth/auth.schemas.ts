import {z} from 'zod';

export const credentialsSchema = z.object({
  email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
  password: z.string().min(12).max(128),
}).strict();

export const emailSchema = z.string().trim().email().max(320).transform(value => value.toLowerCase());

export const credentialsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: {
    email: {type: 'string', format: 'email', maxLength: 320},
    password: {type: 'string', minLength: 12, maxLength: 128},
  },
} as const;

export const accessResponseSchema = {
  type: 'object',
  required: ['accessToken', 'tokenType', 'expiresIn'],
  properties: {
    accessToken: {type: 'string'},
    tokenType: {type: 'string', enum: ['Bearer']},
    expiresIn: {type: 'string'},
  },
} as const;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
}).strict();

export const changePasswordJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: {type: 'string', minLength: 1, maxLength: 128},
    newPassword: {type: 'string', minLength: 12, maxLength: 128},
  },
} as const;

export const sessionParamsSchema = z.object({id: z.string().uuid()}).strict();

/** Explicit confirmation and password prevent accidental account deletion. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal('DELETE'),
}).strict();

export const deleteAccountJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['password', 'confirmation'],
  properties: {
    password: {type: 'string', minLength: 1, maxLength: 128},
    confirmation: {type: 'string', enum: ['DELETE']},
  },
} as const;
