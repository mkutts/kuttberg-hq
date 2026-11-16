import { createSessionStorage } from '../src/supabase/sessionStorage';

function makeSecureStore() {
  const items = new Map<string, string>();
  return {
    items,
    getItemAsync: jest.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
}

test('round trips Unicode and large values through small secure items, then removes them', async () => {
  const store = makeSecureStore();
  const value = JSON.stringify({ user: '🙂'.repeat(451), session: 'a'.repeat(2100) });
  const storage = createSessionStorage(store);

  expect(await storage.getItem('auth')).toBeNull();
  await storage.setItem('auth', value);
  expect(await createSessionStorage(store).getItem('auth')).toBe(value);
  for (const chunk of store.items.values()) {
    expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(1800);
  }

  await storage.removeItem('auth');
  expect(await storage.getItem('auth')).toBeNull();
  expect(store.items.size).toBe(0);
});

test('preserves a committed value if writing a replacement fails and allows retries', async () => {
  const store = makeSecureStore();
  const storage = createSessionStorage(store);
  await storage.setItem('auth', 'old'.repeat(300));
  store.setItemAsync.mockImplementationOnce(async (key, value) => { store.items.set(key, value); });
  store.setItemAsync.mockRejectedValueOnce(new Error('write interrupted'));

  await expect(storage.setItem('auth', 'incomplete')).rejects.toThrow('write interrupted');
  expect(await storage.getItem('auth')).toBe('old'.repeat(300));
  await storage.setItem('auth', 'replacement');
  expect(await storage.getItem('auth')).toBe('replacement');
  expect([...store.items.values()].sort()).toEqual(['1', 'b', 'replacement']);
});

test('serializes concurrent replacements and removal', async () => {
  const store = makeSecureStore();
  const storage = createSessionStorage(store);
  const [, , value] = await Promise.all([
    storage.setItem('auth', 'first'),
    storage.setItem('auth', 'second'),
    storage.getItem('auth'),
    storage.removeItem('auth'),
  ]);
  expect(value).toBe('second');
  expect(store.items.size).toBe(0);
});

test.each([undefined, '0', '1e0', '65'])('removes chunks with damaged metadata (%s)', async (count) => {
  const store = makeSecureStore();
  const storage = createSessionStorage(store);
  await storage.setItem('auth', 'x'.repeat(1800));
  if (count === undefined) store.items.delete('auth.a');
  else store.items.set('auth.a', count);

  await expect(storage.getItem('auth')).rejects.toThrow('Missing or invalid Supabase session storage metadata');
  await storage.removeItem('auth');
  expect(store.items.size).toBe(0);
});

test('cleans both slots with an invalid pointer and retries a failed deletion after restart', async () => {
  const store = makeSecureStore();
  const storage = createSessionStorage(store);
  await storage.setItem('auth', 'current');
  store.items.set('auth', 'invalid');
  store.items.set('auth.b', '1');
  store.items.set('auth.b.0', 'interrupted replacement');
  const deleteItem = store.deleteItemAsync.getMockImplementation()!;
  store.deleteItemAsync.mockImplementation(async (key) => {
    if (key === 'auth.a.0') throw new Error('deletion interrupted');
    await deleteItem(key);
  });

  await expect(storage.getItem('auth')).rejects.toThrow('Invalid Supabase session storage pointer');
  await expect(storage.removeItem('auth')).rejects.toThrow('deletion interrupted');
  expect(await storage.getItem('auth')).toBeNull();
  expect([...store.items.keys()]).toEqual(['auth.a', 'auth.a.0']);

  store.deleteItemAsync.mockImplementation(deleteItem);
  await createSessionStorage(store).removeItem('auth');
  expect(store.items.size).toBe(0);
});
