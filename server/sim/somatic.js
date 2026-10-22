// The "Flesh, Bone & Nerve" Somatic & Sensory Engine.
// Tracks dozens of physical, visceral, thermal, cutaneous, and spatial-psychological sensations
// that arise organically from posture, labor, weather, terrain, shelter geometry, diet, and company.
// Nothing here is cosmetic: every sensation feeds into the character's comfort, movement speed,
// urges, and the natural-language somatic awareness given to the AI mind.

import { T } from '../../shared/config.js';
import { clamp } from '../../shared/dmath.js';

export function createSomaticState() {
  return {
    // Core visceral drives (0 = none/ideal, 1 = severe)
    hunger: 0.22,
    thirst: 0.18,
    fatigue: 0.12,
    sleepDebt: 0.08,
    bladder: 0.1,

    // Thermal & skin (bodyCore: 0 = hypothermic, 0.5 = comfortable, 1 = overheated)
    bodyWarmth: 0.52,
    skinWetness: 0.05,
    chappedHands: 0.0,
    sunWarmthOnSkin: 0.2,
    smokeInEyes: 0.0,
    windChillFeeling: 0.0,

    // Musculoskeletal (0..1)
    shoulderAche: 0.0,      // hauling wood/stone, heavy work
    lowerBackStiff: 0.0,    // sleeping on hard ground, crouching in low shelter
    neckStiff: 0.0,         // ducking under low roof or sleeping without headrest
    kneeJointAche: 0.0,     // cold + high humidity + climbing steep slopes
    footSoreness: 0.0,      // walking long distances on rocky ground
    handBlisters: 0.0,      // knapping stone, stripping bark, digging without tools
    handScratches: 0.0,     // thorny brambles, spiky chestnut burrs

    // Digestive / toxic reactions
    nausea: 0.0,
    stomachCramps: 0.0,
    mouthBitterness: 0.0,
    dizziness: 0.0,
    poisonLoad: 0.0,

    // Spatial & psychological senses
    claustrophobia: 0.0,    // rises in cramped/low shelters or dense dark thicket
    exposureDread: 0.0,     // rises when unsheltered in darkness, cold rain, or open night
    loneliness: 0.0,        // rises when far from loved ones for hours
    wonder: 0.15,           // aesthetic awe from dawn, blossoms, lake reflections, firelight
    restlessness: 0.1,      // rises when staying in the exact same spot too long while rested
    coziness: 0.1,          // rises when warm, dry, fed, near fire or partner
    pride: 0.1,             // rises after discovering, naming, or building something
  };
}

/**
 * Updates somatic state over `dtH` simulated hours based on environment, activity, and nearby structures.
 */
export function updateSomatic(char, dtH, env) {
  const s = char.somatic;
  const { weather, clock, terrain, nearFireWarmth, insideShelter, partnerDist, slope } = env;
  const sleeping = char.activity?.type === 'sleep';
  const resting = sleeping || char.activity?.type === 'rest' || char.activity?.type === 'converse' || char.activity?.type === 'ponder';
  const hauling = char.carrying && char.carrying.weight > 2;
  const building = char.activity?.type === 'build' || char.activity?.type === 'craft';
  const walking = char.moving;

  // 1. Visceral drives
  const metabolic = sleeping ? 0.55 : resting ? 0.8 : walking ? 1.25 : building ? 1.35 : 1.0;
  const coldBurn = s.bodyWarmth < 0.4 ? (0.4 - s.bodyWarmth) * 0.9 : 0;
  s.hunger = clamp(s.hunger + (0.042 * metabolic + coldBurn * 0.03) * dtH, 0, 1);
  const sweat = s.bodyWarmth > 0.65 ? (s.bodyWarmth - 0.65) * 0.08 : 0;
  s.thirst = clamp(s.thirst + (0.065 * (walking ? 1.2 : 0.9) + sweat) * dtH, 0, 1);

  if (sleeping) {
    const sleepQuality = clamp(1 - s.lowerBackStiff * 0.3 - Math.abs(s.bodyWarmth - 0.52) * 1.1 - s.skinWetness * 0.5, 0.25, 1.1);
    s.fatigue = clamp(s.fatigue - 0.16 * sleepQuality * dtH, 0, 1);
    s.sleepDebt = clamp(s.sleepDebt - 0.18 * sleepQuality * dtH, 0, 1);
  } else {
    const exertion = resting ? -0.04 : (walking ? 0.045 : 0.025) + (hauling ? 0.04 : 0) + (building ? 0.05 : 0);
    s.fatigue = clamp(s.fatigue + exertion * dtH, 0, 1);
    s.sleepDebt = clamp(s.sleepDebt + 0.038 * dtH, 0, 1);
  }

  // 2. Wetness & Thermal balance
  const roofCover = insideShelter ? clamp(insideShelter.roofQuality ?? 0.5, 0, 1) : (terrain === T.FOREST ? 0.28 : 0);
  const wallCover = insideShelter ? clamp(insideShelter.wallQuality ?? 0.4, 0, 1) : (terrain === T.FOREST ? 0.2 : 0);
  const inWater = terrain === T.SHALLOW || terrain === T.DEEP;

  const rainExposure = weather.precip * (1 - roofCover * 0.92);
  const dryRate = (0.18 + nearFireWarmth * 0.65 + (clock.daylight * (1 - weather.cloud) * 0.2)) * (1 - weather.humidity * 0.45);
  if (inWater) {
    s.skinWetness = clamp(s.skinWetness + 1.8 * dtH, 0, 1);
  } else {
    s.skinWetness = clamp(s.skinWetness + (rainExposure * 0.9 - dryRate) * dtH, 0, 1);
  }

  const effectiveWind = weather.wind * (1 - wallCover * 0.85);
  s.windChillFeeling = clamp(effectiveWind * (weather.temp < 16 ? (16 - weather.temp) / 18 : 0.15) * (1 + s.skinWetness * 0.8), 0, 1);
  s.sunWarmthOnSkin = clamp(clock.daylight * (1 - weather.cloud * 0.8) * (1 - roofCover * 0.9), 0, 1);

  // Target body warmth: 0.52 is ideal (~21°C felt temperature)
  const feltTemp =
    weather.temp +
    s.sunWarmthOnSkin * 5.5 +
    nearFireWarmth * 16 +
    (insideShelter ? (insideShelter.insulation ?? 0.3) * 6 : 0) +
    (partnerDist < 2.2 ? 2.5 : 0) -
    s.windChillFeeling * 9 -
    s.skinWetness * 7 +
    (walking || building ? 2.5 : 0);

  const warmthTarget = clamp(0.52 + (feltTemp - 18) / 28, 0.05, 0.95);
  s.bodyWarmth += (warmthTarget - s.bodyWarmth) * (1 - Math.exp(-dtH * 1.4));

  // Smoke sting when very close to a fire in wind or poorly vented shelter
  const smokeTarget = nearFireWarmth > 0.35 ? clamp(nearFireWarmth * 0.35 * (insideShelter && !insideShelter.vented ? 1.4 : weather.wind * 0.8), 0, 0.7) : 0;
  s.smokeInEyes += (smokeTarget - s.smokeInEyes) * (1 - Math.exp(-dtH * 3));

  // 3. Musculoskeletal micro-sensations
  // Shoulder ache from hauling or heavy building
  const shoulderLoad = (hauling ? 0.14 : 0) + (building ? 0.09 : 0);
  s.shoulderAche = clamp(s.shoulderAche + (shoulderLoad - (resting ? 0.08 : 0.025)) * dtH, 0, 1);

  // Lower back & neck stiffness from sleeping on bare ground or crouching in low shelter
  const beddingSoftness = insideShelter?.bedding ?? 0;
  const headroom = insideShelter ? (insideShelter.headroom ?? 1.2) : 3.0; // meters
  const lowCeiling = headroom < 1.65 ? clamp((1.65 - headroom) / 0.9, 0, 1) : 0;

  if (sleeping) {
    const hardGround = clamp(0.65 - beddingSoftness * 0.8, -0.3, 0.65);
    s.lowerBackStiff = clamp(s.lowerBackStiff + hardGround * 0.09 * dtH, 0, 1);
    s.neckStiff = clamp(s.neckStiff + (hardGround * 0.06 + lowCeiling * 0.06) * dtH, 0, 1);
  } else {
    s.lowerBackStiff = clamp(s.lowerBackStiff + (lowCeiling * 0.07 + (building ? 0.04 : 0) - 0.05) * dtH, 0, 1);
    s.neckStiff = clamp(s.neckStiff + (lowCeiling * 0.08 - 0.06) * dtH, 0, 1);
  }

  // Achy joints (knees/ankles) react to damp humidity + chill + climbing slopes
  const dampChill = weather.humidity * clamp((14 - weather.temp) / 16, 0, 1);
  const jointTarget = clamp(dampChill * 0.55 + (slope > 0.15 && walking ? 0.25 : 0) + (char.ageYears > 38 ? (char.ageYears - 38) * 0.012 : 0), 0, 1);
  s.kneeJointAche += (jointTarget - s.kneeJointAche) * (1 - Math.exp(-dtH * 0.6));

  // Foot soreness from walking on rough terrain
  const roughGround = terrain === T.MOUNTAIN || terrain === T.FOOTHILL || terrain === T.SHORE ? 1.4 : 0.7;
  s.footSoreness = clamp(s.footSoreness + ((walking ? 0.04 * roughGround : -0.07) - (sleeping ? 0.09 : 0)) * dtH, 0, 1);

  // Hand blisters & scratches slowly heal
  s.handBlisters = clamp(s.handBlisters + ((building ? 0.035 : 0) - 0.025) * dtH, 0, 1);
  s.handScratches = clamp(s.handScratches - 0.03 * dtH, 0, 1);
  s.chappedHands = clamp(s.chappedHands + ((weather.temp < 6 && s.skinWetness > 0.2 ? 0.04 : -0.03)) * dtH, 0, 1);

  // 4. Digestive & toxin recovery
  s.nausea = clamp(s.nausea - 0.18 * dtH, 0, 1);
  s.stomachCramps = clamp(s.stomachCramps - 0.14 * dtH, 0, 1);
  s.mouthBitterness = clamp(s.mouthBitterness - 0.45 * dtH, 0, 1);
  s.dizziness = clamp(s.dizziness - 0.22 * dtH, 0, 1);
  s.poisonLoad = clamp(s.poisonLoad - 0.08 * dtH, 0, 1);

  // 5. Spatial & psychological feelings
  // Claustrophobia: triggered by cramped footprint or low ceiling when inside shelter, or dense dark thicket
  let claustroTarget = 0;
  if (insideShelter) {
    const space = insideShelter.area ?? 4; // m^2
    const crampedArea = space < 9 ? clamp((9 - space) / 7, 0, 1) : 0;
    const windowRelief = insideShelter.hasWindow ? 0.3 : 0;
    claustroTarget = clamp(crampedArea * 0.55 + lowCeiling * 0.65 - windowRelief, 0, 1);
  } else if (terrain === T.FOREST && clock.isNight && nearFireWarmth < 0.1) {
    claustroTarget = 0.22;
  }
  s.claustrophobia += (claustroTarget - s.claustrophobia) * (1 - Math.exp(-dtH * 0.9));

  // Exposure dread: unsheltered at night or in cold rain without fire
  const darkCold = (1 - clock.daylight) * (1 - nearFireWarmth * 0.85) * (insideShelter ? 0.15 : 1.0);
  const stormDread = weather.precip * (insideShelter ? 0.1 : 0.7);
  const expTarget = clamp(darkCold * 0.65 + stormDread, 0, 1);
  s.exposureDread += (expTarget - s.exposureDread) * (1 - Math.exp(-dtH * 1.1));

  // Loneliness vs companionship
  const lonelyTarget = partnerDist < 8 ? 0.0 : partnerDist < 28 ? 0.18 : clamp(0.35 + (partnerDist - 28) / 140, 0.35, 0.95);
  s.loneliness += (lonelyTarget - s.loneliness) * (1 - Math.exp(-dtH * 0.5));

  // Wonder: rises at dawn/dusk, near water reflections, blossoms, or warm firelight
  const goldenHour = clock.daylight > 0.15 && clock.daylight < 0.65 ? 0.35 : 0;
  const blossomBonus = clock.season === 'spring' || clock.season === 'autumn' ? 0.2 : 0.1;
  const wonderTarget = clamp(goldenHour + blossomBonus + (nearFireWarmth > 0.2 ? 0.2 : 0) - s.fatigue * 0.3 - s.nausea * 0.6, 0.05, 0.95);
  s.wonder += (wonderTarget - s.wonder) * (1 - Math.exp(-dtH * 0.7));

  // Coziness: warm, dry, fed, near partner or fire or shelter
  const cozyTarget = clamp(
    (1 - Math.abs(s.bodyWarmth - 0.55) * 2.2) * 0.4 +
    (1 - s.skinWetness) * 0.2 +
    (1 - s.hunger) * 0.15 +
    (nearFireWarmth > 0.15 ? 0.25 : 0) +
    (insideShelter ? 0.2 : 0) +
    (partnerDist < 5 ? 0.2 : 0) -
    s.claustrophobia * 0.35,
    0,
    1
  );
  s.coziness += (cozyTarget - s.coziness) * (1 - Math.exp(-dtH * 0.8));

  // Restlessness: builds up if well-rested and idle in one small area
  const restTarget = !walking && !building && s.fatigue < 0.35 && s.hunger < 0.5 && clock.daylight > 0.3 ? 0.75 : 0.1;
  s.restlessness += (restTarget - s.restlessness) * (1 - Math.exp(-dtH * 0.5));

  s.pride = clamp(s.pride - 0.02 * dtH, 0.05, 1);
}

/**
 * Produces a vivid, natural-language list of the character's most salient bodily & emotional sensations
 * right now. Used both in the AI mind prompt and in the visitor UI inspector.
 */
export function describeSomaticNotes(char, env) {
  const s = char.somatic;
  const notes = [];

  // Hunger & Thirst
  if (s.thirst > 0.72) notes.push({ k: 'thirst', sev: s.thirst, text: 'throat is parched and dry; craving cool water' });
  else if (s.thirst > 0.42) notes.push({ k: 'thirst', sev: s.thirst, text: 'mouth feels dry; could use a drink soon' });

  if (s.hunger > 0.75) notes.push({ k: 'hunger', sev: s.hunger, text: 'stomach is hollow and aching with hunger' });
  else if (s.hunger > 0.45) notes.push({ k: 'hunger', sev: s.hunger, text: 'belly rumbles softly with growing appetite' });

  // Thermal & Cutaneous
  if (s.bodyWarmth < 0.32) notes.push({ k: 'cold', sev: 1 - s.bodyWarmth, text: 'shivering; fingers and toes feel numb with cold' });
  else if (s.bodyWarmth < 0.44) notes.push({ k: 'chill', sev: 0.65 - s.bodyWarmth, text: 'goosebumps on arms from the chill air' });
  else if (s.bodyWarmth > 0.74) notes.push({ k: 'heat', sev: s.bodyWarmth, text: 'flushed and sweating from warmth' });

  if (s.skinWetness > 0.55) notes.push({ k: 'wet', sev: s.skinWetness, text: 'clothes and hair are soaked and clinging to the skin' });
  else if (s.skinWetness > 0.25) notes.push({ k: 'damp', sev: s.skinWetness, text: 'skin feels damp with mist and dew' });

  if (s.windChillFeeling > 0.45) notes.push({ k: 'windchill', sev: s.windChillFeeling, text: 'cold wind cuts right through, making the shoulders hunch' });
  if (s.sunWarmthOnSkin > 0.55 && s.bodyWarmth >= 0.44) notes.push({ k: 'sun', sev: 0.35, text: 'pleasant warmth of sunlight resting on the neck and shoulders' });
  if (s.smokeInEyes > 0.28) notes.push({ k: 'smoke', sev: s.smokeInEyes, text: 'woodsmoke stings the eyes and smells sharp' });

  // Musculoskeletal
  if (s.shoulderAche > 0.35) notes.push({ k: 'shoulder', sev: s.shoulderAche, text: 'a dull, tight ache in the right shoulder from hauling and lifting' });
  else if (s.shoulderAche > 0.18) notes.push({ k: 'shoulder', sev: s.shoulderAche, text: 'shoulders feel slightly knotted from work' });

  if (s.lowerBackStiff > 0.35) notes.push({ k: 'back', sev: s.lowerBackStiff, text: 'lower back feels stiff and sore from hard ground and stooping' });
  if (s.neckStiff > 0.3) notes.push({ k: 'neck', sev: s.neckStiff, text: 'neck is kinked from ducking under low overhead space' });
  if (s.kneeJointAche > 0.32) notes.push({ k: 'joints', sev: s.kneeJointAche, text: 'knees and ankle joints ache faintly with the damp humidity' });
  if (s.footSoreness > 0.38) notes.push({ k: 'feet', sev: s.footSoreness, text: 'soles of the feet are tender and tired from walking' });
  if (s.handBlisters > 0.25) notes.push({ k: 'hands', sev: s.handBlisters, text: 'palms are raw and calloused from working rough materials' });
  if (s.handScratches > 0.2) notes.push({ k: 'scratches', sev: s.handScratches, text: 'small stinging scratches on the hands and forearms' });

  // Visceral / Digestive
  if (s.nausea > 0.25) notes.push({ k: 'nausea', sev: s.nausea + 0.2, text: 'waves of queasiness in the stomach from something eaten' });
  if (s.stomachCramps > 0.25) notes.push({ k: 'cramps', sev: s.stomachCramps + 0.2, text: 'sharp cramps twisting in the gut' });
  if (s.mouthBitterness > 0.2) notes.push({ k: 'bitter', sev: s.mouthBitterness, text: 'an astringent, puckering bitterness lingering on the tongue' });
  if (s.dizziness > 0.2) notes.push({ k: 'dizzy', sev: s.dizziness + 0.2, text: 'head feels light and slightly swimming' });

  // Fatigue
  if (s.fatigue > 0.72 || s.sleepDebt > 0.72) notes.push({ k: 'fatigue', sev: Math.max(s.fatigue, s.sleepDebt), text: 'eyelids are heavy; limbs feel like lead and long for sleep' });
  else if (s.fatigue > 0.45) notes.push({ k: 'tired', sev: s.fatigue, text: 'a gentle weariness settling into the legs' });

  // Spatial & Psychological
  if (s.claustrophobia > 0.3) {
    notes.push({
      k: 'claustrophobia',
      sev: s.claustrophobia + 0.15,
      text: env?.insideShelter
        ? 'feeling boxed-in and claustrophobic—the low ceiling and tight walls press in; wishing for higher beams and more breathing room'
        : 'feeling hemmed in by the tangled undergrowth',
    });
  }
  if (s.exposureDread > 0.38) notes.push({ k: 'exposure', sev: s.exposureDread, text: 'feeling vulnerable and exposed to the vast dark sky; wanting walls, roof, or firelight' });
  if (s.loneliness > 0.35) notes.push({ k: 'lonely', sev: s.loneliness, text: 'a quiet ache of solitude; wondering where their companion is' });
  if (s.coziness > 0.62) notes.push({ k: 'cozy', sev: 0.4, text: 'a deep sense of warmth, safety, and quiet contentment' });
  if (s.wonder > 0.6) notes.push({ k: 'wonder', sev: 0.35, text: 'struck by the quiet beauty of the light, water, and trees' });
  if (s.restlessness > 0.55) notes.push({ k: 'restless', sev: s.restlessness * 0.7, text: 'legs feel restless and curious to wander, explore, or make something new' });

  notes.sort((a, b) => b.sev - a.sev);
  return notes;
}
