import { SLM_TRAINING_SYSTEM_PROMPT } from 'src/training-data/training-prompt.constant';

describe('SLM_TRAINING_SYSTEM_PROMPT', () => {
  // Loud canary so a future SLM prompt change at least produces a noisy
  // test failure here, forcing whoever changed it to update this constant.
  it('starts with the expected first sentence', () => {
    expect(SLM_TRAINING_SYSTEM_PROMPT.startsWith('You are a security log normalizer.')).toBe(true);
  });

  it('targets OCSF v1.7.0 Detection Finding (class_uid 2004)', () => {
    expect(SLM_TRAINING_SYSTEM_PROMPT).toContain('OCSF v1.7.0');
    expect(SLM_TRAINING_SYSTEM_PROMPT).toContain('class_uid: 2004');
  });

  it('contains the JSON-only output rule', () => {
    expect(SLM_TRAINING_SYSTEM_PROMPT).toContain('Output ONLY valid JSON');
  });
});
