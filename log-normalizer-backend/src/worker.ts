import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';


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

  new Logger('WorkerBootstrap').error(
    { err: (err as Error).message },
    'worker.bootstrap_failed',
  );
  process.exit(1);
});
