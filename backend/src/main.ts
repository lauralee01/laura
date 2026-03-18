import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Allow the Next.js dev server (different origin/port) to call our API.
  // In production, we'll tighten this to specific origins.
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
