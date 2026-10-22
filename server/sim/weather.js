// Weather: temperature, humidity, cloud, rain/snow, wind, fog. Evolves continuously with
// persistent fronts so days feel coherent (a grey drizzly morning, a clear cold night...).
import { YEAR_DAYS } from './clock.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Weather {
  constructor(state) {
    Object.assign(this, {
      anomaly: 0, // temperature anomaly (°C)
      cloud: 0.25,
      cloudTarget: 0.25,
      precip: 0, // 0..1 intensity
      humidity: 0.6,
      wind: 0.2,
      windDir: rnd(0, Math.PI * 2),
      fog: 0,
      temp: 10,
      frontTimer: 0, // sim hours until next front change
      sinceRain: 24, // sim hours since precipitation
    }, state || {});
  }

  update(dtH, clock) {
    const doy = clock.dayOfYear, hour = clock.hour;
    const base = 13 - 11 * Math.cos((2 * Math.PI * (doy - 105)) / YEAR_DAYS);
    const diurnalAmp = 5.5 * (1 - this.cloud * 0.6);
    const diurnal = diurnalAmp * Math.sin(((hour - 9) / 24) * 2 * Math.PI) ;

    // fronts
    this.frontTimer -= dtH;
    if (this.frontTimer <= 0) {
      const season = clock.season;
      const wetness = { spring: 0.5, summer: 0.42, autumn: 0.48, winter: 0.4 }[season];
      this.cloudTarget = Math.random() < wetness ? rnd(0.6, 1) : rnd(0, 0.5);
      this.frontTimer = rnd(5, 30);
      this.windTarget = rnd(0.05, this.cloudTarget > 0.75 ? 0.9 : 0.5);
      this.anomalyTarget = rnd(-4, 4);
    }
    const k = 1 - Math.exp(-dtH / 3);
    this.cloud += (this.cloudTarget - this.cloud) * k;
    this.wind += ((this.windTarget ?? 0.2) - this.wind) * k + rnd(-0.02, 0.02) * dtH;
    this.wind = clamp(this.wind, 0, 1);
    this.windDir += rnd(-0.1, 0.1) * dtH;
    this.anomaly += ((this.anomalyTarget ?? 0) - this.anomaly) * (1 - Math.exp(-dtH / 12));

    // precipitation
    const precipTarget = this.cloud > 0.78 ? clamp((this.cloud - 0.78) / 0.22, 0, 1) : 0;
    this.precip += (precipTarget - this.precip) * (1 - Math.exp(-dtH / 0.7));
    if (this.precip < 0.02) this.precip = 0;
    this.sinceRain = this.precip > 0.05 ? 0 : this.sinceRain + dtH;

    this.temp = base + diurnal + this.anomaly - this.precip * 2;

    // humidity: rain, night, proximity to rain
    const humTarget = clamp(0.45 + this.cloud * 0.25 + this.precip * 0.35 + (clock.daylight < 0.2 ? 0.12 : 0) + (clock.season === 'summer' ? 0.12 : 0) - (this.sinceRain > 48 ? 0.1 : 0), 0.15, 1);
    this.humidity += (humTarget - this.humidity) * (1 - Math.exp(-dtH / 2));

    // fog at dawn when humid, calm and cool
    const dawn = hour > clock.sunTimes.rise - 1.5 && hour < clock.sunTimes.rise + 2.5;
    const fogTarget = dawn && this.humidity > 0.75 && this.wind < 0.3 ? (this.humidity - 0.7) * 2.5 : 0;
    this.fog += (clamp(fogTarget, 0, 0.9) - this.fog) * (1 - Math.exp(-dtH / 0.8));
  }

  get isSnow() {
    return this.temp < 1;
  }
  get rain() {
    return this.isSnow ? 0 : this.precip;
  }
  get snow() {
    return this.isSnow ? this.precip : 0;
  }

  describe() {
    const t = Math.round(this.temp);
    let sky = this.cloud < 0.2 ? 'clear' : this.cloud < 0.5 ? 'partly cloudy' : this.cloud < 0.78 ? 'overcast' : 'heavy grey sky';
    if (this.precip > 0.05) sky = this.isSnow ? (this.precip > 0.5 ? 'snowing heavily' : 'light snow') : this.precip > 0.6 ? 'pouring rain' : this.precip > 0.25 ? 'rain' : 'drizzle';
    if (this.fog > 0.3) sky += ', misty';
    const wind = this.wind < 0.15 ? 'still air' : this.wind < 0.4 ? 'a light breeze' : this.wind < 0.7 ? 'a strong wind' : 'a howling wind';
    return { temp: t, sky, wind };
  }

  toJSON() {
    const o = { ...this };
    return o;
  }

  snapshot() {
    return {
      temp: this.temp, cloud: this.cloud, precip: this.precip, snow: this.isSnow, humidity: this.humidity,
      wind: this.wind, windDir: this.windDir, fog: this.fog, text: this.describe(),
    };
  }
}
