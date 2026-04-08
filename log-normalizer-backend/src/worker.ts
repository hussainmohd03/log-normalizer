import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

/**
 * Worker entry point. Boots a headless Nest application context (no HTTP
 * server) that loads only WorkerModule. The BullMQ Worker registered by
 * NormalizeProcessor begins consuming the normalize queue as soon as the
 * BullModule lifecycle hook fires.
 *
 * Shutdown contract:
 *  - SIGTERM / SIGINT triggers app.close()
 *  - Nest calls onModuleDestroy on BullModule which closes the underlying
 *    Worker — the close() call waits for the in-flight job to finish
 *    before resolving (concurrency=1, so at most one).
 *  - PrismaService disconnects via its own onModuleDestroy.
 *
 * Any unhandled rejection is treated as a hard failure: log and exit
 * non-zero so the process supervisor restarts us.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });
  app.enableShutdownHooks();

  const shutdown = async (signal: string): Promise<void> => {
    logger.log({ signal }, 'worker.shutdown_requested');
    try {
      await app.close();
      logger.log('worker.shutdown_complete');
      process.exit(0);
    } catch (err) {
      logger.error(
        { err: (err as Error).message },
        'worker.shutdown_failed',
      );
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error(
      { reason: reason instanceof Error ? reason.message : String(reason) },
      'worker.unhandled_rejection',
    );
    process.exit(1);
  });

  logger.log('worker.ready');
}

bootstrap().catch((err: unknown) => {
  // Boot failure — nothing is initialised yet, so we cannot rely on
  // Nest's logger lifecycle. Use the bare Logger class.
  new Logger('WorkerBootstrap').error(
    { err: (err as Error).message },
    'worker.bootstrap_failed',
  );
  process.exit(1);
});
