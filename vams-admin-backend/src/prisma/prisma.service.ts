import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err: any) {
      console.warn('Prisma failed to connect on boot, will connect lazily:', err.message);
    }

    // Keep-alive database ping to prevent Neon Serverless PostgreSQL cold starts
    setInterval(async () => {
      try {
        await this.$queryRawUnsafe('SELECT 1');
      } catch (err: any) {
        console.warn('[DB Keep-Alive] Ping failed:', err.message);
      }
    }, 120000); // Ping every 2 minutes (120000 ms)
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
