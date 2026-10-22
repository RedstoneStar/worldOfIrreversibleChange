// Autonomous Human Character Model (Ren, Sora, and their descendants).
// Combines the Somatic Matrix ("Flesh, Bone & Nerve"), Blank-Slate Epistemic Learning,
// Physical Tree-Felling / Cooperative or Solo Log-Bucking & Hauling, Personal Space,
// Water Depth Sinking & Emergent Swimming/Floating Skill, and Treatment-Based Relationships.

import { T } from '../../shared/config.js';
import { clamp, dist } from '../../shared/dmath.js';
import { SPECIES, lookOf } from '../../shared/species.js';
import { sampleField, terrainAt } from '../../shared/worldgen.js';
import { createSomaticState, updateSomatic, describeSomaticNotes } from './somatic.js';
import {
  advanceStructureWork,
  deliverChunkToStructure,
  findShelterAt,
  fireWarmthAt,
} from './structures.js';

export function computeGrowthScale(ageYears = 21, heightTrait = 1.0) {
  if (ageYears >= 18) return Math.round(heightTrait * 1000) / 1000;
  // Smooth growth curve from toddler (age 2 -> 0.46) to child (age 8 -> 0.66) to teen (age 14 -> 0.86) to adult (18 -> 1.0)
  const u = clamp((ageYears - 1.5) / 16.5, 0, 1);
  const raw = 0.45 + 0.55 * Math.pow(u, 0.85);
  return Math.round(raw * heightTrait * 1000) / 1000;
}

export function createCharacter(spec) {
  const isF = (spec.sex || 'f') === 'f';
  const defaultAppearance = {
    // 'tunic' (short working kimono w/ kyahan shin-wraps like Ref #2 & #5) | 'robed' (long pleated hakama & haori coat like Ref #3) | 'artisan' (draped cape/sleeves like Ref #4)
    garmentStyle: spec.appearance?.garmentStyle || (isF ? 'robed' : 'tunic'),
    // 'topknot' | 'shimada' | 'ponytail' | 'twin_buns' | 'braid'
    hairStyle: spec.appearance?.hairStyle || (isF ? 'shimada' : 'topknot'),
    // 'none' | 'kanzashi' | 'hachimaki' | 'sugegasa' | 'ribbon'
    headgear: spec.appearance?.headgear || (isF ? 'kanzashi' : 'none'),
    // 'rope_coil' | 'gourd' | 'satchel' | 'sash_bow'
    accessory: spec.appearance?.accessory || (isF ? 'sash_bow' : 'rope_coil'),
    robeHue: spec.appearance?.robeHue ?? spec.robeHue ?? (isF ? 22 : 38),
    innerHue: spec.appearance?.innerHue ?? (isF ? 348 : 28),
    sashHue: spec.appearance?.sashHue ?? (isF ? 16 : 45),
    heightTrait: spec.appearance?.heightTrait ?? (isF ? 0.96 : 1.02),
    buildTrait: spec.appearance?.buildTrait ?? (isF ? 0.94 : 1.04),
  };
  const ageYears = spec.ageYears ?? 21;

  return {
    id: spec.id || `char_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    name: spec.name,
    sex: spec.sex || 'f',
    generation: spec.generation || 1,
    parents: spec.parents || [],
    ageYears,
    growthScale: computeGrowthScale(ageYears, defaultAppearance.heightTrait),
    appearance: defaultAppearance,
    alive: true,

    // Position & kinematics (meters in 1024x1024 basin)
    x: spec.x,
    y: spec.y,
    vx: 0,
    vy: 0,
    speed: 0, // Real-time meters/sec for 60 FPS client interpolation
    targetX: spec.x,
    targetY: spec.y,
    heading: spec.heading ?? 0,
    moving: false,
    // 'standing' | 'walking' | 'crouching' | 'sitting' | 'sleeping' | 'working' | 'chopping' | 'sawing' | 'hauling' | 'swimming' | 'floating'
    posture: 'standing',

    // Water submergence (0 = dry land, 0.1..0.85 = wading/sinking in water) & emergent swimming skill (0..1)
    waterDepth: 0,
    waterSubmerge: 0,
    swimSkill: spec.swimSkill ?? 0,

    // Temperament / personality inclinations
    temperament: spec.temperament || 'observant, gentle, quietly curious',
    hairHue: spec.hairHue ?? 38,
    robeHue: defaultAppearance.robeHue,

    // Somatic state (dozens of physical & psychological sensations)
    somatic: spec.somatic || createSomaticState(),

    // Blank-slate epistemic knowledge
    knownSpecies: spec.knownSpecies || {},
    tools: spec.tools || [],
    inventory: spec.inventory || [],
    // Physical item currently being dragged or carried:
    // { id, kind: 'log_chunk'|'small_log_chunk'|'reed_bundle'|'stone_chunk', species, name, weight, coCarrierId }
    hauling: spec.hauling || null,
    actionTarget: null,

    // Social & family bonds shaped by treatment
    bonds: spec.bonds || {},
    pregnancy: spec.pregnancy || null,

    // Cognitive stream
    thought: spec.thought || 'Opening my eyes to the quiet rustle of leaves and the glint of water.',
    feeling: spec.feeling || 'quiet wonder',
    speech: null,
    activity: spec.activity || {
      type: 'ponder',
      label: 'taking in the unfamiliar forest',
      startedAt: 0,
      durationSimSec: 160,
    },
    memories: spec.memories || [
      {
        time: 'Year 1, spring day 1',
        text: 'Woke in a sunlit clearing beside the water, knowing nothing of this world except the breath in my lungs.',
        importance: 1.0,
      },
    ],
    lastAiSimSec: -9999,
    aiPending: false,
  };
}

export function addMemory(char, clock, text, importance = 0.6) {
  char.memories.unshift({
    time: clock.label(),
    text,
    importance,
  });
  if (char.memories.length > 45) {
    const head = char.memories.slice(0, 25);
    const tail = char.memories.slice(25).sort((a, b) => b.importance - a.importance).slice(0, 15);
    char.memories = [...head, ...tail];
  }
}

export function say(char, clock, text, durationSimSec = 360) {
  char.speech = {
    text,
    untilSimSec: clock.simSeconds + durationSimSec,
  };
}

export function ensureBond(charA, charB) {
  if (!charA.bonds[charB.id]) {
    charA.bonds[charB.id] = {
      trust: 0.55,
      affection: 0.55,
      gratitude: 0.2,
      resentment: 0.0,
      status: 'Curious Companions',
      recentActs: [],
      lastTalkSimSec: 0,
    };
  }
  const b = charA.bonds[charB.id];
  if (b.gratitude === undefined) b.gratitude = 0.2;
  if (b.resentment === undefined) b.resentment = 0.0;
  if (!Array.isArray(b.recentActs)) b.recentActs = [];
  b.status = computeBondStatus(b);
  return b;
}

export function computeBondStatus(b) {
  if (b.resentment > 0.35 || b.trust < 0.35) return 'Strained & Guarded';
  if (b.resentment > 0.2) return 'Wary & Hurt';
  if (b.trust > 0.82 && b.affection > 0.82) return 'Deeply Devoted Partners';
  if (b.trust > 0.7 && b.affection > 0.7) return 'Trusted Companions';
  if (b.trust > 0.58 || b.affection > 0.58) return 'Warm Companions';
  return 'Cautious Acquaintances';
}

/**
 * Computes the comfortable personal space distance (in meters) between `char` and `other`
 * based on their current relationship feelings (trust, affection, resentment).
 */
export function preferredPersonalSpace(char, other) {
  if (!other) return 3.5;
  const b = ensureBond(char, other);
  if (b.resentment > 0.3 || b.trust < 0.38) {
    // Strained/hurt: want plenty of breathing room!
    return 9.5 + b.resentment * 8.0;
  }
  if (b.resentment > 0.15) {
    return 6.0;
  }
  if (b.affection > 0.8 && b.trust > 0.78) {
    // Deeply devoted: comfortable close together, but still respectful of bodily space
    return 2.4;
  }
  // Normal warm companions: polite personal space
  return 4.2 - (b.affection - 0.5) * 2.2;
}

export function recordRelationshipAct(actor, recipient, clock, { dTrust = 0, dAffection = 0, dGratitude = 0, dResentment = 0, reason = '' }) {
  if (!actor || !recipient || actor.id === recipient.id) return;
  const bond = ensureBond(recipient, actor);
  bond.trust = clamp(bond.trust + dTrust, 0.05, 1);
  bond.affection = clamp(bond.affection + dAffection, 0.05, 1);
  bond.gratitude = clamp(bond.gratitude + dGratitude, 0, 1);
  bond.resentment = clamp(bond.resentment + dResentment, 0, 1);
  bond.status = computeBondStatus(bond);

  if (reason) {
    bond.recentActs.unshift({
      time: clock ? clock.label() : 'Recently',
      text: reason,
      positive: dTrust + dAffection + dGratitude >= dResentment,
    });
    if (bond.recentActs.length > 8) bond.recentActs.length = 8;
  }
}

function coinSpeciesName(speciesKey, part, outcome) {
  const names = {
    bilberry: outcome === 'sweet' ? 'Misty Blue-Drop' : 'Low Oval-Leaf',
    bramble: 'Thorny Black-Cluster',
    elder: outcome === 'sick' ? 'Bitter Purple-Elder' : 'Cream-Blossom Shrub',
    hazel: 'Frilled Sweet-Nut',
    persimmon: outcome === 'sweet' ? 'Sun-Lantern Fruit' : 'Puckering Orange-Orb',
    chestnut: 'Burr-Shield Nut',
    oak: 'Heavy Ridge-Oak',
    pine: 'Resin-Needle Pine',
    cedar: 'Straight Strip-Cedar',
    willow: 'Supple Water-Willow',
    sakura: 'Dawn-Blossom Tree',
    maple: 'Five-Finger Maple',
    ginkgo: 'Golden Fan-Tree',
    birch: 'White-Paper Birch',
    bamboo: 'Hollow Creak-Cane',
    reeds: 'Plume Marsh-Reed',
    fern: 'Soft Shade-Frond',
    wildgarlic: 'Sharp-Scent Leaf',
    cattail: 'Velvet Down-Stalk',
    clover: 'Three-Leaf Carpet',
    moss: 'Velvet Stone-Moss',
    mushroom_brown: 'Log-Cluster Cap',
    mushroom_red: 'Spotted Fever-Cap',
    mushroom_pale: 'Pale Ghost-Skirt',
    flint: 'Dark Spark-Flint',
    ironstone: 'Heavy Rust-Stone',
    clay: 'Smooth River-Clay',
    stones: 'Grey River-Cobble',
    deadwood: 'Dry Heart-Tinder',
  };
  return names[speciesKey] || `Wild ${part || speciesKey}`;
}

export function deriveObservedQualities(speciesKey) {
  const sp = SPECIES[speciesKey];
  if (!sp) return [];
  const mat = sp.material || {};
  const q = [];
  if (sp.kind === 'tree' && (mat.timber || mat.poles)) {
    q.push('heavy_timber', 'structural_beam', 'wind_blocking');
  }
  if (mat.bark || mat.thatch || speciesKey === 'fern' || speciesKey === 'reeds' || speciesKey === 'cattail' || speciesKey === 'pine' || speciesKey === 'cedar') {
    q.push('rain_shedding', 'wind_blocking', 'insulating');
  }
  if (speciesKey === 'fern' || speciesKey === 'moss' || speciesKey === 'reeds' || speciesKey === 'cattail' || speciesKey === 'clover') {
    q.push('soft_bedding', 'insulating');
  }
  if (mat.tinder || mat.resin || mat.firewood || speciesKey === 'deadwood' || speciesKey === 'pine' || speciesKey === 'birch' || speciesKey === 'cedar' || speciesKey === 'cattail') {
    q.push('flammable_tinder', 'fuel');
  }
  if (mat.knap || speciesKey === 'flint' || speciesKey === 'ironstone' || speciesKey === 'stones') {
    q.push('hard_stone', 'spark_striker', 'cutting_edge');
  }
  if (mat.cordage || speciesKey === 'willow' || speciesKey === 'reeds' || speciesKey === 'cedar' || speciesKey === 'bamboo') {
    q.push('flexible_binding');
  }
  if (speciesKey === 'clay') {
    q.push('wind_sealing', 'heat_retaining');
  }
  return q;
}

/**
 * Computes water depth in meters at `(x, y)` from the signed water distance field `world.water`.
 * `sd < 0` means inside a river, pond, or lake.
 */
export function waterDepthAt(world, x, y) {
  const sd = sampleField(world, world.water, x, y);
  if (sd >= 0.15) return 0;
  return clamp((0.15 - sd) * 0.48, 0, 3.0);
}

/**
 * Finds the nearest dry bank point from `(x, y)`.
 */
function findNearestDryBank(world, x, y) {
  let bestX = x, bestY = y, bestD = 999;
  for (let r = 1.5; r <= 24; r += 1.5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const tx = x + Math.cos(a) * r;
      const ty = y + Math.sin(a) * r;
      const sd = sampleField(world, world.water, tx, ty);
      if (sd >= 1.2) {
        if (r < bestD) {
          bestD = r;
          bestX = tx;
          bestY = ty;
        }
      }
    }
    if (bestD < 999) break;
  }
  return { x: bestX, y: bestY };
}

/**
 * Checks if `(x, y)` is on a completed bridge structure.
 */
function isOnBridge(structures, x, y) {
  for (const st of structures) {
    if (st.kind === 'bridge' && st.complete) {
      if (dist(x, y, st.x, st.y) <= Math.max(st.width || 7.5, 4) * 0.65) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Step a character's physical movement, personal space, water immersion, somatic state, and current activity.
 */
export function stepCharacter(char, dtSimSec, ctx) {
  if (!char.alive) return;
  const { world, clock, weather, structures, characters, onWearPath } = ctx;
  const dtH = dtSimSec / 3600;
  const simPerRealSec = clock.simRate || 72;

  // Children (< 18 yrs) mature steadily so you can watch them grow up from small children into youths and full-sized adults!
  const ageRateDays = char.ageYears < 18 ? 14 : 120;
  char.ageYears += dtH / (24 * ageRateDays);
  char.growthScale = computeGrowthScale(char.ageYears, char.appearance?.heightTrait || 1.0);

  if (char.speech && clock.simSeconds > char.speech.untilSimSec) {
    char.speech = null;
  }

  const tClass = terrainAt(world, char.x, char.y);
  const nearFireWarmth = fireWarmthAt(structures, char.x, char.y);
  const insideShelter = findShelterAt(structures, char.x, char.y);
  const onBridge = isOnBridge(structures, char.x, char.y);

  // Compute physical water depth & submergence (unless standing on a bridge!)
  const rawDepth = onBridge ? 0 : waterDepthAt(world, char.x, char.y);
  char.waterDepth = Math.round(rawDepth * 100) / 100;
  if (rawDepth > 0.05) {
    // Sink proportional to depth; if swimming/floating with skill, keep head & shoulders buoyant!
    const maxSink = char.swimSkill > 0.35 ? 0.52 : 0.82;
    char.waterSubmerge = Math.round(clamp(rawDepth / 1.35, 0.08, maxSink) * 100) / 100;
    char.somatic.skinWetness = clamp(char.somatic.skinWetness + rawDepth * 0.35 * dtH * 12, 0, 1);
  } else {
    char.waterSubmerge = 0;
  }

  let nearestPartner = null;
  let partnerDist = 999;
  for (const other of characters) {
    if (other.id === char.id || !other.alive) continue;
    ensureBond(char, other);
    const d = dist(char.x, char.y, other.x, other.y);
    if (d < partnerDist) {
      partnerDist = d;
      nearestPartner = other;
    }
  }

  // Personal Space Respect: never encroach overly much on another character's space unless co-working, comforting, or sleeping inside a shelter!
  if (nearestPartner) {
    const isCoWorkingOrSheltering =
      char.hauling?.coCarrierId === nearestPartner.id ||
      char.activity?.type === 'co_buck_tree' ||
      char.activity?.type === 'comfort_partner' ||
      char.activity?.type === 'share_food' ||
      char.activity?.type === 'sleep' ||
      nearestPartner.activity?.type === 'sleep' ||
      Boolean(insideShelter);
    const minAllowedDist = isCoWorkingOrSheltering ? 1.15 : Math.max(2.0, preferredPersonalSpace(char, nearestPartner) * 0.65);

    if (partnerDist < minAllowedDist && partnerDist > 0.01 && char.posture !== 'sleeping' && char.activity?.type !== 'sleep') {
      const pushX = (char.x - nearestPartner.x) / partnerDist;
      const pushY = (char.y - nearestPartner.y) / partnerDist;
      const pushStep = Math.min(minAllowedDist - partnerDist, 0.035 * dtSimSec);
      const nx = char.x + pushX * pushStep;
      const ny = char.y + pushY * pushStep;
      if (waterDepthAt(world, nx, ny) < 0.15) {
        char.x = nx;
        char.y = ny;
      }
    }
  }

  const e0 = sampleField(world, world.elev, char.x, char.y);
  const e1 = sampleField(world, world.elev, char.x + Math.cos(char.heading) * 2, char.y + Math.sin(char.heading) * 2);
  const slope = Math.abs(e1 - e0) / 2;

  const env = {
    weather,
    clock,
    terrain: tClass,
    nearFireWarmth,
    insideShelter,
    partnerDist,
    nearestPartner,
    slope,
  };

  updateSomatic(char, dtH, env);

  // Neglect check
  if (nearestPartner && partnerDist > 38 && (nearestPartner.somatic.poisonLoad > 0.3 || nearestPartner.somatic.bodyWarmth < 0.25)) {
    if (Math.random() < 0.015) {
      recordRelationshipAct(char, nearestPartner, clock, {
        dTrust: -0.01,
        dResentment: 0.015,
        reason: `${char.name} stayed far away while I was shivering and unwell`,
      });
    }
  }

  // Pregnancy progression & birth
  if (char.pregnancy) {
    char.pregnancy.progressDays += dtH / 24;
    if (char.pregnancy.progressDays >= char.pregnancy.termDays) {
      ctx.deliverChild(char, char.pregnancy);
      char.pregnancy = null;
    }
  }

  // If accidentally in deep water (> 0.55m) and not already swimming to shore or intentionally floating, trigger swim_to_shore!
  if (rawDepth > 0.55 && char.activity?.type !== 'swim_to_shore' && char.activity?.type !== 'float_in_water') {
    const bank = findNearestDryBank(world, char.x, char.y);
    const knowsSwim = char.swimSkill >= 0.35;
    char.thought = knowsSwim
      ? 'The water is deep here—I will kick smoothly and swim back to the bank.'
      : 'I slipped into deep water and my feet cannot touch bottom! I have to paddle hard and kick to reach the bank!';
    char.feeling = knowsSwim ? 'swimming steadily' : 'startled and paddling';
    char.activity = {
      type: 'swim_to_shore',
      label: knowsSwim ? 'swimming back to the riverbank' : 'splashing and paddling to get out of deep water',
      targetX: bank.x,
      targetY: bank.y,
      arriveRadius: 0.9,
      startedAt: clock.simSeconds,
      elapsedSimSec: 0,
      durationSimSec: 120,
    };
  }

  // Movement toward activity target if any
  const act = char.activity;
  if (act && act.targetX !== undefined && act.targetY !== undefined) {
    const dx = act.targetX - char.x;
    const dy = act.targetY - char.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const arriveDist = act.arriveRadius ?? 1.4;

    if (d > arriveDist) {
      const fatiguePenalty = 1 - char.somatic.fatigue * 0.32 - char.somatic.footSoreness * 0.22 - char.somatic.kneeJointAche * 0.18;
      // Weight penalty when hauling: smaller chunks or co-carrying with partner are much easier to carry!
      const haulWeight = char.hauling ? (char.hauling.coCarrierId ? 0.85 : char.hauling.weight < 0.7 ? 0.88 : 0.65) : 1.0;
      const waterSpeedFactor = rawDepth > 0.4 ? (0.42 + char.swimSkill * 0.28) : rawDepth > 0.1 ? 0.68 : 1.0;
      const speedMetersPerSimSec = 0.046 * clamp(fatiguePenalty, 0.38, 1) * haulWeight * waterSpeedFactor;
      const step = Math.min(d, speedMetersPerSimSec * dtSimSec);
      const nx = char.x + (dx / d) * step;
      const ny = char.y + (dy / d) * step;

      // Characters NEVER walk into water unless swimming back to shore, floating, or on a bridge!
      const nextDepth = isOnBridge(structures, nx, ny) ? 0 : waterDepthAt(world, nx, ny);
      const nextRim = sampleField(world, world.rim, nx, ny);
      const allowWater = act.type === 'swim_to_shore' || act.type === 'float_in_water' || (act.type === 'drink' && nextDepth < 0.32) || (act.type === 'fish_at_bank' && nextDepth < 0.35);

      if ((nextDepth < 0.14 || allowWater || nextDepth < rawDepth) && nextRim < 0.92) {
        char.x = nx;
        char.y = ny;
        char.heading = Math.atan2(dy, dx);
        char.moving = true;
        char.speed = Math.round(speedMetersPerSimSec * simPerRealSec * 100) / 100;
        char.targetX = Math.round(act.targetX * 100) / 100;
        char.targetY = Math.round(act.targetY * 100) / 100;
        char.posture = rawDepth > 0.45 ? 'swimming' : char.hauling ? 'hauling' : 'walking';
        char.actionTarget = null;

        // If co-carrying a log with partner, move partner in tandem at the rear end of the log!
        if (char.hauling?.coCarrierId && nearestPartner && nearestPartner.id === char.hauling.coCarrierId) {
          nearestPartner.x = char.x - Math.cos(char.heading) * 1.65;
          nearestPartner.y = char.y - Math.sin(char.heading) * 1.65;
          nearestPartner.heading = char.heading;
          nearestPartner.moving = true;
          nearestPartner.speed = char.speed;
          nearestPartner.targetX = Math.round((act.targetX - Math.cos(char.heading) * 1.65) * 100) / 100;
          nearestPartner.targetY = Math.round((act.targetY - Math.sin(char.heading) * 1.65) * 100) / 100;
          nearestPartner.posture = 'hauling';
        }

        if (char.hauling) {
          const strainFactor = char.hauling.coCarrierId ? 0.35 : char.hauling.weight < 0.7 ? 0.45 : 1.0;
          char.somatic.shoulderAche = clamp(char.somatic.shoulderAche + 0.04 * strainFactor * dtH, 0, 1);
          char.somatic.lowerBackStiff = clamp(char.somatic.lowerBackStiff + 0.035 * strainFactor * dtH, 0, 1);
          // Much slower, smaller footprint wear!
          if (onWearPath) onWearPath(char.x, char.y, 0.0024);
        } else if (onWearPath && rawDepth <= 0.05) {
          onWearPath(char.x, char.y, 0.0011);
        }
      } else {
        // Steer along the dry riverbank around water!
        let foundDryStep = false;
        const baseAngle = Math.atan2(dy, dx);
        const turnSign = char.id.charCodeAt(char.id.length - 1) % 2 === 0 ? 1 : -1;
        for (const offset of [0.55, -0.55, 1.05, -1.05, 1.55, -1.55]) {
          const tryAngle = baseAngle + offset * turnSign;
          const sx = char.x + Math.cos(tryAngle) * step * 0.9;
          const sy = char.y + Math.sin(tryAngle) * step * 0.9;
          if (waterDepthAt(world, sx, sy) < 0.14 && sampleField(world, world.rim, sx, sy) < 0.92) {
            char.x = sx;
            char.y = sy;
            char.heading = tryAngle;
            char.moving = true;
            char.speed = Math.round(speedMetersPerSimSec * simPerRealSec * 85) / 100;
            char.targetX = Math.round(sx * 100) / 100;
            char.targetY = Math.round(sy * 100) / 100;
            char.posture = char.hauling ? 'hauling' : 'walking';
            foundDryStep = true;
            break;
          }
        }
        if (!foundDryStep) {
          // Stop at bank edge
          act.targetX = char.x;
          act.targetY = char.y;
          char.moving = false;
          char.speed = 0;
        }
      }
      return;
    }
  }

  char.moving = false;
  char.speed = 0;
  char.targetX = Math.round(char.x * 100) / 100;
  char.targetY = Math.round(char.y * 100) / 100;
  executeCurrentActivity(char, dtSimSec, dtH, env, ctx);
}

function executeCurrentActivity(char, dtSimSec, dtH, env, ctx) {
  const { world, clock, structures, chronicle } = ctx;
  const act = char.activity;
  if (!act) return;

  act.elapsedSimSec = (act.elapsedSimSec || 0) + dtSimSec;
  const duration = act.durationSimSec || 150;
  const progress = clamp(act.elapsedSimSec / duration, 0, 1);

  switch (act.type) {
    case 'drink': {
      char.posture = 'crouching';
      char.actionTarget = null;
      if (!act.done) {
        char.somatic.thirst = clamp(char.somatic.thirst - 0.75, 0, 1);
        char.somatic.mouthBitterness = clamp(char.somatic.mouthBitterness - 0.5, 0, 1);
        act.done = true;
        char.thought = 'The cool river water runs over my cupped hands and eases my dry throat.';
        char.feeling = 'refreshed';
      }
      break;
    }

    // Fishing / bank foraging with a realistic chance of slipping into the water!
    case 'fish_at_bank': {
      char.posture = 'crouching';
      char.actionTarget = { kind: 'fish', x: char.x + Math.cos(char.heading) * 1.2, y: char.y + Math.sin(char.heading) * 1.2, progress };
      if (!act.done && act.elapsedSimSec >= duration * 0.55) {
        act.done = true;
        // 16% chance to slip on the mossy bank into deeper water!
        if (Math.random() < 0.16) {
          const plungeX = char.x + Math.cos(char.heading) * 2.4;
          const plungeY = char.y + Math.sin(char.heading) * 2.4;
          if (waterDepthAt(world, plungeX, plungeY) > 0.45) {
            char.x = plungeX;
            char.y = plungeY;
            char.waterDepth = waterDepthAt(world, plungeX, plungeY);
            char.somatic.skinWetness = 1.0;
            const bank = findNearestDryBank(world, char.x, char.y);
            const wasNovice = char.swimSkill < 0.35;
            char.swimSkill = clamp(char.swimSkill + 0.24, 0, 1);
            addMemory(
              char,
              clock,
              wasNovice
                ? 'Slipped off the mossy bank while reaching into the river! Sank at first, then kicked and paddled until I learned how to stay afloat.'
                : 'Slipped into the river while fishing, but floated calmly and swam back to the bank.',
              0.86
            );
            chronicle.record(
              clock,
              wasNovice
                ? `${char.name} lost their footing while fishing at the riverbank and tumbled into deep water—splashing and kicking back to shore, they began learning how to swim and float.`
                : `${char.name} slipped into the river while fishing and swam smoothly back to the bank.`,
              'discovery',
              { x: char.x, y: char.y }
            );
            say(char, clock, wasNovice ? 'Whoa—! The bank gave way! Kick... kick!' : 'The moss is slick—good thing I know how to float now!');
            char.activity = {
              type: 'swim_to_shore',
              label: 'swimming back to the riverbank after slipping in',
              targetX: bank.x,
              targetY: bank.y,
              arriveRadius: 0.9,
              startedAt: clock.simSeconds,
              elapsedSimSec: 0,
              durationSimSec: 110,
            };
            return;
          }
        }

        // Caught a river fish or freshwater crayfish!
        char.somatic.hunger = clamp(char.somatic.hunger - 0.38, 0, 1);
        if (!char.knownSpecies.river_fish) {
          char.knownSpecies.river_fish = {
            givenName: 'Silver Stream-Dart',
            edible: 'safe',
            qualities: ['nourishing'],
            notes: 'Caught in the shallow turquoise current—rich and sustaining.',
            triedCount: 1,
            learnedFrom: 'self',
          };
          addMemory(char, clock, 'Caught a darting silver fish in the river shallows and named it "Silver Stream-Dart".', 0.82);
          chronicle.record(clock, `${char.name} learned to catch "Silver Stream-Dart" fish along the riverbank.`, 'discovery', { x: char.x, y: char.y });
        }
        if (char.inventory.length < 6) {
          char.inventory.push({
            species: 'river_fish',
            name: 'Silver Stream-Dart',
            part: 'fresh fish',
            kind: 'food',
            kcal: 75,
            effects: {},
          });
        }
        char.thought = 'With quick hands at the water’s edge, I caught a Silver Stream-Dart from the current.';
        char.feeling = 'proud and fed';
      }
      break;
    }

    case 'swim_to_shore': {
      char.posture = char.waterDepth > 0.35 ? 'swimming' : 'crouching';
      char.actionTarget = null;
      if (!act.done) {
        act.done = true;
        char.swimSkill = clamp(char.swimSkill + 0.14, 0, 1);
        char.thought =
          char.swimSkill >= 0.35
            ? 'Climbed back onto the bank, breathing hard. I am starting to feel how the water holds my weight when I relax and float.'
            : 'Pulled myself onto the dry bank, coughing and dripping wet. Now I know how deep that channel is!';
        char.feeling = 'soaked but relieved';
      }
      break;
    }

    case 'float_in_water': {
      char.posture = 'floating';
      char.actionTarget = null;
      char.somatic.shoulderAche = clamp(char.somatic.shoulderAche - 0.18 * dtH, 0, 1);
      char.somatic.lowerBackStiff = clamp(char.somatic.lowerBackStiff - 0.18 * dtH, 0, 1);
      char.somatic.wonder = clamp(char.somatic.wonder + 0.2 * dtH, 0, 1);
      if (!act.done && act.elapsedSimSec >= duration * 0.85) {
        act.done = true;
        const bank = findNearestDryBank(world, char.x, char.y);
        char.activity = {
          type: 'swim_to_shore',
          label: 'wading back onto the bank after floating',
          targetX: bank.x,
          targetY: bank.y,
          arriveRadius: 0.9,
          startedAt: clock.simSeconds,
          elapsedSimSec: 0,
          durationSimSec: 80,
        };
      }
      break;
    }

    case 'forage': {
      char.posture = 'crouching';
      char.actionTarget = act.floraItem ? { kind: 'inspect', x: act.floraItem.x, y: act.floraItem.y, progress } : null;
      if (!act.done && act.elapsedSimSec >= duration * 0.5) {
        act.done = true;
        performForageOrInspect(char, act.floraItem, clock, chronicle);
      }
      break;
    }

    case 'eat': {
      char.posture = 'sitting';
      char.actionTarget = null;
      if (!act.done) {
        act.done = true;
        consumeFoodFromInventory(char, clock, env);
      }
      break;
    }

    case 'share_food': {
      char.posture = 'sitting';
      char.actionTarget = null;
      const partner = env.nearestPartner;
      if (partner && env.partnerDist < 8 && !act.done) {
        act.done = true;
        const foodIdx = char.inventory.findIndex((it) => it.kind === 'food');
        if (foodIdx >= 0) {
          const gift = char.inventory.splice(foodIdx, 1)[0];
          partner.somatic.hunger = clamp(partner.somatic.hunger - (gift.kcal || 55) / 170, 0, 1);
          recordRelationshipAct(char, partner, clock, {
            dTrust: 0.08,
            dAffection: 0.09,
            dGratitude: 0.14,
            dResentment: -0.08,
            reason: `${char.name} brought me ${gift.name} when I was hungry`,
          });
          recordRelationshipAct(partner, char, clock, {
            dTrust: 0.04,
            dAffection: 0.06,
            reason: `Shared ${gift.name} with ${partner.name} and saw their relief`,
          });
          say(char, clock, `Here, ${partner.name}—eat this ${gift.name}. You look hungry.`);
          say(partner, clock, `Thank you, ${char.name}... that means a lot to me.`);
          addMemory(char, clock, `Shared ${gift.name} with ${partner.name} when they were hungry.`, 0.82);
          addMemory(partner, clock, `${char.name} shared their ${gift.name} with me when my stomach was aching.`, 0.86);
        }
      }
      break;
    }

    case 'comfort_partner': {
      char.posture = 'sitting';
      char.actionTarget = null;
      const partner = env.nearestPartner;
      if (partner && env.partnerDist < 8 && !act.done) {
        act.done = true;
        partner.somatic.shoulderAche = clamp(partner.somatic.shoulderAche - 0.25, 0, 1);
        partner.somatic.lowerBackStiff = clamp(partner.somatic.lowerBackStiff - 0.22, 0, 1);
        partner.somatic.nausea = clamp(partner.somatic.nausea - 0.2, 0, 1);
        partner.somatic.exposureDread = clamp(partner.somatic.exposureDread - 0.3, 0, 1);
        partner.somatic.loneliness = 0;
        char.somatic.loneliness = 0;
        recordRelationshipAct(char, partner, clock, {
          dTrust: 0.09,
          dAffection: 0.1,
          dGratitude: 0.12,
          dResentment: -0.1,
          reason: `${char.name} sat beside me and tended my aching body when I felt awful`,
        });
        recordRelationshipAct(partner, char, clock, {
          dTrust: 0.05,
          dAffection: 0.07,
          reason: `Cared for ${partner.name} when they were hurting`,
        });
        say(char, clock, `Rest easy, ${partner.name}. Let me rub the tension from your shoulders.`);
        say(partner, clock, `Your hands are warm, ${char.name}. Thank you.`);
        addMemory(partner, clock, `${char.name} comforted me and eased my pain when I was struggling.`, 0.88);
      }
      break;
    }

    // PHYSICAL STAGE 1: Chopping down a standing tree!
    // When finished, the tree first animates falling and disappears BEFORE the felled trunk appears on the ground!
    case 'fell_tree': {
      char.posture = 'chopping';
      const tree = act.treeItem;
      if (!tree || tree.removed) {
        char.actionTarget = null;
        act.elapsedSimSec = duration;
        break;
      }
      char.heading = Math.atan2(tree.y - char.y, tree.x - char.x);
      char.actionTarget = {
        kind: 'fell_tree',
        floraId: tree.id,
        x: tree.x,
        y: tree.y,
        progress,
      };
      char.somatic.shoulderAche = clamp(char.somatic.shoulderAche + 0.06 * dtH, 0, 1);
      if (char.tools.length === 0) {
        char.somatic.handBlisters = clamp(char.somatic.handBlisters + 0.08 * dtH, 0, 1);
      }

      if (!act.done && act.elapsedSimSec >= duration * 0.92) {
        act.done = true;
        char.actionTarget = null;
        if (ctx.fellTreeIntoTrunk) {
          const trunk = ctx.fellTreeIntoTrunk(tree, char);
          const spName = char.knownSpecies[tree.s]?.givenName || coinSpeciesName(tree.s, 'tree', 'material');
          addMemory(char, clock, `Felled a tall ${spName}. Now I need to decide whether to ask for help or cut it into smaller chunks.`, 0.82);
          chronicle.record(
            clock,
            `${char.name} felled a ${spName} (${act.reason || 'to hew timber logs for shelter'}).`,
            'architecture',
            { x: tree.x, y: tree.y }
          );
          if (trunk) {
            // Pause briefly to watch the tree fall & disappear (2.4 real seconds = ~170 sim sec) before deciding how to handle the fallen trunk!
            char.thought = `The ${spName} is crashing down through the canopy! Once it settles on the ground, I'll decide whether to ask for help or cut it into chunks.`;
            char.feeling = 'awed and focused';
            char.activity = {
              type: 'watch_tree_fall',
              label: `stepping back as the ${spName} falls`,
              trunkId: trunk.id,
              structureId: act.structureId,
              startedAt: clock.simSeconds,
              elapsedSimSec: 0,
              durationSimSec: 175,
            };
            return;
          }
        }
      }
      break;
    }

    case 'watch_tree_fall': {
      char.posture = 'standing';
      char.actionTarget = null;
      // When the tree has finished falling and disappeared, the AI Mind (`decideNextAction`) will choose
      // between asking partner for help chopping, asking partner for help carrying, cutting into small chunks, or solo hauling!
      break;
    }

    // PHYSICAL STAGE 2 (Option A/C/D): Cutting a felled trunk into either 3 standard chunks or 5 smaller easy-to-carry chunks, solo or with partner's help!
    case 'buck_tree':
    case 'co_buck_tree': {
      char.posture = 'sawing';
      const trunk = ctx.groundItems?.find((g) => g.id === act.trunkId);
      if (!trunk) {
        char.actionTarget = null;
        act.elapsedSimSec = duration;
        break;
      }
      char.heading = Math.atan2(trunk.y - char.y, trunk.x - char.x);
      char.actionTarget = {
        kind: 'buck_tree',
        trunkId: trunk.id,
        x: trunk.x,
        y: trunk.y,
        progress,
      };
      const isCooperative = act.type === 'co_buck_tree';
      const strainMult = isCooperative ? 0.45 : 1.0;
      char.somatic.shoulderAche = clamp(char.somatic.shoulderAche + 0.05 * strainMult * dtH, 0, 1);

      // If asking partner for help chopping and partner is nearby, bring partner over to kneel and chop too!
      if (isCooperative && env.nearestPartner && env.partnerDist < 28 && !act.partnerJoined) {
        act.partnerJoined = true;
        const p = env.nearestPartner;
        say(char, clock, `${p.name}, this trunk is heavy—can you help me cut it into sections?`);
        say(p, clock, `Of course, ${char.name}. I'll take this side.`);
        p.activity = {
          type: 'assist_chop',
          label: `helping ${char.name} chop the fallen ${trunk.name}`,
          targetX: trunk.x + Math.cos(trunk.angle || 0) * 0.7,
          targetY: trunk.y + Math.sin(trunk.angle || 0) * 0.7,
          arriveRadius: 1.4,
          startedAt: clock.simSeconds,
          elapsedSimSec: 0,
          durationSimSec: duration * 0.9,
        };
        recordRelationshipAct(p, char, clock, {
          dTrust: 0.06,
          dAffection: 0.06,
          dGratitude: 0.08,
          reason: `${p.name} came over to help me chop the heavy ${trunk.name}`,
        });
      }

      if (!act.done && act.elapsedSimSec >= duration * 0.88) {
        act.done = true;
        char.actionTarget = null;
        if (ctx.buckTrunkIntoChunks) {
          const chunkCount = act.smallChunks ? 5 : 3;
          const chunks = ctx.buckTrunkIntoChunks(trunk, char, chunkCount);
          char.thought = act.smallChunks
            ? `Cut the trunk into ${chunks.length} smaller, lighter billets so I can carry them without straining my aching back.`
            : isCooperative
              ? `Working together, we cut the fallen trunk into ${chunks.length} solid log chunks in half the time.`
              : `Split the fallen trunk into ${chunks.length} log chunks ready to haul.`;
          char.feeling = 'accomplished';
          const st = structures.find((s) => s.id === act.structureId) || structures.find((s) => !s.complete || s.pendingMod);
          if (chunks[0] && st) {
            char.activity = {
              type: 'pickup_and_haul',
              label: `hauling ${chunks[0].name} to ${st.name}`,
              groundItemId: chunks[0].id,
              coCarryWithPartner: Boolean(act.coCarryNext),
              structureId: st.id,
              targetX: chunks[0].x,
              targetY: chunks[0].y,
              arriveRadius: 1.4,
              startedAt: clock.simSeconds,
              elapsedSimSec: 0,
              durationSimSec: 250,
            };
            return;
          }
        }
      }
      break;
    }

    case 'assist_chop': {
      char.posture = 'sawing';
      break;
    }

    case 'gather_bundle': {
      char.posture = 'working';
      const f = act.floraItem;
      if (f) {
        char.heading = Math.atan2(f.y - char.y, f.x - char.x);
        char.actionTarget = { kind: 'bundle', x: f.x, y: f.y, progress };
      }
      if (!act.done && act.elapsedSimSec >= duration * 0.65) {
        act.done = true;
        char.actionTarget = null;
        const key = f?.s || 'reeds';
        if (!char.knownSpecies[key]) {
          char.knownSpecies[key] = {
            givenName: coinSpeciesName(key, SPECIES[key]?.kind || 'plant', 'material'),
            edible: 'non-food',
            qualities: deriveObservedQualities(key),
            notes: `Bundled for its ${Object.keys(SPECIES[key]?.material || {}).join(' and ') || 'fibers'}.`,
            triedCount: 1,
            learnedFrom: 'self',
          };
        }
        const bundleKind = SPECIES[key]?.kind === 'rock' ? 'stone_chunk' : 'reed_bundle';
        const givenName = char.knownSpecies[key].givenName;
        char.hauling = {
          id: `haul_${Date.now().toString(36)}`,
          kind: bundleKind,
          species: key,
          name: `${givenName} ${bundleKind === 'stone_chunk' ? 'Stones' : 'Bundle'}`,
          weight: 0.75,
        };
        const st = structures.find((s) => s.id === act.structureId) || structures.find((s) => !s.complete || s.pendingMod);
        if (st) {
          char.thought = `I've bound a bundle of ${givenName}. Now I'll pull it back to ${st.name}.`;
          char.activity = {
            type: 'deliver_haul',
            label: `pulling ${char.hauling.name} to ${st.name}`,
            structureId: st.id,
            targetX: st.x + (char.sex === 'f' ? 1.4 : -1.4),
            targetY: st.y + 0.9,
            arriveRadius: 2.0,
            startedAt: clock.simSeconds,
            elapsedSimSec: 0,
            durationSimSec: 240,
          };
          return;
        }
      }
      break;
    }

    // PHYSICAL STAGE 3A: Picking up a log chunk (either solo, smaller chunk, or asking partner to help carry the other end!)
    case 'pickup_and_haul': {
      const idx = ctx.groundItems ? ctx.groundItems.findIndex((g) => g.id === act.groundItemId) : -1;
      const st = structures.find((s) => s.id === act.structureId) || structures.find((s) => !s.complete || s.pendingMod);
      if (idx >= 0 && st) {
        const item = ctx.groundItems.splice(idx, 1)[0];
        let coCarrierId = null;

        if (act.coCarryWithPartner && env.nearestPartner && env.partnerDist < 28) {
          const p = env.nearestPartner;
          coCarrierId = p.id;
          say(char, clock, `${p.name}, could you take the other end of this ${item.name} with me?`);
          say(p, clock, `I've got the back end—let's lift together.`);
          p.thought = `Helping ${char.name} carry the heavy ${item.name} so neither of us strains our back alone.`;
          p.feeling = 'cooperative';
          recordRelationshipAct(p, char, clock, {
            dTrust: 0.065,
            dAffection: 0.06,
            dGratitude: 0.09,
            reason: `${p.name} helped me carry the heavy ${item.name} to ${st.name}`,
          });
        }

        char.hauling = {
          id: item.id,
          kind: item.kind || 'log_chunk',
          species: item.species,
          name: item.name,
          weight: item.weight ?? (item.kind === 'small_log_chunk' ? 0.5 : 1.0),
          coCarrierId,
        };
        char.thought = coCarrierId
          ? `Lifting the ${item.name} together with ${env.nearestPartner.name} makes the load feel twice as light.`
          : item.kind === 'small_log_chunk'
            ? `Because I cut this ${item.name} into a smaller billet, I can haul it easily without hurting my back.`
            : `Digging my heels in and pulling this heavy ${item.name} across the ground toward ${st.name}.`;
        char.feeling = coCarrierId ? 'supported and grateful' : 'straining but purposeful';
        char.activity = {
          type: 'deliver_haul',
          label: coCarrierId
            ? `carrying ${item.name} together with ${env.nearestPartner.name}`
            : `dragging ${item.name} to ${st.name}`,
          structureId: st.id,
          targetX: st.x + (char.sex === 'f' ? 1.4 : -1.4),
          targetY: st.y + 0.9,
          arriveRadius: 2.0,
          startedAt: clock.simSeconds,
          elapsedSimSec: 0,
          durationSimSec: 250,
        };
        return;
      } else {
        act.elapsedSimSec = duration;
      }
      break;
    }

    // PHYSICAL STAGE 3B: Arrived at the building site while hauling a log chunk or bundle
    case 'deliver_haul': {
      const st = structures.find((s) => s.id === act.structureId) || structures.find((s) => !s.complete || s.pendingMod);
      if (char.hauling && st) {
        const hauled = char.hauling;
        char.hauling = null;
        if (st.pendingMod) {
          st.pendingMod.chunksDelivered = (st.pendingMod.chunksDelivered || 0) + 1;
        } else {
          deliverChunkToStructure(st, hauled, char.name);
        }

        if (env.nearestPartner) {
          recordRelationshipAct(char, env.nearestPartner, clock, {
            dTrust: 0.045,
            dAffection: 0.035,
            dGratitude: 0.06,
            reason: `${char.name} hauled ${hauled.name} to build ${st.name} for us`,
          });
        }

        char.thought = `Set the ${hauled.name} down at ${st.name}. Now I can fit and lash it into place.`;
        char.feeling = 'accomplished';
        char.activity = {
          type: 'build',
          label: `fitting ${hauled.name} into ${st.name}`,
          structureId: st.id,
          targetX: st.x + (char.sex === 'f' ? 1.4 : -1.4),
          targetY: st.y + 0.9,
          arriveRadius: 2.0,
          startedAt: clock.simSeconds,
          elapsedSimSec: 0,
          durationSimSec: 165,
        };
        return;
      }
      act.elapsedSimSec = duration;
      break;
    }

    case 'build': {
      char.posture = 'working';
      const st = structures.find((s) => s.id === act.structureId);
      if (st) {
        char.heading = Math.atan2(st.y - char.y, st.x - char.x);
        char.actionTarget = { kind: 'build', x: st.x, y: st.y, progress };
        const hasToolBonus = char.tools.length > 0 ? 1.3 : 1.0;
        const result = advanceStructureWork(st, dtH * 0.65 * hasToolBonus);
        if (result?.finished === 'structure') {
          char.actionTarget = null;
          char.somatic.pride = clamp(char.somatic.pride + 0.5, 0, 1);
          addMemory(char, clock, `Finished building ${st.name} (${st.reason}).`, 0.92);
          chronicle.record(clock, `${char.name} completed the ${st.name}—${st.reason}.`, 'invention', { x: st.x, y: st.y });
          say(char, clock, `It holds together... Look, our ${st.name} is ready.`);
          char.thought = `My hands and shoulders ache from hauling and fitting each piece, but seeing the ${st.name} standing makes my chest warm.`;
          char.feeling = 'quiet pride';
          if (env.nearestPartner) {
            recordRelationshipAct(char, env.nearestPartner, clock, {
              dTrust: 0.08,
              dAffection: 0.08,
              dGratitude: 0.1,
              reason: `${char.name} finished building our ${st.name}`,
            });
          }
          act.elapsedSimSec = duration;
        } else if (result?.finished === 'upgrade') {
          char.actionTarget = null;
          char.somatic.pride = clamp(char.somatic.pride + 0.45, 0, 1);
          addMemory(char, clock, `Improved ${st.name}: ${result.upgrade.description}.`, 0.88);
          chronicle.record(clock, `${char.name} improved ${st.name}: ${result.upgrade.description} (${result.upgrade.reason}).`, 'architecture', { x: st.x, y: st.y });
          say(char, clock, `There—more room to breathe now.`);
          char.thought = `After ${result.upgrade.description}, the space feels so much more open and comfortable.`;
          char.feeling = 'relieved and proud';
          act.elapsedSimSec = duration;
        }
      }
      break;
    }

    case 'tend_fire': {
      char.posture = 'crouching';
      const fire = structures.find((s) => s.id === act.structureId);
      if (fire && !act.done) {
        act.done = true;
        fire.fuel = 1.0;
        fire.lit = true;
        char.thought = 'Dry twigs catch the glowing embers; warm golden light pushes back the chill.';
        char.feeling = 'warmed';
        if (env.nearestPartner && env.partnerDist < 18 && env.nearestPartner.somatic.bodyWarmth < 0.5) {
          recordRelationshipAct(char, env.nearestPartner, clock, {
            dTrust: 0.04,
            dAffection: 0.05,
            dGratitude: 0.06,
            reason: `${char.name} fed the hearth fire to warm us`,
          });
        }
      }
      break;
    }

    case 'craft_tool': {
      char.posture = 'sitting';
      if (!act.done && act.elapsedSimSec >= duration * 0.7) {
        act.done = true;
        const toolName = act.toolName || 'Flint Hand-Edge';
        if (!char.tools.some((t) => t.name === toolName)) {
          char.tools.push({
            id: `tool_${Date.now().toString(36)}`,
            name: toolName,
            purpose: act.toolPurpose || 'cutting stems, scraping bark, and hewing timber without blistering bare hands',
            createdYear: clock.year,
          });
          char.somatic.pride = clamp(char.somatic.pride + 0.45, 0, 1);
          addMemory(char, clock, `Crafted a ${toolName} (${act.toolPurpose || 'to ease work on my hands'}).`, 0.85);
          chronicle.record(clock, `${char.name} fashioned a ${toolName}—${act.toolPurpose || 'a new tool born of sore hands'}.`, 'invention', { x: char.x, y: char.y });
          if (ctx.collectiveKnowledge && !ctx.collectiveKnowledge.inventions.includes(toolName)) {
            ctx.collectiveKnowledge.inventions.push(toolName);
          }
        }
      }
      break;
    }

    case 'converse': {
      char.posture = 'sitting';
      char.actionTarget = null;
      const partner = env.nearestPartner;
      if (partner && env.partnerDist < 10 && !act.done) {
        act.done = true;
        shareKnowledgeAndBond(char, partner, clock, chronicle, ctx, act.speechText);
      }
      break;
    }

    case 'sleep': {
      char.posture = 'sleeping';
      char.actionTarget = null;
      // Ensure sleeping characters settle right onto their interior sleeping mat inside the shelter!
      if (act.targetX !== undefined && act.targetY !== undefined) {
        char.x += (act.targetX - char.x) * 0.35;
        char.y += (act.targetY - char.y) * 0.35;
        char.targetX = Math.round(char.x * 100) / 100;
        char.targetY = Math.round(char.y * 100) / 100;
      }
      break;
    }

    case 'rest':
    case 'ponder':
    default: {
      char.posture = 'sitting';
      char.actionTarget = null;
      break;
    }
  }
}

function performForageOrInspect(char, floraItem, clock, chronicle) {
  if (!floraItem) return;
  const key = floraItem.s;
  const sp = SPECIES[key];
  if (!sp) return;

  const season = clock.season;
  const foods = (sp.food && sp.food[season]) || [];
  const qualities = deriveObservedQualities(key);
  let entry = char.knownSpecies[key];

  if (foods.length > 0) {
    const f = foods[0];
    const eff = f.effects || {};
    const isToxic = (eff.toxicity || 0) > 0.3;
    const isBitter = (eff.bitterness || 0) > 0.45 || (eff.nausea || 0) > 0.3;

    if (entry && entry.edible === 'toxic') {
      char.thought = `I remember the ${entry.givenName} made my stomach twist and head swim. I'll leave its fruit untouched.`;
      char.feeling = 'cautious';
      return;
    }

    const kcalGain = f.kcal || 30;
    char.somatic.hunger = clamp(char.somatic.hunger - kcalGain / 210, 0, 1);
    if (eff.nausea) char.somatic.nausea = clamp(char.somatic.nausea + eff.nausea * 0.65, 0, 1);
    if (eff.cramps) char.somatic.stomachCramps = clamp(char.somatic.stomachCramps + eff.cramps * 0.65, 0, 1);
    if (eff.bitterness) char.somatic.mouthBitterness = clamp(char.somatic.mouthBitterness + eff.bitterness * 0.7, 0, 1);
    if (eff.dizziness) char.somatic.dizziness = clamp(char.somatic.dizziness + eff.dizziness * 0.65, 0, 1);
    if (eff.toxicity) char.somatic.poisonLoad = clamp(char.somatic.poisonLoad + eff.toxicity * 0.45, 0, 1);
    if (eff.scratches || eff.handPain) char.somatic.handScratches = clamp(char.somatic.handScratches + 0.25, 0, 1);

    const outcome = isToxic ? 'sick' : isBitter ? 'bitter' : 'sweet';
    if (!entry) {
      const givenName = coinSpeciesName(key, f.part, outcome);
      const edibleClass = isToxic ? 'toxic' : isBitter ? 'bitter-raw' : 'safe';
      const matKeys = Object.keys(sp.material || {});
      const matSuffix = matKeys.length ? ` Its ${matKeys.join('/')} also feels useful.` : '';
      const note = isToxic
        ? `Tasted ${f.part}—caused dizzy nausea and cramps. Dangerous.${matSuffix}`
        : isBitter
          ? `Tasted ${f.part}—puckeringly bitter raw${f.better ? `; maybe ${f.better}` : ''}.${matSuffix}`
          : `Tasted ${f.part}—nourishing and gentle on the stomach.${matSuffix}`;

      char.knownSpecies[key] = {
        givenName,
        edible: edibleClass,
        qualities,
        notes: note,
        triedCount: 1,
        learnedFrom: 'self',
      };
      addMemory(char, clock, `First tasted ${f.part} (${givenName}): ${note}`, 0.8);
      chronicle.record(
        clock,
        `${char.name} examined and tasted ${f.part} for the first time, naming it "${givenName}" (${isToxic ? 'made them ill' : isBitter ? 'bitter raw' : 'sweet and nourishing'}).`,
        'discovery',
        { x: char.x, y: char.y }
      );
      char.thought = note;
      char.feeling = isToxic ? 'queasy and regretful' : isBitter ? 'puckered but curious' : 'grateful';
    } else {
      entry.triedCount = (entry.triedCount || 1) + 1;
      entry.qualities = qualities;
      char.thought = `Gathered ${f.part} from the ${entry.givenName}.`;
      char.feeling = 'sustained';
    }

    if (!isToxic && char.inventory.length < 6) {
      char.inventory.push({
        species: key,
        name: char.knownSpecies[key].givenName,
        part: f.part,
        kind: 'food',
        kcal: kcalGain,
        effects: eff,
      });
    }
  } else {
    if (!entry) {
      const givenName = coinSpeciesName(key, sp.kind, 'material');
      const matKeys = Object.keys(sp.material || {});
      let observation = `Observed ${lookOf(key, season)}.`;
      if (qualities.includes('heavy_timber')) {
        observation = `Tested its stout trunk and branches (${matKeys.join(', ')})—strong enough to hold up a roof or span water if felled and cut.`;
      } else if (qualities.includes('rain_shedding') || qualities.includes('soft_bedding')) {
        observation = `Felt its thick, layered ${matKeys.join(' and ') || 'fronds'}—could block wind, shed rain, or cushion cold ground.`;
      } else if (qualities.includes('spark_striker') || qualities.includes('flammable_tinder')) {
        observation = `Examined its ${matKeys.join(' and ') || 'dry fibers'}—could catch a spark or feed a warm fire.`;
      }
      char.knownSpecies[key] = {
        givenName,
        edible: 'non-food',
        qualities,
        notes: observation,
        triedCount: 1,
        learnedFrom: 'self',
      };
      addMemory(char, clock, `Examined ${lookOf(key, season)} and named it "${givenName}": ${observation}`, 0.72);
      chronicle.record(
        clock,
        `${char.name} closely examined ${lookOf(key, season)}, naming it "${givenName}" and noting: ${observation}`,
        'discovery',
        { x: char.x, y: char.y }
      );
      char.thought = `Turned it over in my hands—I'll call this ${givenName}. ${observation}`;
      char.feeling = 'insightful';
    }
  }
}

function consumeFoodFromInventory(char, clock, env) {
  const idx = char.inventory.findIndex((it) => it.kind === 'food');
  if (idx < 0) return;
  const item = char.inventory.splice(idx, 1)[0];
  char.somatic.hunger = clamp(char.somatic.hunger - (item.kcal || 50) / 190, 0, 1);
  char.thought = `Ate the ${item.part} (${item.name}) I was carrying; warmth returns to my stomach.`;
  char.feeling = 'nourished';

  const partner = env?.nearestPartner;
  if (partner && env.partnerDist < 16 && partner.somatic.hunger > 0.65) {
    recordRelationshipAct(char, partner, clock, {
      dTrust: -0.04,
      dAffection: -0.03,
      dResentment: 0.06,
      reason: `${char.name} ate ${item.name} in front of me while I was starving`,
    });
    addMemory(partner, clock, `Watched ${char.name} eat ${item.name} while my own stomach cramped with hunger.`, 0.72);
  }
}

function shareKnowledgeAndBond(char, partner, clock, chronicle, ctx, customSpeech) {
  const b1 = ensureBond(char, partner);
  const b2 = ensureBond(partner, char);
  b1.lastTalkSimSec = clock.simSeconds;
  b2.lastTalkSimSec = clock.simSeconds;

  char.somatic.loneliness = clamp(char.somatic.loneliness - 0.5, 0, 1);
  partner.somatic.loneliness = clamp(partner.somatic.loneliness - 0.5, 0, 1);

  if (partner.somatic.hunger > 0.42) {
    const foodIdx = char.inventory.findIndex((it) => it.kind === 'food');
    if (foodIdx >= 0) {
      const gift = char.inventory.splice(foodIdx, 1)[0];
      partner.somatic.hunger = clamp(partner.somatic.hunger - (gift.kcal || 50) / 175, 0, 1);
      recordRelationshipAct(char, partner, clock, {
        dTrust: 0.07,
        dAffection: 0.08,
        dGratitude: 0.12,
        dResentment: -0.07,
        reason: `${char.name} gave me ${gift.name} when I was hungry`,
      });
      recordRelationshipAct(partner, char, clock, {
        dTrust: 0.04,
        dAffection: 0.05,
        reason: `Gave ${gift.name} to ${partner.name}`,
      });
      say(char, clock, customSpeech || `Here, ${partner.name}, eat this ${gift.name} I found.`);
      say(partner, clock, `Thank you, ${char.name}... I really needed that.`);
      addMemory(char, clock, `Shared ${gift.name} with ${partner.name} when they were hungry.`, 0.78);
      return;
    }
  }

  let sharedTopic = null;
  for (const [k, info] of Object.entries(char.knownSpecies)) {
    if (!partner.knownSpecies[k]) {
      partner.knownSpecies[k] = {
        ...info,
        qualities: info.qualities || deriveObservedQualities(k),
        learnedFrom: char.name,
      };
      sharedTopic = info;
      addMemory(partner, clock, `${char.name} taught me about ${info.givenName}: ${info.notes}`, 0.78);
      recordRelationshipAct(char, partner, clock, {
        dTrust: 0.045,
        dAffection: 0.04,
        dGratitude: 0.05,
        reason: `${char.name} taught me what they discovered about ${info.givenName}`,
      });
      break;
    }
  }

  recordRelationshipAct(char, partner, clock, {
    dTrust: 0.025,
    dAffection: 0.03,
    dResentment: -0.03,
    reason: !sharedTopic ? `${char.name} checked in on me and talked quietly` : '',
  });
  recordRelationshipAct(partner, char, clock, {
    dTrust: 0.025,
    dAffection: 0.03,
    dResentment: -0.03,
  });

  if (customSpeech) {
    say(char, clock, customSpeech);
  } else if (sharedTopic) {
    say(char, clock, `${partner.name}, look at the ${sharedTopic.givenName}—${sharedTopic.notes.toLowerCase()}`);
  } else {
    const som = describeSomaticNotes(char, {})[0];
    if (som) {
      say(char, clock, `Sit with me a moment, ${partner.name}. My ${som.text}.`);
    } else {
      say(char, clock, `Listen to the water, ${partner.name}. We're figuring this valley out piece by piece.`);
    }
  }

  const hasShelter = ctx.structures.some((s) => (s.kind === 'shelter' || s.kind === 'pavilion') && s.complete);
  const fChar = char.sex === 'f' ? char : partner.sex === 'f' ? partner : null;
  const mChar = char.sex === 'm' ? char : partner.sex === 'm' ? partner : null;
  if (
    hasShelter &&
    fChar &&
    mChar &&
    !fChar.pregnancy &&
    fChar.ageYears >= 18 &&
    fChar.ageYears <= 44 &&
    b1.affection > 0.76 &&
    b1.trust > 0.74 &&
    b1.resentment < 0.15 &&
    fChar.somatic.hunger < 0.55 &&
    fChar.somatic.bodyWarmth > 0.42 &&
    ctx.characters.filter((c) => c.alive).length < 18 &&
    Math.random() < 0.08
  ) {
    fChar.pregnancy = {
      partnerId: mChar.id,
      partnerName: mChar.name,
      progressDays: 0,
      termDays: 18,
    };
    addMemory(fChar, clock, `Felt the quiet beginning of new life with ${mChar.name}.`, 0.96);
    addMemory(mChar, clock, `${fChar.name} and I are expecting a child.`, 0.96);
    chronicle.record(
      clock,
      `Under the shelter they built with their own hands, ${fChar.name} and ${mChar.name} conceived a child.`,
      'lineage',
      { x: fChar.x, y: fChar.y }
    );
  }
}
