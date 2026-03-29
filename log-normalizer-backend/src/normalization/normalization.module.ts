import { Module } from '@nestjs/common';
import { NormalizationService } from './normalization.service';
import { RoutingModule } from 'src/routing/routing.module';


@Module({
  imports: [RoutingModule],
  providers: [NormalizationService],
  exports:[NormalizationService]
})
export class NormalizationModule {}
