const KEY = "base-command:save";
const VERSION = 1;

export function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if ( !raw ) return null;
    var data = JSON.parse(raw);
    if ( data.version !== VERSION ) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, ...data }));
  } catch (e) {}
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
}
