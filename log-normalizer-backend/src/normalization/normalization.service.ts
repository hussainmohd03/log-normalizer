import { Injectable } from '@nestjs/common';
import { SLMClient } from './client/slm-client.service';
import { SLMResponse } from 'src/common/interfaces/slm-response.interface';

@Injectable()
export class NormalizationService {

  constructor(private slmClient: SLMClient){}

  async processAlert(): Promise<SLMResponse> {

    return {}
  }
}
