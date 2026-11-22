type SecureStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

type Slot = 'a' | 'b';
const maxChunks = 64;

export function createSessionStorage(store: SecureStorage) {
  let pending = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.then(() => undefined, () => undefined);
    return result;
  }

  async function readSlot(key: string): Promise<Slot | null> {
    const slot = await store.getItemAsync(key);
    if (slot === null || slot === 'a' || slot === 'b') return slot;
    throw new Error('Invalid Supabase session storage pointer.');
  }

  async function readCount(slotKey: string): Promise<number | null> {
    const value = await store.getItemAsync(slotKey);
    if (value === null) return 0;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > maxChunks || String(count) !== value) return null;
    return count;
  }

  async function clearSlot(slotKey: string, expectMetadata = false) {
    const storedCount = await readCount(slotKey);
    if (storedCount === 0 && !expectMetadata) return;
    // A damaged count cannot tell us which chunks exist. Keep the sweep bounded.
    const count = storedCount || maxChunks;
    if (storedCount === 0) await store.setItemAsync(slotKey, String(count));
    for (let index = 0; index < count; index += 1) {
      await store.deleteItemAsync(`${slotKey}.${index}`);
    }
    await store.deleteItemAsync(slotKey);
  }

  return {
    getItem: (key: string) => serialize(async () => {
      const slot = await readSlot(key);
      if (!slot) return null;
      const slotKey = `${key}.${slot}`;
      const count = await readCount(slotKey);
      if (!count) throw new Error('Missing or invalid Supabase session storage metadata.');

      let value = '';
      for (let index = 0; index < count; index += 1) {
        const chunk = await store.getItemAsync(`${slotKey}.${index}`);
        if (chunk === null) throw new Error('Incomplete Supabase session storage entry.');
        value += chunk;
      }
      return value;
    }),

    setItem: (key: string, value: string) => serialize(async () => {
      // A Unicode code point takes up to four UTF-8 bytes. Keep each item under 2 KB.
      const chunks = value.match(/.{1,450}/gsu) ?? [''];
      if (chunks.length > maxChunks) throw new Error('Supabase session exceeds secure storage capacity.');

      const previous = await readSlot(key);
      const next = previous === 'a' ? 'b' : 'a';
      const slotKey = `${key}.${next}`;
      await clearSlot(slotKey);
      // Write the count first so an interrupted write can be cleaned up. Switch only after all chunks exist.
      await store.setItemAsync(slotKey, String(chunks.length));
      for (const [index, chunk] of chunks.entries()) {
        await store.setItemAsync(`${slotKey}.${index}`, chunk);
      }
      await store.setItemAsync(key, next);

      // The write has committed. A failed cleanup is retried on the next write or removal.
      if (previous) await clearSlot(`${key}.${previous}`, true).catch(() => undefined);
    }),

    removeItem: (key: string) => serialize(async () => {
      const pointer = await store.getItemAsync(key);
      const invalidPointer = pointer !== null && pointer !== 'a' && pointer !== 'b';
      await store.deleteItemAsync(key);
      // Invalidate the session first, then attempt both cleanups before reporting a failure.
      const results = await Promise.allSettled((['a', 'b'] as const).map((slot) =>
        clearSlot(`${key}.${slot}`, pointer === slot || invalidPointer),
      ));
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
    }),
  };
}
