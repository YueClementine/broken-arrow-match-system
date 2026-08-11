type TabStorage = Pick<Storage, 'setItem'>;

export function adminStorageKey(roomCode: string) {
  return `room-admin:${roomCode.toUpperCase()}`;
}

export function captureAdminToken(roomCode: string, search: string, storage: TabStorage): string {
  const parameters = new URLSearchParams(search);
  const token = parameters.get('admin');
  if (!token) return search;
  storage.setItem(adminStorageKey(roomCode), token);
  parameters.delete('admin');
  const clean = parameters.toString();
  return clean ? `?${clean}` : '';
}
