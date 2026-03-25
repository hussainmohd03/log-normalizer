import { Module } from '@nestjs/common';
import { RoutingService } from './routing.service';

@Module({
  providers: [RoutingService]
})
export class RoutingModule {}
