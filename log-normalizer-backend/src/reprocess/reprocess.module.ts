import { Module } from '@nestjs/common';
import { ReprocessService } from './reprocess.service';
import { NormalizationModule } from 'src/normalization/normalization.module';

@Module({
  imports: [NormalizationModule],
  providers: [ReprocessService]
})
export class ReprocessModule {}
