import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from 'src/database/prisma.service';
import { SLMClient } from 'src/normalization/client/slm-client.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService, private slmClient: SLMClient) {}

  @Get()
  async healthCheck(@Res() res: Response){
    let dbCheck = "disconnected"
    // check DB state
    try{
      await this.prisma.$queryRaw`SELECT 1`;
      dbCheck = "connected" 
    }catch {
      dbCheck = "disconnected"
    }

    // Check SLM State - call /health (later)
    const slmHealth = await this.slmClient.slmHeath()
    // Check Circuit Breaker state (later)
    const breakerState = this.slmClient.isHealthy() ? "Closed" : "Opened"

    const status = dbCheck === 'connected' ? 'ok' : 'unhealthy';
    const httpCode = status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(httpCode).json( {
      status: dbCheck === 'connected' ? 'ok' : "unhealthy", 
      database: dbCheck,
      circuit_breaker: breakerState,
      slm_service: slmHealth
    })
  }
}
