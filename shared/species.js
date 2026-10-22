// The living catalog of the basin: what grows here, what it looks like, and the HIDDEN truth
// of what it does when eaten / used. Characters never see names or truths directly; they
// only perceive `look` descriptions and must learn everything else through experience.
//
// food[season] -> list of edible-ish parts available in that season
//   kcal: energy gained per handful/portion
//   effects: hidden consequences (nausea, cramps, mouthPain, toxicity 0..1, bitterness 0..1)
//   better: hidden note about preparation that makes it safer/better (discoverable later)
// material: hidden physical affordances for invention (flexibility, strength, burn, etc.)

export const SPECIES = {
  // ---------------------------------------------------------------- TREES
  willow: {
    kind: 'tree', h: [7, 11], crown: [3.5, 5.5],
    look: 'a tree with long, drooping strands of narrow leaves that hang down like falling water',
    nearWater: true,
    food: {},
    material: { branch: { flexible: 0.95, strength: 0.35, weaveable: true }, bark: { fibrous: 0.6, bitterPainRelief: true } },
  },
  sakura: {
    kind: 'tree', h: [6, 9], crown: [3.5, 5],
    look: 'a spreading tree with dark, banded bark',
    seasonLook: { spring: 'clouds of pale pink blossoms', summer: 'glossy leaves and tiny dark fruit', autumn: 'leaves turning bronze and red', winter: 'bare dark branches' },
    food: { summer: [{ part: 'small dark cherries', kcal: 40, effects: { bitterness: 0.5, mouthPain: 0 } }] },
    material: { wood: { strength: 0.6, carvable: true } },
  },
  maple: {
    kind: 'tree', h: [7, 12], crown: [3.5, 5.5],
    look: 'a tree with hand-shaped leaves with five pointed lobes',
    seasonLook: { spring: 'fresh pale-green leaves', summer: 'deep green leaves', autumn: 'leaves blazing crimson and orange', winter: 'bare fine branches' },
    food: { spring: [{ part: 'sweet sap seeping from a broken twig', kcal: 15, effects: {} }] },
    material: { wood: { strength: 0.75, carvable: true } },
  },
  pine: {
    kind: 'tree', h: [9, 16], crown: [3, 5],
    look: 'a tall twisted tree with clumps of long needles and scaly reddish bark, smelling of resin',
    evergreen: true,
    food: {
      autumn: [{ part: 'seeds shaken from the cones', kcal: 90, effects: {} }],
      winter: [{ part: 'pale inner bark', kcal: 35, effects: { bitterness: 0.4 } }],
      spring: [{ part: 'pale inner bark', kcal: 35, effects: { bitterness: 0.4 } }],
    },
    material: { wood: { strength: 0.7, straight: 0.6 }, resin: { sticky: 0.9, burns: 0.95 }, needles: { insulating: 0.5 } },
  },
  cedar: {
    kind: 'tree', h: [14, 22], crown: [2.5, 3.5],
    look: 'a very tall, straight, cone-shaped tree with soft fibrous bark that peels in long strips',
    evergreen: true,
    food: {},
    material: { wood: { strength: 0.65, straight: 0.95, splits: true, rotResistant: 0.8 }, bark: { fibrous: 0.9, waterproof: 0.7 } },
  },
  oak: {
    kind: 'tree', h: [9, 14], crown: [4.5, 6.5],
    look: 'a broad, heavy tree with deeply furrowed bark and wavy-edged leaves',
    seasonLook: { autumn: 'leaves turning brown, small capped nuts scattered beneath', winter: 'bare and gnarled' },
    food: { autumn: [{ part: 'small capped nuts', kcal: 70, effects: { bitterness: 0.9, nausea: 0.35, cramps: 0.2 }, better: 'leaching in running water removes the bitterness' }] },
    material: { wood: { strength: 0.95, hard: 0.9 } },
  },
  chestnut: {
    kind: 'tree', h: [8, 13], crown: [4, 6],
    look: 'a tree with long saw-toothed leaves',
    seasonLook: { summer: 'long creamy flower spikes with a heavy smell', autumn: 'spiky green burrs splitting open on the ground' },
    food: { autumn: [{ part: 'glossy brown nuts inside spiky burrs', kcal: 110, effects: { handPain: 0.4 }, better: 'roasting makes them sweet and soft' }] },
    material: { wood: { strength: 0.8, rotResistant: 0.85 } },
  },
  ginkgo: {
    kind: 'tree', h: [10, 16], crown: [3, 4.5],
    look: 'an ancient-looking tree with small fan-shaped leaves',
    seasonLook: { autumn: 'leaves turned brilliant gold, soft fruits that smell terribly rotten fallen beneath', winter: 'bare' },
    food: { autumn: [{ part: 'pale nuts inside foul-smelling fruit', kcal: 60, effects: { nausea: 0.5, toxicity: 0.15, skinItch: 0.4 }, better: 'roasted nuts, eaten in small amounts, are safe' }] },
    material: { wood: { strength: 0.5 } },
  },
  persimmon: {
    kind: 'tree', h: [6, 9], crown: [3, 4.5],
    look: 'a modest tree with broad glossy leaves',
    seasonLook: { autumn: 'bright orange fruits hanging like small lanterns', winter: 'bare branches still holding a few wrinkled orange fruits' },
    food: {
      autumn: [{ part: 'bright orange fruits', kcal: 120, effects: { bitterness: 0.6, mouthPain: 0.3 }, better: 'the softest, fully ripe ones are intensely sweet' }],
      winter: [{ part: 'wrinkled sweet fruits', kcal: 100, effects: {} }],
    },
    material: { wood: { strength: 0.7, hard: 0.8 } },
  },
  bamboo: {
    kind: 'tree', h: [9, 15], crown: [1.2, 2],
    look: 'tall, hollow, jointed green stems growing close together, creaking in the wind',
    evergreen: true, cluster: true,
    food: { spring: [{ part: 'pointed shoots pushing out of the ground', kcal: 50, effects: { bitterness: 0.7, nausea: 0.2 }, better: 'boiling makes them safe and mild' }] },
    material: { stem: { strength: 0.85, hollow: true, straight: 1.0, light: 0.9, splits: true } },
  },

  // ---------------------------------------------------------------- BUSHES
  bramble: {
    kind: 'bush', h: [1, 1.8], crown: [1, 1.8],
    look: 'a tangled thorny bush with arching canes',
    seasonLook: { summer: 'clusters of glossy black berries', autumn: 'a few shriveled dark berries' },
    food: { summer: [{ part: 'glossy black clustered berries', kcal: 45, effects: { scratches: 0.4 } }] },
    material: { cane: { thorny: true } },
  },
  bilberry: {
    kind: 'bush', h: [0.4, 0.8], crown: [0.6, 1.2],
    look: 'a low bush with small oval leaves',
    seasonLook: { summer: 'tiny dusty-blue berries', autumn: 'leaves turning red' },
    food: { summer: [{ part: 'tiny dusty-blue berries', kcal: 35, effects: {} }] },
    material: {},
  },
  elder: {
    kind: 'bush', h: [2, 3.5], crown: [1.2, 2],
    look: 'a leggy shrub with pithy stems',
    seasonLook: { spring: 'flat plates of tiny cream flowers', summer: 'drooping clusters of tiny purple-black berries' },
    food: {
      spring: [{ part: 'cream flower plates', kcal: 10, effects: {} }],
      summer: [{ part: 'drooping clusters of tiny purple-black berries', kcal: 30, effects: { nausea: 0.6, cramps: 0.3 }, better: 'cooked berries are harmless' }],
    },
    material: { stem: { hollowPith: true } },
  },
  yew: {
    kind: 'bush', h: [2, 4], crown: [1.2, 2.2],
    look: 'a dark, dense evergreen shrub with flat needles',
    seasonLook: { autumn: 'scattered waxy red cup-shaped berries' },
    evergreen: true,
    food: { autumn: [{ part: 'waxy red cup-shaped berries', kcal: 15, effects: { toxicity: 0.85, nausea: 0.9, dizziness: 0.8 } }] },
    material: { wood: { strength: 0.8, flexible: 0.8, springy: true } },
  },
  hazel: {
    kind: 'bush', h: [2.5, 4], crown: [1.5, 2.5],
    look: 'a many-stemmed shrub with soft rounded leaves',
    seasonLook: { spring: 'dangling yellow catkins', autumn: 'small round nuts in frilly husks' },
    food: { autumn: [{ part: 'small round nuts', kcal: 100, effects: {} }] },
    material: { stem: { straight: 0.9, flexible: 0.7, weaveable: true } },
  },
  fern: {
    kind: 'ground', h: [0.5, 1.1], crown: [0.6, 1.1],
    look: 'feathery green fronds unfurling in the shade',
    seasonLook: { spring: 'tightly coiled young fronds', winter: 'brown, collapsed fronds' },
    food: { spring: [{ part: 'coiled young fronds', kcal: 15, effects: { bitterness: 0.4, nausea: 0.25 }, better: 'cooking removes the bitterness' }] },
    material: { frond: { soft: 0.8, insulating: 0.6 } },
  },
  wildgarlic: {
    kind: 'ground', h: [0.2, 0.4], crown: [0.4, 0.8],
    look: 'broad soft leaves in damp shade, smelling strongly of garlic when crushed',
    seasonLook: { spring: 'starry white flowers', summer: 'yellowed leaves', autumn: 'nothing above ground', winter: 'nothing above ground' },
    food: { spring: [{ part: 'broad garlic-smelling leaves', kcal: 12, effects: {} }] },
    material: {},
  },
  mushroom_brown: {
    kind: 'mushroom', h: [0.08, 0.15], crown: [0.15, 0.3],
    look: 'clusters of brown-capped mushrooms growing from a rotting log',
    seasons: ['autumn', 'spring'],
    food: { autumn: [{ part: 'brown-capped mushrooms', kcal: 20, effects: {} }], spring: [{ part: 'brown-capped mushrooms', kcal: 20, effects: {} }] },
    material: {},
  },
  mushroom_red: {
    kind: 'mushroom', h: [0.12, 0.22], crown: [0.15, 0.3],
    look: 'a striking mushroom with a bright red cap covered in white flecks',
    seasons: ['autumn'],
    food: { autumn: [{ part: 'red white-flecked mushroom', kcal: 10, effects: { toxicity: 0.4, nausea: 0.8, dizziness: 0.9 } }] },
    material: {},
  },
  mushroom_pale: {
    kind: 'mushroom', h: [0.1, 0.16], crown: [0.1, 0.2],
    look: 'a smooth, pale greenish-white mushroom with a skirt on its stem',
    seasons: ['autumn', 'summer'],
    food: {
      autumn: [{ part: 'pale skirted mushroom', kcal: 10, effects: { toxicity: 1.0, delayed: true } }],
      summer: [{ part: 'pale skirted mushroom', kcal: 10, effects: { toxicity: 1.0, delayed: true } }],
    },
    material: {},
  },
  chrysanthemum: {
    kind: 'flower', h: [0.3, 0.6], crown: [0.3, 0.6],
    look: 'clumps of many-petaled golden flowers',
    seasons: ['autumn', 'summer'],
    food: { autumn: [{ part: 'golden petals', kcal: 5, effects: { bitterness: 0.3 } }] },
    material: {},
  },
  violet: {
    kind: 'flower', h: [0.1, 0.2], crown: [0.2, 0.4],
    look: 'small purple flowers close to the ground',
    seasons: ['spring'],
    food: { spring: [{ part: 'small purple flowers', kcal: 3, effects: {} }] },
    material: {},
  },
  wildflower: {
    kind: 'flower', h: [0.2, 0.5], crown: [0.3, 0.6],
    look: 'a scatter of small white and pale-blue meadow flowers',
    seasons: ['spring', 'summer'],
    food: {},
    material: {},
  },
  reeds: {
    kind: 'reed', h: [1.5, 2.6], crown: [0.6, 1.2],
    look: 'tall stiff reeds with brown velvety heads standing in the shallows',
    food: {
      spring: [{ part: 'tender white shoot bases', kcal: 25, effects: {} }],
      summer: [{ part: 'tender white shoot bases', kcal: 25, effects: {} }],
      autumn: [{ part: 'starchy roots dug from the mud', kcal: 80, effects: {} }],
      winter: [{ part: 'starchy roots dug from the mud', kcal: 80, effects: {} }],
    },
    material: { stalk: { straight: 0.9, light: 0.9, weaveable: true, insulating: 0.6, waterproofWhenBundled: 0.7 }, fluff: { tinder: 0.95 } },
  },

  // ---------------------------------------------------------------- NON-LIVING
  boulder: {
    kind: 'rock', h: [0.6, 2.2], crown: [0.6, 1.8],
    look: 'a large rounded grey boulder',
    food: {},
    material: { stone: { hard: 0.9, heavy: true } },
  },
  stones: {
    kind: 'rock', h: [0.1, 0.3], crown: [0.5, 1.2],
    look: 'a scatter of fist-sized smooth stones',
    food: {},
    material: { stone: { hard: 0.85, throwable: true, hammer: true } },
  },
  flint: {
    kind: 'rock', h: [0.1, 0.25], crown: [0.4, 1],
    look: 'dark glassy stones with waxy surfaces and sharp broken edges',
    food: {},
    material: { stone: { hard: 0.95, flakesSharp: true, sparksAgainstIronstone: true } },
  },
  ironstone: {
    kind: 'rock', h: [0.1, 0.3], crown: [0.4, 1],
    look: 'heavy rusty-brown lumpy stones',
    food: {},
    material: { stone: { heavy: true, sparksWithFlint: true, pigment: 'red-brown' } },
  },
  clay: {
    kind: 'rock', h: [0.02, 0.05], crown: [1.5, 3],
    look: 'a smooth, sticky, grey-blue mud bank that holds the shape of a footprint',
    food: {},
    material: { clay: { moldable: 0.95, hardensInSun: 0.6, hardensInFire: 0.95 } },
  },
  log: {
    kind: 'log', h: [0.4, 0.8], crown: [1.5, 3.5],
    look: 'a fallen, moss-covered tree trunk',
    food: {},
    material: { wood: { dry: 0.3, rotten: 0.5, burns: 0.5 } },
  },
  deadwood: {
    kind: 'log', h: [0.2, 0.4], crown: [0.8, 1.5],
    look: 'a pile of dry fallen branches and twigs',
    food: {},
    material: { wood: { dry: 0.9, burns: 0.95, kindling: 0.9 } },
  },
};

export const SPECIES_KEYS = Object.keys(SPECIES);
export const SPECIES_INDEX = Object.fromEntries(SPECIES_KEYS.map((k, i) => [k, i]));

/** Appearance text for a species in a season (what a character actually perceives). */
export function lookOf(key, season) {
  const s = SPECIES[key];
  if (!s) return 'something unfamiliar';
  const extra = s.seasonLook && s.seasonLook[season];
  return extra ? `${s.look}, with ${extra}` : s.look;
}

/** Is a species visible at all in the given season (mushrooms, some flowers come and go)? */
export function presentIn(key, season) {
  const s = SPECIES[key];
  if (!s || !s.seasons) return true;
  return s.seasons.includes(season);
}
