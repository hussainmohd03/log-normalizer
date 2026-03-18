import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from 'src/database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

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

    // Check Circuit Breaker state (later)


    const status = dbCheck === 'connected' ? 'ok' : 'unhealthy';
    const httpCode = status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(httpCode).json( {
      status: dbCheck === 'connected' ? 'ok' : "unhealthy", 
      database: dbCheck,
    })
  }
}
