import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from 'generated/prisma/client';


@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy, OnModuleInit{
  constructor (config: ConfigService) {
    const adapter = new PrismaPg({connectionString: config.get("DATABASE_URL")})
    super({adapter})
  }


  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
