/* Shared renderers for the 12 level types of protocol v1.
 * Each renderer gets (payload, submit) and returns a DOM node.
 * submit(answer) sends the answer object for the level type. */

(function () {
  const element = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, cls, onClick) => {
    const b = element('button', `btn ${cls || ''}`, label);
    b.addEventListener('click', onClick);
    return b;
  };
  const confirmButton = (onClick) => button('Lock in answer', 'primary block', onClick);

  const renderers = {
    word_search: (p, submit) => {
      const root = element('div');
      const grid = element('div', 'ws-grid');
      grid.style.gridTemplateColumns = `repeat(${p.grid[0].length}, 1fr)`;
      for (const row of p.grid) {
        for (const ch of row) {
          const cell = element('div', 'ws-cell', ch);
          cell.addEventListener('pointerdown', () => cell.classList.toggle('lit'));
          grid.append(cell);
        }
      }
      root.append(grid);
      root.append(element('p', 'muted', 'Find your answer in the grid, then tap it below.'));
      for (const option of p.options) {
        root.append(button(option, '', () => submit({ selected: option })));
        root.lastChild.style.margin = '4px 6px 4px 0';
      }
      return root;
    },
    doors: (p, submit) => {
      const root = element('div', 'door-list');
      for (const option of p.options) {
        const door = element('button', 'door');
        door.append(element('span', 'door-label', `🚪 ${option.label}`));
        if (option.description) door.append(element('span', 'door-desc', option.description));
        door.addEventListener('click', () => submit({ chosenId: option.id }));
        root.append(door);
      }
      return root;
    },
    this_or_that: (p, submit) => {
      const root = element('div', 'tot-card');
      const progress = element('div', 'tot-progress');
      const prompt = element('div', 'level-prompt');
      const buttons = element('div', 'tot-buttons');
      root.append(progress, prompt, buttons);
      const choices = [];
      let index = 0;
      const show = () => {
        const item = p.items[index];
        progress.textContent = `${index + 1} / ${p.items.length}`;
        prompt.textContent = item.prompt;
        buttons.replaceChildren(
          button(item.left, 'secondary', () => pick('left')),
          button(item.right, 'secondary', () => pick('right'))
        );
      };
      const pick = (side) => {
        choices.push({ id: p.items[index].id, side });
        index += 1;
        if (index >= p.items.length) submit({ choices });
        else show();
      };
      show();
      return root;
    },
  };

  /* 1. word_search: find your answer in the grid, tap the option to lock it in */

  /* 2. doors: pick one */

  /* 3. this_or_that: rapid fire binary choices */

  /* shared: toggleable chip set with confirm */
  function chipSelect(items, answerKey, submit, note) {
    const root = element('div');
    if (note) root.append(element('p', 'muted', note));
    const selected = new Set();
    for (const item of items) {
      const chip = element('button', 'chip', item.label);
      if (item.description) chip.title = item.description;
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        if (selected.has(item.id)) {
          selected.delete(item.id);
        } else {
          selected.add(item.id);
        }
      });
      root.append(chip);
    }
    root.append(confirmButton(() => submit({ [answerKey]: [...selected] })));
    return root;
  }

  /* 4. highlight_words */
  renderers.highlight_words = (p, submit) => chipSelect(p.items, 'selectedIds', submit, 'Tap everything that applies.');

  /* 5. loot_chest */
  renderers.loot_chest = (p, submit) =>
    chipSelect(p.items, 'selectedIds', submit, 'Drag it into your inventory: tap what you want to keep. 🧰');

  /* 6. match_pairs: tap left, then tap right */
  renderers.match_pairs = (p, submit) => {
    const root = element('div');
    root.append(element('p', 'muted', 'Tap a left item, then its match on the right.'));
    const cols = element('div', 'match-cols');
    const leftCol = element('div');
    const rightCol = element('div');
    cols.append(leftCol, rightCol);
    root.append(cols);
    const pairs = new Map();
    let active = null;
    const leftChips = new Map();
    for (const item of p.left) {
      const chip = element('button', 'chip', item.label);
      chip.addEventListener('click', () => {
        if (active) active.classList.remove('selected');
        active = chip;
        chip.classList.add('selected');
        chip.dataset.id = item.id;
      });
      chip.dataset.id = item.id;
      leftChips.set(item.id, chip);
      leftCol.append(chip);
    }
    for (const item of p.right) {
      const chip = element('button', 'chip', item.label);
      chip.addEventListener('click', () => {
        if (!active) return;
        pairs.set(active.dataset.id, item.id);
        leftChips.get(active.dataset.id).classList.remove('selected');
        leftChips.get(active.dataset.id).classList.add('paired');
        chip.classList.add('paired');
        active = null;
      });
      rightCol.append(chip);
    }
    root.append(
      confirmButton(() => {
        if (pairs.size < p.left.length) return; // every left item needs a match
        submit({ pairs: [...pairs].map(([leftId, rightId]) => ({ leftId, rightId })) });
      })
    );
    return root;
  };

  /* 7. sort_order: move items up and down */
  renderers.sort_order = (p, submit) => {
    const root = element('div');
    root.append(element('p', 'muted', 'Top is first. Move items into place.'));
    const list = element('div');
    root.append(list);
    const order = [...p.items];
    const draw = () => {
      list.replaceChildren(
        ...order.map((item, index) => {
          const row = element('div', 'sort-item');
          const up = element('button', 'mini-btn', '▲');
          const down = element('button', 'mini-btn', '▼');
          up.addEventListener('click', () => move(index, -1));
          down.addEventListener('click', () => move(index, 1));
          row.append(element('span', '', item.label), up, down);
          return row;
        })
      );
    };
    const move = (index, d) => {
      const index_ = index + d;
      if (index_ < 0 || index_ >= order.length) return;
      [order[index], order[index_]] = [order[index_], order[index]];
      draw();
    };
    draw();
    root.append(confirmButton(() => submit({ orderedIds: order.map((index) => index.id) })));
    return root;
  };

  /* 8. bucket_toss: pick a bucket per item */
  renderers.bucket_toss = (p, submit) => {
    const root = element('div');
    const placements = new Map();
    for (const item of p.items) {
      const row = element('div', 'bucket-row');
      row.append(element('span', 'item-label', item.label));
      const chips = [];
      for (const bucket of p.buckets) {
        const chip = element('button', 'chip', bucket.label);
        chip.addEventListener('click', () => {
          for (const c of chips) c.classList.remove('selected');
          chip.classList.add('selected');
          placements.set(item.id, bucket.id);
        });
        chips.push(chip);
        row.append(chip);
      }
      root.append(row);
    }
    root.append(
      confirmButton(() => {
        if (placements.size < p.items.length) return; // every item needs a bucket
        submit({ placements: [...placements].map(([itemId, bucketId]) => ({ itemId, bucketId })) });
      })
    );
    return root;
  };

  /* 9. fill_the_rune: template with a blank */
  renderers.fill_the_rune = (p, submit) => {
    const root = element('div');
    const [before, after] = p.template.split('___');
    const line = element('p', 'level-prompt');
    const input = element('input');
    input.type = 'text';
    input.style.width = '40%';
    input.style.display = 'inline-block';
    if (p.hint) input.placeholder = p.hint;
    line.append(document.createTextNode(before), input, document.createTextNode(after ?? ''));
    root.append(line);
    root.append(confirmButton(() => input.value && submit({ value: input.value })));
    return root;
  };

  /* 10. riddle: plain open question */
  renderers.riddle = (p, submit) => {
    const root = element('div');
    root.append(element('p', 'level-prompt', p.question));
    const input = element('textarea');
    if (p.placeholder) input.placeholder = p.placeholder;
    root.append(input);
    root.append(confirmButton(() => input.value && submit({ text: input.value })));
    return root;
  };

  /* 11. spot_the_bug: one span is flawed */
  renderers.spot_the_bug = (p, submit) => {
    const root = element('div');
    root.append(element('p', 'muted', 'One of these hides a flaw or a wrong assumption. Tap it.'));
    let selectedId = null;
    const chips = [];
    for (const span of p.spans) {
      const chip = element('button', 'chip', span.label);
      chip.addEventListener('click', () => {
        for (const c of chips) c.classList.remove('selected');
        chip.classList.add('selected');
        selectedId = span.id;
      });
      chips.push(chip);
      root.append(chip);
    }
    const note = element('input');
    note.type = 'text';
    note.placeholder = 'Optional: what is wrong here?';
    note.style.marginTop = '12px';
    root.append(note);
    root.append(confirmButton(() => selectedId && submit({ selectedId, note: note.value || undefined })));
    return root;
  };

  /* 12. boss: resolve every review finding */
  renderers.boss = (p, submit) => {
    const root = element('div');
    root.append(element('p', 'level-type', '☠ boss fight: the review'));
    const hp = element('div', 'boss-hp');
    const hpFill = element('div', 'boss-hp-fill');
    hpFill.style.width = '100%';
    hp.append(hpFill);
    root.append(hp);
    const finding = element('p', 'boss-finding');
    const buttons = element('div', 'boss-buttons');
    const correction = element('textarea');
    correction.placeholder = 'Your counter: how should it be?';
    correction.classList.add('hidden');
    root.append(finding, buttons, correction);
    const resolutions = [];
    let index = 0;
    const show = () => {
      const f = p.findings[index];
      finding.textContent = `Finding ${index + 1}/${p.findings.length}: ${f.text}`;
      correction.classList.add('hidden');
      correction.value = '';
      buttons.replaceChildren(
        button('🛡 Parry (accept)', 'secondary', () => resolve('accept')),
        button('✋ Block (reject)', 'danger', () => resolve('reject')),
        button('⚔ Counter', '', () => {
          correction.classList.remove('hidden');
          buttons.replaceChildren(
            button('Strike (send correction)', 'primary', () => {
              if (correction.value) resolve('correct', correction.value);
            })
          );
        })
      );
    };
    const resolve = (action, text) => {
      resolutions.push({ id: p.findings[index].id, action, correction: text });
      index += 1;
      hpFill.style.width = `${100 - (index / p.findings.length) * 100}%`;
      if (index >= p.findings.length) submit({ resolutions });
      else show();
    };
    show();
    return root;
  };

  globalThis.SpecQuestRenderers = renderers;
})();
