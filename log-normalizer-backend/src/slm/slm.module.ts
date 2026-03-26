import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SLMService } from './slm.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [SLMService],
  exports: [SLMService],
})
export class SLMModule {}