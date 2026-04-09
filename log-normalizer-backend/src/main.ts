import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  // cookie-parser must run BEFORE any guard reads req.cookies
  // (the JwtStrategy cookie extractor needs this populated).
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.setGlobalPrefix('api');
  // credentials: true is required for httpOnly auth cookies to ride
  // cross-origin during dev. In prod (same-origin) it's a no-op.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Server running on  http://localhost:${process.env.PORT ?? 3000}/api`);
}
bootstrap();
