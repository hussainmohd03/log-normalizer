import { Module } from '@nestjs/common';
import { NormalizationService } from './normalization.service';
import { SLMClient } from './client/slm-client.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [NormalizationService, SLMClient],
  exports:[SLMClient, NormalizationService]
})
export class NormalizationModule {}
