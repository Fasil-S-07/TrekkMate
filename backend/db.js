// Minimal file-backed store (users + bookings). Swap for a real DB later;
// only read() and write() need to change.
import fs from 'fs';
const FILE = new URL('./data/store.json', import.meta.url);

export function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { users: [], bookings: [] }; }
}
export function write(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}
