// Emergent Invention & Physical Construction Engine.
// Nothing here is pre-ordained: characters only conceive ways to stay warm, dry, or sheltered
// from materials they have ACTUALLY examined in their explorations.
// Construction requires physically cutting down trees, bucking them into log chunks on the ground,
// and hauling each chunk (or bundle of reeds / river stones) over to the site.

import { clamp, dist } from '../../shared/dmath.js';

export function createStructureBlueprint(spec, clock) {
  const kind = spec.kind || 'shelter'; // 'fire' | 'windbreak' | 'shelter' | 'bridge' | 'lantern' | 'pavilion'
  const stories = clamp(spec.stories || 1, 1, 12);
  const width = clamp(
    spec.width || (kind === 'bridge' ? 8.5 : kind === 'fire' || kind === 'lantern' ? 1.6 : kind === 'windbreak' ? 5.6 : 6.8),
    1.4,
    24
  );
  const depth = clamp(
    spec.depth || (kind === 'bridge' ? 2.6 : kind === 'fire' || kind === 'lantern' ? 1.6 : kind === 'windbreak' ? 4.2 : 4.8),
    1.4,
    20
  );
  const headroom = clamp(spec.headroom || (kind === 'windbreak' ? 1.85 : kind === 'shelter' ? 2.15 : 2.6), 1.2, 4.8);
  const height = stories * headroom + (spec.roofPitch || 1.25);

  // Physical chunks required to be hauled to the site before framing completes
  const chunksRequired =
    spec.chunksRequired ??
    (kind === 'fire' ? 2 :
     kind === 'windbreak' ? 2 :
     kind === 'lantern' ? 2 :
     kind === 'bridge' ? 5 :
     Math.max(3, Math.round((width * depth * stories) / 2.8)));

  const defaultWork =
    kind === 'fire' ? 0.45 :
    kind === 'windbreak' ? 0.8 :
    kind === 'lantern' ? 0.9 :
    kind === 'bridge' ? 2.5 :
    1.8 * stories;

  return {
    id: `str_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    name: spec.name || defaultStructureName(kind, stories),
    reason: spec.reason || 'conceived from materials observed in exploration',
    inspiredByMaterials: spec.inspiredByMaterials || [],
    conceivedBy: spec.conceivedBy || 'Ren',
    conceivedYear: clock?.year || 1,
    conceivedSeason: clock?.season || 'spring',
    x: Math.round(spec.x * 100) / 100,
    y: Math.round(spec.y * 100) / 100,
    angle: spec.angle ?? 0,

    width,
    depth,
    area: Math.round(width * depth * stories * 10) / 10,
    headroom,
    height: Math.round(height * 100) / 100,
    stories,
    roofStyle: spec.roofStyle || (stories >= 2 ? 'hipped-eaves' : headroom < 1.55 ? 'lean-to' : 'gabled-thatch'),
    roofQuality: clamp(spec.roofQuality ?? (kind === 'windbreak' ? 0.35 : kind === 'shelter' ? 0.6 : 0.82), 0.1, 1),
    wallQuality: clamp(spec.wallQuality ?? (kind === 'windbreak' ? 0.4 : kind === 'shelter' ? 0.55 : 0.78), 0.1, 1),
    insulation: clamp(spec.insulation ?? (kind === 'windbreak' ? 0.35 : 0.5), 0.1, 1),
    bedding: clamp(spec.bedding ?? (kind === 'windbreak' ? 0.3 : 0.2), 0, 1),
    hasWindow: Boolean(spec.hasWindow ?? (headroom > 1.75)),
    hasVeranda: Boolean(spec.hasVeranda ?? (width > 4.6)),
    vented: Boolean(spec.vented ?? true),
    materialsUsed: spec.materialsUsed || [],

    // Physical material delivery tracking
    chunksRequired,
    chunksDelivered: spec.chunksDelivered ?? 0,
    deliveredItems: [], // [{ kind, name, by }]

    progress: spec.progress ?? 0,
    workDone: 0,
    workRequired: clamp(spec.workRequired ?? defaultWork, 0.3, 60),
    complete: Boolean(spec.complete ?? false),

    fuel: kind === 'fire' ? 1.0 : kind === 'lantern' ? 1.0 : 0,
    lit: kind === 'fire' || kind === 'lantern',
    upgrades: [],
  };
}

function defaultStructureName(kind, stories) {
  if (kind === 'fire') return 'Kindled Stone Hearth';
  if (kind === 'windbreak') return 'Insulating Frond & Reed Windbreak';
  if (kind === 'lantern') return 'River Guide Lantern';
  if (kind === 'bridge') return 'Hewn Timber Crossing';
  if (stories >= 3) return `${stories}-Tier Timber Pavilion`;
  if (stories >= 2) return 'Two-Story Timber House';
  return 'Joined Timber Cabin';
}

export function deliverChunkToStructure(structure, chunk, byName) {
  structure.chunksDelivered = (structure.chunksDelivered || 0) + 1;
  structure.deliveredItems.push({
    kind: chunk.kind || 'log_chunk',
    name: chunk.name || 'Timber Log Chunk',
    by: byName,
  });
  updateStructureProgress(structure);
}

export function updateStructureProgress(structure) {
  const matRatio = clamp((structure.chunksDelivered || 0) / Math.max(1, structure.chunksRequired || 1), 0, 1);
  const workRatio = clamp((structure.workDone || 0) / Math.max(0.1, structure.workRequired || 1), 0, 1);
  structure.progress = clamp(matRatio * 0.65 + workRatio * 0.35, 0, 1);
}

export function beginStructureImprovement(structure, mod, clock) {
  structure.pendingMod = {
    description: mod.description || 'expanding and refining the structure',
    reason: mod.reason || 'to ease bodily discomfort',
    by: mod.by || 'Ren',
    chunksRequired: mod.chunksRequired ?? 2,
    chunksDelivered: 0,
    workDone: 0,
    workRequired: clamp(mod.workRequired || 1.2, 0.4, 15),
    changes: mod.changes || {},
    startedYear: clock?.year || 1,
  };
  return structure.pendingMod;
}

export function advanceStructureWork(structure, workHours) {
  if (!structure.complete) {
    // Can only finish assembly up to the materials physically hauled to the site
    const maxWorkAllowed =
      structure.chunksDelivered >= structure.chunksRequired
        ? structure.workRequired
        : structure.workRequired * ((structure.chunksDelivered + 0.3) / structure.chunksRequired);
    structure.workDone = Math.min(maxWorkAllowed, (structure.workDone || 0) + workHours);
    updateStructureProgress(structure);

    if (structure.chunksDelivered >= structure.chunksRequired && structure.workDone >= structure.workRequired) {
      structure.complete = true;
      structure.progress = 1;
      if (structure.kind === 'fire' || structure.kind === 'lantern') {
        structure.lit = true;
        structure.fuel = 1.0;
      }
      return { finished: 'structure', structure };
    }
    return null;
  }

  if (structure.pendingMod) {
    const pm = structure.pendingMod;
    const maxWork =
      pm.chunksDelivered >= pm.chunksRequired
        ? pm.workRequired
        : pm.workRequired * ((pm.chunksDelivered + 0.3) / pm.chunksRequired);
    pm.workDone = Math.min(maxWork, pm.workDone + workHours);

    if (pm.chunksDelivered >= pm.chunksRequired && pm.workDone >= pm.workRequired) {
      const ch = pm.changes;
      if (ch.kind) structure.kind = ch.kind;
      if (ch.dWidth) structure.width = clamp(structure.width + ch.dWidth, 1.5, 22);
      if (ch.dDepth) structure.depth = clamp(structure.depth + ch.dDepth, 1.5, 22);
      if (ch.dHeadroom) structure.headroom = clamp(structure.headroom + ch.dHeadroom, 1.1, 4.5);
      if (ch.dStories) structure.stories = clamp(structure.stories + ch.dStories, 1, 15);
      if (ch.dRoof) structure.roofQuality = clamp(structure.roofQuality + ch.dRoof, 0.1, 1);
      if (ch.dWall) structure.wallQuality = clamp(structure.wallQuality + ch.dWall, 0.1, 1);
      if (ch.dInsulation) structure.insulation = clamp(structure.insulation + ch.dInsulation, 0.1, 1);
      if (ch.dBedding) structure.bedding = clamp(structure.bedding + ch.dBedding, 0, 1);
      if (ch.hasWindow !== undefined) structure.hasWindow = ch.hasWindow;
      if (ch.hasVeranda !== undefined) structure.hasVeranda = ch.hasVeranda;
      if (ch.roofStyle) structure.roofStyle = ch.roofStyle;
      if (ch.newName) structure.name = ch.newName;

      structure.area = Math.round(structure.width * structure.depth * structure.stories * 10) / 10;
      structure.height = Math.round((structure.stories * structure.headroom + 1.0) * 100) / 100;
      structure.upgrades.push({
        description: pm.description,
        reason: pm.reason,
        by: pm.by,
        year: pm.startedYear,
      });
      structure.pendingMod = null;
      return { finished: 'upgrade', structure, upgrade: structure.upgrades[structure.upgrades.length - 1] };
    }
  }
  return null;
}

/**
 * Evaluates what architectural improvement a character's body and mind naturally crave
 * based on their somatic sensations AND what materials they have discovered in their explorations.
 */
export function diagnoseShelterNeed(char, shelter, collectiveKnowledge) {
  if (!shelter || !shelter.complete || shelter.pendingMod) return null;
  const s = char.somatic;
  const known = char.knownSpecies || {};
  const knownTimber = ['pine', 'cedar', 'oak', 'chestnut', 'maple'].find((k) => known[k]);
  const knownSoft = ['fern', 'reeds', 'pine'].find((k) => known[k]);
  const knownBarkOrClay = ['cedar', 'clay', 'reeds'].find((k) => known[k]);

  // If it's still an early frond/branch windbreak and they've discovered strong timber trees -> raise a real timber cabin!
  if (shelter.kind === 'windbreak' && knownTimber) {
    const treeName = known[knownTimber].givenName;
    return {
      description: `felling ${treeName} trunks, cutting them into logs, and hauling them here to raise a sturdy timber cabin around our windbreak`,
      reason: `${char.name} realized the tall, strong ${treeName} trunks seen in the forest can hold up a real roof against the cold and rain`,
      by: char.name,
      chunksRequired: 3,
      workRequired: 1.6,
      changes: {
        kind: 'shelter',
        dWidth: 1.0,
        dDepth: 0.8,
        dHeadroom: 0.35,
        dRoof: 0.3,
        dWall: 0.3,
        roofStyle: 'gabled-thatch',
        newName: 'Hewn Timber Cabin',
      },
    };
  }

  // 1. Claustrophobia or neck stiffness -> fell tall trees to raise the roof beams
  if ((s.claustrophobia > 0.24 || s.neckStiff > 0.24) && shelter.headroom < 2.2 && knownTimber) {
    const treeName = known[knownTimber].givenName;
    return {
      description: `cutting and hauling taller ${treeName} posts to raise the roof beams so we no longer feel boxed-in`,
      reason: `${char.name} felt claustrophobic and stiff-necked under the low ${shelter.headroom.toFixed(1)}m ceiling`,
      by: char.name,
      chunksRequired: 2,
      workRequired: 1.5,
      changes: {
        dHeadroom: 0.65,
        dWidth: 0.7,
        dDepth: 0.6,
        roofStyle: 'gabled-thatch',
        newName: shelter.width > 4 ? 'High-Beamed Timber Hall' : 'Raised-Eave Timber Cabin',
      },
    };
  }

  // 2. Claustrophobia -> open a framed lattice window facing the water
  if (s.claustrophobia > 0.22 && !shelter.hasWindow) {
    return {
      description: 'cutting a framed lattice window facing the water to let in breeze and light',
      reason: `${char.name} felt closed-in by the solid walls`,
      by: char.name,
      chunksRequired: 1,
      workRequired: 1.0,
      changes: { hasWindow: true, dWidth: 0.4 },
    };
  }

  // 3. Stiff lower back -> gather soft ferns/reeds discovered in the forest for sleeping mats
  if (s.lowerBackStiff > 0.24 && shelter.bedding < 0.75 && knownSoft) {
    const matName = known[knownSoft].givenName;
    return {
      description: `gathering and weaving soft ${matName} into thick sleeping mats`,
      reason: `${char.name}'s lower back was aching from sleeping on hard ground, and they remembered how soft ${matName} felt`,
      by: char.name,
      chunksRequired: 1,
      workRequired: 1.0,
      changes: { dBedding: 0.45, dInsulation: 0.15 },
    };
  }

  // 4. Damp skin or wind chill inside -> seal roof & walls with discovered bark/clay/reeds
  if ((s.skinWetness > 0.22 || s.windChillFeeling > 0.22) && shelter.roofQuality < 0.88 && knownBarkOrClay) {
    const sealName = known[knownBarkOrClay].givenName;
    return {
      description: `hauling ${sealName} to weatherproof the eaves and seal drafty wall gaps`,
      reason: `${char.name} felt cold drafts and dampness seeping inside and remembered the water-shedding ${sealName}`,
      by: char.name,
      chunksRequired: 2,
      workRequired: 1.3,
      changes: { dRoof: 0.28, dWall: 0.28, dInsulation: 0.25 },
    };
  }

  // 5. Veranda or upper story once experienced
  const mastery = (collectiveKnowledge?.inventions?.length || 0) + (shelter.upgrades?.length || 0);
  if (mastery >= 2 && !shelter.hasVeranda && knownTimber) {
    return {
      description: `felling ${known[knownTimber].givenName} to build a raised wooden engawa veranda along the front`,
      reason: `${char.name} wanted a dry open porch to sit under the eaves and watch the river`,
      by: char.name,
      chunksRequired: 2,
      workRequired: 1.8,
      changes: { hasVeranda: true, dWidth: 1.2, dDepth: 0.8, roofStyle: 'hipped-eaves', newName: 'Veranda Timber House' },
    };
  }

  if (mastery >= 4 && shelter.stories < 5 && knownTimber) {
    const nextStories = shelter.stories + 1;
    return {
      description: `hewing and hauling heavy ${known[knownTimber].givenName} columns to raise a ${nextStories === 2 ? 'second story' : `tier-${nextStories} gallery`}`,
      reason: `${char.name} wanted to look out above the forest canopy toward the central lake`,
      by: char.name,
      chunksRequired: 3,
      workRequired: 2.5,
      changes: {
        dStories: 1,
        dWidth: 0.6,
        dDepth: 0.6,
        roofStyle: 'hipped-eaves',
        newName: nextStories >= 3 ? `${nextStories}-Tier Golden Pavilion` : 'Two-Story Timber House',
      },
    };
  }

  return null;
}

export function findShelterAt(structures, x, y) {
  for (const st of structures) {
    if (st.kind !== 'shelter' && st.kind !== 'windbreak' && st.kind !== 'pavilion' && st.kind !== 'tower') continue;
    if (!st.complete && st.progress < 0.35) continue;
    const hw = (st.width || 6.8) * 0.52 + 0.6;
    const hd = (st.depth || 4.8) * 0.52 + 0.6;
    if (Math.abs(x - st.x) <= hw && Math.abs(y - st.y) <= hd) return st;
  }
  return null;
}

export function fireWarmthAt(structures, x, y) {
  let w = 0;
  for (const st of structures) {
    if (!st.lit || st.fuel <= 0) continue;
    const d = dist(x, y, st.x, st.y);
    const reach = st.kind === 'fire' ? 12 : 4.5;
    if (d < reach) {
      const intensity = st.kind === 'fire' ? 1.0 : 0.25;
      w += intensity * Math.pow(1 - d / reach, 1.5) * clamp(st.fuel, 0.2, 1);
    }
  }
  return clamp(w, 0, 1);
}
