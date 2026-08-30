#!/usr/bin/env node
import { createApp } from './app.js';
import { PROTOCOL_VERSION } from './protocol.js';
import { SpecQuestState } from './state.js';

const port = Number(process.env.SPECQUEST_PORT ?? 4477);
const host = process.env.SPECQUEST_HOST ?? '127.0.0.1';
const state = new SpecQuestState({ stateDir: process.env.SPECQUEST_DIR });

state.restore();
createApp({ state }).listen(port, host, () => {
  console.log(`Spec Quest ready on http://${host}:${port} (protocol ${PROTOCOL_VERSION})`);
  console.log(`MCP endpoint: http://${host}:${port}/mcp`);
});
