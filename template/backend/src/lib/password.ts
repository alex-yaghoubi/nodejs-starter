import {randomBytes, scrypt as callbackScrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const scrypt = promisify(callbackScrypt);
const COST = 16384;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24).toString('hex');
  const key = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${COST}$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== String(COST) ||
      !/^[a-f\d]{48}$/i.test(parts[2] ?? '') || !/^[a-f\d]{128}$/i.test(parts[3] ?? '')) return false;
  const salt = parts[2]!;
  const expected = Buffer.from(parts[3]!, 'hex');
  const actual = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return timingSafeEqual(actual, expected);
}
