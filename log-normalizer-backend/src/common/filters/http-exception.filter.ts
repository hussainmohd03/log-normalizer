import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const errorId = randomUUID().slice(0, 8);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      this.logger.warn(`[${errorId}]  ${status}: ${exception.message}`);

      return res
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body, error_id: errorId }
            : { ...body, error_id: errorId },
        );
    }

    this.logger.error(
      `[${errorId}] Unhandled: ${exception instanceof Error ? exception.message : exception}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error_id: errorId,
    });
  }
}
