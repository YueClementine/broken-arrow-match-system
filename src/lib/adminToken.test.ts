import { describe, expect, it } from 'vitest';
import { captureAdminToken } from './adminToken';

describe('admin link capture', () => {
  it('stores the token for this tab and returns a clean search string', () => {
    const storage = new Map<string, string>();
    const clean = captureAdminToken('ABC123', '?admin=secret&from=share', {
      setItem: (key, value) => storage.set(key, value),
    });

    expect(storage.get('room-admin:ABC123')).toBe('secret');
    expect(clean).toBe('?from=share');
  });
});
