// The Autonomous AI Mind (System 2 Cognition).
// Connects each character's Somatic Matrix ("Flesh, Bone & Nerve"), Blank-Slate Epistemic Memory,
// Observation-Driven Causal Invention, Cooperative vs. Solo Timber Handling, Personal Space,
// and Emergent Water/Swimming Behavior to a cascading 100% free LLM pipeline.

import fs from 'node:fs';
import path from 'node:path';
import { T, TERRAIN_NAME } from '../../shared/config.js';
import { clamp, dist } from '../../shared/dmath.js';
import { SPECIES, lookOf, presentIn } from '../../shared/species.js';
import { sampleField, terrainAt } from '../../shared/worldgen.js';
import { describeSomaticNotes } from './somatic.js';
import {
  createStructureBlueprint,
  beginStructureImprovement,
  diagnoseShelterNeed,
  findShelterAt,
  fireWarmthAt,
} from './structures.js';
import { addMemory, say, deriveObservedQualities, preferredPersonalSpace, ensureBond } from './character.js';

const AI_CONFIG_FILE = path.resolve(process.cwd(), 'data', 'ai-config.json');

// Ordered list of current Google AI Studio free-tier Gemini 3.x / Flash-Lite / Gemma-4 models.
// Note: Google retired gemini-2.5-flash / 2.0-flash for new users (404 NotFound) and gemini-3.8-flash has a strict 20 RPD limit,
// whereas gemini-3.5-flash-lite, gemini-flash-lite-latest, gemini-3.1-flash-lite, gemini-3-flash-preview, and gemma-4-26b-a4b-it
// respond 200 OK with generous free-tier quotas!
const GEMINI_CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemma-4-26b-a4b-it',
  'gemini-3.8-flash',
];

const runtimeConfig = {
  geminiKey: process.env.GEMINI_API_KEY || '',
  groqKey: process.env.GROQ_API_KEY || '',
  useFreeCloudLlm: process.env.DISABLE_CLOUD_LLM !== '1',
  preferredGeminiModel: 'gemini-3.5-flash-lite',
  lastCloudCallMs: 0,
  minCloudIntervalMs: 12000,
  providerStatus: 'Ready',
  linkState: 'standby', // 'connected' | 'cloud_free' | 'error' | 'local' | 'standby'
  activeProvider: 'none', // 'gemini' | 'groq' | 'pollinations' | 'local'
  activeModel: '',
  lastSuccessMs: 0,
  lastError: '',
  totalAiDecisions: 0,
  geminiSuccessCount: 0,
  geminiErrorCount: 0,
};

function loadPersistedAiConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, 'utf8'));
      if (raw.geminiKey && !runtimeConfig.geminiKey) runtimeConfig.geminiKey = String(raw.geminiKey).trim();
      if (raw.groqKey && !runtimeConfig.groqKey) runtimeConfig.groqKey = String(raw.groqKey).trim();
      if (raw.preferredGeminiModel && GEMINI_CANDIDATE_MODELS.includes(raw.preferredGeminiModel)) {
        runtimeConfig.preferredGeminiModel = String(raw.preferredGeminiModel);
      }
    }
  } catch {
    // Ignore read errors
  }
}

function savePersistedAiConfig() {
  try {
    const dir = path.dirname(AI_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      AI_CONFIG_FILE,
      JSON.stringify(
        {
          geminiKey: runtimeConfig.geminiKey,
          groqKey: runtimeConfig.groqKey,
          preferredGeminiModel: runtimeConfig.preferredGeminiModel,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    // Ignore write errors
  }
}

loadPersistedAiConfig();
// Automatically verify the persisted AI key on server startup so the status icon turns green immediately!
setTimeout(() => {
  if (runtimeConfig.geminiKey || runtimeConfig.groqKey) {
    testAiConnection().catch(() => {});
  }
}, 200);

export function setAiConfig(opts = {}) {
  if (typeof opts.geminiKey === 'string' && opts.geminiKey.trim().length > 0) {
    runtimeConfig.geminiKey = opts.geminiKey.trim();
  } else if (opts.clearGeminiKey) {
    runtimeConfig.geminiKey = '';
  }
  if (typeof opts.groqKey === 'string' && opts.groqKey.trim().length > 0) {
    runtimeConfig.groqKey = opts.groqKey.trim();
  } else if (opts.clearGroqKey) {
    runtimeConfig.groqKey = '';
  }
  if (typeof opts.useFreeCloudLlm === 'boolean') {
    runtimeConfig.useFreeCloudLlm = opts.useFreeCloudLlm;
  }
  savePersistedAiConfig();
}

export function getAiStatus() {
  return {
    hasGeminiKey: Boolean(runtimeConfig.geminiKey),
    hasGroqKey: Boolean(runtimeConfig.groqKey),
    useFreeCloudLlm: runtimeConfig.useFreeCloudLlm,
    providerStatus: runtimeConfig.providerStatus,
    linkState: runtimeConfig.linkState,
    activeProvider: runtimeConfig.activeProvider,
    activeModel: runtimeConfig.activeModel,
    lastSuccessMs: runtimeConfig.lastSuccessMs,
    lastError: runtimeConfig.lastError,
    totalAiDecisions: runtimeConfig.totalAiDecisions,
    geminiSuccessCount: runtimeConfig.geminiSuccessCount,
    geminiErrorCount: runtimeConfig.geminiErrorCount,
  };
}

/**
 * Immediately tests the configured AI link (Gemini -> Groq -> Free Cloud) and updates `getAiStatus()`.
 */
export async function testAiConnection() {
  const testPrompt = 'Respond ONLY with valid JSON: {"ok":true,"thought":"The forest breeze is calm."}';
  if (runtimeConfig.geminiKey) {
    const text = await callGeminiFree(testPrompt, runtimeConfig.geminiKey);
    if (text) {
      return { ok: true, status: getAiStatus() };
    }
    return { ok: false, error: runtimeConfig.lastError || 'Gemini API request failed', status: getAiStatus() };
  }
  if (runtimeConfig.groqKey) {
    const text = await callGroqFree(testPrompt, runtimeConfig.groqKey);
    if (text) {
      return { ok: true, status: getAiStatus() };
    }
    return { ok: false, error: runtimeConfig.lastError || 'Groq API request failed', status: getAiStatus() };
  }
  if (runtimeConfig.useFreeCloudLlm) {
    const text = await callPollinationsFree(testPrompt);
    if (text) {
      return { ok: true, status: getAiStatus() };
    }
  }
  return { ok: false, error: 'No API key configured', status: getAiStatus() };
}

/**
 * Scans the world around `char` to gather visible flora, water, ground items, and structures.
 */
export function perceiveSurroundings(char, ctx) {
  const { world, floraGrid, clock, structures, characters, groundItems = [] } = ctx;
  const season = clock.season;
  const nearbyFlora = [];
  const radius = 38;
  const nowMs = Date.now();

  floraGrid.query(char.x - radius, char.y - radius, char.x + radius, char.y + radius, (f) => {
    if (f.removed) return;
    if (!presentIn(f.s, season)) return;
    const d = dist(char.x, char.y, f.x, f.y);
    if (d <= radius) nearbyFlora.push({ ...f, d });
  });
  nearbyFlora.sort((a, b) => a.d - b.d);

  // Closest dry bank spot next to water (1.2 <= sd <= 2.4 so they don't stand IN deep water!)
  let nearestWater = null;
  let bestWaterDist = 999;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    for (const step of [3, 7, 14, 24, 38, 56]) {
      const tx = char.x + Math.cos(a) * step;
      const ty = char.y + Math.sin(a) * step;
      const sd = sampleField(world, world.water, tx, ty);
      if (sd >= 0.8 && sd <= 2.4 && step < bestWaterDist) {
        bestWaterDist = step;
        nearestWater = { x: tx, y: ty, d: step };
      }
    }
  }

  const others = characters
    .filter((c) => c.id !== char.id && c.alive)
    .map((c) => ({ char: c, d: dist(char.x, char.y, c.x, c.y) }))
    .sort((a, b) => a.d - b.d);

  const localStructures = structures
    .map((s) => ({ structure: s, d: dist(char.x, char.y, s.x, s.y) }))
    .sort((a, b) => a.d - b.d);

  // Only perceive ground items whose falling-tree animation has finished!
  const nearbyGroundItems = groundItems
    .filter((g) => !g.visibleAfterMs || nowMs >= g.visibleAfterMs)
    .map((g) => ({ item: g, d: dist(char.x, char.y, g.x, g.y) }))
    .sort((a, b) => a.d - b.d);

  return {
    season,
    terrain: terrainAt(world, char.x, char.y),
    nearbyFlora: nearbyFlora.slice(0, 22),
    nearestWater,
    others,
    localStructures,
    nearbyGroundItems,
    insideShelter: findShelterAt(structures, char.x, char.y),
    nearFireWarmth: fireWarmthAt(structures, char.x, char.y),
  };
}

function findKnownWithQuality(char, quality) {
  for (const [spKey, info] of Object.entries(char.knownSpecies || {})) {
    const quals = info.qualities || deriveObservedQualities(spKey);
    if (quals.includes(quality)) {
      return { spKey, ...info, qualities: quals };
    }
  }
  return null;
}

export async function decideNextAction(char, ctx) {
  if (char.aiPending || !char.alive) return;
  if (char.hauling && char.activity?.type === 'deliver_haul') return;
  if (char.activity?.type === 'swim_to_shore' && char.waterDepth > 0.35) return;
  char.aiPending = true;

  try {
    const perc = perceiveSurroundings(char, ctx);
    const partnerDist = perc.others[0]?.d ?? 999;
    const env = {
      weather: ctx.weather,
      clock: ctx.clock,
      terrain: perc.terrain,
      nearFireWarmth: perc.nearFireWarmth,
      insideShelter: perc.insideShelter,
      partnerDist,
      nearestPartner: perc.others[0]?.char || null,
      slope: 0,
    };
    const somaticNotes = describeSomaticNotes(char, env);
    const options = buildSituatedOptions(char, perc, somaticNotes, ctx);

    const nowMs = Date.now();
    const canCallCloud =
      (runtimeConfig.geminiKey || runtimeConfig.groqKey || runtimeConfig.useFreeCloudLlm) &&
      nowMs - runtimeConfig.lastCloudCallMs >= runtimeConfig.minCloudIntervalMs;

    let chosen = null;
    if (canCallCloud && options.length > 1) {
      runtimeConfig.lastCloudCallMs = nowMs;
      chosen = await queryCloudMind(char, perc, somaticNotes, options, ctx).catch(() => null);
    }

    if (!chosen) {
      chosen = deliberateLocally(char, perc, somaticNotes, options);
    }

    applyDecision(char, chosen, perc, ctx);
    char.lastAiSimSec = ctx.clock.simSeconds;
    runtimeConfig.totalAiDecisions++;
  } finally {
    char.aiPending = false;
  }
}

/**
 * Generates physical construction & timber-handling options for `st`, including:
 *   - Asking partner for help chopping a fallen trunk (`ask_help_chop`)
 *   - Asking partner for help carrying a heavy log (`ask_help_carry`)
 *   - Cutting the fallen trunk into smaller, easier-to-carry chunks (`cut_small_chunks`)
 *   - Doing the heavy chop/haul solo (`solo_chop_haul`)
 * weighted by their physical feelings (back/shoulder soreness, fatigue) and relationship feelings!
 */
function pushPhysicalConstructionOptions(opts, char, st, perc, ctx, basePriority, customReason) {
  const isMod = Boolean(st.pendingMod);
  const chunksDone = isMod ? st.pendingMod.chunksDelivered : st.chunksDelivered;
  const chunksReq = isMod ? st.pendingMod.chunksRequired : st.chunksRequired;
  const needsMoreChunks = chunksDone < chunksReq;
  const isTimberStructure = st.kind === 'shelter' || st.kind === 'bridge' || st.kind === 'pavilion' || isMod;

  const s = char.somatic;
  const bodySoreness = Math.max(s.shoulderAche || 0, s.lowerBackStiff || 0, s.fatigue || 0);
  const partnerEntry = perc.others[0];
  const partner = partnerEntry?.char;
  const bond = partner ? ensureBond(char, partner) : null;
  const warmBond = bond && bond.trust > 0.56 && bond.affection > 0.56 && bond.resentment < 0.22;
  const strainedBond = !bond || bond.resentment >= 0.22 || bond.trust < 0.45;

  if (needsMoreChunks) {
    // 1. Are there already cut log chunks / bundles lying on the ground waiting to be hauled?
    const cutChunk = perc.nearbyGroundItems.find(
      (g) => g.item.kind === 'log_chunk' || g.item.kind === 'small_log_chunk' || g.item.kind === 'reed_bundle' || g.item.kind === 'stone_chunk'
    );
    if (cutChunk) {
      const isHeavyLog = cutChunk.item.kind === 'log_chunk';

      // Option 1A: Ask partner to help carry the other end of this heavy log!
      if (isHeavyLog && partner && partnerEntry.d < 32 && warmBond) {
        opts.push({
          id: `ask_help_carry_${st.id}`,
          priority: basePriority + 0.09 + (bodySoreness > 0.25 ? 0.06 : 0),
          summary: `Ask ${partner.name} to help carry the other end of the heavy ${cutChunk.item.name} to ${st.name} so neither of you strains your back`,
          apply: () => ({
            type: 'pickup_and_haul',
            label: `asking ${partner.name} to help carry ${cutChunk.item.name}`,
            groundItemId: cutChunk.item.id,
            coCarryWithPartner: true,
            structureId: st.id,
            targetX: cutChunk.item.x,
            targetY: cutChunk.item.y,
            arriveRadius: 1.4,
            durationSimSec: 230,
          }),
          defaultThought: `That ${cutChunk.item.name} is heavy, and I trust ${partner.name}. I'll ask them to lift the other end with me so we can carry it to ${st.name} together.`,
          defaultFeeling: 'cooperative and trusting',
        });
      }

      // Option 1B: Haul the chunk solo
      opts.push({
        id: `haul_solo_${st.id}`,
        priority: basePriority + 0.06 + (strainedBond || cutChunk.item.kind === 'small_log_chunk' ? 0.05 : 0),
        summary: `Walk to the ${cutChunk.item.name} (${Math.round(cutChunk.d)}m away) and haul it to ${st.name} by yourself (${chunksDone}/${chunksReq} chunks)`,
        apply: () => ({
          type: 'pickup_and_haul',
          label: `pulling ${cutChunk.item.name} to ${st.name}`,
          groundItemId: cutChunk.item.id,
          coCarryWithPartner: false,
          structureId: st.id,
          targetX: cutChunk.item.x,
          targetY: cutChunk.item.y,
          arriveRadius: 1.4,
          durationSimSec: 250,
        }),
        defaultThought:
          cutChunk.item.kind === 'small_log_chunk'
            ? `Because this ${cutChunk.item.name} was cut smaller, I can carry it over to ${st.name} easily on my own.`
            : strainedBond && partner
              ? `Things feel a bit tense with ${partner.name}, so I'd rather just drag this ${cutChunk.item.name} to ${st.name} by myself.`
              : `I have enough strength left to pull this ${cutChunk.item.name} over to ${st.name} on my own.`,
        defaultFeeling: 'determined',
      });
      return;
    }

    // 2. Is there a felled tree trunk on the ground waiting to be chopped/bucked?
    //    Give the character the 4 rich choices based on their physical feelings and relationship!
    const felledTrunk = perc.nearbyGroundItems.find((g) => g.item.kind === 'felled_trunk');
    if (felledTrunk) {
      // Choice 2A: Ask partner for help chopping the fallen trunk together
      if (partner && partnerEntry.d < 35 && warmBond) {
        opts.push({
          id: `ask_help_chop_${st.id}`,
          priority: basePriority + 0.08 + (bodySoreness > 0.22 ? 0.05 : 0) + (bond.affection - 0.5) * 0.1,
          summary: `Call ${partner.name} over to help chop the fallen ${felledTrunk.item.name} into logs and carry them together to ${st.name}`,
          apply: () => ({
            type: 'co_buck_tree',
            label: `chopping ${felledTrunk.item.name} together with ${partner.name}`,
            trunkId: felledTrunk.item.id,
            smallChunks: false,
            coCarryNext: true,
            structureId: st.id,
            targetX: felledTrunk.item.x - 0.6,
            targetY: felledTrunk.item.y,
            arriveRadius: 1.5,
            durationSimSec: char.tools.length > 0 ? 115 : 155,
          }),
          defaultThought: `My shoulders already feel the work of felling that tree, and I feel close to ${partner.name}—I'll ask them to help me chop the ${felledTrunk.item.name} and carry the logs together.`,
          defaultFeeling: 'grateful for company',
        });
      }

      // Choice 2B: Cut the fallen trunk into SMALLER, lighter chunks so it is much easier to carry solo!
      opts.push({
        id: `cut_small_chunks_${st.id}`,
        priority: basePriority + 0.07 + (bodySoreness > 0.24 || strainedBond ? 0.07 : 0),
        summary: `Cut the fallen ${felledTrunk.item.name} into smaller, lighter billets so they are easy to carry to ${st.name} without straining your back`,
        apply: () => ({
          type: 'buck_tree',
          label: `cutting ${felledTrunk.item.name} into smaller, easy-to-carry chunks`,
          trunkId: felledTrunk.item.id,
          smallChunks: true,
          coCarryNext: false,
          structureId: st.id,
          targetX: felledTrunk.item.x,
          targetY: felledTrunk.item.y,
          arriveRadius: 1.5,
          durationSimSec: char.tools.length > 0 ? 175 : 230,
        }),
        defaultThought:
          bodySoreness > 0.24
            ? `My back and shoulders are aching. If I take my time and cut this ${felledTrunk.item.name} into smaller chunks, I can carry them to ${st.name} without hurting myself.`
            : `I'll cut the fallen ${felledTrunk.item.name} into smaller, manageable sections so I can haul them easily by myself.`,
        defaultFeeling: 'methodical and careful',
      });

      // Choice 2C: Do the heavy chopping & hauling all by themselves in big sections
      opts.push({
        id: `solo_heavy_chop_${st.id}`,
        priority: basePriority + 0.05 + (bodySoreness < 0.2 ? 0.05 : -0.04),
        summary: `Chop the fallen ${felledTrunk.item.name} into heavy logs and drag them all by yourself to ${st.name}`,
        apply: () => ({
          type: 'buck_tree',
          label: `cutting ${felledTrunk.item.name} into heavy logs solo`,
          trunkId: felledTrunk.item.id,
          smallChunks: false,
          coCarryNext: false,
          structureId: st.id,
          targetX: felledTrunk.item.x,
          targetY: felledTrunk.item.y,
          arriveRadius: 1.5,
          durationSimSec: char.tools.length > 0 ? 145 : 200,
        }),
        defaultThought: `My body feels strong right now—I'll chop this ${felledTrunk.item.name} into big timber logs and drag them over to ${st.name} myself.`,
        defaultFeeling: 'self-reliant',
      });
      return;
    }

    // 3. If it's a timber structure and no trunk/chunk is on the ground yet, walk to a standing tree and chop it down!
    if (isTimberStructure) {
      const standingTree = perc.nearbyFlora.find(
        (f) => !f.removed && SPECIES[f.s]?.kind === 'tree' && (char.knownSpecies[f.s] || SPECIES[f.s]?.material?.timber)
      );
      if (standingTree) {
        const treeName = char.knownSpecies[standingTree.s]?.givenName || lookOf(standingTree.s, perc.season);
        opts.push({
          id: `fell_tree_${st.id}`,
          priority: basePriority + 0.04,
          summary: `Walk to the standing ${treeName} (${Math.round(standingTree.d)}m away) and chop it down for ${st.name} (${chunksDone}/${chunksReq} chunks)`,
          apply: () => ({
            type: 'fell_tree',
            label: `felling ${treeName} for timber`,
            treeItem: standingTree,
            structureId: st.id,
            reason: customReason || `to get timber logs for ${st.name}`,
            targetX: standingTree.x - 0.9,
            targetY: standingTree.y + 0.3,
            arriveRadius: 1.5,
            durationSimSec: char.tools.length > 0 ? 160 : 220,
          }),
          defaultThought: `To build ${st.name}, we need timber. I remember how solid the ${treeName} felt—I will walk over and chop it down.`,
          defaultFeeling: 'determined',
        });
        return;
      }
    }

    // 4. Otherwise (windbreak, fire), bundle reeds/fronds/stones and haul them
    const matFlora =
      perc.nearbyFlora.find((f) => !f.removed && char.knownSpecies[f.s] && SPECIES[f.s]?.kind !== 'tree') ||
      perc.nearbyFlora.find((f) => !f.removed && SPECIES[f.s]?.material);
    if (matFlora) {
      const matName = char.knownSpecies[matFlora.s]?.givenName || lookOf(matFlora.s, perc.season);
      opts.push({
        id: `bundle_haul_${st.id}`,
        priority: basePriority + 0.03,
        summary: `Walk to ${matName} (${Math.round(matFlora.d)}m away), bind a bundle, and pull it back to ${st.name} (${chunksDone}/${chunksReq} chunks)`,
        apply: () => ({
          type: 'gather_bundle',
          label: `bundling ${matName} to haul`,
          floraItem: matFlora,
          structureId: st.id,
          targetX: matFlora.x,
          targetY: matFlora.y,
          arriveRadius: 1.5,
          durationSimSec: 150,
        }),
        defaultThought: `I'll walk over to the ${matName} I noticed earlier, bind a thick bundle of it, and haul it back to ${st.name}.`,
        defaultFeeling: 'purposeful',
      });
      return;
    }
  }

  // All required chunks delivered: fit & lash at the structure site (respecting personal space around the site!)
  const label = isMod
    ? `assembling ${st.name}: ${st.pendingMod.description}`
    : `fitting logs on ${st.name} (${Math.round(st.progress * 100)}%)`;
  opts.push({
    id: `assemble_${st.id}`,
    priority: basePriority,
    summary: `Fit and lash the hauled materials at ${st.name} (${label})`,
    apply: () => ({
      type: 'build',
      label,
      structureId: st.id,
      targetX: st.x + (char.sex === 'f' ? 1.5 : -1.5),
      targetY: st.y + 0.9,
      arriveRadius: 2.0,
      durationSimSec: 185,
    }),
    defaultThought: `Now that we have hauled the materials over to ${st.name}, I can fit and bind them together.`,
    defaultFeeling: 'patiently working',
  });
}

function buildSituatedOptions(char, perc, somaticNotes, ctx) {
  const { clock, weather, structures, collectiveKnowledge } = ctx;
  const s = char.somatic;
  const opts = [];
  const season = clock.season;
  const partnerEntry = perc.others[0];
  const partner = partnerEntry?.char;
  const spaceDist = partner ? preferredPersonalSpace(char, partner) : 3.5;

  // 1. Drink water at the dry bank edge if thirsty
  if (perc.nearestWater && (s.thirst > 0.28 || perc.nearestWater.d < 10)) {
    opts.push({
      id: 'drink_water',
      priority: s.thirst > 0.65 ? 0.96 : s.thirst > 0.4 ? 0.72 : 0.35,
      summary: `Walk to the riverbank (${Math.round(perc.nearestWater.d)}m away) and cup cool water to drink`,
      apply: () => ({
        type: 'drink',
        label: 'drinking cool water at the bank',
        targetX: perc.nearestWater.x,
        targetY: perc.nearestWater.y,
        arriveRadius: 1.8,
        durationSimSec: 110,
      }),
      defaultThought: 'My mouth feels dry. The sound of the water draws me to the bank to drink.',
      defaultFeeling: 'parched',
    });
  }

  // 2. Empathetic Food Sharing
  const carriedFood = char.inventory.find((it) => it.kind === 'food');
  if (partnerEntry && carriedFood && partner.somatic.hunger > 0.48 && s.hunger < 0.78) {
    opts.push({
      id: 'share_food_partner',
      priority: partner.somatic.hunger > 0.68 ? 0.91 : 0.76,
      summary: `Bring the ${carriedFood.name} you are carrying over to ${partner.name} (${Math.round(partnerEntry.d)}m away) because they look hungry`,
      apply: () => ({
        type: 'share_food',
        label: `bringing ${carriedFood.name} to ${partner.name}`,
        targetX: partner.x + (char.sex === 'f' ? 1.4 : -1.4),
        targetY: partner.y + 0.4,
        arriveRadius: 2.2,
        durationSimSec: 130,
      }),
      defaultThought: `${partner.name} looks pale and hungry. Before I eat alone, I want to walk over and share this ${carriedFood.name} with them.`,
      defaultFeeling: 'caring and generous',
    });
  }

  // 3. Eat carried food if hungry
  if (carriedFood && s.hunger > 0.35) {
    opts.push({
      id: 'eat_carried',
      priority: s.hunger > 0.7 ? 0.94 : 0.68,
      summary: `Sit down and eat the ${carriedFood.part} (${carriedFood.name}) you are carrying`,
      apply: () => ({
        type: 'eat',
        label: `eating ${carriedFood.name}`,
        durationSimSec: 120,
      }),
      defaultThought: `My stomach is rumbling. I'll sit and eat the ${carriedFood.name} I gathered earlier.`,
      defaultFeeling: 'hungry',
    });
  }

  // 4. Comfort / tend partner if partner is hurting
  if (partnerEntry) {
    const ps = partner.somatic;
    const partnerHurting = ps.nausea > 0.25 || ps.poisonLoad > 0.2 || ps.shoulderAche > 0.38 || ps.exposureDread > 0.42;
    if (partnerHurting) {
      opts.push({
        id: 'comfort_partner',
        priority: 0.81,
        summary: `Walk over to ${partner.name} (${Math.round(partnerEntry.d)}m away) to comfort them and ease their aching body`,
        apply: () => ({
          type: 'comfort_partner',
          label: `tending and comforting ${partner.name}`,
          targetX: partner.x + (char.sex === 'f' ? 1.4 : -1.4),
          targetY: partner.y + 0.4,
          arriveRadius: 2.2,
          durationSimSec: 160,
        }),
        defaultThought: `I can see ${partner.name} wincing with discomfort. I want to sit beside them, rub their aching shoulders, and help them through it.`,
        defaultFeeling: 'protective and tender',
      });
    }
  }

  // 5. Forage from a KNOWN safe edible plant nearby
  const knownEdibleFlora = perc.nearbyFlora.find((f) => {
    const kn = char.knownSpecies[f.s];
    const hasFoodNow = (SPECIES[f.s]?.food?.[season]?.length || 0) > 0;
    return kn && (kn.edible === 'safe' || kn.edible === 'bitter-raw') && hasFoodNow;
  });
  if (knownEdibleFlora && (s.hunger > 0.3 || char.inventory.filter((i) => i.kind === 'food').length < 2)) {
    const kn = char.knownSpecies[knownEdibleFlora.s];
    opts.push({
      id: 'forage_known',
      priority: s.hunger > 0.65 ? 0.9 : 0.62,
      summary: `Gather food from the known "${kn.givenName}" (${Math.round(knownEdibleFlora.d)}m away)`,
      apply: () => ({
        type: 'forage',
        label: `gathering from ${kn.givenName}`,
        targetX: knownEdibleFlora.x,
        targetY: knownEdibleFlora.y,
        floraItem: knownEdibleFlora,
        arriveRadius: 1.6,
        durationSimSec: 145,
      }),
      defaultThought: `I remember the ${kn.givenName} gives good nourishment. I'll walk over and gather some.`,
      defaultFeeling: 'focused',
    });
  }

  // 5B. Fish at the riverbank (may catch fish OR accidentally slip on the mossy bank into deep water and learn to swim!)
  if (perc.nearestWater && (s.hunger > 0.32 || Object.keys(char.knownSpecies).length >= 2)) {
    opts.push({
      id: 'fish_at_bank',
      priority: s.hunger > 0.58 ? 0.79 : 0.56,
      summary: `Crouch at the riverbank (${Math.round(perc.nearestWater.d)}m away) and watch the current to catch darting stream fish`,
      apply: () => ({
        type: 'fish_at_bank',
        label: 'fishing along the mossy riverbank',
        targetX: perc.nearestWater.x,
        targetY: perc.nearestWater.y,
        arriveRadius: 1.6,
        durationSimSec: 155,
      }),
      defaultThought: 'I saw silver flashes darting under the ripples near the bank. If I crouch carefully on the mossy stones, I might catch a fish.',
      defaultFeeling: 'alert and patient',
    });
  }

  // 5C. Float peacefully in the water (only once they have practiced swimming `swimSkill >= 0.35` and weather is mild/warm!)
  if (char.swimSkill >= 0.35 && perc.nearestWater && weather.tempC > 16 && (s.shoulderAche > 0.2 || s.lowerBackStiff > 0.2 || s.restlessness > 0.3)) {
    opts.push({
      id: 'float_in_water',
      priority: 0.58,
      summary: `Wade into the calm river shallows and float on your back (since you've learned how to float) to ease your aching muscles`,
      apply: () => ({
        type: 'float_in_water',
        label: 'floating peacefully on the water',
        targetX: perc.nearestWater.x + 1.4,
        targetY: perc.nearestWater.y + 1.0,
        arriveRadius: 1.4,
        durationSimSec: 150,
      }),
      defaultThought: 'Since slipping in earlier, I learned how the water supports my weight when I breathe deeply. Floating in the cool current will soothe my stiff back.',
      defaultFeeling: 'buoyant and serene',
    });
  }

  // 6. Observation-Driven Exploration: Inspect & test an UNFAMILIAR plant/tree/stone nearby!
  const needsWarmth = s.bodyWarmth < 0.48 || s.skinWetness > 0.32 || clock.daylight < 0.38 || s.exposureDread > 0.32;
  const knownTinder = findKnownWithQuality(char, 'flammable_tinder');
  const knownWindblock = findKnownWithQuality(char, 'rain_shedding') || findKnownWithQuality(char, 'wind_blocking');
  const knownTimber = findKnownWithQuality(char, 'heavy_timber');

  const unknownWarmthCandidate = perc.nearbyFlora.find(
    (f) => !char.knownSpecies[f.s] && (SPECIES[f.s]?.kind === 'tree' || SPECIES[f.s]?.kind === 'rock' || SPECIES[f.s]?.material)
  );
  const unknownFlora = (needsWarmth && unknownWarmthCandidate) || perc.nearbyFlora.find((f) => !char.knownSpecies[f.s]);

  if (unknownFlora) {
    const look = lookOf(unknownFlora.s, season);
    const hasFoodNow = (SPECIES[unknownFlora.s]?.food?.[season]?.length || 0) > 0;
    const searchingForWarmthReason = needsWarmth && (!knownTinder || !knownWindblock || !knownTimber);
    const priority = searchingForWarmthReason
      ? 0.86
      : s.hunger > 0.5 && hasFoodNow
        ? 0.78
        : 0.62 + s.wonder * 0.14;

    opts.push({
      id: 'discover_unknown',
      priority,
      summary: searchingForWarmthReason
        ? `Search for something that could keep you warm or block the wind by examining this unfamiliar ${SPECIES[unknownFlora.s]?.kind || 'thing'} (${Math.round(unknownFlora.d)}m away): ${look}`
        : `Walk over to inspect and test an unfamiliar thing (${Math.round(unknownFlora.d)}m away): ${look}`,
      apply: () => ({
        type: 'forage',
        label: searchingForWarmthReason
          ? `testing ${SPECIES[unknownFlora.s]?.kind || 'material'} to see if it can hold warmth`
          : `examining unfamiliar ${SPECIES[unknownFlora.s]?.kind || 'growth'}`,
        targetX: unknownFlora.x,
        targetY: unknownFlora.y,
        floraItem: unknownFlora,
        arriveRadius: 1.6,
        durationSimSec: 155,
      }),
      defaultThought: searchingForWarmthReason
        ? `I need a way to stay warm and block this chill, so I'm thinking about what around us might help. Let me walk over and test ${look} to see what its fibers or trunk can do.`
        : `I haven't closely examined ${look} yet. Let me touch it, smell it, and see what it can be used for.`,
      defaultFeeling: searchingForWarmthReason ? 'searching and observant' : 'curious',
    });
  }

  // 7. Observation-Driven Fire & Warmth
  const existingFire = structures.find((st) => st.kind === 'fire');
  if (existingFire) {
    if (!existingFire.complete) {
      pushPhysicalConstructionOptions(opts, char, existingFire, perc, ctx, needsWarmth ? 0.88 : 0.62, 'to kindle our hearth fire');
    } else if (needsWarmth && dist(char.x, char.y, existingFire.x, existingFire.y) > 4) {
      opts.push({
        id: 'warm_at_fire',
        priority: s.bodyWarmth < 0.36 ? 0.91 : 0.66,
        summary: `Go sit beside the ${existingFire.name} to warm shivering hands and dry damp skin`,
        apply: () => ({
          type: 'tend_fire',
          label: `warming hands by ${existingFire.name}`,
          structureId: existingFire.id,
          targetX: existingFire.x + (char.sex === 'f' ? 1.5 : -1.5),
          targetY: existingFire.y + 0.9,
          arriveRadius: 1.8,
          durationSimSec: 190,
        }),
        defaultThought: 'The air is biting cold on my damp skin. I want to sit close to the hearth fire and warm my hands.',
        defaultFeeling: 'seeking warmth',
      });
    }
  } else if ((needsWarmth || clock.hour >= 14.5) && knownTinder) {
    const tinderName = knownTinder.givenName;
    opts.push({
      id: 'conceive_fire',
      priority: needsWarmth ? 0.87 : 0.6,
      summary: `Use what you discovered about ${tinderName} (dry flammable fibers) to gather fuel and kindle a hearth fire for warmth`,
      apply: () => {
        const shelter = structures.find((st) => st.kind === 'shelter' || st.kind === 'windbreak');
        const fx = shelter ? shelter.x + 3.0 : ctx.world.spawn.x + 1.8;
        const fy = shelter ? shelter.y + 1.8 : ctx.world.spawn.y + 1.2;
        const bp = createStructureBlueprint(
          {
            kind: 'fire',
            name: 'Kindled Stone Hearth',
            reason: `because ${char.name} remembered how dry and flammable ${tinderName} was when examining the forest`,
            inspiredByMaterials: [tinderName],
            conceivedBy: char.name,
            x: fx,
            y: fy,
            chunksRequired: 1,
          },
          clock
        );
        structures.push(bp);
        ctx.chronicle.record(
          clock,
          `${char.name} remembered the dry fibers of ${tinderName} from their explorations and began gathering fuel for a ${bp.name}.`,
          'invention',
          { x: fx, y: fy }
        );
        const subOpts = [];
        pushPhysicalConstructionOptions(subOpts, char, bp, perc, ctx, 0.88, `to fuel the ${bp.name}`);
        return subOpts[0].apply();
      },
      defaultThought: `I need to stay warm, and I'm thinking back to what I touched in my explorations—the ${tinderName} had dry, resinous fibers that could catch a spark and hold heat!`,
      defaultFeeling: 'inventive',
    });
  }

  // 8. Observation-Driven Shelter Evolution & Multi-Option Timber Handling
  const mainShelter = structures.find((st) => st.kind === 'windbreak' || st.kind === 'shelter' || st.kind === 'pavilion');
  if (!mainShelter) {
    if (knownTimber && (needsWarmth || clock.hour > 13.5 || Object.keys(char.knownSpecies).length >= 3)) {
      const treeName = knownTimber.givenName;
      opts.push({
        id: 'conceive_timber_shelter',
        priority: Math.max(0.74, s.exposureDread, s.skinWetness),
        summary: `Use your discovery of ${treeName}'s stout trunk: fell a tree, cut it into sections, and haul them to the clearing to build a warm shelter`,
        apply: () => {
          const sx = ctx.world.spawn.x - 4.2;
          const sy = ctx.world.spawn.y - 2.8;
          const bp = createStructureBlueprint(
            {
              kind: 'shelter',
              name: `Hewn ${treeName} Cabin`,
              reason: `because ${char.name} tested the strong trunk of ${treeName} in the forest and realized felled logs could block the wind and hold warmth`,
              inspiredByMaterials: [treeName],
              conceivedBy: char.name,
              x: sx,
              y: sy,
              width: 6.8,
              depth: 4.8,
              headroom: 2.1,
              chunksRequired: 3,
            },
            clock
          );
          structures.push(bp);
          ctx.chronicle.record(
            clock,
            `${char.name} reflected on the stout ${treeName} trees seen in exploration and decided to fell, cut, and haul logs for a ${bp.name}.`,
            'architecture',
            { x: sx, y: sy }
          );
          const subOpts = [];
          pushPhysicalConstructionOptions(subOpts, char, bp, perc, ctx, 0.85, `to build ${bp.name}`);
          return subOpts[0].apply();
        },
        defaultThought: `I want to stay warm and dry through the night. Thinking about what I've seen in my explorations, the ${treeName} has a thick, sturdy trunk—if I cut one down, split it into chunks, and pull them here, we can build walls against the wind.`,
        defaultFeeling: 'purposeful',
      });
    } else if (knownWindblock && (needsWarmth || clock.hour > 13)) {
      const frondName = knownWindblock.givenName;
      opts.push({
        id: 'conceive_windbreak',
        priority: Math.max(0.7, s.exposureDread, s.skinWetness),
        summary: `Use the thick ${frondName} you discovered earlier: bundle and haul it to pile up an insulating windbreak against the chill`,
        apply: () => {
          const sx = ctx.world.spawn.x - 4.2;
          const sy = ctx.world.spawn.y - 2.8;
          const bp = createStructureBlueprint(
            {
              kind: 'windbreak',
              name: `${frondName} Thatch Shelter`,
              reason: `because ${char.name} felt the cold breeze and remembered how thick and wind-blocking ${frondName} was`,
              inspiredByMaterials: [frondName],
              conceivedBy: char.name,
              x: sx,
              y: sy,
              width: 5.6,
              depth: 4.2,
              headroom: 1.85,
              chunksRequired: 2,
            },
            clock
          );
          structures.push(bp);
          ctx.chronicle.record(
            clock,
            `${char.name} remembered the layered ${frondName} from their explorations and began hauling bundles to form a ${bp.name}.`,
            'architecture',
            { x: sx, y: sy }
          );
          const subOpts = [];
          pushPhysicalConstructionOptions(subOpts, char, bp, perc, ctx, 0.82, `to weave ${bp.name}`);
          return subOpts[0].apply();
        },
        defaultThought: `The wind chills my skin. I remember touching the ${frondName} earlier—its dense fronds blocked the breeze. If I bundle and haul it over here, I can lean it together to shelter us.`,
        defaultFeeling: 'resourceful',
      });
    }
  } else if (!mainShelter.complete || mainShelter.pendingMod) {
    const bodyStrain = Math.max(s.shoulderAche, s.lowerBackStiff, s.fatigue);
    if (bodyStrain < 0.78) {
      pushPhysicalConstructionOptions(opts, char, mainShelter, perc, ctx, 0.74 - bodyStrain * 0.22, `for ${mainShelter.name}`);
    }
  } else {
    const neededMod = diagnoseShelterNeed(char, mainShelter, collectiveKnowledge);
    if (neededMod && s.fatigue < 0.58) {
      opts.push({
        id: 'improve_shelter',
        priority: 0.75,
        summary: `Reshape ${mainShelter.name}: ${neededMod.description} (${neededMod.reason})`,
        apply: () => {
          beginStructureImprovement(mainShelter, neededMod, clock);
          addMemory(char, clock, `Decided to improve ${mainShelter.name} by ${neededMod.description} (${neededMod.reason}).`, 0.84);
          const subOpts = [];
          pushPhysicalConstructionOptions(subOpts, char, mainShelter, perc, ctx, 0.78, neededMod.description);
          return subOpts[0].apply();
        },
        defaultThought: `${neededMod.reason}. I'll fell and haul the materials we need for ${neededMod.description}.`,
        defaultFeeling: 'inspired to improve',
      });
    }
  }

  // 9. Observation-Driven Toolmaking
  const knownStone = findKnownWithQuality(char, 'cutting_edge') || findKnownWithQuality(char, 'hard_stone');
  if (char.tools.length === 0 && (knownStone || s.handBlisters > 0.12 || s.handScratches > 0.12) && Object.keys(char.knownSpecies).length >= 2) {
    const stoneName = knownStone ? knownStone.givenName : 'sharp river stone';
    opts.push({
      id: 'craft_first_tool',
      priority: 0.66 + s.handBlisters * 0.4,
      summary: `Use the ${stoneName} you observed to knap a bound cutting adze so felling trees and cutting stems doesn't blister bare hands`,
      apply: () => ({
        type: 'craft_tool',
        label: `binding a ${stoneName} hand-adze`,
        toolName: `${stoneName} Hand-Adze`,
        toolPurpose: 'chopping tree trunks, bucking logs, and stripping bark without raw blisters',
        durationSimSec: 185,
      }),
      defaultThought: `Working wood with bare hands leaves my palms sore. Remembering how hard and sharp the ${stoneName} was, I can lash it to a wooden handle to chop and cut cleanly.`,
      defaultFeeling: 'inventive',
    });
  }

  // 10. Bridge invention once basic shelter exists and timber is known
  const hasBridge = structures.some((st) => st.kind === 'bridge');
  if (mainShelter?.complete && knownTimber && !hasBridge && s.fatigue < 0.45 && perc.nearestWater) {
    const treeName = knownTimber.givenName;
    opts.push({
      id: 'conceive_bridge',
      priority: 0.54,
      summary: `Fell and haul ${treeName} logs to span the river channel so crossing no longer soaks feet and chills aching knees`,
      apply: () => {
        const bx = perc.nearestWater.x;
        const by = perc.nearestWater.y;
        const bp = createStructureBlueprint(
          {
            kind: 'bridge',
            name: `Arched ${treeName} Footbridge`,
            reason: 'so we can cross the turquoise river without soaking our clothes and chilling our aching knees',
            inspiredByMaterials: [treeName],
            conceivedBy: char.name,
            x: bx,
            y: by,
            width: 7.5,
            depth: 2.2,
            chunksRequired: 4,
          },
          clock
        );
        structures.push(bp);
        ctx.chronicle.record(
          clock,
          `${char.name} decided to fell and haul ${treeName} trunks for an ${bp.name} across the water.`,
          'architecture',
          { x: bx, y: by }
        );
        const subOpts = [];
        pushPhysicalConstructionOptions(subOpts, char, bp, perc, ctx, 0.72, `for ${bp.name}`);
        return subOpts[0].apply();
      },
      defaultThought: `Wading the cold stream leaves my legs soaked and my knee joints aching. Using the tall ${treeName} trunks I've seen, we can fell and haul logs to arch from bank to bank.`,
      defaultFeeling: 'visionary',
    });
  }

  // 11. Sleep at night or when deeply fatigued — characters walk INSIDE the shelter onto the interior tatami mats!
  if (clock.isNight || s.fatigue > 0.72 || s.sleepDebt > 0.72) {
    const sleepSpot = mainShelter || existingFire || { x: ctx.world.spawn.x, y: ctx.world.spawn.y };
    const charIndex = Math.max(0, ctx.characters.findIndex((c2) => c2.id === char.id));
    // When sleeping inside a shelter, place each character on their own interior sleeping mat well within the walls!
    let sleepTargetX, sleepTargetY, sleepArriveRadius;
    if (mainShelter) {
      const slotOffsets = [-0.95, 0.95, 0, -1.75, 1.75];
      const slotX = slotOffsets[charIndex % slotOffsets.length];
      sleepTargetX = mainShelter.x + slotX;
      sleepTargetY = mainShelter.y - 0.12 + (charIndex >= 2 ? 0.35 : 0);
      sleepArriveRadius = 0.45;
    } else {
      const sleepOffset = Math.max(1.2, Math.min(2.8, spaceDist * 0.45));
      sleepTargetX = sleepSpot.x + (char.sex === 'f' ? sleepOffset : -sleepOffset);
      sleepTargetY = sleepSpot.y;
      sleepArriveRadius = 1.2;
    }

    opts.push({
      id: 'sleep',
      priority: clock.isNight ? 0.89 : 0.85,
      summary: `Walk inside ${mainShelter ? mainShelter.name : 'the camp'} and lie down on the sleeping mats to rest`,
      apply: () => ({
        type: 'sleep',
        label: mainShelter ? `sleeping inside ${mainShelter.name}` : 'sleeping under the stars',
        structureId: mainShelter?.id || null,
        targetX: sleepTargetX,
        targetY: sleepTargetY,
        arriveRadius: sleepArriveRadius,
        durationSimSec: 420,
      }),
      defaultThought: mainShelter
        ? `My eyelids are heavy. I will step inside ${mainShelter.name}, lie down on the warm mats under our roof, and sleep.`
        : 'My eyelids are heavy and my limbs ache for rest. I will lie down and let the night carry me into sleep.',
      defaultFeeling: 'drowsy',
    });
  }

  // 12. Rest sore shoulders / stiff back / aching joints
  if (s.shoulderAche > 0.28 || s.lowerBackStiff > 0.28 || s.kneeJointAche > 0.28 || s.nausea > 0.2) {
    opts.push({
      id: 'rest_body',
      priority: 0.6 + Math.max(s.shoulderAche, s.lowerBackStiff, s.kneeJointAche, s.nausea) * 0.35,
      summary: 'Stop working, sit on a mossy stone, roll your sore shoulder, and let your muscles unknot',
      apply: () => ({
        type: 'rest',
        label: 'resting sore muscles and breathing slowly',
        durationSimSec: 165,
      }),
      defaultThought: 'There is no rush. My shoulder has a tight knot in it and my back feels stiff; I will sit awhile, stretch, and watch the light on the water.',
      defaultFeeling: 'unhurried',
    });
  }

  // 13. Seek companion to talk, keeping comfortable personal space based on relationship!
  if (partnerEntry) {
    const bond = ensureBond(char, partner);
    const timeSinceTalk = clock.simSeconds - (bond.lastTalkSimSec || 0);
    if ((s.loneliness > 0.25 || timeSinceTalk > 850 || partnerEntry.d > 22) && bond.resentment < 0.45) {
      const talkOffset = clamp(spaceDist * 0.72, 1.8, 4.8);
      opts.push({
        id: 'converse_partner',
        priority: s.loneliness > 0.45 ? 0.78 : 0.58,
        summary: `Walk over to ${partner.name} (${Math.round(partnerEntry.d)}m away) to talk and share what you've discovered`,
        apply: (speechText) => ({
          type: 'converse',
          label: `talking quietly with ${partner.name}`,
          targetX: partner.x + (char.sex === 'f' ? talkOffset : -talkOffset),
          targetY: partner.y + 0.5,
          arriveRadius: 2.2,
          speechText,
          durationSimSec: 155,
        }),
        defaultThought: `I want to see how ${partner.name} is holding up and tell them about the materials and plants I've tested.`,
        defaultFeeling: 'warm and connected',
      });
    }
  }

  // 14. Gentle wandering / exploring a dry clearing spot (never in water, and respecting personal space!)
  opts.push({
    id: 'stroll_reflect',
    priority: 0.42 + s.restlessness * 0.25,
    summary: 'Walk slowly along the clearing edge or forest path, observing the trees and ground',
    apply: () => {
      let tx = char.x, ty = char.y;
      for (let attempt = 0; attempt < 12; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const distStep = 14 + Math.random() * 22;
        const candX = clamp(char.x + Math.cos(a) * distStep, 120, ctx.world.N - 120);
        const candY = clamp(char.y + Math.sin(a) * distStep, 120, ctx.world.N - 120);
        const sd = sampleField(ctx.world, ctx.world.water, candX, candY);
        const partnerOk = !partner || dist(candX, candY, partner.x, partner.y) >= spaceDist;
        if (sd > 1.8 && partnerOk) {
          tx = candX;
          ty = candY;
          break;
        }
      }
      return {
        type: 'ponder',
        label: 'exploring the valley and observing materials',
        targetX: tx,
        targetY: ty,
        arriveRadius: 2.0,
        durationSimSec: 165,
      };
    },
    defaultThought: 'The breeze moves softly through the golden leaves. I will walk a little way along dry ground and see what grows beyond this bend.',
    defaultFeeling: 'serene',
  });

  opts.sort((a, b) => b.priority - a.priority);
  return opts;
}

async function queryCloudMind(char, perc, somaticNotes, options, ctx) {
  const { clock, weather } = ctx;
  const wDesc = weather.describe();
  const somText = somaticNotes.length
    ? somaticNotes.map((n) => `- ${n.text}`).join('\n')
    : '- Body feels comfortable, warm, and unhurried.';

  const memText = char.memories
    .slice(0, 5)
    .map((m) => `- [${m.time}] ${m.text}`)
    .join('\n');

  const knownList =
    Object.values(char.knownSpecies)
      .slice(0, 8)
      .map((k) => `${k.givenName} (${k.edible}; ${k.notes})`)
      .join('; ') || 'None yet—everything in this forest is still unknown until you touch and test it.';

  const optText = options
    .slice(0, 6)
    .map((o, idx) => `${idx + 1}. [${o.id}] ${o.summary}`)
    .join('\n');

  const partner = perc.others[0]?.char;
  const bond = partner ? char.bonds[partner.id] : null;
  const partnerLine = partner
    ? `${partner.name} is ${Math.round(perc.others[0].d)}m away (${partner.activity?.label || 'nearby'}). Relationship: ${bond?.status || 'Companions'} (trust ${Math.round((bond?.trust ?? 0.6) * 100)}%, affection ${Math.round((bond?.affection ?? 0.6) * 100)}%, strain ${Math.round((bond?.resentment ?? 0) * 100)}%).`
    : 'You are alone right now.';

  const prompt = `You are ${char.name} (age ${Math.floor(char.ageYears)}, temperament: ${char.temperament}), living in a tranquil, ancient forest basin ringed by mountains.
Time: ${clock.label()}. Weather: ${wDesc.temp}°C, ${wDesc.sky}, ${wDesc.wind}, humidity ${Math.round(weather.humidity * 100)}%.
Terrain under your feet: ${TERRAIN_NAME[perc.terrain]}.
${partnerLine}

YOUR BODILY & PSYCHOLOGICAL SENSATIONS RIGHT NOW:
${somText}

YOUR RECENT MEMORIES:
${memText}

THINGS YOU HAVE PERSONALLY EXAMINED & DISCOVERED SO FAR:
${knownList}

POSSIBLE ACTIONS YOU CAN TAKE RIGHT NOW:
${optText}

IMPORTANT RULES FOR YOUR THINKING:
- Nothing is pre-ordained. Connect your bodily needs (cold, damp, hungry, sore back/shoulders, claustrophobic) to specific materials you have ACTUALLY seen/touched in your explorations.
- When handling felled trees or heavy logs, decide whether to ask ${partner ? partner.name : 'others'} for help chopping/carrying, cut the log into smaller chunks to protect your back, or do it solo based on your physical soreness and your current relationship feelings.
Respond ONLY with valid JSON in this exact shape:
{"actionId":"<one of the action ids above>","thought":"<your vivid first-person inner monologue, 1-2 sentences>","feeling":"<2-3 words describing mood>","speech":"<optional short gentle sentence spoken aloud to ${partner ? partner.name : 'yourself'}, or empty string>"}`;

  let raw = null;
  if (runtimeConfig.geminiKey) {
    raw = await callGeminiFree(prompt, runtimeConfig.geminiKey);
  }
  if (!raw && runtimeConfig.groqKey) {
    raw = await callGroqFree(prompt, runtimeConfig.groqKey);
  }
  if (!raw && runtimeConfig.useFreeCloudLlm) {
    raw = await callPollinationsFree(prompt);
  }
  if (!raw) return null;

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  const opt = options.find((o) => o.id === parsed.actionId) || options[0];
  return {
    option: opt,
    thought: typeof parsed.thought === 'string' && parsed.thought.length > 6 ? parsed.thought.slice(0, 280) : opt.defaultThought,
    feeling: typeof parsed.feeling === 'string' && parsed.feeling.length > 2 ? parsed.feeling.slice(0, 45) : opt.defaultFeeling,
    speech: typeof parsed.speech === 'string' && parsed.speech.length > 2 ? parsed.speech.slice(0, 160) : '',
  };
}

async function callGeminiFree(prompt, apiKey) {
  // Build candidate model list starting with whichever model succeeded most recently
  const models = [
    runtimeConfig.preferredGeminiModel,
    ...GEMINI_CANDIDATE_MODELS.filter((m) => m !== runtimeConfig.preferredGeminiModel),
  ].filter(Boolean);

  let lastErrText = '';
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 700 },
        }),
        signal: AbortSignal.timeout(9500),
      });

      if (res.ok) {
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const answerPart = parts.filter((p) => !p.thought && typeof p.text === 'string').pop() || parts[parts.length - 1];
        const text = answerPart?.text || null;
        if (text) {
          if (runtimeConfig.preferredGeminiModel !== model) {
            runtimeConfig.preferredGeminiModel = model;
            savePersistedAiConfig();
          }
          runtimeConfig.providerStatus = `Gemini (${model})`;
          runtimeConfig.linkState = 'connected';
          runtimeConfig.activeProvider = 'gemini';
          runtimeConfig.activeModel = model;
          runtimeConfig.lastSuccessMs = Date.now();
          runtimeConfig.lastError = '';
          runtimeConfig.geminiSuccessCount++;
          return text;
        }
      } else {
        const errBody = await res.text().catch(() => '');
        lastErrText = `HTTP ${res.status} on ${model}`;
        // If 404 NotFound, 400, 500, or 503, immediately try next candidate model in loop!
        if (res.status === 404 || res.status === 400 || res.status === 500 || res.status === 503) {
          continue;
        }
        // If 403/401 invalid key, break early
        if (res.status === 401 || res.status === 403 || errBody.includes('API_KEY_INVALID')) {
          lastErrText = `Invalid Gemini API Key (${res.status})`;
          break;
        }
        if (res.status === 429) {
          lastErrText = `Rate Limit (429) on ${model}`;
          continue;
        }
      }
    } catch (e) {
      lastErrText = e.message || 'Network timeout';
    }
  }

  runtimeConfig.geminiErrorCount++;
  runtimeConfig.lastError = lastErrText || 'Gemini API unreachable';
  runtimeConfig.linkState = 'error';
  return null;
}

async function callGroqFree(prompt, apiKey) {
  try {
    const model = 'llama-3.3-70b-versatile';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
        max_tokens: 230,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      runtimeConfig.lastError = `Groq HTTP ${res.status}`;
      if (!runtimeConfig.geminiKey) runtimeConfig.linkState = 'error';
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || null;
    if (text) {
      runtimeConfig.providerStatus = 'Groq Llama-3.3 (Connected)';
      runtimeConfig.linkState = 'connected';
      runtimeConfig.activeProvider = 'groq';
      runtimeConfig.activeModel = model;
      runtimeConfig.lastSuccessMs = Date.now();
      runtimeConfig.lastError = '';
    }
    return text;
  } catch (e) {
    runtimeConfig.lastError = e.message || 'Groq network error';
    return null;
  }
}

async function callPollinationsFree(prompt) {
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: 'You output only compact valid JSON representing an autonomous character inner monologue and decision.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.75,
      }),
      signal: AbortSignal.timeout(8500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || null;
    if (text && !runtimeConfig.geminiKey && !runtimeConfig.groqKey) {
      runtimeConfig.providerStatus = 'Free Cloud LLM (Connected)';
      runtimeConfig.linkState = 'cloud_free';
      runtimeConfig.activeProvider = 'pollinations';
      runtimeConfig.activeModel = 'openai-free';
      runtimeConfig.lastSuccessMs = Date.now();
    }
    return text;
  } catch {
    return null;
  }
}

function deliberateLocally(char, perc, somaticNotes, options) {
  if (!runtimeConfig.geminiKey && !runtimeConfig.groqKey) {
    if (runtimeConfig.linkState !== 'cloud_free') {
      runtimeConfig.providerStatus = 'Somatic-Epistemic Engine';
      runtimeConfig.linkState = 'local';
      runtimeConfig.activeProvider = 'local';
    }
  }
  const top = options[0];
  let chosenOpt = top;
  if (top.priority < 0.82 && options.length > 1 && Math.random() < 0.25) {
    chosenOpt = options[1];
  }

  const primarySensation = somaticNotes[0];
  let thought = chosenOpt.defaultThought;
  if (primarySensation && !thought.toLowerCase().includes(primarySensation.k)) {
    thought = `Right now, ${primarySensation.text}. ${chosenOpt.defaultThought}`;
  }

  return {
    option: chosenOpt,
    thought,
    feeling: chosenOpt.defaultFeeling,
    speech: '',
  };
}

function applyDecision(char, decision, perc, ctx) {
  const { option, thought, feeling, speech } = decision;
  char.thought = thought;
  char.feeling = feeling;
  if (speech && perc.others[0]?.d < 22) {
    say(char, ctx.clock, speech);
  }
  const nextAct = option.apply(speech);
  nextAct.startedAt = ctx.clock.simSeconds;
  nextAct.elapsedSimSec = 0;
  char.activity = nextAct;
}
