import { describe, expect, it } from 'vitest';
import { toUserMessage } from './errors';

describe('toUserMessage', () => {
  it.each([
    ['SEAT_TAKEN', '这个位置刚刚被其他玩家抢走了，请选择其他位置。'],
    ['NO_VOICE_PAIR_AVAILABLE', '这个时间段的 OOPZ 语音频道已经全部被预约，请换一个时间。'],
    ['ROOM_QUOTA_EXCEEDED', '你最多只能同时创建 3 个未来约战。'],
    ['BATRACE_UNAVAILABLE', '玩家资料服务暂时不可用，可跳过资料后继续。'],
  ])('maps %s to a stable Chinese message', (code, message) => {
    expect(toUserMessage({ message: code })).toBe(message);
  });

  it('does not leak unknown backend error details', () => {
    expect(toUserMessage({ message: 'relation private.secrets does not exist' })).toBe(
      '操作失败，请稍后重试。',
    );
  });
});
