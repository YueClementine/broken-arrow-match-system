import { describe, expect, it } from 'vitest';
import {
  beijingInputToIso,
  formatBeijingDateTime,
  formatBeijingTimeRange,
  isoToBeijingInput,
} from './beijingTime';

describe('Beijing time utilities', () => {
  it('renders a 45-minute range in Asia/Shanghai regardless of host timezone', () => {
    expect(formatBeijingTimeRange('2026-08-12T13:00:00.000Z')).toBe(
      '8月12日 21:00 - 21:45',
    );
  });

  it('includes the end date when a match crosses midnight', () => {
    expect(formatBeijingTimeRange('2026-08-12T15:30:00.000Z')).toBe(
      '8月12日 23:30 - 8月13日 00:15',
    );
  });

  it('converts a Beijing datetime-local value to UTC', () => {
    expect(beijingInputToIso('2026-08-12T21:00')).toBe(
      '2026-08-12T13:00:00.000Z',
    );
  });

  it('formats a full date with an explicit Beijing suffix', () => {
    expect(formatBeijingDateTime('2026-08-12T13:00:00.000Z')).toBe(
      '2026年8月12日 21:00（北京时间）',
    );
  });

  it('converts an ISO timestamp back to a Beijing datetime-local value', () => {
    expect(isoToBeijingInput('2026-08-11T12:30:00.000Z')).toBe('2026-08-11T20:30');
  });
});
