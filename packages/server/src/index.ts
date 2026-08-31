import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { RelayStore } from './relay-store.js';

const config = loadConfig();
const relayStore = await RelayStore.create(config.supersaveConnection);
const server = createApp(config, relayStore).listen(config.port, () => {
  console.log(`Spec Quest server ready on ${config.baseUrl.toString()}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await relayStore.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
