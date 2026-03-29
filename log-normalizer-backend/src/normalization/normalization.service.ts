import { Injectable, Logger } from '@nestjs/common';
import { SLMService } from 'src/slm/slm.service';
import { SLMResponse } from 'src/common/interfaces/slm-response.interface';
import { RawLog } from 'generated/prisma/browser';
import { RoutingService } from 'src/routing/routing.service';

@Injectable()
export class NormalizationService {
  private readonly logger = new Logger(NormalizationService.name)
  
  constructor(
  private slmClient: SLMService, 
  private routingService: RoutingService){}

  async process(rawLog: RawLog): Promise<SLMResponse | null> {
    try {
      const response = await this.slmClient.normalize({
        raw_log: rawLog.rawContent as Record<string, any>,
        source: rawLog.source,
        format: rawLog.format || 'json',
      });

      // Route the response - routing service handles ALL DB writes
      await this.routingService.route(rawLog, response);

      return response;
    } catch (error) {
      // SLM call failed entirely (timeout, circuit open)
      // Log stays as PENDING - reprocess job picks it up 
      this.logger.error(`[${rawLog.id}] Normalization failed: ${error.message}`);
      return null;
    }
    
  }
}
