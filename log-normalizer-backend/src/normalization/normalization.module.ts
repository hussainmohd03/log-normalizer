import { Module } from '@nestjs/common';
import { NormalizationService } from './normalization.service';
import { SLMClient } from './client/slm-client.service';

@Module({
  providers: [NormalizationService, SLMClient]
})
export class NormalizationModule {}
