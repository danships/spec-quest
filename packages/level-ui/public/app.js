/* Spec Quest web app: long-polls the server, renders the current level. */
(function () {
  const stage = document.querySelector('#stage');
  const scoreElement = document.querySelector('#score');
  const statsElement = document.querySelector('#run-stats');
  const titleElement = document.querySelector('#quest-title');
  const xpFill = document.querySelector('#xp-fill');
  const actionBar = document.querySelector('#action-bar');
  const steerInput = document.querySelector('#steer-input');
  const notifyButton = document.querySelector('#notify-btn');
  const authPanel = document.querySelector('#auth-panel');
  const loginLink = document.querySelector('#login-link');
  const authUser = document.querySelector('#auth-user');
  const logoutButton = document.querySelector('#logout-btn');
  const createRelayButton = document.querySelector('#create-relay-btn');
  const relaySetup = document.querySelector('#relay-setup');
  const relayEnvironment = document.querySelector('#relay-environment');
  const copyRelayButton = document.querySelector('#copy-relay-btn');

  const BONUS_WINDOW_MS = 120_000;
  let currentLevel = null;
  let renderedKey = null;
  let xpTimer = null;

  /* ---- optional remote-server authentication ---- */
  async function loadAuth() {
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) return;
      const auth = await response.json();
      authPanel.classList.remove('hidden');
      if (auth.authenticated) {
        authUser.textContent = `@${auth.user.login}`;
        authUser.classList.remove('hidden');
        createRelayButton.classList.remove('hidden');
        logoutButton.classList.remove('hidden');
      } else {
        loginLink.classList.remove('hidden');
      }
    } catch {
      // The local MCP server intentionally has no auth endpoint.
    }
  }

  logoutButton.addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST' });
    globalThis.location.reload();
  });

  createRelayButton.addEventListener('click', async () => {
    const response = await fetch('/api/relays', { method: 'POST' });
    if (!response.ok) {
      console.error(await response.text());
      return;
    }
    const relay = await response.json();
    relayEnvironment.textContent = [
      `SPECQUEST_REMOTE_URL=${globalThis.location.origin}`,
      `SPECQUEST_RELAY_ID=${relay.relayId}`,
      `SPECQUEST_RELAY_TOKEN=${relay.relayToken}`,
    ].join('\n');
    relaySetup.classList.remove('hidden');
  });

  copyRelayButton.addEventListener('click', async () => {
    await globalThis.navigator.clipboard.writeText(relayEnvironment.textContent);
    copyRelayButton.textContent = 'Copied';
  });

  /* ---- notifications ---- */
  notifyButton.addEventListener('click', async () => {
    if (!('Notification' in globalThis)) return;
    const permission = await Notification.requestPermission();
    notifyButton.textContent = permission === 'granted' ? '🔔✓' : '🔕';
  });
  function notifyNewLevel(level) {
    if (!('Notification' in globalThis) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    new Notification('Spec Quest', { body: `New level: ${level.prompt}` });
  }

  /* ---- api ---- */
  async function post(path, body) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!response.ok) console.error(await response.text());
  }

  function submitAnswer(answer) {
    if (!currentLevel) return;
    post(`/api/levels/${currentLevel.id}/answer`, { answer });
  }

  document.querySelector('#steer-btn').addEventListener('click', () => {
    if (!currentLevel || !steerInput.value) return;
    post(`/api/levels/${currentLevel.id}/steer`, { text: steerInput.value });
    steerInput.value = '';
  });
  document.querySelector('#reset-btn').addEventListener('click', () => {
    if (currentLevel) post(`/api/levels/${currentLevel.id}/reset`, {});
  });

  /* ---- xp/time-bonus bar ---- */
  function trackBonus(level) {
    clearInterval(xpTimer);
    if (!level) {
      xpFill.style.width = '0%';
      return;
    }
    const tick = () => {
      const left = Math.max(0, 1 - (Date.now() - level.createdAt) / BONUS_WINDOW_MS);
      xpFill.style.width = `${left * 100}%`;
      if (left <= 0) clearInterval(xpTimer);
    };
    tick();
    xpTimer = setInterval(tick, 1000);
  }

  /* ---- rendering ---- */
  function panel() {
    const node = document.createElement('section');
    node.className = 'panel';
    return node;
  }

  function renderEmpty(message, sub) {
    const node = panel();
    node.classList.add('center');
    node.innerHTML = `<p class="big-rune">⚔</p><p>${message}</p><p class="muted">${sub || ''}</p>`;
    stage.replaceChildren(node);
    actionBar.classList.add('hidden');
  }

  function renderVictory(session) {
    const node = panel();
    node.classList.add('victory');
    node.innerHTML = `
      <p class="big-rune">🏆</p>
      <p class="level-type">quest complete</p>
      <p class="score-final">${session.totalScore}</p>
      <p class="muted">${session.answered} levels · ${session.steers} steers · ${session.resets} resets</p>`;
    stage.replaceChildren(node);
    actionBar.classList.add('hidden');
  }

  function renderLevel(level) {
    const node = panel();
    const type = document.createElement('p');
    type.className = 'level-type';
    type.textContent = level.type.replaceAll('_', ' ');
    node.append(type);
    if (level.type !== 'riddle' && level.type !== 'fill_the_rune') {
      const prompt = document.createElement('p');
      prompt.className = 'level-prompt';
      prompt.textContent = level.prompt;
      node.append(prompt);
    }
    if (level.status === 'steered') {
      const wait = document.createElement('p');
      wait.className = 'muted';
      wait.textContent = '⏳ Steer sent. The quest master is thinking…';
      node.append(wait);
    } else {
      const renderer = globalThis.SpecQuestRenderers[level.type];
      node.append(renderer(level.payload, submitAnswer));
    }
    stage.replaceChildren(node);
    actionBar.classList.remove('hidden');
  }

  function apply(state) {
    if (state.session) {
      titleElement.textContent = state.session.title;
      scoreElement.textContent = state.session.totalScore;
      statsElement.textContent = `${state.session.answered} ⚑ · ${state.session.steers} ↝ · ${state.session.resets} ↺`;
    }
    const level = state.level;
    const key = level ? `${level.id}:${level.status}:${level.resetCount}` : 'none';
    if (key === renderedKey) return;
    renderedKey = key;
    const isNew = level && (!currentLevel || currentLevel.id !== level.id);
    currentLevel = level;
    trackBonus(level && level.status === 'pending' ? level : null);
    if (level) {
      renderLevel(level);
      if (isNew && level.status === 'pending') notifyNewLevel(level);
    } else if (state.session && state.session.finished) {
      renderVictory(state.session);
    } else if (state.session) {
      renderEmpty('Waiting for the next level…', 'The agent is working on the spec.');
    } else {
      renderEmpty('No quest is running.', 'Start a session from your agent and the first level appears here.');
    }
  }

  /* ---- main loop: long-poll, fall back to steady polling on errors ---- */
  async function loop() {
    let wait = '';
    for (;;) {
      try {
        const response = await fetch(`/api/state${wait}`);
        apply(await response.json());
        wait = '?wait=1';
      } catch {
        wait = '';
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  loadAuth();
  loop();
})();
