// src/queue/normalize.producer.spec.ts
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NormalizeProducer } from '../../src/queue/normalize.producer';
import { NORMALIZE_QUEUE } from '../../src/queue/queue-names';

describe('NormalizeProducer', () => {
  let producer: NormalizeProducer;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'some-bull-id' }) };

    const module = await Test.createTestingModule({
      providers: [
        NormalizeProducer,
        { provide: getQueueToken(NORMALIZE_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    producer = module.get(NormalizeProducer);
  });

  it('calls queue.add with jobId as both payload and BullMQ job ID', async () => {
    const jobId = 'abc-123';
    await producer.enqueue(jobId);

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      NORMALIZE_QUEUE,
      { jobId },
      expect.objectContaining({ jobId }),
    );
  });

  it('sets attempts: 1 (no retries in Week 1)', async () => {
    await producer.enqueue('any-id');

    const [, , options] = mockQueue.add.mock.calls[0];
    expect(options.attempts).toBe(1);
  });

  it('preserves BullMQ job history (removeOnComplete/Fail both false)', async () => {
    await producer.enqueue('any-id');

    const [, , options] = mockQueue.add.mock.calls[0];
    expect(options.removeOnComplete).toBe(false);
    expect(options.removeOnFail).toBe(false);
  });

  it('propagates queue.add errors to the caller', async () => {
    mockQueue.add.mockRejectedValueOnce(new Error('Redis connection refused'));

    await expect(producer.enqueue('any-id')).rejects.toThrow(
      'Redis connection refused',
    );
  });

  it('distinct jobIds produce distinct queue.add calls', async () => {
    await producer.enqueue('id-1');
    await producer.enqueue('id-2');

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
    expect(mockQueue.add.mock.calls[0][2].jobId).toBe('id-1');
    expect(mockQueue.add.mock.calls[1][2].jobId).toBe('id-2');
  });
});
