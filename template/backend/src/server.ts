import {buildApp} from './app.js';
import {env} from './config/env.js';

const app = await buildApp();
let stopping = false;

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info({signal}, 'Shutting down HTTP server');
  try {
    // Fastify stops accepting connections and runs onClose DB cleanup.
    await app.close();
  } catch (error) {
    app.log.error({err: error}, 'Shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGTERM', () => {void shutdown('SIGTERM');});
process.once('SIGINT', () => {void shutdown('SIGINT');});

try {
  await app.listen({host: env.HOST, port: env.PORT});
} catch (error) {
  app.log.error({err: error}, 'Unable to start API');
  process.exitCode = 1;
  await app.close();
}
