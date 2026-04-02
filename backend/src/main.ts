import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  const raw = process.env.CORS_ORIGIN?.trim();
  const origin =
    raw === undefined || raw === ''
      ? ['http://localhost:3000', 'http://127.0.0.1:3000']
      : raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  app.enableCors({
    origin,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
