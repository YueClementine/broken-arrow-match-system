const BEIJING_TIME_ZONE = 'Asia/Shanghai';
const MATCH_DURATION_MS = 45 * 60_000;

type DateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function partsFor(date: Date): DateParts {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return parts as DateParts;
}

function parseIso(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error('INVALID_DATE_TIME');
  }
  return date;
}

export function formatBeijingDateTime(iso: string): string {
  const { year, month, day, hour, minute } = partsFor(parseIso(iso));
  return `${year}年${month}月${day}日 ${hour}:${minute}（北京时间）`;
}

export function formatBeijingTimeRange(startIso: string): string {
  const start = parseIso(startIso);
  const end = new Date(start.getTime() + MATCH_DURATION_MS);
  const startParts = partsFor(start);
  const endParts = partsFor(end);
  const sameDay =
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day;
  const endLabel = sameDay
    ? `${endParts.hour}:${endParts.minute}`
    : `${endParts.month}月${endParts.day}日 ${endParts.hour}:${endParts.minute}`;

  return `${startParts.month}月${startParts.day}日 ${startParts.hour}:${startParts.minute} - ${endLabel}`;
}

export function beijingInputToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('INVALID_DATE_TIME');
  }
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute),
  );
  const iso = new Date(utc).toISOString();
  const roundTrip = partsFor(new Date(iso));
  if (
    roundTrip.year !== String(Number(year)) ||
    roundTrip.month !== String(Number(month)) ||
    roundTrip.day !== String(Number(day)) ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute
  ) {
    throw new Error('INVALID_DATE_TIME');
  }
  return iso;
}

export function beijingInputNowMinimum(now = new Date()): string {
  const future = new Date(now.getTime() + 60_000);
  const { year, month, day, hour, minute } = partsFor(future);
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour}:${minute}`;
}

export function isoToBeijingInput(iso: string): string {
  const { year, month, day, hour, minute } = partsFor(parseIso(iso));
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour}:${minute}`;
}
