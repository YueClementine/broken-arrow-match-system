export type Team = 'A' | 'B';

function characterLength(value: string): number {
  return Array.from(value.trim()).length;
}

export function validateQQ(value: string): string | null {
  return /^[0-9]{5,12}$/.test(value) ? null : 'QQ 号需为 5～12 位数字。';
}

export function validateNickname(value: string): string | null {
  const length = characterLength(value);
  if (length === 0) return '请输入游戏昵称。';
  if (length > 30) return '游戏昵称最多 30 个字符。';
  return null;
}

export function validateTitle(value: string): string | null {
  const length = characterLength(value);
  if (length === 0) return '请输入房间标题。';
  if (length > 40) return '房间标题最多 40 个字符。';
  return null;
}

export function validateNote(value: string): string | null {
  return characterLength(value) > 300 ? '备注最多 300 个字符。' : null;
}

export function validateSeat(team: string, seatNo: number): string | null {
  return (team === 'A' || team === 'B') && Number.isInteger(seatNo) && seatNo >= 1 && seatNo <= 5
    ? null
    : '请选择有效座位。';
}
