import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { SLMService } from 'src/slm/slm.service';
import { buildSLMResponse } from 'test/factories';

describe('SLMService', () => {
  let slmService: SLMService;
  let mockHttp: { post: jest.Mock };

  beforeAll(async () => {
    mockHttp = { post: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SLMService,
        { provide: HttpService, useValue: mockHttp },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'SLM_API' ? 'http://localhost:8000' : null,
          },
        },
      ],
    }).compile();

    slmService = module.get(SLMService);
    // Trigger onModuleInit to create the circuit breaker
    await slmService.onModuleInit();
  });

  beforeEach(() => {
    mockHttp.post.mockClear();
  });

  it('returns SLMResponse on successful call', async () => {
    const expectedResponse = buildSLMResponse();
    mockHttp.post.mockReturnValue(of({ data: expectedResponse }));

    const result = await slmService.normalize({
      raw_log: { alert_id: 'test' },
      source: 'crowdstrike',
      format: 'json',
    });

    expect(result.confidence).toBe(expectedResponse.confidence);
    expect(result.decision).toBe('accept');
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
  });

  it('isHealthy returns true when circuit is closed', () => {
    expect(slmService.isHealthy()).toBe(true);
  });

  it('circuit opens after repeated failures', async () => {
    mockHttp.post.mockReturnValue(
      throwError(() => new Error('Connection refused')),
    );

    // Fire enough requests to trip the breaker (volumeThreshold = 5)
    for (let i = 0; i < 6; i++) {
      try {
        await slmService.normalize({
          raw_log: { alert_id: 'test' },
          source: 'crowdstrike',
          format: 'json',
        });
      } catch {
        // Expected failures
      }
    }

    expect(slmService.isHealthy()).toBe(false);
  });
});
