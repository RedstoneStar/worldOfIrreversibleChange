// Shared constants for world + time. Changing WORLD values changes the generated world.

export const WORLD = {
  size: 1024, // meters across (and grid cells: 1 cell = 1 m)
  radius: 480, // basin radius in meters (mountain crest ~ here)
  defaultSeed: 'ren-and-sora',
  version: 1, // bump when worldgen changes in a way that invalidates saves
};

export const TIME = {
  // One simulated day passes every REAL hour. Day and night cycle 24x per real day.
  realSecondsPerSimDay: 3600,
  daysPerSeason: 30, // 1 sim year = 120 sim days = 5 real days
  seasons: ['spring', 'summer', 'autumn', 'winter'],
  startHour: 6.4, // genesis at dawn
};

// Terrain classes (per 1 m cell)
export const T = {
  DEEP: 0,
  SHALLOW: 1,
  SHORE: 2,
  CLEARING: 3,
  FOREST: 4,
  FOOTHILL: 5,
  MOUNTAIN: 6,
  PEAK: 7,
  VOID: 8,
};

export const TERRAIN_NAME = ['deep water', 'shallow water', 'shore', 'clearing', 'forest', 'foothills', 'mountain slope', 'mountain peak', 'beyond'];

// Field encoding used by the GPU ground texture (keep in sync with ground shader)
export const FIELD = {
  sdMin: -8, // water signed distance range (meters)
  sdMax: 24,
  elevMax: 330,
  rimMax: 1.25,
};
