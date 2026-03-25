import { HttpService } from "@nestjs/axios";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SLMRequest } from "src/common/interfaces/slm-request.interface";
import { SLMResponse } from "src/common/interfaces/slm-response.interface";
import CircuitBreaker from "opossum";
import { firstValueFrom } from "rxjs";

@Injectable()
export class SLMClient implements OnModuleInit{
  private readonly logger = new Logger("SLMClient")
  private breaker: CircuitBreaker<[SLMRequest], SLMResponse>
  private readonly slmUrl: string;


  constructor(private config: ConfigService, private httpService: HttpService) {
    const url = this.config.get('SLM_API');
    if(!url) throw new Error('SLM_API environment variable is required');
    this.slmUrl = url;
  }

  onModuleInit() {
    this.breaker = new CircuitBreaker(
      (payload: SLMRequest) => this.callSLM(payload),
      {
        timeout: 15000,                  // 15s request timeout
        errorThresholdPercentage: 50,    // open after 50% failures
        resetTimeout: 60000,             // try again after 60s
        volumeThreshold: 5,              // need 5 requests before opening
      },
    );

    this.breaker.on('open', () => this.logger.warn('Circuit OPEN — SLM unavailable'));
    this.breaker.on('halfOpen', () => this.logger.log('Circuit HALF-OPEN — testing SLM'));
    this.breaker.on('close', () => this.logger.log('Circuit CLOSED — SLM recovered'));
  }



  async normalize(request: SLMRequest): Promise<SLMResponse> {
    return this.breaker.fire(request)
  }

  private async callSLM(payload: SLMRequest): Promise<SLMResponse> {
    const {data} = await firstValueFrom(
      this.httpService.post<SLMResponse>(
        `${this.slmUrl}/api/normalize`,
        payload,
      ),
    );
    return data;
  }
    
  isHealthy(){
    return !this.breaker.opened
  }
}


