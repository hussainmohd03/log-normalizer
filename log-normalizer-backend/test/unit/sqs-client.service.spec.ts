import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { SQSClientService } from 'src/delivery/sqs-client.service'

jest.mock('@aws-sdk/client-sqs', () => {
  const send = jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' })
  return {
    SQSClient: jest.fn().mockImplementation(() => ({ send })),
    SendMessageCommand: jest.fn().mockImplementation((input) => ({ input })),
    __mockSend: send,
  }
})

const sdk = jest.requireMock('@aws-sdk/client-sqs') as {
  __mockSend: jest.Mock
  SendMessageCommand: jest.Mock
}

async function buildService(env: { AWS_REGION: string; SQS_QUEUE_URL: string }) {
  const module = await Test.createTestingModule({
    providers: [
      SQSClientService,
      {
        provide: ConfigService,
        useValue: { get: (k: string) => (env as any)[k] },
      },
    ],
  }).compile()
  return module.get(SQSClientService)
}

describe('SQSClientService', () => {
  beforeEach(() => {
    sdk.__mockSend.mockClear()
    sdk.SendMessageCommand.mockClear()
  })

  it('throws on missing AWS_REGION', async () => {
    await expect(
      buildService({ AWS_REGION: '', SQS_QUEUE_URL: 'https://sqs/std' }),
    ).rejects.toThrow(/AWS_REGION/)
  })

  it('throws on missing SQS_QUEUE_URL', async () => {
    await expect(
      buildService({ AWS_REGION: 'us-east-1', SQS_QUEUE_URL: '' }),
    ).rejects.toThrow(/SQS_QUEUE_URL/)
  })

  // ── Standard queue: dedup id is silently ignored ───────────────────────

  it('standard queue: publish does NOT attach MessageDeduplicationId or MessageGroupId', async () => {
    const service = await buildService({
      AWS_REGION: 'us-east-1',
      SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/normalize',
    })

    await service.publish({ class_uid: 2004 }, 'job-uuid-1')

    expect(sdk.SendMessageCommand).toHaveBeenCalledTimes(1)
    const input = sdk.SendMessageCommand.mock.calls[0][0]
    expect(input.MessageDeduplicationId).toBeUndefined()
    expect(input.MessageGroupId).toBeUndefined()
    expect(input.MessageBody).toBe(JSON.stringify({ class_uid: 2004 }))
  })

  // ── FIFO queue: dedup id is forwarded ──────────────────────────────────

  it('FIFO queue: publish attaches MessageDeduplicationId from the dedupId arg', async () => {
    const service = await buildService({
      AWS_REGION: 'us-east-1',
      SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/normalize.fifo',
    })

    await service.publish({ class_uid: 2004 }, 'job-uuid-42')

    const input = sdk.SendMessageCommand.mock.calls[0][0]
    expect(input.MessageDeduplicationId).toBe('job-uuid-42')
    expect(input.MessageGroupId).toBeDefined() // FIFO requires a group id
  })

  it('FIFO queue: publish without dedupId omits the dedup fields (defensive)', async () => {
    const service = await buildService({
      AWS_REGION: 'us-east-1',
      SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/normalize.fifo',
    })

    await service.publish({ class_uid: 2004 })

    const input = sdk.SendMessageCommand.mock.calls[0][0]
    expect(input.MessageDeduplicationId).toBeUndefined()
  })

  // ── Return value ───────────────────────────────────────────────────────

  it('returns the SQS MessageId on successful send', async () => {
    const service = await buildService({
      AWS_REGION: 'us-east-1',
      SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/normalize',
    })

    const result = await service.publish({ class_uid: 2004 }, 'job-uuid-1')
    expect(result).toBe('mock-msg-id')
  })
})
