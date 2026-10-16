import type {FastifyRequest} from 'fastify';
import {env} from '../config/env.js';
import {HttpError} from './http-error.js';

/** Browser Origin is an origin string, not a path or URL prefix. */
export function isTrustedOrigin(origin: string | undefined, ownOrigin: string, allowed: string[]): boolean {
  if (!origin) return true; // Non-browser clients need not send Origin.
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) return false;
    return origin === ownOrigin || allowed.includes(origin);
  } catch {
    return false;
  }
}

/**
 * Refresh/logout rely on browser cookies. Unlike CORS (which only controls
 * reading responses), Origin checking protects state changes from requests
 * originating on untrusted websites and sibling subdomains.
 *
 * For production deployments use an explicit CORS_ORIGINS allow-list,
 * terminate TLS at a trusted reverse proxy, and configure TRUST_PROXY only
 * when the proxy is trusted. SameSite=Strict is additional protection.
 */
export function requireTrustedCookieOrigin(request: FastifyRequest): void {
  // A browser should not be able to submit a cross-site form without Origin.
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    throw new HttpError(403, 'UNTRUSTED_ORIGIN', 'Cross-site cookie request forbidden');
  }

  const host = request.headers.host;
  // Host includes any non-default port, unlike `request.hostname`.
  const ownOrigin = host ? `${request.protocol}://${host}` : '';
  const allowed = env.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
  if (!isTrustedOrigin(request.headers.origin, ownOrigin, allowed)) {
    throw new HttpError(403, 'UNTRUSTED_ORIGIN', 'Cookie request origin not allowed');
  }
}
