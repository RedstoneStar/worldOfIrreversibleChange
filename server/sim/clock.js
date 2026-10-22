// Simulation clock: one sim day per real hour (configurable in shared/config.js).
import { TIME } from '../../shared/config.js';

const DAY = 86400;
const YEAR_DAYS = TIME.daysPerSeason * 4;

export class Clock {
  constructor(state) {
    this.simSeconds = state?.simSeconds ?? TIME.startHour * 3600;
  }
  get rate() {
    return DAY / TIME.realSecondsPerSimDay; // sim seconds per real second
  }
  advance(realDt) {
    this.simSeconds += realDt * this.rate;
  }
  get dayIndex() {
    return Math.floor(this.simSeconds / DAY);
  }
  get hour() {
    return (this.simSeconds % DAY) / 3600;
  }
  get dayOfYear() {
    return this.dayIndex % YEAR_DAYS;
  }
  get year() {
    return Math.floor(this.dayIndex / YEAR_DAYS) + 1;
  }
  get seasonIndex() {
    return Math.floor(this.dayOfYear / TIME.daysPerSeason);
  }
  get season() {
    return TIME.seasons[this.seasonIndex];
  }
  get dayOfSeason() {
    return (this.dayOfYear % TIME.daysPerSeason) + 1;
  }
  /** Sunrise / sunset hours (temperate latitude, smooth over the year). */
  get sunTimes() {
    // longest day mid-summer (doy 45), shortest mid-winter (doy 105)
    const k = Math.cos((2 * Math.PI * (this.dayOfYear - 45)) / YEAR_DAYS); // 1 summer .. -1 winter
    const len = 12 + 2.4 * k;
    return { rise: 12 - len / 2 - 0.2, set: 12 + len / 2 - 0.2 };
  }
  /** 0 = night, 1 = full day, smooth dawn/dusk. */
  get daylight() {
    const h = this.hour, { rise, set } = this.sunTimes;
    const s = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    return s(rise - 0.6, rise + 0.9, h) * (1 - s(set - 0.9, set + 0.6, h));
  }
  get isNight() {
    return this.daylight < 0.15;
  }
  /** Moon phase 0..1 (29.5 sim-day cycle), brightness 0..1. */
  get moon() {
    const phase = (this.simSeconds / DAY / 29.5) % 1;
    return { phase, light: 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI) };
  }
  label() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour % 1) * 60);
    return `Year ${this.year}, ${this.season} day ${this.dayOfSeason}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  toJSON() {
    return { simSeconds: this.simSeconds };
  }
  snapshot() {
    return {
      simSeconds: this.simSeconds, rate: this.rate, year: this.year, season: this.season, seasonIndex: this.seasonIndex,
      dayOfSeason: this.dayOfSeason, dayOfYear: this.dayOfYear, dayIndex: this.dayIndex, hour: this.hour,
      daylight: this.daylight, sun: this.sunTimes, moon: this.moon,
    };
  }
}

export { DAY, YEAR_DAYS };
