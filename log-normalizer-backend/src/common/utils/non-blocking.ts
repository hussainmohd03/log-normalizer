import { Logger } from '@nestjs/common';

export async function nonBlocking<T>(
  fn: () => T | Promise<T>,
  context: string,
  logger: Logger,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    logger.error(`[${context}] Non-Blocking Failure: ${error.message}`);
    return null;
  }
}
