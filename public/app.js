// Main Frontend Controller for "World of Irreversible Change" (Ren & Sora).

import { WORLD } from '/shared/config.js';
import { clamp, dist } from '/shared/dmath.js';
import { generateWorld } from '/shared/worldgen.js';
import { WorldRenderer } from '/renderer.js';
import { Soundscape } from '/audio.js';

const canvas = document.getElementById('world-canvas');
let currentSeed = WORLD.defaultSeed;
let world = generateWorld(currentSeed);
const renderer = new WorldRenderer(canvas, world);
const sound = new Soundscape();

let latestState = null;
let selectedCharId = 'char_ren';
let lanternMode = false;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ------------------------------------------------------------------ Camera Pan, Zoom & Click
let dragging = false;
let dragStart = { x: 0, y: 0 };
let camStart = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  camStart = { x: renderer.cam.targetX, y: renderer.cam.targetY };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  if (Math.hypot(dx, dy) > 4) {
    renderer.cam.followId = null;
    updateFollowButton();
  }
  renderer.cam.targetX = clamp(camStart.x - dx / renderer.cam.zoom, 30, world.N - 30);
  renderer.cam.targetY = clamp(camStart.y - dy / renderer.cam.zoom, 30, world.N - 30);
});

canvas.addEventListener('pointerup', async (e) => {
  if (!dragging) return;
  dragging = false;
  const moved = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
  if (moved < 5) {
    const wpos = renderer.screenToWorld(e.clientX, e.clientY);

    if (lanternMode) {
      const msgInput = document.getElementById('lantern-msg');
      const message = msgInput?.value || 'May warmth stay in this valley';
      await fetch('/api/lantern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: wpos.x, y: wpos.y, message }),
      });
      return;
    }

    // Check if user clicked on a character
    if (latestState?.characters) {
      let closest = null;
      let bestD = 18 / renderer.cam.zoom + 2.2;
      for (const c of latestState.characters) {
        const d = dist(wpos.x, wpos.y, c.x, c.y);
        if (d < bestD) {
          bestD = d;
          closest = c;
        }
      }
      if (closest) {
        selectCharacter(closest.id, true);
      }
    }
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.16 : 1 / 1.16;
    renderer.cam.targetZoom = clamp(renderer.cam.targetZoom * factor, 0.75, 22);
  },
  { passive: false }
);

// ------------------------------------------------------------------ Minimalist UI Expand / Collapse Toggle
const btnToggleUi = document.getElementById('btn-toggle-ui');
const uiToggleLabel = document.getElementById('ui-toggle-label');
const hudTop = document.getElementById('hud-top');
const inspectorPanel = document.getElementById('inspector-panel');
let uiExpanded = false;

function setUiExpanded(expanded) {
  uiExpanded = expanded;
  renderer.uiExpanded = expanded;
  hudTop.classList.toggle('hidden', !expanded);
  inspectorPanel.classList.toggle('hidden', !expanded);
  btnToggleUi.classList.toggle('active', expanded);
  if (uiToggleLabel) {
    uiToggleLabel.textContent = expanded ? '▴ Hide Panels' : '▾ Open Panels';
  }
  if (!expanded) {
    document.getElementById('chronicle-panel')?.classList.add('hidden');
    document.getElementById('btn-chronicle')?.classList.remove('active');
  }
}

btnToggleUi.addEventListener('click', () => {
  setUiExpanded(!uiExpanded);
});

// ------------------------------------------------------------------ HUD Controls
document.getElementById('btn-clearing').addEventListener('click', () => {
  renderer.cam.followId = null;
  renderer.centerOn(world.spawn.x, world.spawn.y, 10.5);
  updateFollowButton();
});

document.getElementById('btn-basin').addEventListener('click', () => {
  renderer.cam.followId = null;
  renderer.centerOn(world.N / 2, world.N / 2, 0.86);
  updateFollowButton();
});

const btnLantern = document.getElementById('btn-lantern');
const lanternBanner = document.getElementById('lantern-banner');
btnLantern.addEventListener('click', () => {
  lanternMode = !lanternMode;
  btnLantern.classList.toggle('active', lanternMode);
  lanternBanner.classList.toggle('hidden', !lanternMode);
});
document.getElementById('btn-cancel-lantern').addEventListener('click', () => {
  lanternMode = false;
  btnLantern.classList.remove('active');
  lanternBanner.classList.add('hidden');
});

const chroniclePanel = document.getElementById('chronicle-panel');
const btnChronicle = document.getElementById('btn-chronicle');
btnChronicle.addEventListener('click', () => {
  const hidden = chroniclePanel.classList.toggle('hidden');
  btnChronicle.classList.toggle('active', !hidden);
});
document.getElementById('btn-close-chronicle').addEventListener('click', () => {
  chroniclePanel.classList.add('hidden');
  btnChronicle.classList.remove('active');
});

const btnAudio = document.getElementById('btn-audio');
btnAudio.addEventListener('click', () => {
  const on = sound.toggle();
  btnAudio.textContent = on ? '♫ Sound: On' : '♫ Sound: Off';
  btnAudio.classList.toggle('active', on);
});

const btnFollow = document.getElementById('btn-follow-toggle');
btnFollow.addEventListener('click', () => {
  if (renderer.cam.followId === selectedCharId) {
    renderer.cam.followId = null;
  } else {
    renderer.cam.followId = selectedCharId;
    if (renderer.cam.targetZoom < 7) renderer.cam.targetZoom = 10.5;
  }
  updateFollowButton();
});

function updateFollowButton() {
  const following = renderer.cam.followId === selectedCharId;
  btnFollow.textContent = following ? 'Following ★' : 'Follow';
  btnFollow.classList.toggle('active', following);
}

// AI Settings Modal & Live AI Link Status Icon
const aiModal = document.getElementById('ai-modal');
const btnAiStatusMini = document.getElementById('btn-ai-status-mini');
const aiStatusDot = document.getElementById('ai-status-dot');
const aiStatusMiniText = document.getElementById('ai-status-mini-text');
const aiTestBanner = document.getElementById('ai-test-banner');
const inputGeminiKey = document.getElementById('input-gemini-key');
const inputGroqKey = document.getElementById('input-groq-key');

// Restore any previously saved API keys from browser localStorage and sync to server
const savedGemini = localStorage.getItem('woic_gemini_key') || '';
const savedGroq = localStorage.getItem('woic_groq_key') || '';
if (inputGeminiKey && savedGemini) inputGeminiKey.value = savedGemini;
if (inputGroqKey && savedGroq) inputGroq.value = savedGroq;

if (savedGemini || savedGroq) {
  fetch('/api/ai-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ geminiKey: savedGemini, groqKey: savedGroq }),
  })
    .then((r) => r.json())
    .then((res) => {
      if (res?.ai) updateAiStatusVisuals(res.ai);
    })
    .catch(() => {});
}

function openAiModal() {
  aiModal.classList.remove('hidden');
}

document.getElementById('btn-ai-settings').addEventListener('click', openAiModal);
btnAiStatusMini?.addEventListener('click', openAiModal);

document.getElementById('btn-close-modal').addEventListener('click', () => {
  aiModal.classList.add('hidden');
});

document.getElementById('btn-save-ai').addEventListener('click', async () => {
  const geminiKey = inputGeminiKey.value.trim();
  const groqKey = inputGroqKey.value.trim();
  localStorage.setItem('woic_gemini_key', geminiKey);
  localStorage.setItem('woic_groq_key', groqKey);

  if (aiTestBanner) {
    aiTestBanner.textContent = 'Testing AI API connection…';
  }

  const res = await fetch('/api/ai-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      geminiKey,
      groqKey,
      clearGeminiKey: !geminiKey,
      clearGroqKey: !groqKey,
    }),
  });
  const data = await res.json();
  if (data?.ai) {
    updateAiStatusVisuals(data.ai, data.error);
  }
});

function updateAiStatusVisuals(ai, customError = '') {
  if (!ai) return;
  const state = ai.linkState || 'standby';

  if (aiStatusDot) {
    aiStatusDot.className = `status-dot ${state}`;
  }

  if (aiStatusMiniText) {
    if (state === 'connected') {
      const label = ai.activeProvider === 'gemini'
        ? `Gemini Connected (${ai.activeModel || '2.5-flash'})`
        : `Groq Connected`;
      aiStatusMiniText.textContent = label;
    } else if (state === 'error') {
      aiStatusMiniText.textContent = `AI Key Error (${ai.lastError || 'Check Key'})`;
    } else if (state === 'cloud_free') {
      aiStatusMiniText.textContent = `AI: Free Cloud ✓`;
    } else {
      aiStatusMiniText.textContent = ai.hasGeminiKey ? 'AI: Gemini Ready' : 'AI: Ready';
    }
  }

  const aiPill = document.getElementById('ai-pill');
  if (aiPill) {
    aiPill.textContent = `AI: ${ai.providerStatus} (${ai.totalAiDecisions} thoughts)`;
  }

  if (aiTestBanner) {
    if (state === 'connected') {
      aiTestBanner.style.borderColor = '#42e685';
      aiTestBanner.style.color = '#d8ffe8';
      aiTestBanner.textContent = `✓ API Link Working! Connected to ${ai.activeModel || ai.providerStatus} (${ai.geminiSuccessCount || 1} successful calls).`;
    } else if (state === 'error' || customError) {
      aiTestBanner.style.borderColor = '#ff5c4d';
      aiTestBanner.style.color = '#ffd2cc';
      aiTestBanner.textContent = `✕ API Error: ${customError || ai.lastError || 'Could not reach model'}. Falling back automatically to Free Cloud LLM.`;
    } else if (state === 'cloud_free') {
      aiTestBanner.style.borderColor = '#f4d47c';
      aiTestBanner.style.color = '#f5ebd1';
      aiTestBanner.textContent = `● Connected to 100% Free Keyless Cloud LLM (${ai.totalAiDecisions} thoughts). Paste a Gemini or Groq key above for dedicated API calls.`;
    } else {
      aiTestBanner.textContent = `Status: ${ai.providerStatus}`;
    }
  }
}

// Full Reset Modal
const resetModal = document.getElementById('reset-modal');
document.getElementById('btn-reset-world').addEventListener('click', () => {
  resetModal.classList.remove('hidden');
});
document.getElementById('btn-close-reset').addEventListener('click', () => {
  resetModal.classList.add('hidden');
});

async function triggerFullReset(newSeed) {
  resetModal.classList.add('hidden');
  const res = await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newSeed }),
  });
  const data = await res.json();
  if (data?.ok && data.state) {
    updateUI(data.state);
    renderer.cam.followId = 'char_ren';
    renderer.centerOn(world.spawn.x, world.spawn.y, 11.5);
    updateFollowButton();
  }
}

document.getElementById('btn-confirm-reset-same').addEventListener('click', () => triggerFullReset(false));
document.getElementById('btn-confirm-reset-new').addEventListener('click', () => triggerFullReset(true));

// ------------------------------------------------------------------ UI State Updates
function selectCharacter(id, panTo = false) {
  selectedCharId = id;
  renderer.selectedCharId = id;
  if (panTo && latestState?.characters) {
    const c = latestState.characters.find((ch) => ch.id === id);
    if (c) {
      renderer.cam.followId = id;
      renderer.centerOn(c.x, c.y, Math.max(renderer.cam.targetZoom, 10));
    }
  }
  updateFollowButton();
  if (latestState) updateUI(latestState);
}

function updateUI(state) {
  latestState = state;

  // If the server's terrain seed changed (e.g. after Full Reset + New Terrain Map), regenerate client terrain scroll!
  if (state.seed && state.seed !== currentSeed) {
    currentSeed = state.seed;
    world = generateWorld(currentSeed);
    renderer.setWorld(world);
    renderer.centerOn(world.spawn.x, world.spawn.y, 11.5);
  }

  // 1. Top bar clock, weather, AI status
  const c = state.clock;
  if (c) {
    const h = String(Math.floor(c.hour)).padStart(2, '0');
    const m = String(Math.floor((c.hour % 1) * 60)).padStart(2, '0');
    const capSeason = c.season.charAt(0).toUpperCase() + c.season.slice(1);
    document.getElementById('clock-label').textContent = `Year ${c.year} · ${capSeason} Day ${c.dayOfSeason} · ${h}:${m}`;
  }

  const w = state.weather;
  if (w?.text) {
    document.getElementById('weather-pill').textContent = `${w.text.temp}°C · ${w.text.sky} · ${w.text.wind} · ${Math.round(w.humidity * 100)}% hum`;
  }

  if (state.ai) {
    updateAiStatusVisuals(state.ai);
  }

  // 2. Character switcher buttons
  const charBtnGroup = document.getElementById('char-buttons');
  if (state.characters) {
    charBtnGroup.innerHTML = '';
    for (const ch of state.characters) {
      const btn = document.createElement('button');
      btn.className = `hud-btn ${ch.id === selectedCharId ? 'active' : ''}`;
      btn.textContent = ch.name;
      btn.addEventListener('click', () => selectCharacter(ch.id, true));
      charBtnGroup.appendChild(btn);
    }
  }

  // 3. Selected Character Somatic & Mind Inspector
  const char = state.characters?.find((ch) => ch.id === selectedCharId) || state.characters?.[0];
  if (char) {
    selectedCharId = char.id;
    document.getElementById('insp-name').textContent = char.name;
    const parentText = char.parents?.length ? ` · Child of ${char.parents.join(' & ')}` : ' · Primordial Founder';
    const growthNote = char.ageYears < 18
      ? ` · Growing Child (${Math.round((char.growthScale || 0.5) * 100)}% height)`
      : '';
    document.getElementById('insp-subtitle').textContent = `Age ${char.ageYears < 18 ? char.ageYears.toFixed(1) : Math.floor(char.ageYears)} · Gen ${char.generation}${parentText}${growthNote}`;
    document.getElementById('insp-feeling').textContent = char.feeling || 'reflective';
    document.getElementById('insp-thought').textContent = `“${char.thought}”`;
    document.getElementById('insp-activity').textContent = `Currently: ${char.activity?.label || 'observing'} (${char.posture})`;

    // Somatic notes
    const notesUl = document.getElementById('insp-somatic-notes');
    notesUl.innerHTML = '';
    const notes = char.somaticNotes?.length
      ? char.somaticNotes
      : [{ text: 'Body feels calm, unhurried, and comfortable in the air.' }];
    for (const n of notes) {
      const li = document.createElement('li');
      li.textContent = n.text;
      notesUl.appendChild(li);
    }

    // Somatic bars
    const s = char.somatic || {};
    const barDefs = [
      ['Nourished', 1 - (s.hunger || 0)],
      ['Hydrated', 1 - (s.thirst || 0)],
      ['Rested', 1 - (s.fatigue || 0)],
      ['Body Warmth', s.bodyWarmth ?? 0.5],
      ['Shoulder/Back Ease', 1 - Math.max(s.shoulderAche || 0, s.lowerBackStiff || 0)],
      ['Spatial Comfort', 1 - (s.claustrophobia || 0)],
      ['Joint Comfort', 1 - (s.kneeJointAche || 0)],
      ['Coziness & Wonder', Math.max(s.coziness || 0, s.wonder || 0)],
    ];
    const barsEl = document.getElementById('insp-bars');
    barsEl.innerHTML = barDefs
      .map(
        ([label, val]) => `
      <div class="bar-item">
        <div class="bar-label"><span>${label}</span><span>${Math.round(clamp(val, 0, 1) * 100)}%</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(clamp(val, 0, 1) * 100)}%"></div></div>
      </div>`
      )
      .join('');

    // Relationships & Treatment History
    const bondsEl = document.getElementById('insp-bonds');
    if (bondsEl) {
      const bondEntries = Object.entries(char.bonds || {});
      if (bondEntries.length === 0) {
        bondsEl.innerHTML = `<span class="subtitle">No bonds formed yet.</span>`;
      } else {
        bondsEl.innerHTML = bondEntries
          .map(([otherId, b]) => {
            const other = state.characters?.find((c2) => c2.id === otherId);
            const otherName = other ? other.name : otherId;
            const trustPct = Math.round((b.trust ?? 0.55) * 100);
            const affPct = Math.round((b.affection ?? 0.55) * 100);
            const gratPct = Math.round((b.gratitude ?? 0.2) * 100);
            const resPct = Math.round((b.resentment ?? 0) * 100);
            const recentAct = b.recentActs?.[0]?.text
              ? `<div class="struct-meta" style="margin-top:3px;color:#ffdca0;">Last act: ${b.recentActs[0].text}</div>`
              : '';
            return `
            <div class="struct-card" style="cursor:default">
              <div class="struct-title">${otherName} · <span style="color:#ffdf88">${b.status || 'Companions'}</span></div>
              <div class="struct-meta">Trust ${trustPct}% · Affection ${affPct}% · Gratitude ${gratPct}%${resPct > 5 ? ` · Hurt/Strain ${resPct}%` : ''}</div>
              ${recentAct}
            </div>`;
          })
          .join('');
      }
    }

    // Known species
    const knownEntries = Object.values(char.knownSpecies || {});
    document.getElementById('insp-known-count').textContent = String(knownEntries.length);
    const knownEl = document.getElementById('insp-known-list');
    knownEl.innerHTML = knownEntries.length
      ? knownEntries
          .map((k) => `<span class="chip" title="${k.notes}">${k.givenName} (${k.edible})</span>`)
          .join('')
      : `<span class="subtitle">Blank slate — learning by touching, tasting &amp; observing…</span>`;

    // Tools & Inventory (plus physical log/bundle being dragged or carried!)
    const invEl = document.getElementById('insp-inventory');
    const haulDesc = char.hauling
      ? char.hauling.coCarrierId
        ? `🪵 Tandem Carrying w/ Partner: ${char.hauling.name}`
        : char.hauling.kind === 'small_log_chunk'
          ? `🪵 Carrying Billet: ${char.hauling.name}`
          : `🪵 Hauling: ${char.hauling.name}`
      : null;
    const swimPct = Math.round((char.swimSkill || 0) * 100);
    const allItems = [
      ...(haulDesc ? [`<span class="chip" style="border-color:#ffd86b;color:#fff2b8;">${haulDesc}</span>`] : []),
      ...(swimPct > 0 ? [`<span class="chip" title="Learned from wading &amp; swimming in water">🌊 Water Buoyancy: ${swimPct}%</span>`] : []),
      ...(char.tools || []).map((t) => `<span class="chip" title="${t.purpose}">🛠 ${t.name}</span>`),
      ...(char.inventory || []).map((i) => `<span class="chip">${i.name} (${i.part})</span>`),
    ];
    invEl.innerHTML = allItems.length ? allItems.join('') : `<span class="subtitle">Bare hands</span>`;

    // Memories
    const memUl = document.getElementById('insp-memories');
    memUl.innerHTML = (char.memories || [])
      .slice(0, 10)
      .map((m) => `<li><span class="memory-time">${m.time}</span>${m.text}</li>`)
      .join('');
  }

  // 4. Structures & Golden Chronicle
  if (state.structures) {
    document.getElementById('struct-count').textContent = String(state.structures.length);
    const stList = document.getElementById('struct-list');
    stList.innerHTML = state.structures.length
      ? state.structures
          .map(
            (st) => `
        <div class="struct-card" data-x="${st.x}" data-y="${st.y}">
          <div class="struct-title">${st.name} ${st.complete ? '✓' : `(${Math.round((st.progress || 0) * 100)}%)`}</div>
          <div class="struct-meta">${st.reason} · ${st.width.toFixed(1)}×${st.depth.toFixed(1)}m · headroom ${st.headroom.toFixed(1)}m</div>
        </div>`
          )
          .join('')
      : `<span class="subtitle">No structures erected yet — Ren &amp; Sora will conceive shelter and fire as needs arise.</span>`;

    stList.querySelectorAll('.struct-card').forEach((el) => {
      el.addEventListener('click', () => {
        renderer.cam.followId = null;
        renderer.centerOn(Number(el.dataset.x), Number(el.dataset.y), 13);
        updateFollowButton();
      });
    });
  }

  if (state.chronicle) {
    const chrUl = document.getElementById('chronicle-list');
    chrUl.innerHTML = state.chronicle
      .map(
        (e) => `
      <li data-x="${e.x || ''}" data-y="${e.y || ''}" style="cursor:${e.x ? 'pointer' : 'default'}">
        <span class="memory-time">${e.time}</span>
        ${e.text}
      </li>`
      )
      .join('');

    chrUl.querySelectorAll('li[data-x]').forEach((li) => {
      if (!li.dataset.x) return;
      li.addEventListener('click', () => {
        renderer.cam.followId = null;
        renderer.centerOn(Number(li.dataset.x), Number(li.dataset.y), 12);
        updateFollowButton();
      });
    });
  }
}

// ------------------------------------------------------------------ Live Server Connection (SSE)
function connectStream() {
  const es = new EventSource('/api/stream');
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      updateUI(data);
    } catch (e) {
      console.error('Stream parse error:', e);
    }
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectStream, 3000);
  };
}
connectStream();

// ------------------------------------------------------------------ 60 FPS Render Loop
const t0 = performance.now();
function frame(now) {
  const timeSec = (now - t0) / 1000;
  renderer.render(latestState, timeSec);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
