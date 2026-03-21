import { Injectable } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SLMRequest } from "src/common/interfaces/slm-request.interface";
import { SLMResponse } from "src/common/interfaces/slm-response.interface";


@Injectable()
export class SLMClient {
  private readonly logger = new Logger("SLMClient")

  constructor(private config: ConfigService) {}

   async normalize(rawAlert: SLMRequest): Promise<SLMResponse> {
    
   }

  isHealthy(){
    return {status: "ok"}
  }
}