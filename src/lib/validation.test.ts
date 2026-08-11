import { describe, expect, it } from 'vitest';
import {
  validateNickname,
  validateNote,
  validateQQ,
  validateSeat,
  validateTitle,
} from './validation';

describe('form validation', () => {
  it.each(['12345', '123456789012'])('accepts valid QQ %s', (value) => {
    expect(validateQQ(value)).toBeNull();
  });

  it.each(['1234', '1234567890123', '12345a', ' 12345'])('rejects invalid QQ %s', (value) => {
    expect(validateQQ(value)).toBe('QQ 号需为 5～12 位数字。');
  });

  it('enforces trimmed title, nickname, and note lengths', () => {
    expect(validateTitle('')).toBe('请输入房间标题。');
    expect(validateTitle('A'.repeat(41))).toBe('房间标题最多 40 个字符。');
    expect(validateNickname('   ')).toBe('请输入游戏昵称。');
    expect(validateNickname('A'.repeat(31))).toBe('游戏昵称最多 30 个字符。');
    expect(validateNote('A'.repeat(301))).toBe('备注最多 300 个字符。');
  });

  it('accepts only A/B seats numbered 1 through 5', () => {
    expect(validateSeat('A', 1)).toBeNull();
    expect(validateSeat('B', 5)).toBeNull();
    expect(validateSeat('C', 1)).toBe('请选择有效座位。');
    expect(validateSeat('A', 6)).toBe('请选择有效座位。');
  });
});
