import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from 'generated/prisma/client';
import { AuthenticatedPrincipal } from 'src/auth/auth.types';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TrainingDataService } from './training-data.service';
import { NoCorrectionsToExportError, TrainingDataStats } from './training-data.types';

@Controller('admin/training-data')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TrainingDataController {
  constructor(private readonly service: TrainingDataService) {}

  @Get('stats')
  async stats(): Promise<TrainingDataStats> {
    return this.service.getStats();
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/x-ndjson')
  async export(
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    if (actor.kind !== 'user') {
      throw new ForbiddenException('User account required');
    }

    try {
      const result = await this.service.exportPending(actor.userId);
      const filename = `training-export-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Record-Count', String(result.recordCount));
      res.setHeader('X-Export-Id', result.exportId);
      return result.jsonl;
    } catch (err) {
      if (err instanceof NoCorrectionsToExportError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }
}
