// Persistent World State Orchestrator.
// Ties together the deterministic terrain/flora, Clock, Weather, Ren & Sora (and their descendants),
// Felled Trees & Cut Log Chunks on the ground, emergent Structures, worn Footpaths, and the Golden Chronicle.

import fs from 'node:fs';
import path from 'node:path';
import { WORLD } from '../../shared/config.js';
import { clamp, dist } from '../../shared/dmath.js';
import { SPECIES } from '../../shared/species.js';
import { generateWorld, buildFloraGrid, sampleField } from '../../shared/worldgen.js';
import { Clock } from './clock.js';
import { Weather } from './weather.js';
import { createCharacter, stepCharacter, ensureBond, deriveObservedQualities, computeGrowthScale } from './character.js';
import { describeSomaticNotes } from './somatic.js';
import { decideNextAction, getAiStatus } from './mind.js';
import { findShelterAt, fireWarmthAt } from './structures.js';

const SAVE_DIR = path.resolve(process.cwd(), 'data');
const SAVE_FILE = path.join(SAVE_DIR, 'world-state.json');

export class WorldSimulation {
  constructor({ fresh = false, seed = WORLD.defaultSeed } = {}) {
    this.seed = seed;
    this.world = generateWorld(seed);
    this.floraGrid = buildFloraGrid(this.world.flora, this.world.N, 16);

    this.clock = new Clock();
    this.weather = new Weather();
    this.structures = [];
    this.characters = [];
    this.felledTrees = []; // [{ id, x, y, s, h, angle, felledAtMs }]
    this.groundItems = []; // [{ id, kind: 'felled_trunk'|'log_chunk'|'reed_bundle', species, name, x, y, angle }]
    this.lanterns = [];
    this.paths = new Map(); // "gx,gy" (2m cells) -> wear 0..1
    this.collectiveKnowledge = {
      inventions: [],
      namedPlaces: [
        { name: 'The Mirror Basin', x: this.world.lake.x, y: this.world.lake.y, kind: 'lake' },
      ],
    };

    this.chronicle = {
      entries: [],
      record: (clock, text, category = 'event', pos = null) => {
        const entry = {
          id: `chr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          time: clock.label(),
          year: clock.year,
          season: clock.season,
          day: clock.dayOfSeason,
          text,
          category,
          x: pos ? Math.round(pos.x) : null,
          y: pos ? Math.round(pos.y) : null,
        };
        this.chronicle.entries.unshift(entry);
        if (this.chronicle.entries.length > 160) {
          this.chronicle.entries.length = 160;
        }
        return entry;
      },
    };

    if (!fresh && this.loadFromDisk()) {
      console.log(`[World] Restored persistent world (${this.clock.label()}, ${this.characters.length} inhabitants, ${this.structures.length} structures).`);
    } else {
      this.initGenesis();
      this.saveToDisk();
    }

    this.lastSaveMs = Date.now();
  }

  /**
   * Completely resets the world, terrain, characters, memories, structures, felled trees, ground items, footpaths, and chronicle.
   */
  resetWorld({ newSeed = false } = {}) {
    if (newSeed) {
      this.seed = `ren-and-sora-${Date.now().toString(36)}`;
    } else {
      this.seed = WORLD.defaultSeed;
    }
    this.world = generateWorld(this.seed);
    this.floraGrid = buildFloraGrid(this.world.flora, this.world.N, 16);
    this.clock = new Clock();
    this.weather = new Weather();
    this.structures = [];
    this.characters = [];
    this.felledTrees = [];
    this.groundItems = [];
    this.lanterns = [];
    this.paths = new Map();
    this.collectiveKnowledge = {
      inventions: [],
      namedPlaces: [
        { name: 'The Mirror Basin', x: this.world.lake.x, y: this.world.lake.y, kind: 'lake' },
      ],
    };
    this.chronicle.entries = [];
    this.initGenesis();
    this.saveToDisk();
    console.log(`[World] FULL RESET complete (seed: ${this.seed}).`);
    return this.snapshot();
  }

  initGenesis() {
    const sp = this.world.spawn;
    const ren = createCharacter({
      id: 'char_ren',
      name: 'Ren',
      sex: 'm',
      generation: 1,
      ageYears: 21,
      x: Math.round((sp.x - 1.8) * 100) / 100,
      y: Math.round((sp.y + 0.6) * 100) / 100,
      heading: 0.2,
      temperament: 'patient, attentive to how things fit together, quietly protective',
      hairHue: 36,
      robeHue: 42,
      thought: 'The morning air is cool against my skin, and I can hear water moving through the trees. Who is this standing beside me?',
      feeling: 'awakening wonder',
    });

    const sora = createCharacter({
      id: 'char_sora',
      name: 'Sora',
      sex: 'f',
      generation: 1,
      ageYears: 20,
      x: Math.round((sp.x + 1.8) * 100) / 100,
      y: Math.round((sp.y - 0.5) * 100) / 100,
      heading: 2.9,
      temperament: 'curious, perceptive of scents and seasons, warm-hearted',
      hairHue: 340,
      robeHue: 48,
      thought: 'Light filters like gold dust through the canopy. My hands are empty, the grass is damp with dew, and we have a whole world to learn.',
      feeling: 'curious and alive',
    });

    ensureBond(ren, sora);
    ensureBond(sora, ren);

    this.characters = [ren, sora];
    this.chronicle.record(
      this.clock,
      'At dawn of the First Spring, Ren and Sora opened their eyes in a sunlit clearing beside the central lake, knowing nothing yet of fire, shelter, or the names of the trees.',
      'genesis',
      sp
    );
  }

  /**
   * Physically fells a standing tree in `world.flora`, recording its stump and placing a fallen trunk on the ground.
   */
  fellTreeIntoTrunk(treeItem, char) {
    const realFlora = this.world.flora.find((f) => f.id === treeItem.id);
    if (realFlora) realFlora.removed = true;
    treeItem.removed = true;

    const nowMs = Date.now();
    const fallAngle = char ? Math.atan2(treeItem.y - char.y, treeItem.x - char.x) + (Math.random() - 0.5) * 0.4 : 0.35;
    const felledEntry = {
      id: treeItem.id,
      x: Math.round(treeItem.x * 100) / 100,
      y: Math.round(treeItem.y * 100) / 100,
      s: treeItem.s,
      h: treeItem.h || 7,
      angle: Math.round(fallAngle * 100) / 100,
      felledAtMs: nowMs,
      fallDurationMs: 2400,
    };
    this.felledTrees.push(felledEntry);
    if (this.felledTrees.length > 200) this.felledTrees.shift();

    // Ensure character records knowledge of this tree's timber qualities
    if (char && !char.knownSpecies[treeItem.s]) {
      char.knownSpecies[treeItem.s] = {
        givenName: `Stout ${treeItem.s[0].toUpperCase() + treeItem.s.slice(1)}`,
        edible: 'non-food',
        qualities: deriveObservedQualities(treeItem.s),
        notes: 'Felled its heavy trunk for timber logs.',
        triedCount: 1,
        learnedFrom: 'self',
      };
    }

    const spName = char?.knownSpecies[treeItem.s]?.givenName || 'Timber';
    const trunk = {
      id: `trunk_${treeItem.id}_${nowMs.toString(36)}`,
      kind: 'felled_trunk',
      species: treeItem.s,
      name: `${spName} Trunk`,
      x: Math.round((treeItem.x + Math.cos(fallAngle) * 2.1) * 100) / 100,
      y: Math.round((treeItem.y + Math.sin(fallAngle) * 2.1) * 100) / 100,
      angle: felledEntry.angle,
      length: Math.min(6.5, (treeItem.h || 6) * 0.65),
      // Only becomes visible on the ground AFTER the tree finishes falling and disappears!
      visibleAfterMs: nowMs + 2400,
    };
    this.groundItems.push(trunk);
    return trunk;
  }

  /**
   * Cuts a fallen tree trunk (`felled_trunk`) into either 3 heavy `log_chunk` sections
   * or 5 smaller, easier-to-carry `small_log_chunk` billets on the forest floor.
   */
  buckTrunkIntoChunks(trunkItem, char, chunkCount = 3) {
    const idx = this.groundItems.findIndex((g) => g.id === trunkItem.id);
    if (idx >= 0) this.groundItems.splice(idx, 1);

    const spName = char?.knownSpecies[trunkItem.species]?.givenName || 'Timber';
    const chunks = [];
    const ca = Math.cos(trunkItem.angle || 0);
    const sa = Math.sin(trunkItem.angle || 0);
    const isSmall = chunkCount >= 4;
    const offsets = isSmall ? [-1.8, -0.9, 0, 0.9, 1.8] : [-1.4, 0, 1.4];

    for (const offset of offsets) {
      const ch = {
        id: `chunk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        kind: isSmall ? 'small_log_chunk' : 'log_chunk',
        species: trunkItem.species,
        name: isSmall ? `Small ${spName} Billet` : `${spName} Log Chunk`,
        weight: isSmall ? 0.48 : 1.0,
        x: Math.round((trunkItem.x + ca * offset + (Math.random() - 0.5) * 0.25) * 100) / 100,
        y: Math.round((trunkItem.y + sa * offset + (Math.random() - 0.5) * 0.25) * 100) / 100,
        angle: Math.round(((trunkItem.angle || 0) + (Math.random() - 0.5) * 0.25) * 100) / 100,
        length: isSmall ? 1.05 : 1.65,
      };
      this.groundItems.push(ch);
      chunks.push(ch);
    }
    return chunks;
  }

  wearPathAt(x, y, amount = 0.015) {
    const gx = Math.floor(x / 2);
    const gy = Math.floor(y / 2);
    const key = `${gx},${gy}`;
    const prev = this.paths.get(key) || 0;
    const next = clamp(prev + amount, 0, 1);
    this.paths.set(key, next);
  }

  deliverChild(mother, preg) {
    const childNames = ['Mei', 'Kael', 'Hana', 'Taro', 'Yuki', 'Aoi', 'Haru', 'Satsuki', 'Kiri', 'Nori', 'Suzu', 'Renji'];
    const used = new Set(this.characters.map((c) => c.name));
    const name = childNames.find((n) => !used.has(n)) || `Kiko-${this.characters.length + 1}`;
    const sex = Math.random() < 0.5 ? 'f' : 'm';
    const father = this.characters.find((c) => c.id === preg.partnerId);

    const inheritedKnowledge = {};
    for (const [k, v] of Object.entries(mother.knownSpecies || {})) {
      inheritedKnowledge[k] = { ...v, learnedFrom: mother.name };
    }
    if (father) {
      for (const [k, v] of Object.entries(father.knownSpecies || {})) {
        if (!inheritedKnowledge[k]) inheritedKnowledge[k] = { ...v, learnedFrom: father.name };
      }
    }

    const childIdx = this.characters.length - 1;
    const garmentChoices = ['tunic', 'robed', 'artisan'];
    const maleHairChoices = ['topknot', 'ponytail', 'braid'];
    const femaleHairChoices = ['shimada', 'twin_buns', 'ponytail', 'braid'];
    const headgearChoices = ['none', 'hachimaki', 'sugegasa', 'kanzashi', 'ribbon'];
    const accessoryChoices = ['rope_coil', 'gourd', 'satchel', 'sash_bow'];

    const childAppearance = {
      garmentStyle: garmentChoices[(childIdx + (sex === 'f' ? 1 : 0)) % garmentChoices.length],
      hairStyle: sex === 'f'
        ? femaleHairChoices[childIdx % femaleHairChoices.length]
        : maleHairChoices[childIdx % maleHairChoices.length],
      headgear: headgearChoices[(childIdx * 2 + (sex === 'f' ? 3 : 1)) % headgearChoices.length],
      accessory: accessoryChoices[(childIdx + 1) % accessoryChoices.length],
      robeHue: Math.round(((mother.appearance?.robeHue || 32) * 0.5 + (father?.appearance?.robeHue || 42) * 0.5 + (childIdx * 47) % 90) % 360),
      innerHue: Math.round((18 + childIdx * 53) % 360),
      sashHue: Math.round((35 + childIdx * 67) % 360),
      heightTrait: Math.round((0.91 + ((childIdx * 37) % 19) * 0.01) * 100) / 100,
      buildTrait: Math.round((0.92 + ((childIdx * 29) % 17) * 0.01) * 100) / 100,
    };

    const child = createCharacter({
      name,
      sex,
      generation: Math.max(mother.generation || 1, father?.generation || 1) + 1,
      parents: [mother.name, preg.partnerName],
      ageYears: 2.5, // Starts as a small child (~48% height) and grows up into an adult over time!
      appearance: childAppearance,
      x: mother.x + (Math.random() - 0.5) * 1.6,
      y: mother.y + (Math.random() - 0.5) * 1.6,
      temperament: 'bright-eyed, inheriting the curiosity of their parents, eager to shape the valley',
      knownSpecies: inheritedKnowledge,
      thought: `Looking up at ${mother.name} and ${preg.partnerName} under the golden canopy—everything in this world is big and new!`,
      feeling: 'wide-eyed wonder',
      memories: [
        {
          time: this.clock.label(),
          text: `Born to ${mother.name} and ${preg.partnerName} in the valley they made home.`,
          importance: 1.0,
        },
      ],
    });

    for (const c of this.characters) {
      if (!c.alive) continue;
      ensureBond(c, child);
      ensureBond(child, c);
      c.bonds[child.id].trust = 0.85;
      c.bonds[child.id].affection = 0.9;
      child.bonds[c.id].trust = 0.85;
      child.bonds[c.id].affection = 0.9;
    }

    this.characters.push(child);
    this.chronicle.record(
      this.clock,
      `A new generation: ${name} was born to ${mother.name} and ${preg.partnerName}, inheriting their knowledge of ${Object.keys(inheritedKnowledge).length} species.`,
      'lineage',
      { x: mother.x, y: mother.y }
    );
  }

  addFloatingLantern({ x, y, message = 'May warmth stay in the valley', from = 'A Distant Watcher' }) {
    let lx = clamp(Number(x) || this.world.lake.x, 40, this.world.N - 40);
    let ly = clamp(Number(y) || this.world.lake.y, 40, this.world.N - 40);

    if (sampleField(this.world, this.world.water, lx, ly) > 1.5) {
      let bestD = 999, bx = this.world.lake.x, by = this.world.lake.y;
      for (let r = 4; r <= 60; r += 4) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          const tx = lx + Math.cos(a) * r;
          const ty = ly + Math.sin(a) * r;
          if (sampleField(this.world, this.world.water, tx, ty) < 0) {
            if (r < bestD) {
              bestD = r;
              bx = tx;
              by = ty;
            }
          }
        }
        if (bestD < 999) break;
      }
      lx = bx;
      ly = by;
    }

    const lantern = {
      id: `lan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      x: Math.round(lx * 100) / 100,
      y: Math.round(ly * 100) / 100,
      message: String(message).slice(0, 120),
      from: String(from).slice(0, 40),
      life: 1.0,
    };
    this.lanterns.push(lantern);
    if (this.lanterns.length > 24) this.lanterns.shift();

    for (const c of this.characters) {
      if (!c.alive) continue;
      if (dist(c.x, c.y, lantern.x, lantern.y) < 65) {
        c.somatic.wonder = clamp(c.somatic.wonder + 0.35, 0, 1);
        c.thought = `A warm golden light is drifting across the water... "${lantern.message}". Where did it come from?`;
        c.feeling = 'moved by mystery';
      }
    }

    return lantern;
  }

  /**
   * Main simulation tick.
   */
  tick(realDtSec) {
    const dtReal = clamp(realDtSec, 0.01, 2.0);
    const prevSimSec = this.clock.simSeconds;
    this.clock.advance(dtReal);
    const dtSimSec = this.clock.simSeconds - prevSimSec;
    this.clock.simRate = dtReal > 0.001 ? dtSimSec / dtReal : 72;
    const dtH = dtSimSec / 3600;

    this.weather.update(dtH, this.clock);

    for (const st of this.structures) {
      if (st.kind === 'fire' && st.lit) {
        const rainDamp = this.weather.precip * 0.08;
        st.fuel = clamp(st.fuel - (0.018 + rainDamp) * dtH, 0.08, 1);
      }
    }

    for (let i = this.lanterns.length - 1; i >= 0; i--) {
      const l = this.lanterns[i];
      const wx = Math.cos(this.weather.windDir) * 0.45 * dtReal;
      const wy = Math.sin(this.weather.windDir) * 0.45 * dtReal;
      const nx = l.x + wx;
      const ny = l.y + wy;
      if (sampleField(this.world, this.world.water, nx, ny) < 0.8) {
        l.x = nx;
        l.y = ny;
      }
      l.life -= 0.0004 * dtReal;
      if (l.life <= 0) this.lanterns.splice(i, 1);
    }

    const ctx = {
      world: this.world,
      floraGrid: this.floraGrid,
      clock: this.clock,
      weather: this.weather,
      structures: this.structures,
      characters: this.characters,
      felledTrees: this.felledTrees,
      groundItems: this.groundItems,
      chronicle: this.chronicle,
      collectiveKnowledge: this.collectiveKnowledge,
      onWearPath: (x, y, amt) => this.wearPathAt(x, y, amt),
      deliverChild: (mother, preg) => this.deliverChild(mother, preg),
      fellTreeIntoTrunk: (tree, char) => this.fellTreeIntoTrunk(tree, char),
      buckTrunkIntoChunks: (trunk, char, count) => this.buckTrunkIntoChunks(trunk, char, count),
    };

    for (const char of this.characters) {
      if (!char.alive) continue;
      stepCharacter(char, dtSimSec, ctx);

      const act = char.activity;
      const actDone = !act || (act.elapsedSimSec || 0) >= (act.durationSimSec || 160);
      const sinceAi = this.clock.simSeconds - (char.lastAiSimSec || 0);
      if ((actDone && sinceAi > 50) || sinceAi > 320) {
        decideNextAction(char, ctx);
      }
    }

    if (Date.now() - this.lastSaveMs > 25000) {
      this.lastSaveMs = Date.now();
      this.saveToDisk();
    }
  }

  /**
   * Builds a lightweight live snapshot for connected browsers.
   */
  snapshot() {
    const chars = this.characters.map((c) => {
      const insideShelter = findShelterAt(this.structures, c.x, c.y);
      const nearFireWarmth = fireWarmthAt(this.structures, c.x, c.y);
      const somaticNotes = describeSomaticNotes(c, { insideShelter, nearFireWarmth });
      return {
        id: c.id,
        name: c.name,
        sex: c.sex,
        generation: c.generation,
        parents: c.parents,
        ageYears: Math.round(c.ageYears * 10) / 10,
        growthScale: c.growthScale || computeGrowthScale(c.ageYears, c.appearance?.heightTrait || 1.0),
        appearance: c.appearance || null,
        insideShelterId: insideShelter?.id || null,
        x: Math.round(c.x * 100) / 100,
        y: Math.round(c.y * 100) / 100,
        targetX: c.targetX ?? Math.round(c.x * 100) / 100,
        targetY: c.targetY ?? Math.round(c.y * 100) / 100,
        speed: c.speed || 0,
        heading: Math.round(c.heading * 100) / 100,
        moving: c.moving,
        posture: c.posture,
        waterDepth: c.waterDepth || 0,
        waterSubmerge: c.waterSubmerge || 0,
        swimSkill: Math.round((c.swimSkill || 0) * 100) / 100,
        hauling: c.hauling || null,
        actionTarget: c.actionTarget || null,
        temperament: c.temperament,
        thought: c.thought,
        feeling: c.feeling,
        speech: c.speech && this.clock.simSeconds <= c.speech.untilSimSec ? c.speech.text : null,
        activity: c.activity ? { type: c.activity.type, label: c.activity.label } : null,
        somatic: c.somatic,
        somaticNotes: somaticNotes.slice(0, 7),
        knownSpecies: c.knownSpecies,
        tools: c.tools,
        inventory: c.inventory,
        bonds: c.bonds,
        pregnancy: c.pregnancy,
        memories: c.memories.slice(0, 14),
      };
    });

    const wornPaths = [];
    for (const [k, w] of this.paths.entries()) {
      if (w >= 0.08) {
        const [gx, gy] = k.split(',').map(Number);
        wornPaths.push([gx * 2 + 1, gy * 2 + 1, Math.round(w * 100) / 100]);
      }
    }

    const nowMs = Date.now();
    const visibleGroundItems = this.groundItems.filter((g) => !g.visibleAfterMs || nowMs >= g.visibleAfterMs);

    return {
      seed: this.seed,
      checksum: this.world.checksum,
      clock: this.clock.snapshot(),
      weather: this.weather.snapshot(),
      ai: getAiStatus(),
      characters: chars,
      structures: this.structures,
      felledTrees: this.felledTrees,
      groundItems: visibleGroundItems,
      lanterns: this.lanterns,
      paths: wornPaths.slice(-500),
      chronicle: this.chronicle.entries.slice(0, 50),
      collectiveKnowledge: this.collectiveKnowledge,
    };
  }

  saveToDisk() {
    try {
      if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });
      const payload = {
        version: WORLD.version,
        seed: this.seed,
        savedAt: new Date().toISOString(),
        clock: this.clock.toJSON(),
        weather: this.weather.toJSON(),
        characters: this.characters,
        structures: this.structures,
        felledTrees: this.felledTrees,
        groundItems: this.groundItems,
        lanterns: this.lanterns,
        paths: Array.from(this.paths.entries()).slice(-1200),
        chronicle: this.chronicle.entries,
        collectiveKnowledge: this.collectiveKnowledge,
      };
      fs.writeFileSync(SAVE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error('[World] Save failed:', err.message);
    }
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(SAVE_FILE)) return false;
      const raw = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
      if (raw.version !== WORLD.version || raw.seed !== this.seed) return false;
      this.clock = new Clock(raw.clock);
      this.weather = new Weather(raw.weather);
      this.characters = (raw.characters || []).map((c) => createCharacter(c));
      this.structures = raw.structures || [];
      this.felledTrees = raw.felledTrees || [];
      this.groundItems = raw.groundItems || [];
      for (const ft of this.felledTrees) {
        const fl = this.world.flora.find((f) => f.id === ft.id);
        if (fl) fl.removed = true;
      }
      this.lanterns = raw.lanterns || [];
      this.paths = new Map(raw.paths || []);
      this.chronicle.entries = raw.chronicle || [];
      if (raw.collectiveKnowledge) this.collectiveKnowledge = raw.collectiveKnowledge;
      return this.characters.length > 0;
    } catch (err) {
      console.warn('[World] Could not load previous save, starting fresh:', err.message);
      return false;
    }
  }
}
