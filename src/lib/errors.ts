const ERROR_MESSAGES: Record<string, string> = {
  SEAT_TAKEN: '这个位置刚刚被其他玩家抢走了，请选择其他位置。',
  ALREADY_JOINED: '你已经加入了这个房间。',
  ROOM_NOT_FOUND: '没有找到这个房间。',
  ROOM_READ_ONLY: '本场约战已取消或已经开始，当前为只读状态。',
  ROOM_EXPIRED: '本场约战已经开始，无法继续报名。',
  ROOM_CANCELLED: '本场约战已被房主取消。',
  INVALID_ADMIN_TOKEN: '管理链接无效。',
  NO_VOICE_PAIR_AVAILABLE: '这个时间段的 OOPZ 语音频道已经全部被预约，请换一个时间。',
  ROOM_QUOTA_EXCEEDED: '你最多只能同时创建 3 个未来约战。',
  CREATE_COOLDOWN: '创建得太快了，请 30 秒后再试。',
  INVALID_QQ: 'QQ 号格式不正确。',
  INVALID_NICKNAME: '游戏昵称格式不正确。',
  INVALID_TITLE: '房间标题格式不正确。',
  INVALID_NOTE: '备注内容过长。',
  INVALID_START_TIME: '请选择未来 7 天内的比赛时间。',
  BATRACE_DISABLED: '玩家资料功能暂时关闭，可跳过资料后继续。',
  BATRACE_UNAVAILABLE: '玩家资料服务暂时不可用，可跳过资料后继续。',
  BATRACE_RATE_LIMITED: '玩家资料查询次数过多，请稍后再试。',
};

function extractCode(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message).split(/[:\n]/)[0].trim();
  }
  return '';
}

export function toUserMessage(error: unknown): string {
  const code = extractCode(error);
  return ERROR_MESSAGES[code] ?? '操作失败，请稍后重试。';
}
