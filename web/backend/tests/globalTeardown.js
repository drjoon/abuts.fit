// related files:
// - web/backend/jest.config.js
// - web/backend/tests/globalSetup.js
export default async function globalTeardown() {
  const replSet = globalThis.__abutsMemoryMongo;
  if (!replSet) return;
  globalThis.__abutsMemoryMongo = null;
  await replSet.stop();
}
