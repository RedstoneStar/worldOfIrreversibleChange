// teamLab "World of Irreversible Change" Overhauled Master Renderer.
// Combines the High-DPI Botanical & Texture Atlas (artAtlas.js) with:
//   - Painterly sumi-ink indigo ground with cloudy slate-blue mist washes & seamless tree-root grounding
//   - Animated High-DPI botanical bushes, ferns, flowering shrubs, weeping willows, sakura & momiji maples
//   - True 3D-to-2.5D Volumetric Skeletal & Garment Characters with 60 FPS dead-reckoning locomotion,
//     water-depth submergence & swimming/floating, and cooperative or solo timber hauling
//   - Subtle, slow-forming footprints, zero on-canvas structure text clutter, and dreamy soft-focus mist diffusion

import { T } from '/shared/config.js';
import { clamp, dist, lerp } from '/shared/dmath.js';
import { SPECIES, presentIn } from '/shared/species.js';
import { buildFloraGrid } from '/shared/worldgen.js';
import {
  ArtAtlas,
  drawAnimatedWillow,
  drawDetailedCharacter,
  drawTimberLogOrBundle,
} from '/artAtlas.js';

export class WorldRenderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.floraGrid = buildFloraGrid(world.flora, world.N, 16);
    this.atlas = new ArtAtlas();
    this.uiExpanded = false; // Pure artwork view by default!

    this.cam = {
      x: world.spawn.x,
      y: world.spawn.y,
      zoom: 11.5,
      targetX: world.spawn.x,
      targetY: world.spawn.y,
      targetZoom: 11.5,
      followId: null,
    };

    this.charVis = new Map();
    this.lastTimeSec = 0;

    // Seasonal atmospheric particles (sakura petals, crimson momiji leaves, fireflies, snow)
    this.particles = Array.from({ length: 165 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: -0.015 - Math.random() * 0.035,
      vy: 0.018 + Math.random() * 0.042,
      size: 1.6 + Math.random() * 2.6,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 2.2,
      phase: Math.random() * Math.PI * 2,
    }));

    // World-space clouds that slowly drift across the 1024x1024 map when zoomed out
    this.worldClouds = Array.from({ length: 18 }, (_, idx) => ({
      x: ((idx * 193 + 110) % (world.N - 160)) + 80,
      y: ((idx * 271 + 90) % (world.N - 160)) + 80,
      rx: 58 + (idx % 5) * 22,
      ry: 24 + (idx % 4) * 9,
      speed: 2.2 + (idx % 4) * 0.65,
      phase: idx * 1.3,
    }));

    this.baseCanvas = document.createElement('canvas');
    this.softCanvas = document.createElement('canvas');
    this.bakeTerrainScroll();
  }

  setWorld(newWorld) {
    this.world = newWorld;
    this.floraGrid = buildFloraGrid(newWorld.flora, newWorld.N, 16);
    this.charVis.clear();
    this.bakeTerrainScroll();
  }

  /**
   * Bakes the 1024x1024 ground scroll to match the 3 uploaded reference images:
   *   - Rich sumi-ink charcoal & deep midnight-indigo wash
   *   - Soft, cloudy blue-slate mist patches drifting across the forest floor
   *   - Seamless dark root shadows & warm golden-amber moss pools under every tree and bush
   *   - Natural stacked stone embankments (ishigaki) along the mineral-turquoise rivers & lake
   */
  bakeTerrainScroll() {
    const N = this.world.N;
    this.baseCanvas.width = N;
    this.baseCanvas.height = N;
    const bctx = this.baseCanvas.getContext('2d');
    const img = bctx.createImageData(N, N);
    const data = img.data;
    const { rim, elev, water, clear, moisture, terrain } = this.world;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const p = i * 4;
        const t = terrain[i];
        const r = rim[i];
        const sd = water[i];
        const cl = clear[i];
        const el = elev[i];
        const mo = moisture ? moisture[i] : 0.5;

        const grain = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const fineGrain = (grain - 0.5) * 2.8;

        // Soft, multi-scale cloudy sumi-ink & slate-blue mist washes (matches Reference Images #1 & #2)
        const m1 = Math.sin(x * 0.018 + Math.cos(y * 0.016) * 2.2) * Math.cos(y * 0.019 - Math.sin(x * 0.014) * 1.8);
        const m2 = Math.sin(x * 0.045 - y * 0.032 + m1 * 1.6) * 0.5 + 0.5;
        const mistPatch = clamp((m1 * 0.5 + 0.5) * 0.65 + m2 * 0.35, 0, 1);

        let R = 9, G = 15, B = 26;

        if (t === T.VOID) {
          R = 12 + fineGrain;
          G = 16 + fineGrain;
          B = 24 + fineGrain;
        } else if (sd < 0) {
          const depthFactor = clamp(-sd / 5.5, 0, 1);
          const wave1 = Math.sin(x * 0.42 + Math.sin(y * 0.22) * 2.6);
          const wave2 = Math.cos(y * 0.52 + Math.sin(x * 0.19) * 2.0);
          const shimmer = (wave1 > 0.65 ? 14 : 0) + (wave2 > 0.74 ? 10 : 0);
          R = lerp(40, 15, depthFactor) + shimmer * 0.5;
          G = lerp(148, 88, depthFactor) + shimmer * 0.92;
          B = lerp(172, 122, depthFactor) + shimmer;
        } else {
          const warmMoss = cl * 0.5 + mo * 0.22;
          R = 8 + mistPatch * 12 + warmMoss * 20 + fineGrain;
          G = 14 + mistPatch * 19 + warmMoss * 20 + fineGrain;
          B = 24 + mistPatch * 30 + warmMoss * 10 + fineGrain;

          if (sd < 1.6) {
            const cobble = Math.sin(x * 1.7 + (y & 1) * 1.5) * Math.cos(y * 1.6);
            const isStone = cobble > -0.25;
            const waterRimGlow = sd < 0.5 ? 22 : 0;
            R = (isStone ? 34 : 16) + waterRimGlow * 1.3;
            G = (isStone ? 42 : 22) + waterRimGlow * 1.1;
            B = (isStone ? 54 : 32) + waterRimGlow * 0.5;
          } else if (sd < 3.6) {
            const bank = 1 - (sd - 1.6) / 2.0;
            R = lerp(R, 72, bank * 0.32);
            G = lerp(G, 64, bank * 0.3);
            B = lerp(B, 36, bank * 0.22);
          }

          if (r > 0.78) {
            const mt = clamp((r - 0.78) / 0.22, 0, 1);
            const contour = Math.abs(((el * 0.22) % 1) - 0.5) < 0.065 ? 1 : 0;
            R = lerp(R, 30 + mt * 64, mt) + contour * 58;
            G = lerp(G, 28 + mt * 52, mt) + contour * 48;
            B = lerp(B, 38 + mt * 26, mt) + contour * 18;
          }
        }

        data[p] = clamp(Math.round(R), 0, 255);
        data[p + 1] = clamp(Math.round(G), 0, 255);
        data[p + 2] = clamp(Math.round(B), 0, 255);
        data[p + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);

    // Second pass on baseCanvas: ground every tree and bush into the terrain scroll with a soft
    // sumi-moss shadow halo + warm golden canopy light pool so tree bases blend seamlessly!
    bctx.save();
    for (let i = 0; i < this.world.flora.length; i++) {
      const f = this.world.flora[i];
      const spKind = SPECIES[f.s]?.kind;
      if (spKind !== 'tree' && spKind !== 'bush') continue;
      const rad = spKind === 'tree' ? 4.2 * f.size : 2.0 * f.size;
      const g = bctx.createRadialGradient(f.x, f.y, 0.2, f.x, f.y, rad);
      g.addColorStop(0, 'rgba(6, 11, 20, 0.42)'); // Deep root grounding right under trunk
      if (f.s === 'sakura') {
        g.addColorStop(0.38, 'rgba(195, 140, 132, 0.14)');
      } else if (f.s === 'maple') {
        g.addColorStop(0.38, 'rgba(195, 110, 48, 0.14)');
      } else {
        g.addColorStop(0.38, 'rgba(155, 136, 54, 0.13)');
      }
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      bctx.fillStyle = g;
      bctx.beginPath();
      bctx.arc(f.x, f.y, rad, 0, Math.PI * 2);
      bctx.fill();
    }
    bctx.restore();
  }

  worldToScreen(wx, wy) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x: (wx - this.cam.x) * this.cam.zoom + w * 0.5,
      y: (wy - this.cam.y) * this.cam.zoom + h * 0.5,
    };
  }

  screenToWorld(sx, sy) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x: (sx - w * 0.5) / this.cam.zoom + this.cam.x,
      y: (sy - h * 0.5) / this.cam.zoom + this.cam.y,
    };
  }

  centerOn(wx, wy, zoom = null) {
    this.cam.targetX = clamp(wx, 40, this.world.N - 40);
    this.cam.targetY = clamp(wy, 40, this.world.N - 40);
    if (zoom !== null) this.cam.targetZoom = clamp(zoom, 0.75, 24);
  }

  render(state, timeSec) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!W || !H) return;

    const dt = clamp(timeSec - (this.lastTimeSec || timeSec), 0.001, 0.08);
    this.lastTimeSec = timeSec;

    const felledSet = new Set();
    if (state?.felledTrees) {
      for (const ft of state.felledTrees) felledSet.add(ft.id);
    }

    if (state?.characters) {
      for (const c of state.characters) {
        this.updateCharacterVisualKinematics(c, dt);
      }
    }

    if (this.cam.followId && state?.characters) {
      const targetVis = this.charVis.get(this.cam.followId);
      const targetChar = state.characters.find((c) => c.id === this.cam.followId);
      if (targetVis) {
        this.cam.targetX = targetVis.x;
        this.cam.targetY = targetVis.y;
      } else if (targetChar) {
        this.cam.targetX = targetChar.x;
        this.cam.targetY = targetChar.y;
      }
    }

    const camLerp = 1 - Math.exp(-dt * 9.5);
    this.cam.x += (this.cam.targetX - this.cam.x) * camLerp;
    this.cam.y += (this.cam.targetY - this.cam.y) * camLerp;
    this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * camLerp;

    const zoom = this.cam.zoom;
    const season = state?.clock?.season || 'spring';
    const daylight = state?.clock?.daylight ?? 0.85;

    // 1. Deep sumi-indigo background
    ctx.fillStyle = '#070d18';
    ctx.fillRect(0, 0, W, H);

    // 2. Baked terrain scroll
    const tl = this.worldToScreen(0, 0);
    const span = this.world.N * zoom;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.baseCanvas, tl.x, tl.y, span, span);
    ctx.restore();

    // 2B. Fine golden moss brushwork when zoomed in
    if (zoom > 3.2) {
      this.drawGroundBrushwork(ctx, W, H, zoom, timeSec);
    }

    // 3. Animated woodblock water waves & golden shimmer on rivers/lake
    if (zoom > 1.8) {
      this.drawWaterWaves(ctx, W, H, zoom, timeSec);
    }

    // 4. Subtle, small, slow-forming footprints ("Irreversible Change" — Point 3)
    if (state?.paths?.length) {
      ctx.save();
      for (const [px, py, wear] of state.paths) {
        const sp = this.worldToScreen(px, py);
        if (sp.x < -20 || sp.x > W + 20 || sp.y < -20 || sp.y > H + 20) continue;
        const rad = Math.max(0.75, 0.42 * zoom);
        ctx.fillStyle = `rgba(198, 164, 82, ${clamp(wear * 0.13, 0.015, 0.11)})`;
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, rad, rad * 0.6, 0.2, 0, Math.PI * 2);
        ctx.ellipse(sp.x + rad * 1.1, sp.y + rad * 0.4, rad * 0.85, rad * 0.5, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 5. Collect visible flora, felled stumps/falling trees, ground log chunks, structures, lanterns & characters
    const halfW = (W * 0.5) / zoom + 24;
    const halfH = (H * 0.5) / zoom + 30;
    const x0 = this.cam.x - halfW, x1 = this.cam.x + halfW;
    const y0 = this.cam.y - halfH, y1 = this.cam.y + halfH;

    const choppingMap = new Map();
    if (state?.characters) {
      for (const c of state.characters) {
        if (c.actionTarget?.kind === 'fell_tree' && c.actionTarget.floraId !== undefined) {
          choppingMap.set(c.actionTarget.floraId, c.actionTarget);
        }
      }
    }

    const drawables = [];
    const lod = zoom < 1.25 ? 'far' : zoom < 2.6 ? 'mid' : 'near';

    this.floraGrid.query(x0, y0, x1, y1, (f) => {
      if (f.removed || felledSet.has(f.id)) return;
      if (!presentIn(f.s, season)) return;
      const kind = SPECIES[f.s]?.kind;
      if (lod === 'far' && kind !== 'tree') return;
      if (lod === 'far' && (f.id % 3 !== 0) && f.s !== 'sakura' && f.s !== 'maple' && f.s !== 'willow') return;
      if (lod === 'mid' && kind !== 'tree' && kind !== 'bush' && kind !== 'rock') return;
      drawables.push({ kind: 'flora', y: f.y, data: f, chopInfo: choppingMap.get(f.id) || null });
    });

    if (state?.felledTrees) {
      for (const ft of state.felledTrees) {
        if (ft.x >= x0 - 15 && ft.x <= x1 + 15 && ft.y >= y0 - 15 && ft.y <= y1 + 15) {
          drawables.push({ kind: 'felled_tree', y: ft.y - 0.1, data: ft });
        }
      }
    }

    if (state?.groundItems) {
      const nowMs = Date.now();
      for (const g of state.groundItems) {
        if (g.visibleAfterMs && nowMs < g.visibleAfterMs) continue;
        if (g.x >= x0 - 15 && g.x <= x1 + 15 && g.y >= y0 - 15 && g.y <= y1 + 15) {
          drawables.push({ kind: 'ground_item', y: g.y, data: g });
        }
      }
    }

    if (state?.structures) {
      for (const st of state.structures) {
        if (st.x >= x0 - 28 && st.x <= x1 + 28 && st.y >= y0 - 28 && st.y <= y1 + 28) {
          const isBuilding = st.kind === 'shelter' || st.kind === 'windbreak' || st.kind === 'pavilion' || st.kind === 'tower';
          if (isBuilding) {
            // Layer 1 (interior floor, raised veranda, back walls & sleeping mats) renders BEHIND characters inside!
            drawables.push({ kind: 'structure_base', y: st.y - 2.5, data: st });
            // Layer 2 (front timber pillars, side shoji screens & overarching 2.5D roof eaves) renders OVER characters inside!
            drawables.push({ kind: 'structure_roof', y: st.y + 2.5, data: st });
          } else {
            drawables.push({ kind: 'structure', y: st.y + 0.25, data: st });
          }
        }
      }
    }

    if (state?.lanterns) {
      for (const lan of state.lanterns) {
        drawables.push({ kind: 'lantern', y: lan.y, data: lan });
      }
    }

    if (state?.characters) {
      for (const c of state.characters) {
        const vis = this.charVis.get(c.id) || { x: c.x, y: c.y, heading: c.heading || 0, walkCycle: 0, moveBlend: 0 };
        drawables.push({ kind: 'char', y: vis.y + 0.15, data: c, vis });
      }
    }

    drawables.sort((a, b) => a.y - b.y);

    for (const item of drawables) {
      if (item.kind === 'flora') {
        this.drawFloraItem(ctx, item.data, zoom, season, timeSec, item.chopInfo, state?.characters);
      } else if (item.kind === 'felled_tree') {
        this.drawFelledTreeAndStump(ctx, item.data, zoom, season);
      } else if (item.kind === 'ground_item') {
        this.drawGroundItem(ctx, item.data, zoom);
      } else if (item.kind === 'structure') {
        this.drawStructure(ctx, item.data, zoom, timeSec, daylight);
      } else if (item.kind === 'structure_base') {
        this.drawBuildingInteriorAndBase(ctx, item.data, zoom, timeSec, daylight, state?.characters);
      } else if (item.kind === 'structure_roof') {
        this.drawBuildingRoofAndFront(ctx, item.data, zoom, timeSec, daylight);
      } else if (item.kind === 'lantern') {
        this.drawFloatingLantern(ctx, item.data, zoom, timeSec);
      } else if (item.kind === 'char') {
        this.drawCharacter(ctx, item.data, item.vis, zoom, timeSec);
      }
    }

    // 6. Night / Dusk ambient indigo glaze + incandescent golden lantern/hearth bloom
    if (daylight < 0.88) {
      const nightAlpha = clamp((0.88 - daylight) * 0.58, 0, 0.52);
      ctx.save();
      ctx.fillStyle = `rgba(4, 9, 22, ${nightAlpha})`;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';
      if (state?.structures) {
        for (const st of state.structures) {
          const sp = this.worldToScreen(st.x, st.y);
          const rad = (st.kind === 'fire' ? 14 : 9) * zoom;
          const g = ctx.createRadialGradient(sp.x, sp.y, rad * 0.05, sp.x, sp.y, rad);
          g.addColorStop(0, 'rgba(255, 206, 98, 0.38)');
          g.addColorStop(0.5, 'rgba(240, 160, 52, 0.14)');
          g.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 7. Drifting seasonal particles (cherry petals, crimson maple leaves, fireflies, snow, rain)
    this.drawAtmosphericParticles(ctx, W, H, season, state?.weather, timeSec);

    // 8. Slow-drifting world-space clouds across the map when zoomed out enough (`zoom < 6.8`)
    if (zoom < 6.8) {
      this.drawDriftingMapClouds(ctx, W, H, zoom, timeSec, dt);
    }

    // 9. Whisper-light Suyari-gasumi border mist veils at top and bottom
    this.drawByobuGoldClouds(ctx, W, H);

    // 10. Dreamy Painterly Soft-Focus & Atmospheric Mist Diffusion (Point 10 & 11 — matches Reference Art!)
    this.applyDreamyMistAndSoftFocus(ctx, W, H, timeSec);
  }

  /**
   * Applies the subtle, dreamy soft-focus halation and atmospheric mist diffusion characteristic
   * of teamLab's "World of Irreversible Change" without overdoing it.
   */
  applyDreamyMistAndSoftFocus(ctx, W, H, timeSec) {
    const sw = Math.max(160, Math.floor(W * 0.32));
    const sh = Math.max(90, Math.floor(H * 0.32));
    if (this.softCanvas.width !== sw || this.softCanvas.height !== sh) {
      this.softCanvas.width = sw;
      this.softCanvas.height = sh;
    }
    const sctx = this.softCanvas.getContext('2d');
    sctx.clearRect(0, 0, sw, sh);
    sctx.filter = 'blur(3.5px)';
    sctx.drawImage(this.canvas, 0, 0, sw, sh);
    sctx.filter = 'none';

    ctx.save();
    // 1. Subtle soft-focus blend (11% opacity) so hard digital edges soften like silk painting
    ctx.globalAlpha = 0.11;
    ctx.drawImage(this.softCanvas, 0, 0, W, H);

    // 2. Warm golden/blossom halation bloom (14% screen blend)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.14;
    ctx.drawImage(this.softCanvas, 0, 0, W, H);

    // 3. Gentle drifting ground mist pockets (like the smoky indigo-and-gold mist in Reference Images #1 & #2)
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 4; i++) {
      const mx = ((i * 0.27 + Math.sin(timeSec * 0.04 + i) * 0.08 + 1) % 1) * W;
      const my = (0.22 + (i % 3) * 0.28 + Math.cos(timeSec * 0.03 + i * 2) * 0.05) * H;
      const mr = Math.min(W, H) * 0.34;
      const mg = ctx.createRadialGradient(mx, my, mr * 0.05, mx, my, mr);
      mg.addColorStop(0, 'rgba(18, 28, 46, 0.11)');
      mg.addColorStop(0.55, 'rgba(218, 186, 98, 0.035)');
      mg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }
    ctx.restore();
  }

  /**
   * 60 FPS Predictive Dead-Reckoning Character Kinematics (Zero 5Hz SSE rubber-banding!).
   * Tracks when each server packet arrived (`packetTime`) so between packets the client extrapolates
   * forward along the character's velocity vector without ever pulling backward toward stale coordinates.
   */
  updateCharacterVisualKinematics(c, dt) {
    const nowSec = performance.now() * 0.001;
    let vis = this.charVis.get(c.id);
    if (!vis) {
      const initHeading = c.heading || 0;
      const initDirX = Math.cos(initHeading) >= -0.05 ? 1 : -1;
      vis = {
        x: c.x,
        y: c.y,
        lastPacketX: c.x,
        lastPacketY: c.y,
        lastPacketSec: nowSec,
        smoothSpeed: c.moving ? (c.speed || 2.8) : 0,
        heading: initHeading,
        facingDirX: initDirX,
        facingMix: initDirX,
        walkCycle: Math.random() * Math.PI * 2,
        moveBlend: c.moving ? 1 : 0,
      };
      this.charVis.set(c.id, vis);
      return;
    }

    // Detect when a fresh SSE snapshot updated `c.x, c.y`
    if (c.x !== vis.lastPacketX || c.y !== vis.lastPacketY) {
      vis.lastPacketX = c.x;
      vis.lastPacketY = c.y;
      vis.lastPacketSec = nowSec;
    }

    const prevX = vis.x;
    const prevY = vis.y;
    const errDist = dist(vis.x, vis.y, c.x, c.y);

    if (errDist > 16) {
      vis.x = c.x;
      vis.y = c.y;
    } else if (c.moving && c.speed > 0 && c.targetX !== undefined && c.targetY !== undefined) {
      // Predict where the character is right now (`ageSec` after the last 200ms SSE packet)
      const ageSec = clamp(nowSec - vis.lastPacketSec, 0, 0.28);
      const dxTarget = c.targetX - c.x;
      const dyTarget = c.targetY - c.y;
      const dTarget = Math.hypot(dxTarget, dyTarget);
      let predX = c.x;
      let predY = c.y;
      if (dTarget > 0.05) {
        const adv = Math.min(dTarget, c.speed * ageSec);
        predX += (dxTarget / dTarget) * adv;
        predY += (dyTarget / dTarget) * adv;
      }

      // Smoothly ramp speed and steer toward the predicted live position + target
      vis.smoothSpeed += (c.speed - vis.smoothSpeed) * (1 - Math.exp(-dt * 8.5));
      const dxGoal = c.targetX - vis.x;
      const dyGoal = c.targetY - vis.y;
      const dGoal = Math.hypot(dxGoal, dyGoal);
      if (dGoal > 0.03) {
        const step = Math.min(dGoal, vis.smoothSpeed * dt);
        vis.x += (dxGoal / dGoal) * step;
        vis.y += (dyGoal / dGoal) * step;
      }
      // Gentle drift-free alignment toward the extrapolated position `predX, predY` (never pulls backward!)
      const follow = 1 - Math.exp(-dt * 5.2);
      vis.x += (predX - vis.x) * follow;
      vis.y += (predY - vis.y) * follow;
    } else {
      vis.smoothSpeed *= Math.exp(-dt * 9.0);
      const settle = 1 - Math.exp(-dt * 6.5);
      vis.x += (c.x - vis.x) * settle;
      vis.y += (c.y - vis.y) * settle;
    }

    const movedDist = Math.hypot(vis.x - prevX, vis.y - prevY);
    const instSpeed = movedDist / Math.max(0.001, dt);
    const isMovingVisually = (c.moving && instSpeed > 0.06) || instSpeed > 0.2;

    const targetBlend = isMovingVisually ? 1 : 0;
    vis.moveBlend += (targetBlend - vis.moveBlend) * (1 - Math.exp(-dt * 8.0));

    // Drive stride phase smoothly from damped locomotion velocity so footsteps never micro-stutter
    const growthScale = clamp(c.growthScale || 1.0, 0.48, 1.15);
    const effectiveSpeed = lerp(instSpeed, vis.smoothSpeed || instSpeed, 0.65);
    if (vis.moveBlend > 0.015) {
      const strideRate = 2.35 / growthScale;
      vis.walkCycle = (vis.walkCycle + effectiveSpeed * dt * strideRate * vis.moveBlend) % (Math.PI * 200);
    }

    const targetHeading = movedDist > 0.0025 ? Math.atan2(vis.y - prevY, vis.x - prevX) : (c.heading ?? vis.heading);
    let dAngle = targetHeading - vis.heading;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    vis.heading += dAngle * (1 - Math.exp(-dt * 9.5));

    // Hysteresis-stabilized horizontal facing direction (`+1` right, `-1` left) + smooth continuous `facingMix`
    const cosH = Math.cos(vis.heading);
    if (cosH > 0.16) vis.facingDirX = 1;
    else if (cosH < -0.16) vis.facingDirX = -1;
    if (vis.facingDirX === undefined) vis.facingDirX = cosH >= 0 ? 1 : -1;
    if (vis.facingMix === undefined) vis.facingMix = vis.facingDirX;
    vis.facingMix += (vis.facingDirX - vis.facingMix) * (1 - Math.exp(-dt * 9.0));
  }

  drawGroundBrushwork(ctx, W, H, zoom, timeSec) {
    ctx.save();
    const step = 6;
    const w0 = this.screenToWorld(0, 0);
    const w1 = this.screenToWorld(W, H);
    const gx0 = Math.max(8, Math.floor(w0.x / step) * step);
    const gy0 = Math.max(8, Math.floor(w0.y / step) * step);
    const gx1 = Math.min(this.world.N - 8, Math.ceil(w1.x / step) * step);
    const gy1 = Math.min(this.world.N - 8, Math.ceil(w1.y / step) * step);

    const alpha = clamp((zoom - 3.2) / 5.5, 0, 0.32);
    ctx.strokeStyle = `rgba(218, 186, 84, ${alpha})`;
    ctx.lineWidth = Math.max(0.65, 0.05 * zoom);

    ctx.beginPath();
    for (let wy = gy0; wy <= gy1; wy += step) {
      for (let wx = gx0; wx <= gx1; wx += step) {
        const idx = (wy | 0) * this.world.N + (wx | 0);
        if (this.world.water[idx] < 1.2 || this.world.rim[idx] > 0.85) continue;
        const h1 = Math.sin(wx * 19.3 + wy * 37.1);
        if (h1 < 0.15) continue;
        const ox = wx + Math.cos(wy * 7.3) * 1.8;
        const oy = wy + Math.sin(wx * 5.7) * 1.8;
        const sp = this.worldToScreen(ox, oy);
        const gh = (0.26 + (h1 - 0.15) * 0.32) * zoom;
        const sway = Math.sin(timeSec * 1.2 + wx * 0.4) * 0.08 * zoom;
        ctx.moveTo(sp.x - 0.18 * zoom, sp.y);
        ctx.lineTo(sp.x - 0.25 * zoom + sway, sp.y - gh);
        ctx.moveTo(sp.x + 0.12 * zoom, sp.y + 0.05 * zoom);
        ctx.lineTo(sp.x + 0.22 * zoom + sway, sp.y - gh * 0.82);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawWaterWaves(ctx, W, H, zoom, timeSec) {
    ctx.save();
    const step = Math.max(5, Math.floor(24 / Math.sqrt(zoom)));
    const w0 = this.screenToWorld(0, 0);
    const w1 = this.screenToWorld(W, H);
    const gx0 = Math.max(0, Math.floor(w0.x / step) * step);
    const gy0 = Math.max(0, Math.floor(w0.y / step) * step);

    ctx.strokeStyle = 'rgba(130, 224, 244, 0.28)';
    ctx.lineWidth = Math.max(0.8, 0.08 * zoom);
    ctx.beginPath();
    for (let wy = gy0; wy < Math.min(this.world.N, w1.y); wy += step) {
      for (let wx = gx0; wx < Math.min(this.world.N, w1.x); wx += step) {
        const sd = this.world.water[(wy | 0) * this.world.N + (wx | 0)];
        if (sd < -0.4) {
          const sp = this.worldToScreen(wx, wy);
          const drift = Math.sin(timeSec * 1.4 + wx * 0.25 + wy * 0.18) * 3.5;
          const wlen = Math.max(4, 1.3 * zoom);
          ctx.moveTo(sp.x - wlen + drift, sp.y);
          ctx.quadraticCurveTo(sp.x - wlen * 0.3 + drift, sp.y - 1.8, sp.x + drift, sp.y);
          ctx.quadraticCurveTo(sp.x + wlen * 0.3 + drift, sp.y + 1.8, sp.x + wlen + drift, sp.y);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Renders a felled tree's stump AND, during the first 2.4 seconds (`fallDurationMs`),
   * animates the tree tipping over and disappearing BEFORE the felled trunk log appears on the ground!
   */
  drawFelledTreeAndStump(ctx, ft, zoom, season) {
    if (zoom < 2.2) return;
    const sp = this.worldToScreen(ft.x, ft.y);
    const sc = clamp(zoom * 0.32, 1.2, 7.5);

    ctx.save();
    // Stump grounded in dark sumi-moss shadow
    ctx.fillStyle = 'rgba(8, 14, 24, 0.65)';
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y + 0.15 * sc, 1.25 * sc, 0.48 * sc, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(42, 28, 14, 0.88)';
    ctx.strokeStyle = 'rgba(255, 222, 118, 0.9)';
    ctx.lineWidth = Math.max(0.9, 0.15 * sc);
    ctx.beginPath();
    ctx.moveTo(sp.x - 0.85 * sc, sp.y + 0.15 * sc);
    ctx.lineTo(sp.x - 0.65 * sc, sp.y - 0.55 * sc);
    ctx.lineTo(sp.x + 0.65 * sc, sp.y - 0.55 * sc);
    ctx.lineTo(sp.x + 0.85 * sc, sp.y + 0.15 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(185, 145, 58, 0.82)';
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y - 0.55 * sc, 0.65 * sc, 0.28 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Falling tree animation: disappears completely at 2400ms (right when the felled trunk log appears!)
    const fallDur = ft.fallDurationMs || 2400;
    const ageMs = Date.now() - (ft.felledAtMs || 0);
    if (ageMs >= 0 && ageMs < fallDur) {
      const u = clamp(ageMs / fallDur, 0, 1);
      const fallTilt = Math.pow(u, 2.1) * (Math.PI * 0.48) * (Math.cos(ft.angle || 0) >= 0 ? 1 : -1);
      const fade = u < 0.72 ? 1 : 1 - (u - 0.72) / 0.28;
      const sprite = this.atlas.getTreeSprite(ft.s || 'pine', season, ft.id % 5);
      const s = 1.15 * zoom;
      const drawW = 8.4 * s;
      const drawH = 9.1 * s;

      ctx.globalAlpha = fade;
      ctx.translate(sp.x, sp.y - 0.4 * sc);
      ctx.rotate(fallTilt);
      ctx.drawImage(sprite, -drawW * 0.5, -drawH * 0.89, drawW, drawH);
    }
    ctx.restore();
  }

  drawGroundItem(ctx, item, zoom) {
    if (zoom < 2.2) return;
    const sp = this.worldToScreen(item.x, item.y);
    drawTimberLogOrBundle(ctx, sp.x, sp.y, zoom, item.kind, item.angle || 0, item.length || 1.6, false);
  }

  drawFloraItem(ctx, f, zoom, season, timeSec, chopInfo = null, characters = null) {
    const sp = this.worldToScreen(f.x, f.y);
    const s = f.size * zoom;

    if (zoom < 1.9) {
      const r = Math.max(1.8, 1.6 * s);
      if (f.s === 'sakura' && season === 'spring') {
        ctx.fillStyle = 'rgba(255, 188, 218, 0.82)';
      } else if (f.s === 'maple' && season === 'autumn') {
        ctx.fillStyle = 'rgba(235, 68, 36, 0.85)';
      } else if (f.s === 'willow') {
        ctx.fillStyle = 'rgba(250, 228, 112, 0.78)';
      } else if (f.s === 'ginkgo' && season === 'autumn') {
        ctx.fillStyle = 'rgba(255, 215, 60, 0.85)';
      } else {
        ctx.fillStyle = 'rgba(218, 182, 84, 0.55)';
      }
      ctx.beginPath();
      ctx.arc(sp.x, sp.y - r * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const kind = SPECIES[f.s]?.kind;

    if (f.s === 'willow') {
      drawAnimatedWillow(ctx, this.atlas, sp, s, season, timeSec, f.id);
      if (f.id % 11 === 0 && zoom > 3.5) {
        const lw = 2.4 * s;
        const lh = 3.2 * s;
        ctx.drawImage(this.atlas.stoneLanternSprite, sp.x + 1.6 * s, sp.y - lh * 0.82, lw, lh);
      }
      return;
    }

    if (kind === 'tree' && f.s !== 'bamboo') {
      const sprite = this.atlas.getTreeSprite(f.s, season, f.v);
      const chopShake = chopInfo ? Math.sin(timeSec * 28) * 0.045 : 0;
      const chopLean = chopInfo ? (chopInfo.progress || 0) * 0.12 : 0;
      const sway = Math.sin(timeSec * 1.15 + f.x * 0.35 + f.y * 0.25) * 0.014 + chopShake + chopLean;
      const drawW = 8.4 * s;
      const drawH = 9.1 * s;

      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sway);
      ctx.drawImage(sprite, -drawW * 0.5, -drawH * 0.89, drawW, drawH);

      if (chopInfo) {
        const notchDepth = clamp(chopInfo.progress || 0.2, 0.15, 0.9) * 0.35 * s;
        ctx.fillStyle = '#ffe588';
        ctx.beginPath();
        ctx.moveTo(-0.35 * s, -0.55 * s);
        ctx.lineTo(-0.35 * s + notchDepth, -0.42 * s);
        ctx.lineTo(-0.35 * s, -0.28 * s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      if ((f.s === 'sakura' || f.s === 'maple') && f.id % 9 === 0 && zoom > 3.5) {
        const lw = 2.2 * s;
        const lh = 2.9 * s;
        ctx.drawImage(this.atlas.stoneLanternSprite, sp.x + 2.1 * s, sp.y - lh * 0.8, lw, lh);
      }
      return;
    }

    if (f.s === 'bamboo') {
      const h = 4.6 * s;
      const sway = Math.sin(timeSec * 1.5 + f.x * 0.5) * 0.2 * s;
      ctx.save();
      ctx.strokeStyle = 'rgba(218, 226, 114, 0.72)';
      ctx.lineWidth = Math.max(0.9, 0.11 * s);
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.quadraticCurveTo(sp.x + sway * 0.5, sp.y - h * 0.5, sp.x + sway, sp.y - h);
      ctx.stroke();

      ctx.fillStyle = 'rgba(228, 234, 128, 0.55)';
      for (let k = 1; k <= 3; k++) {
        const ly = sp.y - h * (0.45 + k * 0.17);
        const lx = sp.x + sway * (k * 0.3);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(lx + side * 0.45 * s, ly, 0.5 * s, 0.14 * s, side * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      return;
    }

    // Reeds & Cattails in the shallows with multi-stalk wind wave animation
    if (f.s === 'reeds' || f.s === 'cattail') {
      const sway = Math.sin(timeSec * 1.7 + f.x * 0.4 + f.y * 0.3) * 0.22 * s;
      ctx.save();
      ctx.strokeStyle = 'rgba(232, 204, 108, 0.72)';
      ctx.lineWidth = Math.max(0.8, 0.08 * s);
      for (let k = -2; k <= 2; k++) {
        const rx = sp.x + k * 0.22 * s;
        const rh = (1.4 + (k & 1) * 0.28) * s;
        const stalkSway = sway * (0.85 + k * 0.1);
        ctx.beginPath();
        ctx.moveTo(rx, sp.y);
        ctx.quadraticCurveTo(rx + stalkSway * 0.5, sp.y - rh * 0.5, rx + stalkSway, sp.y - rh);
        ctx.stroke();

        // Feathery golden reed plume or cattail head at tip
        ctx.fillStyle = f.s === 'cattail' ? 'rgba(135, 88, 38, 0.85)' : 'rgba(255, 238, 165, 0.65)';
        ctx.beginPath();
        ctx.ellipse(rx + stalkSway, sp.y - rh, 0.11 * s, 0.32 * s, stalkSway * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // Mossy Boulders, Flint & Ironstone with golden Rimpa contour facets & moss cushions
    if (kind === 'rock') {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 14, 24, 0.58)';
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + 0.12 * s, 0.82 * s, 0.32 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(26, 34, 48, 0.85)';
      ctx.strokeStyle = f.s === 'flint' ? 'rgba(175, 224, 248, 0.78)' : 'rgba(225, 192, 112, 0.74)';
      ctx.lineWidth = Math.max(0.8, 0.08 * s);
      ctx.beginPath();
      ctx.moveTo(sp.x - 0.65 * s, sp.y + 0.1 * s);
      ctx.lineTo(sp.x - 0.48 * s, sp.y - 0.42 * s);
      ctx.lineTo(sp.x + 0.15 * s, sp.y - 0.52 * s);
      ctx.lineTo(sp.x + 0.65 * s, sp.y - 0.12 * s);
      ctx.lineTo(sp.x + 0.45 * s, sp.y + 0.22 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Velvet moss tuft on the rock shoulder
      ctx.fillStyle = 'rgba(118, 138, 54, 0.55)';
      ctx.beginPath();
      ctx.ellipse(sp.x - 0.15 * s, sp.y - 0.38 * s, 0.32 * s, 0.14 * s, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // High-DPI Botanical Bushes & Ferns (`bush` / `fern`) with live wind-shear & character-proximity rustle!
    if (kind === 'bush' || f.s === 'fern') {
      const sprite = this.atlas.getBushSprite(f.s, season, f.v);
      let rustle = 0;
      if (characters) {
        for (const c of characters) {
          const d = Math.hypot(c.x - f.x, c.y - f.y);
          if (d < 2.2) {
            rustle = Math.sin(timeSec * 16 + f.id) * 0.085 * (1 - d / 2.2);
            break;
          }
        }
      }
      const windShear = Math.sin(timeSec * 1.65 + f.x * 0.45 + f.y * 0.35) * 0.055 + rustle;
      const drawW = 3.2 * s;
      const drawH = 2.8 * s;

      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.transform(1, 0, windShear, 1, 0, 0);
      ctx.drawImage(sprite, -drawW * 0.5, -drawH * 0.82, drawW, drawH);
      ctx.restore();
      return;
    }

    // Animated Wildflowers & Mushrooms
    ctx.save();
    if (kind === 'flower') {
      const sway = Math.sin(timeSec * 2.0 + f.x * 0.6) * 0.14 * s;
      const col = f.s === 'chrysanthemum' ? '#ffda48' : f.s === 'violet' ? '#c892ff' : '#ffe89e';
      ctx.strokeStyle = 'rgba(175, 198, 84, 0.68)';
      ctx.lineWidth = Math.max(0.7, 0.06 * s);
      for (let k = -1; k <= 1; k++) {
        const bx = sp.x + k * 0.25 * s;
        const tx = bx + sway + k * 0.1 * s;
        const ty = sp.y - (0.55 + (k === 0 ? 0.18 : 0)) * s;
        ctx.beginPath();
        ctx.moveTo(bx, sp.y);
        ctx.quadraticCurveTo(bx + sway * 0.4, (sp.y + ty) * 0.5, tx, ty);
        ctx.stroke();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1.3, 0.15 * s), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'mushroom' && zoom > 4.2) {
      ctx.fillStyle = f.s === 'mushroom_red' ? '#e84838' : f.s === 'mushroom_pale' ? '#d8ebd0' : '#d2a05a';
      ctx.strokeStyle = 'rgba(255, 232, 150, 0.7)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y - 0.16 * s, Math.max(1.8, 0.24 * s), Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draws structures in the glowing golden wireframe aesthetic of teamLab's "World of Irreversible Change".
   * Zero on-canvas text labels (Point 1)!
   */
  drawStructure(ctx, st, zoom, timeSec, daylight) {
    const sp = this.worldToScreen(st.x, st.y);
    const prog = clamp(st.progress ?? 1, 0.12, 1);

    ctx.save();

    const chunksDelivered = st.pendingMod ? st.pendingMod.chunksDelivered : st.chunksDelivered || 0;
    if ((!st.complete || st.pendingMod) && chunksDelivered > 0 && zoom > 3) {
      for (let cIdx = 0; cIdx < Math.min(4, chunksDelivered); cIdx++) {
        drawTimberLogOrBundle(
          ctx,
          sp.x - 1.6 * zoom + cIdx * 0.35 * zoom,
          sp.y + 1.15 * zoom - (cIdx % 2) * 0.25 * zoom,
          zoom,
          st.kind === 'windbreak' ? 'reed_bundle' : 'log_chunk',
          0.15,
          1.3,
          false
        );
      }
    }

    if (st.kind === 'fire') {
      const r = Math.max(3.5, 0.85 * zoom);
      const glow = ctx.createRadialGradient(sp.x, sp.y, 1, sp.x, sp.y, r * 4.2);
      glow.addColorStop(0, 'rgba(255, 224, 120, 0.55)');
      glow.addColorStop(0.5, 'rgba(235, 148, 42, 0.2)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r * 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(42, 36, 26, 0.88)';
      ctx.strokeStyle = 'rgba(245, 212, 118, 0.88)';
      ctx.lineWidth = Math.max(0.9, 0.09 * zoom);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(sp.x + Math.cos(a) * r, sp.y + Math.sin(a) * r * 0.62, r * 0.28, r * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(sp.x - r * 0.7, sp.y + r * 0.2);
      ctx.lineTo(sp.x + r * 0.7, sp.y - r * 0.25);
      ctx.moveTo(sp.x - r * 0.65, sp.y - r * 0.2);
      ctx.lineTo(sp.x + r * 0.65, sp.y + r * 0.25);
      ctx.stroke();

      if (st.lit && st.complete) {
        const flicker = 0.88 + Math.sin(timeSec * 8.5 + st.x) * 0.14;
        const fh = r * 2.4 * flicker;
        const fgrad = ctx.createRadialGradient(sp.x, sp.y - fh * 0.35, 1, sp.x, sp.y - fh * 0.25, r * 2.2);
        fgrad.addColorStop(0, 'rgba(255, 252, 210, 0.96)');
        fgrad.addColorStop(0.45, 'rgba(255, 192, 62, 0.78)');
        fgrad.addColorStop(1, 'rgba(255, 110, 20, 0)');
        ctx.fillStyle = fgrad;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y - fh * 0.25, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    if (st.kind === 'windbreak') {
      const ww = (st.width || 2.5) * zoom * 0.52;
      const wh = (st.headroom || 1.15) * zoom * 0.85 * prog;
      ctx.fillStyle = 'rgba(34, 30, 14, 0.68)';
      ctx.strokeStyle = 'rgba(255, 224, 118, 0.88)';
      ctx.lineWidth = Math.max(0.9, 0.1 * zoom);

      ctx.beginPath();
      ctx.moveTo(sp.x - ww, sp.y + 0.2 * zoom);
      ctx.quadraticCurveTo(sp.x, sp.y - wh * 1.15, sp.x + ww, sp.y + 0.2 * zoom);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(245, 208, 102, 0.52)';
      ctx.lineWidth = Math.max(0.6, 0.06 * zoom);
      ctx.beginPath();
      for (let k = -5; k <= 5; k++) {
        const bx = sp.x + (k / 5) * ww * 0.92;
        ctx.moveTo(sp.x + (k / 5) * ww * 0.25, sp.y - wh * 0.95);
        ctx.lineTo(bx, sp.y + 0.2 * zoom);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (st.kind === 'bridge') {
      const bw = (st.width || 7.5) * zoom * 0.55;
      const bd = (st.depth || 2.2) * zoom * 0.42;
      const archH = Math.max(6, 1.85 * zoom);

      const refl = ctx.createRadialGradient(sp.x, sp.y + bd * 0.8, 2, sp.x, sp.y + bd * 0.8, bw * 1.1);
      refl.addColorStop(0, 'rgba(255, 218, 102, 0.28)');
      refl.addColorStop(1, 'rgba(255, 218, 102, 0)');
      ctx.fillStyle = refl;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + bd * 0.8, bw * 1.1, bd * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 222, 118, 0.9)';
      ctx.fillStyle = 'rgba(26, 20, 10, 0.72)';
      ctx.lineWidth = Math.max(1.0, 0.12 * zoom);

      for (const frac of [-0.65, -0.25, 0.25, 0.65]) {
        const px = sp.x + frac * bw;
        const archY = (1 - frac * frac) * archH;
        ctx.beginPath();
        ctx.moveTo(px, sp.y - archY + bd * 0.5);
        ctx.lineTo(px, sp.y + bd * 1.45);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(sp.x - bw, sp.y);
      ctx.quadraticCurveTo(sp.x, sp.y - archH * 2, sp.x + bw, sp.y);
      ctx.lineTo(sp.x + bw, sp.y + bd);
      ctx.quadraticCurveTo(sp.x, sp.y - archH * 2 + bd, sp.x - bw, sp.y + bd);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const totalSteps = 16;
      const activeSteps = Math.max(4, Math.floor(totalSteps * prog));
      const railH = 0.72 * zoom;
      ctx.beginPath();
      for (let i = 0; i <= activeSteps; i++) {
        const t = (i / totalSteps) * 2 - 1;
        const px = sp.x + t * bw;
        const archY = (1 - t * t) * archH;
        ctx.moveTo(px, sp.y - archY);
        ctx.lineTo(px, sp.y - archY + bd);
        if (i % 2 === 0) {
          ctx.moveTo(px, sp.y - archY);
          ctx.lineTo(px, sp.y - archY - railH);
          ctx.moveTo(px, sp.y - archY + bd);
          ctx.lineTo(px, sp.y - archY + bd - railH);
        }
      }
      ctx.moveTo(sp.x - bw, sp.y - railH);
      ctx.quadraticCurveTo(sp.x, sp.y - archH * 2 - railH, sp.x - bw + 2 * bw * prog, sp.y - railH);
      ctx.moveTo(sp.x - bw, sp.y + bd - railH);
      ctx.quadraticCurveTo(sp.x, sp.y - archH * 2 + bd - railH, sp.x - bw + 2 * bw * prog, sp.y + bd - railH);
      ctx.stroke();

      if (zoom > 3.5 && this.atlas.stoneLanternSprite) {
        const lw = 2.1 * zoom;
        const lh = 2.8 * zoom;
        ctx.drawImage(this.atlas.stoneLanternSprite, sp.x - bw - lw * 0.8, sp.y - lh * 0.65, lw, lh);
        ctx.drawImage(this.atlas.stoneLanternSprite, sp.x + bw - lw * 0.2, sp.y - lh * 0.65, lw, lh);
      }

      ctx.restore();
      return;
    }

    // Shelters / Houses / Pavilions are rendered via the 2-pass 2.5D architectural methods below!
    ctx.restore();
  }

  /**
   * Computes the shared 2.5D oblique architectural metrics for a building `st` at screen anchor `sp`.
   * Sized authentically to match teamLab's "World of Irreversible Change" reference images (`e6583ed1.jpg`, `88c1a8c0.jpg`, `f15421b9.jpg`):
   * a single-story minka house is ~2.8x taller and ~4.8x wider than a standing character, with a deep interior room.
   */
  getBuildingMetrics(st, sp, zoom) {
    const prog = clamp(st.progress ?? 1, 0.18, 1);
    const isWindbreak = st.kind === 'windbreak';
    const hw = Math.max(isWindbreak ? 4.4 : 5.8, st.width || 6.8) * zoom * 0.92;
    const wallH = Math.max(isWindbreak ? 2.9 : 3.8, (st.headroom || 2.15) * 1.82) * zoom * prog;
    const stories = st.stories || 1;
    // 2.5D oblique depth vector receding up-and-right (like traditional Japanese emaki & teamLab perspective)
    const ox = hw * 0.34;
    const oy = -hw * 0.28;
    // Front veranda baseline is slightly below `sp.y` so `sp.y - 0.12*zoom` sits squarely in the center of the interior tatami floor!
    const frontY = sp.y + hw * 0.22;
    return { prog, isWindbreak, hw, wallH, stories, ox, oy, frontY };
  }

  /**
   * PASS 1 (Drawn BEHIND characters inside the house):
   * Renders the warm courtyard glow, stacked-stone & timber foundation, 2.5D raised wooden veranda (`engawa`),
   * front entrance steps, recessed interior `tatami` floor, back wall `shoji` screens, and interior sleeping mats!
   */
  drawBuildingInteriorAndBase(ctx, st, zoom, timeSec, daylight, characters = []) {
    const sp = this.worldToScreen(st.x, st.y);
    const { prog, isWindbreak, hw, wallH, ox, oy, frontY } = this.getBuildingMetrics(st, sp, zoom);

    ctx.save();

    // 0. Delivered timber logs / reed bundles stacked beside the construction site while building
    const chunksDelivered = st.pendingMod ? st.pendingMod.chunksDelivered : st.chunksDelivered || 0;
    if ((!st.complete || st.pendingMod) && chunksDelivered > 0 && zoom > 3) {
      for (let cIdx = 0; cIdx < Math.min(4, chunksDelivered); cIdx++) {
        drawTimberLogOrBundle(
          ctx,
          sp.x - hw * 0.95 + cIdx * 0.45 * zoom,
          frontY + 0.85 * zoom - (cIdx % 2) * 0.25 * zoom,
          zoom,
          isWindbreak ? 'reed_bundle' : 'log_chunk',
          0.15,
          1.35,
          false
        );
      }
    }

    // 1. Warm Golden Courtyard & Interior Halation Glow
    const ambient = ctx.createRadialGradient(sp.x, sp.y, hw * 0.15, sp.x, sp.y, hw * 1.75);
    ambient.addColorStop(0, daylight < 0.65 ? 'rgba(255, 212, 96, 0.38)' : 'rgba(248, 208, 98, 0.24)');
    ambient.addColorStop(0.55, 'rgba(218, 164, 52, 0.09)');
    ambient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ambient;
    ctx.beginPath();
    ctx.ellipse(sp.x + ox * 0.3, sp.y, hw * 1.65, hw * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Foundation Posts (`Tsuka`) & Stacked Stone Plinth (`Ishigaki`) along the front & right side
    const plinthH = 0.55 * zoom;
    const vLeft = sp.x - hw * 1.06;
    const vRight = sp.x + hw * 1.06;

    ctx.fillStyle = 'rgba(16, 13, 8, 0.88)';
    ctx.strokeStyle = 'rgba(242, 202, 98, 0.78)';
    ctx.lineWidth = Math.max(0.85, 0.1 * zoom);

    // Front foundation skirt
    ctx.beginPath();
    ctx.moveTo(vLeft, frontY);
    ctx.lineTo(vRight, frontY);
    ctx.lineTo(vRight, frontY + plinthH);
    ctx.lineTo(vLeft, frontY + plinthH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right oblique foundation skirt
    ctx.beginPath();
    ctx.moveTo(vRight, frontY);
    ctx.lineTo(vRight + ox, frontY + oy);
    ctx.lineTo(vRight + ox, frontY + oy + plinthH);
    ctx.lineTo(vRight, frontY + plinthH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Foundation support posts under veranda
    ctx.beginPath();
    for (let p = 0; p <= 6; p++) {
      const px = lerp(vLeft, vRight, p / 6);
      ctx.moveTo(px, frontY);
      ctx.lineTo(px, frontY + plinthH);
    }
    ctx.stroke();

    // 3. 2.5D Oblique Raised Wooden Veranda (`Engawa`) & Interior `Tatami` Floor Parallelogram
    //    Four corners of the floor deck: Front-Left, Front-Right, Back-Right, Back-Left
    const fl = { x: vLeft, y: frontY };
    const fr = { x: vRight, y: frontY };
    const br = { x: vRight + ox, y: frontY + oy };
    const bl = { x: vLeft + ox, y: frontY + oy };

    const floorGrad = ctx.createLinearGradient(fl.x, fl.y, br.x, br.y);
    floorGrad.addColorStop(0, 'rgba(62, 44, 18, 0.90)');
    floorGrad.addColorStop(0.45, 'rgba(92, 68, 26, 0.88)');
    floorGrad.addColorStop(1, 'rgba(46, 34, 14, 0.92)');

    ctx.fillStyle = floorGrad;
    ctx.strokeStyle = 'rgba(255, 226, 124, 0.90)';
    ctx.lineWidth = Math.max(0.95, 0.11 * zoom);
    ctx.beginPath();
    ctx.moveTo(fl.x, fl.y);
    ctx.lineTo(fr.x, fr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Perspective wooden floorboards on the front `engawa` veranda + woven `tatami` mat grid inside!
    ctx.strokeStyle = 'rgba(255, 222, 118, 0.42)';
    ctx.lineWidth = Math.max(0.6, 0.06 * zoom);
    ctx.beginPath();
    for (const u of [0.18, 0.36, 0.65, 0.85]) {
      ctx.moveTo(lerp(fl.x, bl.x, u), lerp(fl.y, bl.y, u));
      ctx.lineTo(lerp(fr.x, br.x, u), lerp(fr.y, br.y, u));
    }
    for (let k = 1; k < 8; k++) {
      const u = k / 8;
      ctx.moveTo(lerp(fl.x, fr.x, u), lerp(fl.y, fr.y, u));
      ctx.lineTo(lerp(bl.x, br.x, u), lerp(bl.y, br.y, u));
    }
    ctx.stroke();

    // Front wooden entrance steps (`Kizahashi`) leading up into the open central chamber
    const stepW = hw * 0.36;
    ctx.fillStyle = 'rgba(54, 38, 16, 0.92)';
    ctx.strokeStyle = 'rgba(255, 228, 128, 0.88)';
    ctx.lineWidth = Math.max(0.8, 0.09 * zoom);
    for (let s = 0; s < 2; s++) {
      const sy = frontY + s * (plinthH * 0.55);
      ctx.fillRect(sp.x - stepW * 0.5, sy, stepW, plinthH * 0.52);
      ctx.strokeRect(sp.x - stepW * 0.5, sy, stepW, plinthH * 0.52);
    }

    // 4. Back Wall & Right Oblique Side Wall (drawn BEHIND characters inside the room!)
    const backWallTopY = bl.y - wallH;
    const frontWallTopY = frontY - wallH;

    // Back interior wall with warm golden-amber lantern light & shoji lattice
    const backGrad = ctx.createLinearGradient(bl.x, backWallTopY, bl.x, bl.y);
    backGrad.addColorStop(0, 'rgba(38, 28, 12, 0.88)');
    backGrad.addColorStop(0.6, daylight < 0.65 ? 'rgba(168, 118, 38, 0.72)' : 'rgba(96, 68, 24, 0.78)');
    backGrad.addColorStop(1, 'rgba(52, 36, 14, 0.86)');

    ctx.fillStyle = backGrad;
    ctx.strokeStyle = 'rgba(248, 214, 112, 0.82)';
    ctx.lineWidth = Math.max(0.9, 0.1 * zoom);
    ctx.beginPath();
    ctx.moveTo(bl.x, backWallTopY);
    ctx.lineTo(br.x, backWallTopY);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Back wall shoji lattice muntins
    if (zoom > 3.2) {
      ctx.strokeStyle = 'rgba(255, 226, 128, 0.36)';
      ctx.lineWidth = Math.max(0.55, 0.055 * zoom);
      ctx.beginPath();
      for (let k = 1; k < 6; k++) {
        const bx = lerp(bl.x, br.x, k / 6);
        ctx.moveTo(bx, backWallTopY);
        ctx.lineTo(bx, bl.y);
      }
      for (let h = 1; h <= 3; h++) {
        const by = lerp(backWallTopY, bl.y, h / 4);
        ctx.moveTo(bl.x, by);
        ctx.lineTo(br.x, by);
      }
      ctx.stroke();
    }

    // Right oblique side wall (`Tsuma` wall with horizontal timber weatherboards `shitami-ita`)
    ctx.fillStyle = 'rgba(26, 19, 10, 0.86)';
    ctx.strokeStyle = 'rgba(255, 222, 118, 0.88)';
    ctx.lineWidth = Math.max(0.9, 0.1 * zoom);
    ctx.beginPath();
    ctx.moveTo(fr.x, frontWallTopY);
    ctx.lineTo(br.x, backWallTopY);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(fr.x, fr.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horizontal golden timber clapboard lines on the right oblique wall
    ctx.strokeStyle = 'rgba(245, 206, 98, 0.44)';
    ctx.lineWidth = Math.max(0.55, 0.055 * zoom);
    ctx.beginPath();
    for (let h = 1; h <= 4; h++) {
      const u = h / 5;
      ctx.moveTo(fr.x, lerp(frontWallTopY, fr.y, u));
      ctx.lineTo(br.x, lerp(backWallTopY, br.y, u));
    }
    ctx.stroke();

    // 5. Cozy Woven Interior Sleeping Mats (`Futon` / `Goza` with wooden headrests) on the interior tatami floor!
    if (prog > 0.45) {
      for (const slotX of [-0.95, 0.95]) {
        const matCenter = this.worldToScreen(st.x + slotX, st.y - 0.12);
        const mw = 1.05 * zoom;
        const mh = 0.48 * zoom;
        ctx.fillStyle = 'rgba(178, 132, 46, 0.52)';
        ctx.strokeStyle = 'rgba(255, 232, 138, 0.78)';
        ctx.lineWidth = Math.max(0.65, 0.07 * zoom);
        ctx.beginPath();
        ctx.roundRect(matCenter.x - mw * 0.5, matCenter.y - mh * 0.5, mw, mh, 0.12 * zoom);
        ctx.fill();
        ctx.stroke();

        // Small red-gold brocade pillow (`makura`) at the head of each interior sleeping mat
        ctx.fillStyle = 'rgba(186, 68, 38, 0.82)';
        ctx.beginPath();
        ctx.roundRect(
          matCenter.x + (slotX < 0 ? -mw * 0.36 : mw * 0.16),
          matCenter.y - mh * 0.32,
          mw * 0.2,
          mh * 0.64,
          0.06 * zoom
        );
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * PASS 2 (Drawn OVER characters inside the house):
   * Renders the front timber pillars (`hashira`), side translucent `shoji` & `koshi` lattice bays
   * (leaving the wide central entrance bays open so sleeping/resting characters inside are clearly visible!),
   * `noren` curtains, and the sweeping 2.5D golden thatched/tiled roof (`kayabuki` / `irimoya`) with hanging lanterns!
   */
  drawBuildingRoofAndFront(ctx, st, zoom, timeSec, daylight) {
    const sp = this.worldToScreen(st.x, st.y);
    const { prog, isWindbreak, hw, wallH, stories, ox, oy, frontY } = this.getBuildingMetrics(st, sp, zoom);

    ctx.save();

    const vLeft = sp.x - hw;
    const vRight = sp.x + hw;
    const frontWallTopY = frontY - wallH;

    // 1. Front Facade Bays:
    //    5 bays total: outer-left (0) and outer-right (4) have glowing translucent shoji & wooden koshi grilles;
    //    the 3 central bays (1, 2, 3) form an open-front `zashiki` gallery with hanging `noren` curtains at the top lintel
    //    so you can see right inside the room onto the tatami floor & sleeping mats (just like Reference Image `e6583ed1.jpg`!)
    const bays = 5;
    const bayW = (hw * 2) / bays;

    for (let b = 0; b <= bays; b++) {
      const bx = vLeft + b * bayW;
      // Vertical golden-rimmed timber pillar (`hashira`)
      ctx.fillStyle = 'rgba(34, 24, 12, 0.94)';
      ctx.strokeStyle = 'rgba(255, 228, 128, 0.94)';
      ctx.lineWidth = Math.max(1.0, 0.12 * zoom);
      const colW = Math.max(1.6, 0.16 * zoom);
      ctx.fillRect(bx - colW * 0.5, frontWallTopY, colW, wallH);
      ctx.strokeRect(bx - colW * 0.5, frontWallTopY, colW, wallH);

      if (b < bays) {
        const isOuterScreenBay = b === 0 || b === bays - 1;
        if (isOuterScreenBay && prog > 0.35) {
          // Translucent golden Shoji screen on upper 65% + vertical wooden Koshi grille on lower 35%
          ctx.fillStyle = daylight < 0.65
            ? 'rgba(248, 198, 78, 0.52)'
            : 'rgba(198, 156, 64, 0.34)';
          ctx.fillRect(bx + colW * 0.5, frontWallTopY + wallH * 0.08, bayW - colW, wallH * 0.88);

          if (zoom > 3.0) {
            ctx.strokeStyle = 'rgba(255, 232, 138, 0.62)';
            ctx.lineWidth = Math.max(0.6, 0.06 * zoom);
            ctx.beginPath();
            for (let v = 1; v <= 3; v++) {
              const vx = bx + (v / 4) * bayW;
              ctx.moveTo(vx, frontWallTopY + wallH * 0.08);
              ctx.lineTo(vx, frontY - wallH * 0.04);
            }
            for (let h = 1; h <= 4; h++) {
              const hy = frontWallTopY + (h / 5) * wallH;
              ctx.moveTo(bx, hy);
              ctx.lineTo(bx + bayW, hy);
            }
            ctx.stroke();
          }
        } else if (prog > 0.5) {
          // Open central bay: draw rolled bamboo blind (`sudare`) / short `noren` valence along the top 22% of the lintel!
          const valenceH = wallH * 0.22;
          ctx.fillStyle = 'rgba(48, 34, 16, 0.84)';
          ctx.strokeStyle = 'rgba(255, 224, 120, 0.78)';
          ctx.lineWidth = Math.max(0.7, 0.07 * zoom);
          ctx.fillRect(bx + colW * 0.5, frontWallTopY + wallH * 0.04, bayW - colW, valenceH);
          ctx.strokeRect(bx + colW * 0.5, frontWallTopY + wallH * 0.04, bayW - colW, valenceH);
        }
      }
    }

    // Horizontal lintel beam (`nageshi`) across the top of the front pillars
    ctx.fillStyle = 'rgba(42, 30, 14, 0.94)';
    ctx.strokeStyle = 'rgba(255, 232, 136, 0.94)';
    ctx.lineWidth = Math.max(1.0, 0.12 * zoom);
    ctx.fillRect(vLeft - 0.15 * zoom, frontWallTopY - 0.12 * zoom, hw * 2 + 0.3 * zoom, 0.28 * zoom);
    ctx.strokeRect(vLeft - 0.15 * zoom, frontWallTopY - 0.12 * zoom, hw * 2 + 0.3 * zoom, 0.28 * zoom);

    // 2. Multi-Story & Primary 2.5D Sweeping Japanese Roofs (`Irimoya` / `Kayabuki` Thatch & Ribbed Tile)
    //    Matches the richly ribbed dark-brown & spun-gold roofs in `media_1792618523243_e6583ed1.jpg` and `88c1a8c0.jpg`!
    if (prog > 0.25) {
      for (let sIdx = 0; sIdx < stories; sIdx++) {
        const tierScale = Math.pow(0.84, sIdx);
        const tw = hw * tierScale;
        const tox = ox * tierScale;
        const toy = oy * tierScale;
        const tierWallTopY = frontWallTopY - sIdx * (wallH * 0.88);

        // If upper story (`sIdx >= 1`), draw the upper story timber gallery & balcony railing (`koran`) first!
        if (sIdx >= 1) {
          const prevY = frontWallTopY - (sIdx - 1) * (wallH * 0.88);
          ctx.fillStyle = 'rgba(24, 18, 10, 0.90)';
          ctx.strokeStyle = 'rgba(255, 224, 122, 0.90)';
          ctx.lineWidth = Math.max(0.9, 0.1 * zoom);
          ctx.fillRect(sp.x - tw, tierWallTopY, tw * 2, prevY - tierWallTopY);
          ctx.strokeRect(sp.x - tw, tierWallTopY, tw * 2, prevY - tierWallTopY);

          // Upper story glowing shoji windows & vertical timber posts
          const ubays = 4;
          const ubayW = (tw * 2) / ubays;
          for (let ub = 0; ub < ubays; ub++) {
            const ubx = sp.x - tw + ub * ubayW;
            ctx.fillStyle = 'rgba(245, 198, 82, 0.38)';
            ctx.fillRect(ubx + 2, tierWallTopY + 3, ubayW - 4, (prevY - tierWallTopY) * 0.78);
            ctx.beginPath();
            ctx.moveTo(ubx, tierWallTopY);
            ctx.lineTo(ubx, prevY);
            ctx.stroke();
          }
        }

        const eaveOverhang = tw * 1.18;
        const eaveY = tierWallTopY + 0.22 * zoom;
        const ridgeH = (isWindbreak ? 3.2 : 4.35) * zoom * tierScale * prog;
        const ridgeHalfW = tw * 0.56;
        // Ridgepole sits shifted halfway back along the 2.5D oblique depth vector `(tox * 0.5, toy * 0.5)`!
        const rcx = sp.x + tox * 0.52;
        const peakY = tierWallTopY - ridgeH + toy * 0.45;

        const eFL = { x: sp.x - eaveOverhang, y: eaveY };
        const eFR = { x: sp.x + eaveOverhang, y: eaveY };
        const eBR = { x: sp.x + eaveOverhang + tox, y: eaveY + toy };
        const rL = { x: rcx - ridgeHalfW, y: peakY };
        const rR = { x: rcx + ridgeHalfW, y: peakY };

        // A. Right Oblique Gable Roof Plane (`Irimoya` / `Kirizuma` side roof slope)
        const sideRoofGrad = ctx.createLinearGradient(rR.x, rR.y, eBR.x, eBR.y);
        sideRoofGrad.addColorStop(0, 'rgba(56, 40, 16, 0.95)');
        sideRoofGrad.addColorStop(1, 'rgba(24, 18, 9, 0.94)');
        ctx.fillStyle = sideRoofGrad;
        ctx.strokeStyle = 'rgba(255, 228, 128, 0.92)';
        ctx.lineWidth = Math.max(1.0, 0.12 * zoom);
        ctx.beginPath();
        ctx.moveTo(rR.x, rR.y);
        ctx.quadraticCurveTo((rR.x + eFR.x) * 0.5, lerp(rR.y, eFR.y, 0.58), eFR.x, eFR.y);
        ctx.lineTo(eBR.x, eBR.y);
        ctx.quadraticCurveTo((rR.x + eBR.x) * 0.52, lerp(rR.y, eBR.y, 0.52), rR.x, rR.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Ornamental gable timber lattice inside the right side roof triangle
        ctx.strokeStyle = 'rgba(248, 210, 102, 0.48)';
        ctx.lineWidth = Math.max(0.6, 0.06 * zoom);
        ctx.beginPath();
        for (let g = 1; g <= 4; g++) {
          const u = g / 5;
          ctx.moveTo(lerp(rR.x, eFR.x, u), lerp(rR.y, eFR.y, u));
          ctx.lineTo(lerp(rR.x, eBR.x, u), lerp(rR.y, eBR.y, u));
        }
        ctx.stroke();

        // B. Main Sweeping Front Roof Plane (`Kayabuki` / `Kawara` concave slope)
        const roofGrad = ctx.createLinearGradient(sp.x, peakY, sp.x, eaveY);
        roofGrad.addColorStop(0, 'rgba(68, 48, 18, 0.95)');
        roofGrad.addColorStop(0.5, 'rgba(38, 27, 11, 0.93)');
        roofGrad.addColorStop(1, 'rgba(22, 16, 8, 0.95)');

        ctx.fillStyle = roofGrad;
        ctx.strokeStyle = 'rgba(255, 232, 136, 0.95)';
        ctx.lineWidth = Math.max(1.1, 0.14 * zoom);
        ctx.beginPath();
        ctx.moveTo(eFL.x, eFL.y);
        ctx.quadraticCurveTo(lerp(eFL.x, rL.x, 0.45), lerp(eFL.y, rL.y, 0.38), rL.x, rL.y);
        ctx.lineTo(rR.x, rR.y);
        ctx.quadraticCurveTo(lerp(eFR.x, rR.x, 0.45), lerp(eFR.y, rR.y, 0.38), eFR.x, eFR.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Dense Golden Thatch / Tile Wireframe Courses & Rafter Ribs (exact match to Reference Images `e6583ed1.jpg` & `88c1a8c0.jpg`!)
        ctx.strokeStyle = 'rgba(248, 212, 104, 0.48)';
        ctx.lineWidth = Math.max(0.6, 0.065 * zoom);
        ctx.beginPath();
        const courses = 8;
        for (let r = 1; r < courses; r++) {
          const u = r / courses;
          const curveU = Math.pow(u, 0.88);
          const lx = lerp(rL.x, eFL.x, curveU);
          const rx = lerp(rR.x, eFR.x, curveU);
          const ry = lerp(rL.y, eFL.y, u);
          ctx.moveTo(lx, ry);
          ctx.lineTo(rx, ry);
        }
        const ribs = 22;
        for (let k = 0; k <= ribs; k++) {
          const u = k / ribs;
          const topX = lerp(rL.x, rR.x, u);
          const botX = lerp(eFL.x, eFR.x, u);
          const midX = (topX + botX) * 0.5;
          const midY = lerp(rL.y, eFL.y, 0.56);
          ctx.moveTo(topX, rL.y);
          ctx.quadraticCurveTo(midX, midY, botX, eFL.y);
        }
        ctx.stroke();

        // Exposed Golden Rafter Tails (`Taruki`) along the front eave lip
        if (zoom > 3.2) {
          ctx.strokeStyle = 'rgba(255, 236, 152, 0.82)';
          ctx.lineWidth = Math.max(0.75, 0.08 * zoom);
          ctx.beginPath();
          for (let k = 0; k <= 24; k++) {
            const rx = lerp(eFL.x, eFR.x, k / 24);
            ctx.moveTo(rx, eFL.y);
            ctx.lineTo(rx, eFL.y + 0.18 * zoom);
          }
          ctx.stroke();
        }

        // Sleek Bound Antique-Gold & Bronze Ridgepole (`Mune` & `Gushi` roof crest matching `e6583ed1.jpg`)
        ctx.fillStyle = 'rgba(46, 33, 14, 0.96)';
        ctx.strokeStyle = 'rgba(244, 208, 104, 0.88)';
        ctx.lineWidth = Math.max(0.95, 0.11 * zoom);
        const muneH = 0.2 * zoom;
        ctx.beginPath();
        ctx.roundRect(rL.x - 0.12 * zoom, rL.y - muneH * 0.5, (rR.x - rL.x) + 0.24 * zoom, muneH, 0.08 * zoom);
        ctx.fill();
        ctx.stroke();

        // Subtle bamboo & straw ridge bindings (`warabite`) along the crest
        ctx.strokeStyle = 'rgba(236, 196, 88, 0.58)';
        ctx.lineWidth = Math.max(0.65, 0.07 * zoom);
        ctx.beginPath();
        for (let b = 0; b <= 6; b++) {
          const bx = lerp(rL.x, rR.x, b / 6);
          ctx.moveTo(bx, rL.y - muneH * 0.6);
          ctx.lineTo(bx, rL.y + muneH * 0.5);
        }
        ctx.stroke();

        // Warm Glowing Hanging Paper Lanterns (`Chochin`) under the front eave corners
        if (st.complete && zoom > 3.5 && sIdx === 0) {
          for (const side of [-1, 1]) {
            const lx = sp.x + side * tw * 0.62;
            const ly = eaveY + 0.34 * zoom;
            const lGlow = ctx.createRadialGradient(lx, ly, 0.5, lx, ly, 1.4 * zoom);
            lGlow.addColorStop(0, 'rgba(255, 240, 168, 0.85)');
            lGlow.addColorStop(1, 'rgba(255, 180, 50, 0)');
            ctx.fillStyle = lGlow;
            ctx.beginPath();
            ctx.arc(lx, ly, 1.4 * zoom, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 214, 102, 0.94)';
            ctx.strokeStyle = '#fff2be';
            ctx.lineWidth = Math.max(0.75, 0.08 * zoom);
            ctx.beginPath();
            ctx.ellipse(lx, ly, 0.24 * zoom, 0.34 * zoom, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    }

    ctx.restore();
  }

  drawFloatingLantern(ctx, lan, zoom, timeSec) {
    const sp = this.worldToScreen(lan.x, lan.y);
    const bob = Math.sin(timeSec * 2.4 + lan.x) * 1.5;
    const r = Math.max(3.5, 0.62 * zoom);

    ctx.save();
    const grad = ctx.createRadialGradient(sp.x, sp.y + bob, 1, sp.x, sp.y + bob, r * 4.0);
    grad.addColorStop(0, 'rgba(255, 248, 200, 0.95)');
    grad.addColorStop(0.4, 'rgba(255, 196, 78, 0.58)');
    grad.addColorStop(1, 'rgba(255, 150, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y + bob, r * 4.0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff5c0';
    ctx.fillStyle = 'rgba(255, 224, 118, 0.9)';
    ctx.lineWidth = 1;
    ctx.fillRect(sp.x - r * 0.5, sp.y + bob - r * 0.85, r, r * 1.25);
    ctx.strokeRect(sp.x - r * 0.5, sp.y + bob - r * 0.85, r, r * 1.25);
    ctx.restore();
  }

  drawCharacter(ctx, c, vis, zoom, timeSec) {
    const sp = this.worldToScreen(vis.x, vis.y);
    const isSelected = this.cam.followId === c.id || this.selectedCharId === c.id;

    drawDetailedCharacter(ctx, c, vis, sp, zoom, timeSec, isSelected);

    const growthScale = clamp(c.growthScale || 1.0, 0.45, 1.15);
    const sc = clamp(zoom * 0.32, 1.35, 8.2) * growthScale;

    // When sleeping inside a shelter, drape a warm woven golden-amber quilt (`kakebuton`) over their body on the interior sleeping mat!
    if (c.posture === 'sleeping' && c.insideShelterId) {
      ctx.save();
      ctx.fillStyle = 'rgba(136, 86, 28, 0.84)';
      ctx.strokeStyle = 'rgba(255, 232, 138, 0.90)';
      ctx.lineWidth = Math.max(0.75, 0.12 * sc);
      const qw = 1.9 * sc;
      const qh = 1.05 * sc;
      ctx.beginPath();
      ctx.roundRect(sp.x - qw * 0.5, sp.y - qh * 0.65, qw, qh, 0.25 * sc);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Only show character name / speech when UI is expanded so the default view is 100% pure living artwork!
    if (!this.uiExpanded && !c.speech) return;

    const headTopY = sp.y - 11.2 * sc;

    ctx.save();
    if (this.uiExpanded) {
      ctx.font = '600 11.5px "Georgia", serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 242, 190, 0.88)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 4;
      ctx.fillText(c.name, sp.x, headTopY);
    }

    if (c.speech && this.uiExpanded) {
      ctx.font = 'italic 11px "Georgia", serif';
      const text = `“${c.speech}”`;
      const disp = text.length > 46 ? text.slice(0, 44) + '…”' : text;
      const tw = Math.min(250, ctx.measureText(disp).width + 16);
      const bx = sp.x - tw * 0.5;
      const by = headTopY - 26;
      ctx.fillStyle = 'rgba(10, 18, 32, 0.84)';
      ctx.strokeStyle = 'rgba(244, 206, 104, 0.72)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 20, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffecb3';
      ctx.textAlign = 'center';
      ctx.fillText(disp, sp.x, by + 14);
    }
    ctx.restore();
  }

  drawAtmosphericParticles(ctx, W, H, season, weather, timeSec) {
    const precip = weather?.precip || 0;
    const isSnow = weather?.snow;

    ctx.save();
    for (const p of this.particles) {
      p.x = (p.x + p.vx * 0.004 + 1) % 1;
      p.y = (p.y + p.vy * 0.004 + 1) % 1;
      const px = p.x * W + Math.sin(timeSec * 1.3 + p.phase) * 16;
      const py = p.y * H;

      if (precip > 0.08 && !isSnow) {
        ctx.strokeStyle = 'rgba(165, 220, 245, 0.34)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 3.5, py + 12);
        ctx.stroke();
      } else if (season === 'spring') {
        ctx.fillStyle = p.phase > 3 ? 'rgba(255, 202, 226, 0.78)' : 'rgba(255, 232, 244, 0.78)';
        ctx.beginPath();
        ctx.ellipse(px, py, p.size * 1.25, p.size * 0.68, timeSec * p.vrot + p.rot, 0, Math.PI * 2);
        ctx.fill();
      } else if (season === 'autumn') {
        ctx.fillStyle = p.phase > 2.5 ? 'rgba(236, 66, 34, 0.8)' : 'rgba(248, 178, 48, 0.8)';
        ctx.beginPath();
        ctx.ellipse(px, py, p.size * 1.35, p.size * 0.78, timeSec * p.vrot + p.rot, 0, Math.PI * 2);
        ctx.fill();
      } else if (season === 'winter' || isSnow) {
        ctx.fillStyle = 'rgba(242, 248, 255, 0.78)';
        ctx.beginPath();
        ctx.arc(px, py, p.size * 0.82, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const glow = 0.35 + 0.5 * Math.sin(timeSec * 2.8 + p.phase);
        ctx.fillStyle = `rgba(255, 232, 125, ${glow})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawDriftingMapClouds(ctx, W, H, zoom, timeSec, dt) {
    const cloudAlpha = clamp((6.8 - zoom) / 3.4, 0, 0.26);
    if (cloudAlpha <= 0.005) return;

    ctx.save();
    for (const cl of this.worldClouds) {
      cl.x += cl.speed * dt;
      if (cl.x > this.world.N - 40) cl.x = 40;

      const sp = this.worldToScreen(cl.x, cl.y + Math.sin(timeSec * 0.25 + cl.phase) * 6);
      const rx = cl.rx * zoom;
      const ry = cl.ry * zoom;
      if (sp.x + rx * 1.6 < 0 || sp.x - rx * 1.6 > W || sp.y + ry * 1.6 < 0 || sp.y - ry * 1.6 > H) continue;

      const grad = ctx.createRadialGradient(sp.x, sp.y, ry * 0.15, sp.x, sp.y, rx * 1.25);
      grad.addColorStop(0, `rgba(255, 244, 206, ${cloudAlpha})`);
      grad.addColorStop(0.55, `rgba(218, 208, 178, ${cloudAlpha * 0.58})`);
      grad.addColorStop(1, 'rgba(218, 208, 178, 0)');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, rx * 1.2, ry * 0.85, 0, 0, Math.PI * 2);
      ctx.ellipse(sp.x - rx * 0.45, sp.y + ry * 0.22, rx * 0.75, ry * 0.62, 0, 0, Math.PI * 2);
      ctx.ellipse(sp.x + rx * 0.48, sp.y - ry * 0.18, rx * 0.78, ry * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 246, 205, ${cloudAlpha * 0.65})`;
      ctx.lineWidth = Math.max(0.7, 0.08 * zoom);
      ctx.beginPath();
      ctx.moveTo(sp.x - rx * 0.85, sp.y);
      ctx.bezierCurveTo(
        sp.x - rx * 0.3,
        sp.y - ry * 0.45,
        sp.x + rx * 0.3,
        sp.y + ry * 0.35,
        sp.x + rx * 0.85,
        sp.y - ry * 0.1
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  drawByobuGoldClouds(ctx, W, H) {
    ctx.save();
    const pattern = this.atlas.goldFoilCanvas
      ? ctx.createPattern(this.atlas.goldFoilCanvas, 'repeat')
      : '#d8ae42';

    const buildSuyariPath = (isTop) => {
      const path = new Path2D();
      if (isTop) {
        path.moveTo(0, 0);
        path.lineTo(W, 0);
        path.lineTo(W, 18);
        const fingers = [
          [0.92, 26, 0.76, 38],
          [0.72, 22, 0.56, 52],
          [0.48, 42, 0.31, 56],
          [0.26, 28, 0.12, 38],
          [0.05, 20, 0.0, 24],
        ];
        let prevX = W, prevY = 18;
        for (const [fx1, fy1, fx2, fy2] of fingers) {
          const x1 = fx1 * W, x2 = fx2 * W;
          path.bezierCurveTo((prevX + x1) * 0.5, prevY, (prevX + x1) * 0.5, fy1, x1, fy1);
          path.bezierCurveTo((x1 + x2) * 0.5, fy1 + 8, (x1 + x2) * 0.5, fy2, x2, fy2);
          prevX = x2;
          prevY = fy2;
        }
        path.closePath();
      } else {
        path.moveTo(0, H);
        path.lineTo(W, H);
        path.lineTo(W, H - 42);
        const fingers = [
          [0.86, H - 48, 0.74, H - 28],
          [0.64, H - 18, 0.48, H - 28],
          [0.34, H - 16, 0.18, H - 34],
          [0.08, H - 26, 0.0, H - 20],
        ];
        let prevX = W, prevY = H - 42;
        for (const [fx1, fy1, fx2, fy2] of fingers) {
          const x1 = fx1 * W, x2 = fx2 * W;
          path.bezierCurveTo((prevX + x1) * 0.5, prevY, (prevX + x1) * 0.5, fy1, x1, fy1);
          path.bezierCurveTo((x1 + x2) * 0.5, fy1 - 8, (x1 + x2) * 0.5, fy2, x2, fy2);
          prevX = x2;
          prevY = fy2;
        }
        path.closePath();
      }
      return path;
    };

    const topCloud = buildSuyariPath(true);
    const botCloud = buildSuyariPath(false);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = pattern;
    ctx.fill(topCloud);
    ctx.fill(botCloud);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 245, 198, 0.14)';
    ctx.lineWidth = 1.0;
    ctx.stroke(topCloud);
    ctx.stroke(botCloud);

    for (const frac of [0.25, 0.5, 0.75]) {
      const hx = Math.round(W * frac) + 0.5;
      ctx.strokeStyle = 'rgba(10, 14, 22, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, H);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 232, 145, 0.07)';
      ctx.beginPath();
      ctx.moveTo(hx + 1, 0);
      ctx.lineTo(hx + 1, H);
      ctx.stroke();
    }

    ctx.restore();
  }
}
