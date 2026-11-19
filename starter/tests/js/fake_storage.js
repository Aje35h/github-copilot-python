// In-memory Storage stand-in for node --test. It can be told to throw like a
// blocked or full browser localStorage.
export function createFakeStorage(entries = {}, { failGet = false, failSet = false } = {}) {
  const items = new Map(Object.entries(entries));
  return {
    items,
    getItem(key) {
      if (failGet) {
        throw new Error('SecurityError');
      }
      return items.has(key) ? items.get(key) : null;
    },
    setItem(key, value) {
      if (failSet) {
        throw new Error('QuotaExceededError');
      }
      items.set(key, String(value));
    },
    removeItem(key) {
      if (failSet) {
        throw new Error('SecurityError');
      }
      items.delete(key);
    },
  };
}
