// High-Definition Procedural Art Atlas & True 3D-Projected Golden Wireframe-Mesh Character Painter
// Faithfully recreates the visual richness, atmosphere, and soul of teamLab's "World of Irreversible Change":
//   - Seamless tree root-to-ground blending with gnarled root buttresses, dark sumi-moss cushions & root flora
//   - High-DPI botanical bushes, ferns, flowering shrubs, berry brambles & mossy stones with live wind sway
//   - True 3D-to-2.5D Volumetric Skeletal & Garment Rig for characters (depth-sorted 3D limbs, draped kimono
//     panels with warp/weft golden wireframe mesh, water-depth submergence clipping, swimming/floating,
//     cooperative two-person log carrying, small-billet shoulder carrying, and heavy log dragging)

import { clamp, lerp } from '/shared/dmath.js';
import { mulberry32 } from '/shared/rng.js';

export class ArtAtlas {
  constructor() {
    this.treeSprites = new Map(); // `${species}_${season}_${variant}` -> HTMLCanvasElement
    this.bushSprites = new Map(); // `${species}_${season}_${variant}` -> HTMLCanvasElement
    this.stoneLanternSprite = null;
    this.goldFoilCanvas = null;
    this.buildGoldFoilTexture();
    this.buildStoneLanternSprite();
  }

  buildGoldFoilTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const rand = mulberry32(0x9e3779b9);

    const g = ctx.createLinearGradient(0, 0, 512, 256);
    g.addColorStop(0, '#d8b454');
    g.addColorStop(0.35, '#ecd078');
    g.addColorStop(0.65, '#dfc062');
    g.addColorStop(1, '#cfa948');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);

    const tile = 48;
    for (let y = 0; y < 256; y += tile) {
      for (let x = 0; x < 512; x += tile) {
        const lum = (rand() - 0.48) * 18;
        ctx.fillStyle = lum > 0
          ? `rgba(255, 244, 190, ${(lum / 18) * 0.18})`
          : `rgba(120, 84, 18, ${(-lum / 18) * 0.14})`;
        ctx.fillRect(x, y, tile, tile);

        ctx.strokeStyle = 'rgba(255, 246, 205, 0.14)';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(x + 0.5, y + 0.5, tile, tile);
      }
    }
    this.goldFoilCanvas = c;
  }

  buildStoneLanternSprite() {
    const c = document.createElement('canvas');
    c.width = 72;
    c.height = 96;
    const ctx = c.getContext('2d');
    const cx = 36, by = 84;

    const halo = ctx.createRadialGradient(cx, by - 42, 2, cx, by - 42, 28);
    halo.addColorStop(0, 'rgba(255, 232, 140, 0.65)');
    halo.addColorStop(0.5, 'rgba(240, 185, 70, 0.22)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, by - 42, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 220, 125, 0.88)';
    ctx.fillStyle = 'rgba(28, 24, 18, 0.78)';
    ctx.lineWidth = 1.1;

    ctx.beginPath();
    ctx.moveTo(cx - 14, by);
    ctx.lineTo(cx + 14, by);
    ctx.lineTo(cx + 10, by - 8);
    ctx.lineTo(cx - 10, by - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillRect(cx - 5, by - 30, 10, 22);
    ctx.strokeRect(cx - 5, by - 30, 10, 22);

    ctx.beginPath();
    ctx.moveTo(cx - 11, by - 30);
    ctx.lineTo(cx + 11, by - 30);
    ctx.lineTo(cx + 13, by - 35);
    ctx.lineTo(cx - 13, by - 35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 224, 120, 0.82)';
    ctx.fillRect(cx - 8, by - 49, 16, 14);
    ctx.strokeRect(cx - 8, by - 49, 16, 14);
    ctx.beginPath();
    ctx.moveTo(cx, by - 49);
    ctx.lineTo(cx, by - 35);
    ctx.moveTo(cx - 8, by - 42);
    ctx.lineTo(cx + 8, by - 42);
    ctx.stroke();

    ctx.fillStyle = 'rgba(32, 24, 14, 0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - 20, by - 48);
    ctx.quadraticCurveTo(cx - 10, by - 55, cx, by - 62);
    ctx.quadraticCurveTo(cx + 10, by - 55, cx + 20, by - 48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    for (let k = -3; k <= 3; k++) {
      ctx.moveTo(cx, by - 62);
      ctx.lineTo(cx + k * 5.5, by - 48);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, by - 65, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    this.stoneLanternSprite = c;
  }

  getTreeSprite(species, season, variant = 0) {
    const v = (variant | 0) % 5;
    const key = `${species}_${season}_${v}`;
    let sp = this.treeSprites.get(key);
    if (!sp) {
      sp = this.renderTreeSprite(species, season, v);
      this.treeSprites.set(key, sp);
    }
    return sp;
  }

  /**
   * Lazily builds and caches a high-DPI botanical bush, fern, wildflower, or mossy stone sprite.
   */
  getBushSprite(species, season, variant = 0) {
    const v = (variant | 0) % 4;
    const key = `${species}_${season}_${v}`;
    let sp = this.bushSprites.get(key);
    if (!sp) {
      sp = this.renderBushSprite(species, season, v);
      this.bushSprites.set(key, sp);
    }
    return sp;
  }

  /**
   * Renders a seamless root-to-ground base for any tree so the trunk never looks pasted on top of the ground.
   */
  drawSeamlessTreeRootBase(ctx, cx, by, rand, species, season) {
    // 1. Deep sumi-ink & mossy earth shadow cushion that blends the trunk into the dark indigo ground
    const earthShadow = ctx.createRadialGradient(cx, by + 2, 3, cx, by + 2, 48);
    earthShadow.addColorStop(0, 'rgba(6, 12, 22, 0.78)');
    earthShadow.addColorStop(0.45, 'rgba(14, 24, 34, 0.42)');
    earthShadow.addColorStop(0.78, 'rgba(68, 62, 28, 0.14)');
    earthShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = earthShadow;
    ctx.beginPath();
    ctx.ellipse(cx, by + 2, 48, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Spreading gnarled root buttresses that taper and fade to alpha=0 into the moss!
    const rootCount = 6;
    for (let r = 0; r < rootCount; r++) {
      const t = (r / (rootCount - 1)) * 2 - 1; // -1..1
      const spreadX = t * (16 + rand() * 12);
      const dropY = 4 + (1 - Math.abs(t)) * 6 + rand() * 4;
      const startX = cx + t * 4.5;
      const startY = by - 14 - rand() * 6;
      const endX = cx + spreadX;
      const endY = by + dropY;

      const rGrad = ctx.createLinearGradient(startX, startY, endX, endY);
      rGrad.addColorStop(0, species === 'sakura' ? 'rgba(135, 92, 62, 0.9)' : 'rgba(158, 122, 58, 0.88)');
      rGrad.addColorStop(0.65, 'rgba(86, 74, 34, 0.55)');
      rGrad.addColorStop(1, 'rgba(24, 32, 24, 0)');

      ctx.strokeStyle = rGrad;
      ctx.lineWidth = Math.max(1.2, (1 - Math.abs(t) * 0.4) * 3.8);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cx + spreadX * 0.45, by + 1, endX, endY);
      ctx.stroke();

      // Subtle golden bark highlight fading down the root ridge
      const hGrad = ctx.createLinearGradient(startX, startY, endX, endY);
      hGrad.addColorStop(0, 'rgba(245, 212, 118, 0.45)');
      hGrad.addColorStop(0.7, 'rgba(185, 165, 72, 0.18)');
      hGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.strokeStyle = hGrad;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cx + spreadX * 0.45, by, endX, endY);
      ctx.stroke();
    }

    // 3. Soft velvet moss mounds & tiny fern/grass tufts overlapping the root flare (like Reference Images #1 & #3)
    for (let m = 0; m < 18; m++) {
      const a = rand() * Math.PI * 2;
      const distR = Math.pow(rand(), 0.7) * 24;
      const mx = cx + Math.cos(a) * distR;
      const my = by + Math.sin(a) * distR * 0.32 + 1;
      const mr = 2.5 + rand() * 4.5;
      const mGrad = ctx.createRadialGradient(mx, my, 0.5, mx, my, mr);
      mGrad.addColorStop(0, 'rgba(98, 112, 46, 0.48)');
      mGrad.addColorStop(0.6, 'rgba(42, 56, 32, 0.28)');
      mGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.ellipse(mx, my, mr * 1.3, mr * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderTreeSprite(species, season, variant) {
    const W = 240, H = 260;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const rand = mulberry32((species.charCodeAt(0) * 9973 + season.charCodeAt(0) * 313 + variant * 7919) >>> 0);
    const cx = W * 0.5;
    const by = H - 28;

    // Seamless root shadow & moss cushion first
    this.drawSeamlessTreeRootBase(ctx, cx, by, rand, species, season);

    if (species === 'sakura' && season === 'spring') {
      for (let i = 0; i < 190; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.pow(rand(), 0.65) * 64;
        const px = cx + Math.cos(a) * r;
        const py = by + Math.sin(a) * r * 0.32;
        ctx.fillStyle = rand() > 0.35
          ? `rgba(248, 178, 212, ${0.22 + rand() * 0.42})`
          : `rgba(255, 228, 242, ${0.28 + rand() * 0.38})`;
        ctx.beginPath();
        ctx.ellipse(px, py, 1.3 + rand() * 1.5, 0.7 + rand(), rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (species === 'maple' && season === 'autumn') {
      for (let i = 0; i < 150; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.pow(rand(), 0.7) * 56;
        const px = cx + Math.cos(a) * r;
        const py = by + Math.sin(a) * r * 0.32;
        ctx.fillStyle = rand() > 0.4
          ? `rgba(232, 62, 34, ${0.25 + rand() * 0.4})`
          : `rgba(245, 162, 42, ${0.25 + rand() * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(px, py, 1.4 + rand() * 1.4, 0.8 + rand(), rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const glowGrad = ctx.createRadialGradient(cx, by - 95, 8, cx, by - 95, 86);
    if (species === 'sakura' && season === 'spring') {
      glowGrad.addColorStop(0, 'rgba(255, 224, 210, 0.34)');
      glowGrad.addColorStop(0.55, 'rgba(245, 165, 200, 0.14)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else if (species === 'maple' && season === 'autumn') {
      glowGrad.addColorStop(0, 'rgba(255, 165, 65, 0.34)');
      glowGrad.addColorStop(0.55, 'rgba(225, 58, 28, 0.16)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      glowGrad.addColorStop(0, 'rgba(255, 220, 110, 0.24)');
      glowGrad.addColorStop(0.6, 'rgba(218, 175, 65, 0.08)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, by - 95, 86, 0, Math.PI * 2);
    ctx.fill();

    const tips = [];

    const drawBranch = (x, y, len, angle, thick, depth, maxDepth) => {
      const bend = (rand() - 0.5) * 0.24;
      const mx = x + Math.cos(angle + bend * 0.5) * (len * 0.52);
      const my = y + Math.sin(angle + bend * 0.5) * (len * 0.52);
      const ex = x + Math.cos(angle + bend) * len;
      const ey = y + Math.sin(angle + bend) * len;

      // Smoothly gradient the lowest trunk segment so it blends into the dark root shadow!
      if (depth === maxDepth) {
        const tGrad = ctx.createLinearGradient(x, y + 4, ex, ey);
        tGrad.addColorStop(0, 'rgba(28, 24, 16, 0.35)');
        tGrad.addColorStop(0.28, species === 'sakura' ? 'rgba(135, 92, 62, 0.92)' : 'rgba(168, 132, 64, 0.9)');
        tGrad.addColorStop(1, species === 'sakura' ? 'rgba(165, 115, 78, 0.95)' : 'rgba(218, 176, 84, 0.95)');
        ctx.strokeStyle = tGrad;
      } else {
        ctx.strokeStyle = species === 'sakura'
          ? `rgba(165, 115, 78, ${0.75 + (depth / maxDepth) * 0.2})`
          : `rgba(218, 176, 84, ${0.65 + (depth / maxDepth) * 0.3})`;
      }
      ctx.lineWidth = thick;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();

      if (thick > 1.8) {
        ctx.strokeStyle = 'rgba(255, 232, 145, 0.42)';
        ctx.lineWidth = Math.max(0.7, thick * 0.26);
        ctx.beginPath();
        ctx.moveTo(x - 0.8, y - 4);
        ctx.quadraticCurveTo(mx - 0.8, my, ex - 0.5, ey);
        ctx.stroke();
      }

      if (depth <= 2) {
        tips.push({ x: ex, y: ey, angle });
      }
      if (depth <= 0) return;

      const subCount = depth === maxDepth ? 3 : rand() > 0.35 ? 2 : 3;
      for (let i = 0; i < subCount; i++) {
        const spread = (i - (subCount - 1) * 0.5) * (0.48 + rand() * 0.28);
        const nextAngle = angle + spread + (rand() - 0.5) * 0.18;
        const nextLen = len * (0.68 + rand() * 0.16);
        const nextThick = Math.max(0.65, thick * 0.66);
        drawBranch(ex, ey, nextLen, nextAngle, nextThick, depth - 1, maxDepth);
      }
    };

    // Draw main trunk & branches
    if (species === 'pine' || species === 'cedar') {
      const isCedar = species === 'cedar';
      const trunkH = isCedar ? 175 : 145;
      drawBranch(cx, by - 2, trunkH * 0.34, -Math.PI * 0.5 + (rand() - 0.5) * 0.18, isCedar ? 9 : 8.5, 4, 4);

      for (const tip of tips) {
        const padW = isCedar ? 18 + rand() * 14 : 24 + rand() * 18;
        const padH = isCedar ? 8 + rand() * 5 : 9 + rand() * 6;
        for (let n = 0; n < 42; n++) {
          const nx = tip.x + (rand() - 0.5) * padW;
          const ny = tip.y + (rand() - 0.5) * padH;
          const na = -Math.PI * 0.5 + (rand() - 0.5) * 1.5;
          const nl = 4 + rand() * 5;
          ctx.strokeStyle = rand() > 0.3
            ? 'rgba(225, 198, 96, 0.58)'
            : 'rgba(155, 178, 88, 0.48)';
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(nx + Math.cos(na) * nl, ny + Math.sin(na) * nl);
          ctx.stroke();
        }
      }
    } else if (species === 'willow') {
      drawBranch(cx, by - 2, 48, -Math.PI * 0.5 + (rand() - 0.5) * 0.12, 8.5, 3, 3);
    } else {
      drawBranch(cx, by - 2, 46 + rand() * 8, -Math.PI * 0.5 + (rand() - 0.5) * 0.16, 9.2, 5, 5);
    }

    // Foreground yamabuki wildflowers & moss blades overlapping the front of the trunk base so it sits IN the ground!
    for (let cl = 0; cl < 2; cl++) {
      const ox = (cl === 0 ? -1 : 1) * (8 + rand() * 14);
      const oy = 1 + rand() * 4;
      ctx.strokeStyle = 'rgba(175, 198, 85, 0.62)';
      ctx.lineWidth = 0.85;
      for (let st = 0; st < 6; st++) {
        const sx = cx + ox + (rand() - 0.5) * 12;
        const sy = by + oy + (rand() - 0.5) * 3;
        const tx = sx + (rand() - 0.5) * 7;
        const ty = sy - 6 - rand() * 8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        if (species === 'sakura' || species === 'willow' || species === 'maple') {
          ctx.fillStyle = rand() > 0.3 ? 'rgba(255, 224, 72, 0.85)' : 'rgba(255, 242, 150, 0.85)';
          ctx.beginPath();
          ctx.arc(tx, ty, 1.5 + rand() * 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (species === 'willow' || species === 'pine' || species === 'cedar') {
      return c;
    }

    if (season === 'winter') {
      for (const tip of tips) {
        if (species === 'persimmon' && rand() < 0.22) {
          ctx.fillStyle = '#ff7824';
          ctx.beginPath();
          ctx.arc(tip.x, tip.y + 2, 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255, 245, 215, 0.42)';
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return c;
    }

    if (species === 'sakura' && season === 'spring') {
      for (const tip of tips) {
        for (let k = 0; k < 14; k++) {
          const r = Math.pow(rand(), 0.55) * 24;
          const a = rand() * Math.PI * 2;
          const bx = tip.x + Math.cos(a) * r;
          const by2 = tip.y + Math.sin(a) * r * 0.82;
          ctx.fillStyle = `rgba(188, 108, 148, ${0.32 + rand() * 0.3})`;
          ctx.beginPath();
          ctx.arc(bx, by2, 1.8 + rand() * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const tip of tips) {
        for (let k = 0; k < 18; k++) {
          const r = Math.pow(rand(), 0.6) * 22;
          const a = rand() * Math.PI * 2;
          const bx = tip.x + Math.cos(a) * r;
          const by2 = tip.y + Math.sin(a) * r * 0.82;
          const roll = rand();
          ctx.fillStyle =
            roll < 0.45 ? `rgba(252, 186, 216, ${0.65 + rand() * 0.3})` :
            roll < 0.82 ? `rgba(255, 224, 238, ${0.72 + rand() * 0.25})` :
            `rgba(255, 238, 195, ${0.75 + rand() * 0.25})`;
          const rad = 1.2 + rand() * 1.7;
          ctx.beginPath();
          ctx.arc(bx, by2, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return c;
    }

    if (species === 'maple' && season === 'autumn') {
      for (const tip of tips) {
        for (let k = 0; k < 22; k++) {
          const r = Math.pow(rand(), 0.58) * 23;
          const a = rand() * Math.PI * 2;
          const lx = tip.x + Math.cos(a) * r;
          const ly = tip.y + Math.sin(a) * r * 0.82;
          const roll = rand();
          ctx.fillStyle =
            roll < 0.38 ? `rgba(175, 28, 22, ${0.55 + rand() * 0.35})` :
            roll < 0.72 ? `rgba(235, 64, 32, ${0.65 + rand() * 0.32})` :
            roll < 0.90 ? `rgba(248, 124, 36, ${0.7 + rand() * 0.28})` :
            `rgba(255, 205, 68, ${0.75 + rand() * 0.25})`;
          ctx.beginPath();
          ctx.ellipse(lx, ly, 1.6 + rand() * 2.1, 1.0 + rand() * 1.3, rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return c;
    }

    if (species === 'ginkgo' && season === 'autumn') {
      for (const tip of tips) {
        for (let k = 0; k < 20; k++) {
          const r = Math.pow(rand(), 0.6) * 20;
          const a = rand() * Math.PI * 2;
          const lx = tip.x + Math.cos(a) * r;
          const ly = tip.y + Math.sin(a) * r * 0.85;
          ctx.fillStyle = rand() > 0.35
            ? `rgba(255, 212, 52, ${0.62 + rand() * 0.32})`
            : `rgba(255, 238, 128, ${0.7 + rand() * 0.25})`;
          ctx.beginPath();
          ctx.arc(lx, ly, 1.5 + rand() * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return c;
    }

    for (const tip of tips) {
      for (let k = 0; k < 16; k++) {
        const r = Math.pow(rand(), 0.6) * 21;
        const a = rand() * Math.PI * 2;
        const lx = tip.x + Math.cos(a) * r;
        const ly = tip.y + Math.sin(a) * r * 0.82;
        const roll = rand();
        ctx.fillStyle =
          roll < 0.45 ? `rgba(188, 175, 72, ${0.34 + rand() * 0.28})` :
          roll < 0.82 ? `rgba(235, 204, 96, ${0.42 + rand() * 0.32})` :
          `rgba(255, 236, 152, ${0.5 + rand() * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 1.6 + rand() * 1.8, 1.0 + rand() * 1.2, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      if (species === 'persimmon' && season === 'autumn' && rand() < 0.35) {
        ctx.fillStyle = '#ff7b24';
        ctx.beginPath();
        ctx.arc(tip.x + (rand() - 0.5) * 10, tip.y + 3, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return c;
  }

  /**
   * Pre-renders intricate Japanese Rimpa/teamLab-style bushes, ferns, flowering shrubs, and mossy boulders.
   */
  renderBushSprite(species, season, variant) {
    const W = 128, H = 112;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const rand = mulberry32((species.charCodeAt(0) * 6151 + season.charCodeAt(0) * 521 + variant * 4099) >>> 0);
    const cx = W * 0.5;
    const by = H - 20;

    // Ground shadow & moss blend pool
    const pool = ctx.createRadialGradient(cx, by + 2, 2, cx, by + 2, 36);
    pool.addColorStop(0, 'rgba(6, 12, 22, 0.72)');
    pool.addColorStop(0.55, 'rgba(48, 56, 26, 0.24)');
    pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(cx, by + 2, 36, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Case A: Forest Fern (`fern`) — 9 arching pinnate fronds with individual leaflets
    if (species === 'fern') {
      const frondCount = 9;
      for (let f = 0; f < frondCount; f++) {
        const u = (f / (frondCount - 1)) * 2 - 1; // -1..1
        const len = 28 + (1 - Math.abs(u) * 0.35) * 18;
        const endX = cx + u * 38 + (rand() - 0.5) * 6;
        const endY = by - 8 - (1 - Math.abs(u) * 0.55) * 26;
        const ctrlX = cx + u * 18;
        const ctrlY = by - len * 0.85;

        // Central rachis stem
        ctx.strokeStyle = 'rgba(218, 198, 88, 0.78)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(cx + u * 3, by);
        ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
        ctx.stroke();

        // Pinnate leaflets along the arching frond
        for (let p = 2; p <= 11; p++) {
          const t = p / 12;
          const px = (1 - t) * (1 - t) * (cx + u * 3) + 2 * (1 - t) * t * ctrlX + t * t * endX;
          const py = (1 - t) * (1 - t) * by + 2 * (1 - t) * t * ctrlY + t * t * endY;
          const leafLen = (1 - Math.abs(t - 0.45)) * 7.5;
          ctx.fillStyle = p % 2 === 0 ? 'rgba(182, 196, 78, 0.58)' : 'rgba(238, 216, 108, 0.62)';
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(
              px + side * leafLen * 0.45,
              py + side * 1.2,
              leafLen * 0.65,
              1.4,
              u * 0.6 + side * 0.5,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        }
      }
      return c;
    }

    // Case B: Multi-stemmed Botanical Shrub (`bilberry`, `bramble`, `elder`, `hazel`, etc.)
    const tips = [];
    const stems = 5 + (variant % 2);
    for (let s = 0; s < stems; s++) {
      const u = (s / (stems - 1)) * 2 - 1;
      const a = -Math.PI * 0.5 + u * 0.82 + (rand() - 0.5) * 0.16;
      const len = 24 + rand() * 14;
      const mx = cx + Math.cos(a) * len * 0.5;
      const my = by + Math.sin(a) * len * 0.5;
      const ex = cx + Math.cos(a + u * 0.22) * len;
      const ey = by + Math.sin(a + u * 0.22) * len;

      ctx.strokeStyle = 'rgba(198, 158, 76, 0.78)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx + u * 4, by);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();

      tips.push({ x: mx, y: my }, { x: ex, y: ey });

      // Sub-twigs
      for (const sub of [-0.45, 0.45]) {
        const sa = a + sub;
        const sl = len * 0.55;
        const sx = mx + Math.cos(sa) * sl;
        const sy = my + Math.sin(sa) * sl;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        tips.push({ x: sx, y: sy });
      }
    }

    // Layered luminous gold-rimmed leaves around every twig tip
    for (const tip of tips) {
      const leafCount = season === 'winter' ? 3 : 15;
      for (let k = 0; k < leafCount; k++) {
        const r = Math.pow(rand(), 0.65) * 14;
        const a = rand() * Math.PI * 2;
        const lx = tip.x + Math.cos(a) * r;
        const ly = tip.y + Math.sin(a) * r * 0.78;
        const roll = rand();
        if (season === 'autumn') {
          ctx.fillStyle =
            roll < 0.45 ? 'rgba(215, 92, 38, 0.55)' :
            roll < 0.8 ? 'rgba(242, 168, 52, 0.62)' :
            'rgba(255, 224, 112, 0.68)';
        } else {
          ctx.fillStyle =
            roll < 0.4 ? 'rgba(84, 112, 48, 0.48)' :
            roll < 0.78 ? 'rgba(186, 182, 72, 0.55)' :
            'rgba(248, 224, 118, 0.66)';
        }
        ctx.beginPath();
        ctx.ellipse(lx, ly, 2.2 + rand() * 1.8, 1.1 + rand() * 0.9, a, 0, Math.PI * 2);
        ctx.fill();
      }

      // Seasonal blossoms or berries on the shrub
      if (season === 'spring' && rand() < 0.65) {
        ctx.fillStyle = species === 'elder' ? '#fff6d6' : species === 'bramble' ? '#ffd8ea' : '#ffe46b';
        for (let b = 0; b < 3; b++) {
          ctx.beginPath();
          ctx.arc(tip.x + (rand() - 0.5) * 10, tip.y + (rand() - 0.5) * 8, 1.6 + rand(), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if ((season === 'summer' || season === 'autumn') && rand() < 0.65) {
        if (species === 'bilberry' || species === 'bramble' || species === 'elder') {
          ctx.fillStyle = species === 'bilberry' ? '#7cb8ff' : species === 'bramble' ? '#4a1c42' : '#8a3278';
          ctx.strokeStyle = 'rgba(255, 232, 150, 0.55)';
          ctx.lineWidth = 0.5;
          for (let b = 0; b < 3; b++) {
            ctx.beginPath();
            ctx.arc(tip.x + (rand() - 0.5) * 10, tip.y + (rand() - 0.5) * 8, 1.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    }

    return c;
  }
}

/**
 * Draws an animated Weeping Willow (Yanagi) with cascading golden-chartreuse catenary strands.
 */
export function drawAnimatedWillow(ctx, atlas, sp, s, season, timeSec, seedOffset = 0) {
  const sprite = atlas.getTreeSprite('willow', season, seedOffset % 5);
  const drawW = 36 * s;
  const drawH = 39 * s;
  ctx.drawImage(sprite, sp.x - drawW * 0.5, sp.y - drawH * 0.89, drawW, drawH);

  const h = 4.6 * s;
  const wind = Math.sin(timeSec * 1.35 + seedOffset * 0.7) * 0.22 * s;

  ctx.save();
  const strandCount = 22;
  for (let i = 0; i < strandCount; i++) {
    const t = (i / (strandCount - 1)) * 2 - 1;
    const crownX = sp.x + t * 1.75 * s;
    const crownY = sp.y - h * (0.76 + (1 - t * t) * 0.22);
    const strandLen = h * (0.58 + (i % 3) * 0.08) * (1 - Math.abs(t) * 0.22);
    const localSway = wind + Math.sin(timeSec * 2.1 + i * 0.9 + seedOffset) * 0.08 * s;

    const midX = crownX + t * 0.25 * s + localSway * 0.55;
    const midY = crownY + strandLen * 0.5;
    const tipX = crownX + t * 0.35 * s + localSway * 1.25;
    const tipY = crownY + strandLen;

    ctx.strokeStyle = i % 2 === 0
      ? 'rgba(255, 232, 118, 0.68)'
      : 'rgba(218, 206, 86, 0.52)';
    ctx.lineWidth = Math.max(0.75, 0.075 * s);
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();

    if (s > 5.5 && season !== 'winter') {
      ctx.fillStyle = 'rgba(255, 238, 138, 0.78)';
      for (let lf = 1; lf <= 5; lf++) {
        const u = lf / 6;
        const lx = (1 - u) * (1 - u) * crownX + 2 * (1 - u) * u * midX + u * u * tipX;
        const ly = (1 - u) * (1 - u) * crownY + 2 * (1 - u) * u * midY + u * u * tipY;
        ctx.beginPath();
        ctx.ellipse(lx + (lf % 2 ? 1.2 : -1.2), ly, 1.5, 0.65, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/**
 * Draws a physical log chunk, small billet, felled tree trunk, or reed bundle on the ground or being hauled.
 */
export function drawTimberLogOrBundle(ctx, sx, sy, zoom, kind = 'log_chunk', angle = 0, lengthMeters = 1.6, isDragged = false) {
  const sc = clamp(zoom * 0.32, 1.2, 8.0);
  ctx.save();
  ctx.translate(sx, sy);

  ctx.fillStyle = isDragged ? 'rgba(215, 175, 75, 0.22)' : 'rgba(8, 14, 24, 0.58)';
  ctx.beginPath();
  ctx.ellipse(0, 0.32 * sc, lengthMeters * 1.05 * sc, 0.58 * sc, angle * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(angle * 0.35);

  if (kind === 'reed_bundle') {
    const bw = 1.7 * sc;
    const bh = 0.68 * sc;
    ctx.fillStyle = 'rgba(65, 58, 22, 0.72)';
    ctx.strokeStyle = 'rgba(255, 226, 118, 0.85)';
    ctx.lineWidth = Math.max(0.8, 0.14 * sc);
    ctx.beginPath();
    ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    for (let k = -3; k <= 3; k++) {
      ctx.moveTo(-bw * 0.92, (k / 4) * bh);
      ctx.lineTo(bw * 0.92, (k / 4) * bh);
    }
    ctx.moveTo(-0.25 * sc, -bh);
    ctx.lineTo(-0.25 * sc, bh);
    ctx.moveTo(0.25 * sc, -bh);
    ctx.lineTo(0.25 * sc, bh);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (kind === 'stone_chunk') {
    ctx.fillStyle = 'rgba(38, 46, 58, 0.85)';
    ctx.strokeStyle = 'rgba(245, 214, 120, 0.88)';
    ctx.lineWidth = Math.max(0.9, 0.15 * sc);
    ctx.beginPath();
    ctx.arc(-0.4 * sc, 0, 0.62 * sc, 0, Math.PI * 2);
    ctx.arc(0.45 * sc, 0.1 * sc, 0.52 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  const isSmall = kind === 'small_log_chunk';
  const halfL = (kind === 'felled_trunk' ? 3.8 : isSmall ? 0.95 : 1.55) * sc;
  const rad = (kind === 'felled_trunk' ? 0.68 : isSmall ? 0.42 : 0.58) * sc;

  ctx.fillStyle = 'rgba(44, 30, 14, 0.84)';
  ctx.strokeStyle = 'rgba(255, 222, 118, 0.92)';
  ctx.lineWidth = Math.max(0.9, 0.15 * sc);

  ctx.beginPath();
  ctx.moveTo(-halfL, -rad);
  ctx.lineTo(halfL, -rad);
  ctx.arc(halfL, 0, rad, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.lineTo(-halfL, rad);
  ctx.arc(-halfL, 0, rad, Math.PI * 0.5, -Math.PI * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(185, 142, 58, 0.78)';
  ctx.beginPath();
  ctx.ellipse(halfL, 0, rad * 0.52, rad, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 242, 175, 0.75)';
  ctx.lineWidth = Math.max(0.6, 0.09 * sc);
  ctx.beginPath();
  ctx.ellipse(halfL, 0, rad * 0.24, rad * 0.48, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245, 204, 96, 0.48)';
  ctx.beginPath();
  for (const frac of [-0.52, 0, 0.52]) {
    const by = frac * rad;
    ctx.moveTo(-halfL * 0.9, by);
    ctx.lineTo(halfL * 0.85, by);
  }
  if (isDragged) {
    ctx.strokeStyle = '#ffefb0';
    ctx.lineWidth = Math.max(1.0, 0.17 * sc);
    ctx.moveTo(-halfL * 0.45, -rad * 1.05);
    ctx.lineTo(-halfL * 0.45, rad * 1.05);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * Helper: strokes the current path with teamLab's signature soft, painterly antique-gold brushwork
 * matching the exact texture of `06c3e32d.png`, `5f10f972.png`, and `60dffec5.png` (never harsh CAD wireframe!).
 */
function strokeGoldenCalligraphy(
  ctx,
  sc,
  coreColor = 'rgba(236, 202, 104, 0.78)',
  glowColor = 'rgba(188, 142, 46, 0.34)',
  widthMult = 1.0
) {
  ctx.save();
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = Math.max(1.1, 0.30 * sc * widthMult);
  ctx.stroke();
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = Math.max(0.6, 0.12 * sc * widthMult);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws an anatomically sculpted, painterly human limb segment (thigh, calf, or forearm)
 * modeled directly on the legs and arms in `5f10f972.png` and `60dffec5.png`:
 * rich russet-mahogany & olive-ochre interior shading with soft golden outer/inner brush contours.
 */
function drawTaperedAnatomicalSegment(
  ctx,
  p0,
  p1,
  r0,
  r1,
  innerFill,
  wrapRings = 2,
  sc = 3.0,
  coreGold = 'rgba(234, 198, 98, 0.76)',
  muscleBulge = 0.24
) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (p0.x + p1.x) * 0.5 + nx * (r0 - r1) * muscleBulge;
  const my = (p0.y + p1.y) * 0.5 + ny * (r0 - r1) * muscleBulge;

  const limbGrad = ctx.createLinearGradient(
    mx - nx * r0,
    my - ny * r0,
    mx + nx * r0,
    my + ny * r0
  );
  limbGrad.addColorStop(0, 'rgba(38, 24, 14, 0.90)');
  limbGrad.addColorStop(0.45, innerFill);
  limbGrad.addColorStop(0.82, 'rgba(148, 96, 38, 0.84)');
  limbGrad.addColorStop(1, 'rgba(44, 28, 14, 0.90)');

  ctx.fillStyle = limbGrad;
  ctx.beginPath();
  ctx.moveTo(p0.x + nx * r0, p0.y + ny * r0);
  ctx.quadraticCurveTo(
    mx + nx * ((r0 + r1) * 0.58),
    my + ny * ((r0 + r1) * 0.58),
    p1.x + nx * r1,
    p1.y + ny * r1
  );
  ctx.arc(p1.x, p1.y, r1, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
  ctx.quadraticCurveTo(
    mx - nx * ((r0 + r1) * 0.48),
    my - ny * ((r0 + r1) * 0.48),
    p0.x - nx * r0,
    p0.y - ny * r0
  );
  ctx.closePath();
  ctx.fill();
  strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.30)', 0.88);

  if (wrapRings > 0 && len > 1.6) {
    ctx.save();
    ctx.strokeStyle = 'rgba(236, 198, 96, 0.38)';
    ctx.lineWidth = Math.max(0.55, 0.11 * sc);
    ctx.beginPath();
    // Inner golden muscle / shin highlight stroke (visible down the center of calves in `5f10f972.png` & `60dffec5.png`)
    ctx.moveTo(lerp(p0.x, p1.x, 0.18) + nx * r0 * 0.12, lerp(p0.y, p1.y, 0.18) + ny * r0 * 0.12);
    ctx.lineTo(lerp(p0.x, p1.x, 0.84) + nx * r1 * 0.12, lerp(p0.y, p1.y, 0.84) + ny * r1 * 0.12);
    for (let i = 1; i <= wrapRings; i++) {
      const u = i / (wrapRings + 1);
      const cx = lerp(p0.x, p1.x, u);
      const cy = lerp(p0.y, p1.y, u);
      const rw = lerp(r0, r1, u) * 0.92;
      ctx.moveTo(cx + nx * rw, cy + ny * rw);
      ctx.quadraticCurveTo(
        cx + (dx / len) * rw * 0.32,
        cy + (dy / len) * rw * 0.32,
        cx - nx * rw,
        cy - ny * rw
      );
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draws a woven Edo straw sandal (`waraji`) matching the broad golden-ochre sandals
 * at the bottom of `06c3e32d.png`, `5f10f972.png`, and `60dffec5.png`.
 */
function drawWarajiSandal(ctx, ankleP, toeP, heelP, sc, coreGold) {
  const dx = toeP.x - heelP.x;
  const dy = toeP.y - heelP.y;
  const angle = Math.atan2(dy, dx);
  const footLen = Math.max(0.56 * sc, Math.hypot(dx, dy) * 0.56);
  const footW = 0.25 * sc;
  const cx = (heelP.x + toeP.x) * 0.5;
  const cy = (heelP.y + toeP.y) * 0.5;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Warm golden-ochre woven straw foot & sandal (`06c3e32d.png` & `5f10f972.png`)
  ctx.fillStyle = 'rgba(164, 124, 46, 0.88)';
  ctx.beginPath();
  ctx.ellipse(0, 0, footLen, footW, 0, 0, Math.PI * 2);
  ctx.fill();
  strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(188, 140, 44, 0.32)', 0.82);

  // Subtle woven strap lines across the sandal
  ctx.strokeStyle = 'rgba(92, 64, 22, 0.65)';
  ctx.lineWidth = Math.max(0.5, 0.09 * sc);
  ctx.beginPath();
  ctx.moveTo(-footLen * 0.45, -footW * 0.55);
  ctx.lineTo(footLen * 0.35, footW * 0.55);
  ctx.moveTo(-footLen * 0.35, footW * 0.55);
  ctx.lineTo(footLen * 0.45, -footW * 0.55);
  ctx.stroke();
  ctx.restore();
}

/**
 * True Reference-Faithful Character Renderer
 * Modeled 1-to-1 on the 3 close-up reference images inspected via `read_file`:
 *   - `media_1792633452479_06c3e32d.png` (Three-quarter frontal figure in olive-gold & russet-mahogany top, curved obi, long vertical-pleated skirt & golden waraji)
 *   - `media_1792633456671_5f10f972.png` (Three-quarter frontal figure turning slightly left, glowing V-neck kimono collar, short divided hip-tunic with center tie, and two sculpted russet-mahogany legs with knee creases)
 *   - `media_1792633460772_60dffec5.png` (Three-quarter frontal figure turning slightly right, sloping shoulders, hanging side arms with hip sash loop, hip-tunic & sculpted striding legs)
 */
export function drawDetailedCharacter(ctx, c, vis, sp, zoom, timeSec, isSelected) {
  const app = c.appearance || {};
  const ageYears = c.ageYears ?? 21;
  const growthScale = clamp(c.growthScale ?? (ageYears < 18 ? 0.46 + (ageYears / 18) * 0.54 : 1.0), 0.44, 1.14);
  const buildTrait = clamp(app.buildTrait ?? 1.0, 0.88, 1.14);

  const sc = clamp(zoom * 0.32, 1.35, 8.2) * growthScale;
  const isFemale = c.sex === 'f';
  const garmentStyle = app.garmentStyle || (isFemale ? 'robed' : 'tunic');
  const hairStyle = app.hairStyle || (ageYears < 11 ? 'twin_buns' : isFemale ? 'shimada' : 'topknot');
  const headgear = app.headgear || (isFemale ? 'kanzashi' : 'none');
  const accessory = app.accessory || (isFemale ? 'sash_bow' : 'rope_coil');

  // Smooth continuous heading & 3/4 frontal turn bias (`turnX` in `[-1, 1]`)
  const heading = vis?.heading ?? c.heading ?? 0;
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const dirX = vis?.facingDirX ?? (cosH >= -0.05 ? 1 : -1);
  const turnX = clamp(vis?.facingMix ?? cosH, -1, 1);

  const moveBlend = clamp(vis?.moveBlend ?? (c.moving ? 1 : 0), 0, 1);
  const walkPhase = vis?.walkCycle ?? (timeSec * 4.2);

  const isChopping = c.posture === 'chopping';
  const isSawing = c.posture === 'sawing';
  const isHauling = Boolean(c.hauling) || c.posture === 'hauling';
  const isSitting = c.posture === 'sitting';
  const isCrouching = c.posture === 'crouching';
  const isSleeping = c.posture === 'sleeping';
  const isWorking = c.posture === 'working';
  const isSwimming = c.posture === 'swimming';
  const isFloating = c.posture === 'floating';
  const submerge = clamp(c.waterSubmerge || 0, 0, 0.85);

  const breath = Math.sin(timeSec * 1.9 + (isFemale ? 1.4 : 0)) * 0.04;
  // Gentle, natural weight transfer during walking (`walkBob` + subtle lateral hip shift `hipSwayX`)
  const walkBob = Math.sin(walkPhase * 2 - Math.PI * 0.25) * 0.10 * moveBlend;
  const hipSwayX = Math.cos(walkPhase) * 0.08 * moveBlend;

  ctx.save();

  // 0. Draw hauled log chunk / cooperative carried log / dragged log!
  if (c.hauling) {
    const isSmallBillet = c.hauling.kind === 'small_log_chunk';
    const isCoCarried = Boolean(c.hauling.coCarrierId);

    if (isCoCarried) {
      const logMidX = sp.x - cosH * 2.5 * sc;
      const logMidY = sp.y - sinH * 1.1 * sc - 3.5 * sc;
      drawTimberLogOrBundle(ctx, logMidX, logMidY, zoom, 'log_chunk', heading, 1.9, true);
    } else if (!isSmallBillet) {
      const towDist = 4.1 * sc;
      const logX = sp.x - cosH * towDist;
      const logY = sp.y - sinH * towDist * 0.45 + 0.32 * sc;
      drawTimberLogOrBundle(ctx, logX, logY, zoom, c.hauling.kind || 'log_chunk', heading, 1.55, true);

      const waistAnchorX = sp.x + turnX * 0.15 * sc;
      const waistAnchorY = sp.y - 4.7 * sc;
      ctx.strokeStyle = 'rgba(238, 202, 102, 0.80)';
      ctx.lineWidth = Math.max(0.85, 0.14 * sc);
      ctx.beginPath();
      ctx.moveTo(logX + cosH * 0.5 * sc, logY - 0.15 * sc);
      ctx.quadraticCurveTo(
        (logX + waistAnchorX) * 0.5,
        (logY + waistAnchorY) * 0.5 + 0.38 * sc,
        waistAnchorX,
        waistAnchorY
      );
      ctx.stroke();
    }
  }

  // 1. Soft Painterly Golden Rim-Light Aura (matches the subtle olive-gold atmospheric glow in `06c3e32d.png`, `5f10f972.png`, `60dffec5.png`)
  const auraR = 6.8 * sc;
  const aura = ctx.createRadialGradient(sp.x, sp.y - 4.8 * sc, 0.4 * sc, sp.x, sp.y - 4.8 * sc, auraR);
  aura.addColorStop(0, isSelected ? 'rgba(255, 234, 148, 0.38)' : 'rgba(218, 180, 74, 0.22)');
  aura.addColorStop(0.55, 'rgba(168, 128, 38, 0.08)');
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y - 4.8 * sc, auraR, 0, Math.PI * 2);
  ctx.fill();

  // Woven straw mat (goza) when sitting or sleeping on dry land (outside a house)
  if ((isSitting || isSleeping) && submerge <= 0.05 && !c.insideShelterId) {
    const mw = isSleeping ? 4.4 * sc : 3.0 * sc;
    const mh = 1.35 * sc;
    ctx.fillStyle = 'rgba(175, 134, 48, 0.26)';
    ctx.strokeStyle = 'rgba(244, 210, 108, 0.56)';
    ctx.lineWidth = Math.max(0.7, 0.1 * sc);
    ctx.beginPath();
    ctx.moveTo(sp.x - mw, sp.y + 0.2 * sc);
    ctx.lineTo(sp.x - mw * 0.7, sp.y - mh);
    ctx.lineTo(sp.x + mw, sp.y - mh * 0.8);
    ctx.lineTo(sp.x + mw * 0.7, sp.y + 0.4 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Soft sumi-ink ground contact shadow under the sandals
  if (submerge <= 0.05) {
    ctx.fillStyle = 'rgba(6, 10, 18, 0.48)';
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y + 0.18 * sc, 1.72 * sc, 0.52 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Translate to character ground anchor; sink downward if wading/swimming in water
  const sinkPx = submerge * 7.8 * sc;
  ctx.translate(sp.x, sp.y + sinkPx);

  if (submerge > 0.05) {
    ctx.beginPath();
    ctx.rect(-25 * sc, -30 * sc, 50 * sc, 30 * sc - sinkPx + 0.25 * sc);
    ctx.clip();
  }

  if (isSleeping) {
    ctx.rotate(dirX >= 0 ? 1.42 : -1.42);
    ctx.translate(0, 2.3 * sc);
  } else if (isFloating) {
    ctx.rotate(dirX >= 0 ? 1.15 : -1.15);
    ctx.translate(0, 1.8 * sc);
  }

  // Soft golden brushstroke glow on the character's calligraphy (gives the exact warm painted feel of `06c3e32d.png`, `5f10f972.png`, `60dffec5.png`)
  ctx.shadowColor = 'rgba(214, 166, 58, 0.26)';
  ctx.shadowBlur = Math.max(1.0, 0.22 * sc);

  // Chopping & sawing cycle
  const chopCycle = (timeSec * 2.8) % 1;
  const chopSwing =
    chopCycle < 0.62
      ? -Math.sin((chopCycle / 0.62) * Math.PI * 0.5)
      : chopCycle < 0.82
        ? lerp(-1, 1.12, Math.pow((chopCycle - 0.62) / 0.2, 1.8))
        : lerp(1.12, 0, (chopCycle - 0.82) / 0.18);
  const sawSwing = Math.sin(timeSec * 7.6);

  const crouchDrop = isSitting ? 2.55 : isCrouching || isSawing ? 1.85 : isChopping && chopSwing > 0.3 ? 0.38 : 0;
  const zOff = walkBob + breath - crouchDrop;
  const leanExtra =
    isHauling && !c.hauling?.coCarrierId && c.hauling?.kind !== 'small_log_chunk' ? 0.55 :
    isCrouching || isSawing ? 0.45 :
    isChopping ? chopSwing * 0.38 + 0.18 :
    isWorking ? Math.sin(timeSec * 5.4) * 0.22 + 0.15 :
    moveBlend * 0.14;

  // Spine landmarks in 3/4 Frontal View (matching `06c3e32d.png`, `5f10f972.png`, `60dffec5.png`!)
  const torsoShiftX = (turnX * (0.18 + leanExtra) + hipSwayX) * sc;
  const waistP = {
    x: torsoShiftX * 0.55,
    y: -(4.85 + zOff) * sc,
  };
  const chestP = {
    x: torsoShiftX * 0.85,
    y: -(6.85 + zOff) * sc,
  };
  const neckP = {
    x: torsoShiftX * 1.0,
    y: -(8.12 + zOff) * sc,
  };
  const headScale = ageYears < 14 ? lerp(1.16, 1.0, clamp((ageYears - 2) / 12, 0, 1)) : 1.0;
  const headP = {
    x: torsoShiftX * 1.08 + turnX * 0.10 * sc,
    y: -(9.08 + zOff) * sc,
  };

  // Three-quarter Frontal Proportions directly measured from `06c3e32d.png`, `5f10f972.png`, `60dffec5.png`:
  //   - Broad, natural sloping shoulders (`shHalf ≈ 1.18 * sc`)
  //   - Grounded waist (`waistHalf ≈ 0.96 * sc`)
  //   - Left & right hip sockets separated side-by-side (`hipHalf ≈ 0.52 * sc`) so both legs are clearly visible side-by-side!
  const shHalf = (isFemale ? 1.10 : 1.22) * buildTrait * sc;
  const waistHalf = (isFemale ? 0.90 : 0.98) * buildTrait * sc;
  const hipHalf = (isFemale ? 0.48 : 0.52) * buildTrait * sc;
  const shTwist = -Math.sin(walkPhase) * 0.10 * moveBlend * sc;

  const shL = {
    x: chestP.x - shHalf * (1.0 - turnX * 0.08) + shTwist,
    y: neckP.y + (0.42 - turnX * 0.04) * sc,
  };
  const shR = {
    x: chestP.x + shHalf * (1.0 + turnX * 0.08) - shTwist,
    y: neckP.y + (0.42 + turnX * 0.04) * sc,
  };
  const hipL = {
    x: waistP.x - hipHalf + turnX * 0.06 * sc,
    y: waistP.y + 0.45 * sc,
  };
  const hipR = {
    x: waistP.x + hipHalf + turnX * 0.06 * sc,
    y: waistP.y + 0.45 * sc,
  };

  // Rich Painterly Palette sampled from `06c3e32d.png`, `5f10f972.png`, `60dffec5.png`,
  // tinted by each person's hereditary hues so every child looks a little different.
  const litHue = app.robeHue ?? (isFemale ? 34 : 46);
  const shadeHue = app.innerHue ?? (isFemale ? 10 : 16);
  const sashHue = app.sashHue ?? 42;
  const coreGold = 'rgba(236, 202, 102, 0.80)';
  const softGold = 'rgba(226, 186, 82, 0.50)';
  const foldGold = 'rgba(214, 172, 68, 0.40)';
  const oliveGoldShade = `hsla(${litHue}, 50%, 34%, 0.88)`;      // Warm lit side of the tunic
  const russetCopperShade = `hsla(${shadeHue}, 62%, 29%, 0.88)`; // Reddish-russet shaded side
  const legRusset = 'rgba(124, 54, 26, 0.90)';                   // Skin / leggings tone
  const legRussetDeep = 'rgba(96, 42, 20, 0.90)';
  const deepUmberFill = 'rgba(30, 22, 12, 0.92)';                // Deep sumi-umber shadow tone
  const sashFill = `hsla(${sashHue}, 58%, 38%, 0.90)`;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // =========================================================================
  // 1. SIDE-BY-SIDE ARTICULATED LEGS (`5f10f972.png` & `60dffec5.png`)
  //    Each leg keeps its own lane (left hip / right hip). The foot plants, rolls
  //    backward while weight passes over it, then lifts and swings forward with a
  //    bent knee - a real two-beat human gait instead of point-to-point sliding.
  // =========================================================================
  // Screen-space "forward" for knee/elbow flexion: follows travel direction, but never
  // collapses to zero when walking straight up/down the screen.
  const fwdX = clamp(cosH + (1 - Math.abs(cosH)) * turnX * 0.55, -1, 1);
  const isToolWork = isChopping || isSawing;

  const computeLeg = (isRight) => {
    const sideSign = isRight ? 1 : -1;
    const hipP = isRight ? hipR : hipL;
    const phase = walkPhase + (isRight ? Math.PI : 0);
    const sSin = Math.sin(phase) * moveBlend;
    const sCos = Math.cos(phase) * moveBlend;

    // Swing phase = foot travelling forward (d/dphase sin = cos > 0): lift it off the ground.
    const lift = isToolWork ? 0 : Math.pow(Math.max(0, sCos), 1.3) * 0.52;
    const strideH = isToolWork ? sideSign * 0.16 + fwdX * (isRight === dirX >= 0 ? 0.32 : -0.10) : cosH * sSin * 0.62;
    const strideV = isToolWork ? 0 : sinH * sSin * 0.36;

    const ankleP = {
      x: hipP.x + strideH * sc + sideSign * 0.03 * sc,
      y: -(0.34 + lift * 0.55) * sc + strideV * sc,
    };

    // Knee: midpoint of hip->ankle pushed forward by flexion (more flex while swinging & crouching)
    const flex = 0.12 + lift * 0.9 + Math.max(0, sSin) * 0.06 + crouchDrop * 0.34;
    const kneeP = {
      x: lerp(hipP.x, ankleP.x, 0.5) + fwdX * flex * sc,
      y: lerp(hipP.y, ankleP.y, 0.52) - lift * 0.16 * sc,
    };

    // Heel-to-toe sandal: toe dips during the swing, foot lies flat when planted
    const heelP = {
      x: ankleP.x - fwdX * 0.30 * sc,
      y: ankleP.y + 0.14 * sc,
    };
    const toeP = {
      x: ankleP.x + (fwdX * 0.52 + sideSign * 0.05) * sc,
      y: ankleP.y + (0.18 + Math.max(0, sinH) * 0.16 + lift * 0.24) * sc,
    };

    return { hipP, kneeP, ankleP, heelP, toeP, lift, sSin };
  };

  const legL = computeLeg(false);
  const legR = computeLeg(true);

  const drawLeg = (leg, isShadedSide) => {
    if (isSitting) return;
    const { hipP, kneeP, ankleP, heelP, toeP } = leg;
    const legTone = isShadedSide ? legRussetDeep : legRusset;

    // Upper thigh (tucks under the hip-tunic / hakama skirt)
    drawTaperedAnatomicalSegment(ctx, hipP, kneeP, 0.40 * sc, 0.32 * sc, legTone, 1, sc, coreGold, 0.18);
    // Tapered calf with golden shin highlight (`5f10f972.png` & `60dffec5.png`)
    drawTaperedAnatomicalSegment(ctx, kneeP, ankleP, 0.33 * sc, 0.20 * sc, legTone, 2, sc, coreGold, 0.26);

    // Soft knee-cap crease
    ctx.strokeStyle = softGold;
    ctx.lineWidth = Math.max(0.55, 0.10 * sc);
    ctx.beginPath();
    ctx.moveTo(kneeP.x - 0.22 * sc, kneeP.y - 0.03 * sc);
    ctx.quadraticCurveTo(kneeP.x, kneeP.y + 0.09 * sc, kneeP.x + 0.22 * sc, kneeP.y - 0.03 * sc);
    ctx.stroke();

    drawWarajiSandal(ctx, ankleP, toeP, heelP, sc, coreGold);
  };

  // =========================================================================
  // 2. ARMS IN LOOSE KIMONO SLEEVES
  //    Relaxed counter-swing while walking, two-handed overhead axe swing when chopping,
  //    push-pull when sawing, reaching when working, gripping the tow rope when hauling.
  // =========================================================================
  const shMid = { x: (shL.x + shR.x) * 0.5, y: (shL.y + shR.y) * 0.5 };
  const isLeadArm = (isRight) => (dirX >= 0 ? isRight : !isRight);

  // Shared two-handed tool grip (chopping / sawing)
  let tool = null;
  if (isChopping) {
    const t = clamp((chopSwing + 1) / 2.12, 0, 1);
    const a = lerp(2.0, -0.7, t * t * (3 - 2 * t)); // raised overhead -> strike low in front
    const dx = dirX * Math.cos(a);
    const dy = -Math.sin(a);
    const R = 1.85 * sc;
    tool = {
      kind: 'axe',
      lead: { x: shMid.x + dx * R, y: shMid.y + 0.25 * sc + dy * R },
      rear: { x: shMid.x + dx * (R - 0.42 * sc), y: shMid.y + 0.25 * sc + dy * (R - 0.42 * sc) },
      dir: { x: dx, y: dy },
      strike: t > 0.86,
    };
  } else if (isSawing) {
    const push = sawSwing * 0.42;
    const gx = waistP.x + dirX * (1.05 + push) * sc;
    const gy = waistP.y - 0.35 * sc;
    tool = {
      kind: 'saw',
      lead: { x: gx, y: gy },
      rear: { x: gx - dirX * 0.34 * sc, y: gy - 0.06 * sc },
      dir: { x: dirX * 0.94, y: 0.34 },
      strike: Math.abs(sawSwing) > 0.7,
    };
  }

  const computeSideArm = (isRight) => {
    const sideSign = isRight ? 1 : -1;
    const shP = isRight ? shR : shL;
    const armPhase = walkPhase + (isRight ? 0 : Math.PI); // opposite to the same-side leg
    const swing = Math.sin(armPhase) * moveBlend;

    let handP;
    if (tool) {
      handP = isLeadArm(isRight) ? tool.lead : tool.rear;
    } else if (isHauling && c.hauling?.kind !== 'small_log_chunk') {
      // Both hands grip the tow rope at the hip, slightly behind
      handP = { x: waistP.x - fwdX * 0.42 * sc + sideSign * 0.18 * sc, y: waistP.y + 0.05 * sc };
    } else if (isHauling) {
      // Cradling a small billet against the chest
      handP = { x: chestP.x + fwdX * 0.55 * sc + sideSign * 0.32 * sc, y: chestP.y + 0.55 * sc };
    } else if (isSwimming) {
      const swimA = timeSec * 6.2 + (isRight ? Math.PI : 0);
      handP = { x: shP.x + sideSign * 0.5 * sc + Math.cos(swimA) * 1.1 * sc, y: shP.y + 0.4 * sc + Math.sin(swimA) * 0.35 * sc };
    } else if (isCrouching || isWorking) {
      const osc = Math.sin(timeSec * 5.6 + sideSign * 1.3) * 0.28;
      handP = { x: chestP.x + fwdX * (1.0 + osc) * sc + sideSign * 0.22 * sc, y: waistP.y + (0.2 + Math.abs(osc)) * sc };
    } else {
      // Relaxed, natural counter-swing (`06c3e32d.png`, `5f10f972.png`, `60dffec5.png`)
      const elb = {
        x: shP.x + (sideSign * 0.16 + fwdX * swing * 0.30) * sc,
        y: shP.y + (1.12 - Math.abs(swing) * 0.06) * sc + sinH * swing * 0.12 * sc,
      };
      handP = {
        x: elb.x + (fwdX * (0.10 + swing * 0.46) - sideSign * 0.04) * sc,
        y: elb.y + (1.0 - Math.abs(swing) * 0.12) * sc + sinH * swing * 0.18 * sc,
      };
      return { shP, elbP: elb, handP, sideSign, isRight };
    }

    // Two-bone elbow solve: upper arm 1.12, forearm 1.02 (in sc units); bend outward & down
    const L1 = 1.12 * sc;
    const L2 = 1.02 * sc;
    const dx = handP.x - shP.x;
    const dy = handP.y - shP.y;
    const d = clamp(Math.hypot(dx, dy), 0.05 * sc, (L1 + L2) * 0.999);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dx / d;
    const uy = dy / d;
    const bx = shP.x + ux * a;
    const by = shP.y + uy * a;
    // Choose the bend solution whose elbow sits lower / further out (natural elbow)
    const e1 = { x: bx - uy * h, y: by + ux * h };
    const e2 = { x: bx + uy * h, y: by - ux * h };
    const score = (e) => e.y + (e.x - shMid.x) * sideSign * 0.6;
    const elbP = score(e1) >= score(e2) ? e1 : e2;
    return { shP, elbP, handP, sideSign, isRight };
  };

  const armL = computeSideArm(false);
  const armR = computeSideArm(true);

  const drawSideArm = (arm, isShadedSide) => {
    const { shP, elbP, handP, sideSign } = arm;

    // Forearm & hand peeking out of the sleeve
    drawTaperedAnatomicalSegment(ctx, elbP, handP, 0.22 * sc, 0.16 * sc, isShadedSide ? legRussetDeep : legRusset, 1, sc, coreGold, 0.15);
    ctx.fillStyle = 'rgba(206, 160, 84, 0.90)';
    ctx.beginPath();
    ctx.ellipse(handP.x, handP.y, 0.19 * sc, 0.15 * sc, Math.atan2(handP.y - elbP.y, handP.x - elbP.x), 0, Math.PI * 2);
    ctx.fill();
    strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.24)', 0.66);

    // Loose kimono sleeve: shoulder -> past the elbow, with the soft `tamoto` pouch hanging under it
    const cuff = { x: lerp(elbP.x, handP.x, 0.40), y: lerp(elbP.y, handP.y, 0.40) };
    const fdx = handP.x - elbP.x;
    const fdy = handP.y - elbP.y;
    const fl = Math.hypot(fdx, fdy) || 1;
    const px = -fdy / fl;
    const py = fdx / fl;
    const cw = 0.30 * sc;
    let cuffA = { x: cuff.x + px * cw, y: cuff.y + py * cw };
    let cuffB = { x: cuff.x - px * cw, y: cuff.y - py * cw };
    const shOuter = { x: shP.x + sideSign * 0.22 * sc, y: shP.y + 0.04 * sc };
    if (Math.hypot(cuffB.x - shOuter.x, cuffB.y - shOuter.y) < Math.hypot(cuffA.x - shOuter.x, cuffA.y - shOuter.y)) {
      const tmp = cuffA;
      cuffA = cuffB;
      cuffB = tmp;
    }
    const pouchDrop = (garmentStyle === 'robed' ? 0.78 : 0.52) * sc;
    const pouch = {
      x: lerp(shP.x, elbP.x, 0.78) - fwdX * 0.10 * moveBlend * sc,
      y: Math.max(elbP.y, cuff.y) + pouchDrop,
    };
    const armpit = { x: shP.x - sideSign * 0.26 * sc, y: shP.y + 0.86 * sc };

    const slGrad = ctx.createLinearGradient(shP.x, shP.y - 0.2 * sc, pouch.x, pouch.y);
    slGrad.addColorStop(0, isShadedSide ? russetCopperShade : oliveGoldShade);
    slGrad.addColorStop(0.65, isShadedSide ? deepUmberFill : russetCopperShade);
    slGrad.addColorStop(1, deepUmberFill);

    ctx.fillStyle = slGrad;
    ctx.beginPath();
    ctx.moveTo(shP.x - sideSign * 0.30 * sc, shP.y - 0.14 * sc);
    ctx.quadraticCurveTo(shP.x + sideSign * 0.06 * sc, shP.y - 0.24 * sc, shOuter.x, shOuter.y);
    ctx.quadraticCurveTo(elbP.x + sideSign * 0.26 * sc, elbP.y - 0.04 * sc, cuffA.x, cuffA.y);
    ctx.quadraticCurveTo(cuff.x + (fdx / fl) * 0.10 * sc, cuff.y + (fdy / fl) * 0.10 * sc, cuffB.x, cuffB.y);
    ctx.bezierCurveTo(
      lerp(cuffB.x, pouch.x, 0.5),
      pouch.y + 0.06 * sc,
      pouch.x - sideSign * 0.10 * sc,
      pouch.y,
      armpit.x,
      armpit.y
    );
    ctx.closePath();
    ctx.fill();
    strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.26)', 0.84);

    // Single soft drape fold inside the sleeve
    ctx.strokeStyle = foldGold;
    ctx.lineWidth = Math.max(0.45, 0.08 * sc);
    ctx.beginPath();
    ctx.moveTo(shP.x, shP.y + 0.18 * sc);
    ctx.quadraticCurveTo(pouch.x, pouch.y - 0.28 * sc, lerp(cuffA.x, cuffB.x, 0.5), lerp(cuffA.y, cuffB.y, 0.5));
    ctx.stroke();

    if (isHauling && c.hauling?.kind === 'small_log_chunk' && sideSign === dirX) {
      drawTimberLogOrBundle(ctx, chestP.x + fwdX * 0.55 * sc, chestP.y + 0.45 * sc, zoom, 'small_log_chunk', heading + 0.5, 1.0, false);
    }
  };

  // Hand tools: a hafted stone/iron axe or a toothed saw, held two-handed
  const drawTool = () => {
    if (!tool && !isWorking) return;
    if (!tool) {
      // Small hand tool (digging stick / adze) in the lead hand while working
      const hand = isLeadArm(true) ? armR.handP : armL.handP;
      ctx.strokeStyle = 'rgba(176, 128, 60, 0.95)';
      ctx.lineWidth = Math.max(0.9, 0.16 * sc);
      ctx.beginPath();
      ctx.moveTo(hand.x - fwdX * 0.2 * sc, hand.y - 0.2 * sc);
      ctx.lineTo(hand.x + fwdX * 0.8 * sc, hand.y + 0.5 * sc);
      ctx.stroke();
      return;
    }
    const { lead, rear, dir } = tool;
    const len = tool.kind === 'axe' ? 1.75 * sc : 1.9 * sc;
    const butt = { x: rear.x - dir.x * 0.22 * sc, y: rear.y - dir.y * 0.22 * sc };
    const tip = { x: lead.x + dir.x * len, y: lead.y + dir.y * len };

    // Wooden haft
    ctx.strokeStyle = 'rgba(150, 104, 48, 0.96)';
    ctx.lineWidth = Math.max(1.0, 0.17 * sc);
    ctx.beginPath();
    ctx.moveTo(butt.x, butt.y);
    ctx.lineTo(tool.kind === 'axe' ? tip.x : lead.x, tool.kind === 'axe' ? tip.y : lead.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240, 206, 112, 0.55)';
    ctx.lineWidth = Math.max(0.4, 0.05 * sc);
    ctx.stroke();

    if (tool.kind === 'axe') {
      // Wedge-shaped axe head lashed at the tip, blade facing the swing
      const nx = -dir.y * dirX;
      const ny = dir.x * dirX;
      const bw = 0.42 * sc;
      ctx.fillStyle = 'rgba(150, 168, 178, 0.92)';
      ctx.beginPath();
      ctx.moveTo(tip.x - dir.x * 0.12 * sc - nx * 0.10 * sc, tip.y - dir.y * 0.12 * sc - ny * 0.10 * sc);
      ctx.lineTo(tip.x + nx * bw - dir.x * 0.28 * sc, tip.y + ny * bw - dir.y * 0.28 * sc);
      ctx.quadraticCurveTo(tip.x + nx * (bw + 0.12 * sc), tip.y + ny * (bw + 0.12 * sc), tip.x + nx * bw + dir.x * 0.22 * sc, tip.y + ny * bw + dir.y * 0.22 * sc);
      ctx.lineTo(tip.x + dir.x * 0.12 * sc - nx * 0.10 * sc, tip.y + dir.y * 0.12 * sc - ny * 0.10 * sc);
      ctx.closePath();
      ctx.fill();
      strokeGoldenCalligraphy(ctx, sc, 'rgba(236, 222, 170, 0.85)', 'rgba(170, 160, 120, 0.25)', 0.7);
      // Rawhide lashing
      ctx.strokeStyle = 'rgba(214, 170, 92, 0.85)';
      ctx.lineWidth = Math.max(0.5, 0.07 * sc);
      ctx.beginPath();
      ctx.moveTo(tip.x - nx * 0.14 * sc - dir.x * 0.05 * sc, tip.y - ny * 0.14 * sc - dir.y * 0.05 * sc);
      ctx.lineTo(tip.x + nx * 0.06 * sc + dir.x * 0.05 * sc, tip.y + ny * 0.06 * sc + dir.y * 0.05 * sc);
      ctx.stroke();
    } else {
      // Saw blade with small teeth along the lower edge
      const bladeEnd = { x: lead.x + dir.x * len, y: lead.y + dir.y * len };
      const nx = -dir.y;
      const ny = dir.x;
      const bh = 0.24 * sc;
      ctx.fillStyle = 'rgba(160, 176, 184, 0.88)';
      ctx.beginPath();
      ctx.moveTo(lead.x, lead.y);
      ctx.lineTo(bladeEnd.x, bladeEnd.y);
      ctx.lineTo(bladeEnd.x + nx * bh * 0.6, bladeEnd.y + ny * bh * 0.6);
      ctx.lineTo(lead.x + nx * bh, lead.y + ny * bh);
      ctx.closePath();
      ctx.fill();
      strokeGoldenCalligraphy(ctx, sc, 'rgba(236, 222, 170, 0.80)', 'rgba(170, 160, 120, 0.22)', 0.6);
      ctx.strokeStyle = 'rgba(230, 230, 220, 0.75)';
      ctx.lineWidth = Math.max(0.4, 0.05 * sc);
      ctx.beginPath();
      for (let k = 1; k < 8; k++) {
        const u = k / 8;
        const ex = lerp(lead.x + nx * bh, bladeEnd.x + nx * bh * 0.6, u);
        const ey = lerp(lead.y + ny * bh, bladeEnd.y + ny * bh * 0.6, u);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + nx * 0.08 * sc + dir.x * 0.05 * sc, ey + ny * 0.08 * sc + dir.y * 0.05 * sc);
      }
      ctx.stroke();
    }

    // Golden wood chips / sawdust at the moment of impact
    if (tool.strike) {
      const ix = tool.kind === 'axe' ? tip.x : lead.x + dir.x * len * 0.5;
      const iy = tool.kind === 'axe' ? tip.y : lead.y + dir.y * len * 0.5 + 0.2 * sc;
      const burst = (timeSec * 6.5) % 1;
      ctx.fillStyle = `rgba(255, 224, 120, ${0.85 * (1 - burst)})`;
      for (let k = 0; k < 5; k++) {
        const ang = -Math.PI * 0.5 + (k - 2) * 0.55 + (dirX < 0 ? Math.PI : 0) * 0;
        const dd = (0.25 + burst * 1.4) * sc;
        ctx.beginPath();
        ctx.ellipse(ix + Math.cos(ang) * dd * dirX, iy + Math.sin(ang) * dd, 0.12 * sc, 0.06 * sc, ang, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // Painter's order (fixed, so nothing ever pops): far arm -> far leg -> near leg
  const farArm = turnX >= 0 ? armR : armL;
  const nearArm = turnX >= 0 ? armL : armR;
  if (!tool) drawSideArm(farArm, true);
  if (turnX >= 0) {
    drawLeg(legR, true);
    drawLeg(legL, false);
  } else {
    drawLeg(legL, true);
    drawLeg(legR, false);
  }

  // =========================================================================
  // 3. LOWER GARMENT:
  //    - `'tunic'` / `'artisan'` (`5f10f972.png` & `60dffec5.png`): Short hip-kilt (`u = 4.85` down to `u = 3.25`)
  //      with a bold vertical golden center tie/seam, leaving both sculpted legs & knees clearly visible!
  //    - `'robed'` (`06c3e32d.png`): Long vertical-pleated skirt (`hakama`) sweeping down to the ankles (`u = 1.05`)!
  // =========================================================================
  const wL = { x: waistP.x - waistHalf, y: waistP.y + 0.08 * sc };
  const wR = { x: waistP.x + waistHalf, y: waistP.y + 0.08 * sc };

  const isLongRobed = garmentStyle === 'robed';
  const hemUp = isSitting ? 0.35 : isLongRobed ? 1.02 + zOff * 0.25 : 3.22 + zOff * 0.55;
  const hemY = -hemUp * sc;
  const hemHalf = (isSitting ? 1.65 : isLongRobed ? 1.24 : 1.12) * buildTrait * sc;
  const hemShiftX = turnX * 0.12 * sc;

  const hL = { x: waistP.x - hemHalf + hemShiftX, y: hemY };
  const hR = { x: waistP.x + hemHalf + hemShiftX, y: hemY };
  const hemMidX = (hL.x + hR.x) * 0.5;
  const hemDip = (isLongRobed ? 0.22 : 0.18) * sc;

  // Painterly olive-ochre & deep russet-umber gradient across the skirt
  const skGrad = ctx.createLinearGradient(wL.x, wL.y, hR.x, hR.y);
  skGrad.addColorStop(0, deepUmberFill);
  skGrad.addColorStop(0.38, oliveGoldShade);
  skGrad.addColorStop(0.72, russetCopperShade);
  skGrad.addColorStop(1, deepUmberFill);

  ctx.fillStyle = skGrad;
  ctx.beginPath();
  ctx.moveTo(wL.x, wL.y);
  ctx.quadraticCurveTo(wL.x - 0.14 * sc, lerp(wL.y, hL.y, 0.5), hL.x, hL.y);
  ctx.quadraticCurveTo(hemMidX, hemY + hemDip, hR.x, hR.y);
  ctx.quadraticCurveTo(wR.x + 0.14 * sc, lerp(wR.y, hR.y, 0.5), wR.x, wR.y);
  ctx.closePath();
  ctx.fill();
  strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.34)', 0.96);

  if (isLongRobed) {
    // Bold vertical golden-ochre pleat ridges & dark umber troughs (exact match to `06c3e32d.png`!)
    const pleats = 5;
    for (let p = 1; p < pleats; p++) {
      const u = p / pleats;
      const topX = lerp(wL.x, wR.x, u);
      const botX = lerp(hL.x, hR.x, u) + Math.sin(walkPhase + p) * 0.05 * moveBlend * sc;
      const botY = hemY + Math.sin(u * Math.PI) * hemDip * 0.9;
      ctx.strokeStyle = p % 2 === 0 ? coreGold : foldGold;
      ctx.lineWidth = Math.max(0.65, (p % 2 === 0 ? 0.15 : 0.10) * sc);
      ctx.beginPath();
      ctx.moveTo(topX, wL.y + 0.12 * sc);
      ctx.quadraticCurveTo(lerp(topX, botX, 0.5), lerp(wL.y, botY, 0.55), botX, botY);
      ctx.stroke();
    }
  } else {
    // Short hip-tunic (`5f10f972.png` & `60dffec5.png`):
    //   1. Bold golden vertical center seam / sash tie dividing the front of the hip-kilt!
    const centerTopX = waistP.x + turnX * 0.08 * sc;
    const centerBotX = hemMidX + turnX * 0.10 * sc;
    strokeGoldenCalligraphy(ctx, sc, 'rgba(248, 218, 122, 0.88)', 'rgba(198, 148, 48, 0.38)', 1.05);
    ctx.beginPath();
    ctx.moveTo(centerTopX, wL.y + 0.05 * sc);
    ctx.lineTo(centerBotX, hemY + hemDip);
    strokeGoldenCalligraphy(ctx, sc, 'rgba(248, 218, 122, 0.90)', 'rgba(198, 148, 48, 0.40)', 1.1);

    //   2. Subtle horizontal woven cloth texture lines across the left and right panels of the hip-tunic
    ctx.strokeStyle = foldGold;
    ctx.lineWidth = Math.max(0.5, 0.09 * sc);
    ctx.beginPath();
    for (const u of [0.35, 0.68]) {
      const ly = lerp(wL.y, hL.y, u);
      ctx.moveTo(lerp(wL.x, hL.x, u) + 0.12 * sc, ly);
      ctx.quadraticCurveTo(hemMidX, ly + 0.12 * sc, lerp(wR.x, hR.x, u) - 0.12 * sc, ly);
    }
    ctx.stroke();
  }

  // =========================================================================
  // 4. UPPER TORSO (`Kosode` / `Hanten`) WITH TWO-TONE OLIVE-GOLD & RUSSET-MAHOGANY SHADING
  //    AND GLOWING V-NECK OVERLAPPING KIMONO COLLAR (`Eri`) (`06c3e32d.png`, `5f10f972.png`, `60dffec5.png`)
  // =========================================================================
  const neckW = 0.42 * sc;
  const neckL = { x: neckP.x - neckW, y: neckP.y + 0.06 * sc };
  const neckR = { x: neckP.x + neckW, y: neckP.y + 0.06 * sc };

  // Two-tone horizontal chest gradient: warm olive-ochre on the left/lit side, rich reddish-russet mahogany on the right/shaded side
  // (Look at `06c3e32d.png` — that exact olive-left / russet-right chest shading is unmistakable!)
  const torsoGrad = ctx.createLinearGradient(shL.x, chestP.y, shR.x, chestP.y);
  torsoGrad.addColorStop(0, deepUmberFill);
  torsoGrad.addColorStop(0.28, oliveGoldShade);
  torsoGrad.addColorStop(0.55, 'rgba(156, 122, 46, 0.86)');
  torsoGrad.addColorStop(0.78, russetCopperShade);
  torsoGrad.addColorStop(1, deepUmberFill);

  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(neckL.x, neckL.y);
  // Sloping shoulder contour to `shL`
  ctx.quadraticCurveTo(lerp(neckL.x, shL.x, 0.55), neckL.y + 0.04 * sc, shL.x, shL.y);
  // Outer ribcage contour tapering into `wL`
  ctx.quadraticCurveTo(shL.x - 0.08 * sc, lerp(shL.y, wL.y, 0.5), wL.x, wL.y);
  ctx.quadraticCurveTo(waistP.x, waistP.y + 0.22 * sc, wR.x, wR.y);
  ctx.quadraticCurveTo(shR.x + 0.08 * sc, lerp(shR.y, wR.y, 0.5), shR.x, shR.y);
  ctx.quadraticCurveTo(lerp(neckR.x, shR.x, 0.55), neckR.y + 0.04 * sc, neckR.x, neckR.y);
  ctx.closePath();
  ctx.fill();
  strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.32)', 0.92);

  // Warm bare throat / upper-chest V-triangle inside the open kimono collar (`5f10f972.png` & `60dffec5.png`)
  const sternumV = {
    x: chestP.x + turnX * 0.14 * sc,
    y: lerp(neckP.y, waistP.y, 0.46),
  };
  ctx.fillStyle = 'rgba(154, 118, 46, 0.88)';
  ctx.beginPath();
  ctx.moveTo(neckL.x, neckL.y);
  ctx.lineTo(sternumV.x, sternumV.y);
  ctx.lineTo(neckR.x, neckR.y);
  ctx.closePath();
  ctx.fill();

  // Signature Glowing Golden V-Neck & Diagonal Overlapping Collar (`Eri` — exact match to `5f10f972.png` & `60dffec5.png`!)
  ctx.beginPath();
  // Left collar lapel down to sternum V
  ctx.moveTo(neckL.x, neckL.y);
  ctx.lineTo(sternumV.x, sternumV.y);
  // Right collar lapel sweeping all the way from `neckR` through `sternumV` diagonally down to the left waist (`wL`)!
  ctx.moveTo(neckR.x, neckR.y);
  ctx.quadraticCurveTo(
    sternumV.x + 0.06 * sc,
    sternumV.y + 0.08 * sc,
    wL.x + 0.34 * sc,
    waistP.y - 0.06 * sc
  );
  strokeGoldenCalligraphy(ctx, sc, 'rgba(248, 218, 122, 0.88)', 'rgba(198, 148, 48, 0.38)', 1.08);

  // =========================================================================
  // 5. CURVED DOUBLE-WRAPPED WAIST SASH (`OBI`) & SIGNATURE CURVED HIP SASH LOOP
  //    (Look at the right hip of `06c3e32d.png`, `5f10f972.png`, and `60dffec5.png` — all 3 have that
  //     exact golden curved loop hanging beside the right hip!)
  // =========================================================================
  const obiHalfW = waistHalf * 1.05;
  const obiThick = 0.48 * sc;
  const obiDip = 0.18 * sc;
  const obiTopY = waistP.y - obiThick * 0.45;
  const obiBotY = waistP.y + obiThick * 0.55;

  ctx.fillStyle = sashFill;
  ctx.beginPath();
  ctx.moveTo(waistP.x - obiHalfW, obiTopY);
  ctx.quadraticCurveTo(waistP.x, obiTopY + obiDip, waistP.x + obiHalfW, obiTopY);
  ctx.lineTo(waistP.x + obiHalfW, obiBotY);
  ctx.quadraticCurveTo(waistP.x, obiBotY + obiDip, waistP.x - obiHalfW, obiBotY);
  ctx.closePath();
  ctx.fill();
  strokeGoldenCalligraphy(ctx, sc, 'rgba(246, 214, 118, 0.86)', 'rgba(196, 144, 44, 0.36)', 0.95);

  // Hereditary hip accessory hanging at the right hip (the curved golden loop in all 3 close-ups)
  const loopBaseX = waistP.x + obiHalfW * 0.92;
  const loopBaseY = waistP.y + 0.12 * sc;
  if (accessory === 'gourd') {
    ctx.fillStyle = 'rgba(168, 114, 38, 0.90)';
    ctx.beginPath();
    ctx.arc(loopBaseX + 0.12 * sc, loopBaseY + 0.22 * sc, 0.17 * sc, 0, Math.PI * 2);
    ctx.arc(loopBaseX + 0.12 * sc, loopBaseY + 0.52 * sc, 0.25 * sc, 0, Math.PI * 2);
    ctx.fill();
    strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.24)', 0.7);
  } else if (accessory === 'satchel') {
    ctx.fillStyle = 'rgba(112, 80, 34, 0.90)';
    ctx.beginPath();
    ctx.ellipse(loopBaseX + 0.10 * sc, loopBaseY + 0.38 * sc, 0.28 * sc, 0.24 * sc, 0.15, 0, Math.PI * 2);
    ctx.fill();
    strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.24)', 0.7);
  } else {
    ctx.beginPath();
    ctx.moveTo(loopBaseX, loopBaseY);
    ctx.bezierCurveTo(
      loopBaseX + 0.58 * sc,
      loopBaseY + 0.12 * sc,
      loopBaseX + 0.54 * sc,
      loopBaseY + 0.98 * sc,
      loopBaseX - 0.04 * sc,
      loopBaseY + 0.86 * sc
    );
    strokeGoldenCalligraphy(ctx, sc, 'rgba(240, 206, 108, 0.80)', 'rgba(192, 140, 42, 0.30)', 0.9);
  }

  // Near arm frames the torso; with a two-handed tool both arms come forward over the body
  if (tool) drawSideArm(farArm, true);
  drawSideArm(nearArm, false);
  drawTool();

  // =========================================================================
  // 6. SCULPTED PAINTERLY HEAD, OLIVE-GOLD & BRONZE SHADING, RIM-LIT CHEEK/NOSE & TOPKNOT
  //    Modeled directly on the heads in `06c3e32d.png`, `5f10f972.png`, and `60dffec5.png`!
  // =========================================================================
  drawTaperedAnatomicalSegment(ctx, neckP, headP, 0.28 * sc, 0.24 * sc, oliveGoldShade, 0, sc, coreGold, 0.1);

  const hw = 0.72 * headScale * sc;
  const hh = 0.94 * headScale * sc;
  const faceSign = turnX >= -0.15 ? 1 : -1;

  // Warm olive-ochre & deep sumi-umber shaded head oval (matching the mossy-olive/bronze heads in `5f10f972.png` & `60dffec5.png`)
  const headGrad = ctx.createRadialGradient(
    headP.x + faceSign * 0.22 * hw,
    headP.y + 0.08 * hh,
    0.08 * sc,
    headP.x,
    headP.y,
    hh * 1.15
  );
  headGrad.addColorStop(0, 'rgba(158, 132, 52, 0.92)');
  headGrad.addColorStop(0.55, 'rgba(86, 72, 26, 0.92)');
  headGrad.addColorStop(1, 'rgba(28, 22, 12, 0.95)');

  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(headP.x, headP.y, hw, hh, faceSign * 0.08, 0, Math.PI * 2);
  ctx.fill();
  strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.32)', 0.85);

  // Dark sumi-ink hair mass: hairline sweeps back from the forehead, sidelock (`bin`) over the far ear
  ctx.fillStyle = 'rgba(24, 20, 11, 0.94)';
  ctx.beginPath();
  ctx.moveTo(headP.x + faceSign * hw * 0.70, headP.y - hh * 0.48);
  ctx.quadraticCurveTo(headP.x + faceSign * hw * 0.10, headP.y - hh * 1.18, headP.x - faceSign * hw * 0.86, headP.y - hh * 0.46);
  ctx.quadraticCurveTo(headP.x - faceSign * hw * 1.02, headP.y + hh * 0.10, headP.x - faceSign * hw * 0.62, headP.y + hh * 0.42);
  ctx.quadraticCurveTo(headP.x - faceSign * hw * 0.40, headP.y - hh * 0.10, headP.x + faceSign * hw * 0.04, headP.y - hh * 0.40);
  ctx.quadraticCurveTo(headP.x + faceSign * hw * 0.40, headP.y - hh * 0.56, headP.x + faceSign * hw * 0.70, headP.y - hh * 0.48);
  ctx.closePath();
  ctx.fill();

  // Combed hair strands & a soft rim-lit nose/cheek line (no hard horizontal "visor" strokes)
  ctx.strokeStyle = softGold;
  ctx.lineWidth = Math.max(0.45, 0.07 * sc);
  ctx.beginPath();
  for (const k of [0.25, 0.55]) {
    ctx.moveTo(lerp(headP.x + faceSign * hw * 0.55, headP.x - faceSign * hw * 0.80, k), lerp(headP.y - hh * 0.62, headP.y - hh * 0.40, k) - 0.10 * sc);
    ctx.quadraticCurveTo(headP.x - faceSign * hw * 0.10, headP.y - hh * (0.95 - k * 0.3), headP.x - faceSign * hw * 0.55, headP.y - hh * 0.30);
  }
  ctx.moveTo(headP.x + faceSign * hw * 0.48, headP.y - hh * 0.18);
  ctx.quadraticCurveTo(headP.x + faceSign * hw * 0.78, headP.y + hh * 0.10, headP.x + faceSign * hw * 0.52, headP.y + hh * 0.30);
  ctx.stroke();

  // Downcast eye: a single tiny brush flick
  ctx.strokeStyle = 'rgba(232, 196, 104, 0.55)';
  ctx.lineWidth = Math.max(0.4, 0.06 * sc);
  ctx.beginPath();
  ctx.moveTo(headP.x + faceSign * hw * 0.18, headP.y - hh * 0.10);
  ctx.quadraticCurveTo(headP.x + faceSign * hw * 0.32, headP.y - hh * 0.04, headP.x + faceSign * hw * 0.44, headP.y - hh * 0.11);
  ctx.stroke();

  // Hereditary hairstyle at the crown (`06c3e32d.png`, `5f10f972.png`, `60dffec5.png`)
  const crownX = headP.x - faceSign * 0.14 * sc;
  const crownY = headP.y - hh * 0.96;
  ctx.fillStyle = 'rgba(30, 23, 12, 0.95)';
  if (hairStyle === 'twin_buns') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(headP.x + s * 0.50 * headScale * sc, headP.y - hh * 0.80, 0.26 * headScale * sc, 0, Math.PI * 2);
      ctx.fill();
      strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.24)', 0.66);
    }
  } else if (hairStyle === 'ponytail' || hairStyle === 'braid') {
    const sway = Math.sin(walkPhase * 2) * 0.08 * moveBlend * sc;
    const tipX = headP.x - faceSign * (hw + 0.30 * sc) + sway;
    const tipY = headP.y + hh * 0.75;
    ctx.beginPath();
    ctx.moveTo(crownX, crownY + 0.05 * sc);
    ctx.quadraticCurveTo(headP.x - faceSign * (hw + 0.35 * sc), headP.y - hh * 0.5, tipX, tipY);
    ctx.quadraticCurveTo(headP.x - faceSign * (hw + 0.05 * sc), headP.y - hh * 0.2, crownX - faceSign * 0.1 * sc, crownY + 0.28 * sc);
    ctx.closePath();
    ctx.fill();
    strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.24)', 0.66);
  } else {
    // Topknot (`chonmage`) or upswept chignon (`shimada`)
    const isShimada = hairStyle === 'shimada';
    ctx.beginPath();
    ctx.ellipse(
      crownX,
      crownY - 0.08 * headScale * sc,
      (isShimada ? 0.46 : 0.30) * headScale * sc,
      (isShimada ? 0.26 : 0.20) * headScale * sc,
      -faceSign * 0.18,
      0,
      Math.PI * 2
    );
    ctx.fill();
    strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(186, 138, 44, 0.26)', 0.74);
    // Golden cord binding at the base
    ctx.strokeStyle = 'rgba(240, 206, 112, 0.70)';
    ctx.lineWidth = Math.max(0.45, 0.07 * sc);
    ctx.beginPath();
    ctx.moveTo(crownX - 0.14 * sc, crownY + 0.07 * sc);
    ctx.lineTo(crownX + 0.14 * sc, crownY + 0.05 * sc);
    ctx.stroke();
  }

  // Optional hereditary headgear
  if (headgear === 'sugegasa') {
    ctx.fillStyle = 'rgba(78, 62, 24, 0.90)';
    ctx.beginPath();
    ctx.moveTo(headP.x - 1.45 * headScale * sc, crownY + 0.30 * sc);
    ctx.quadraticCurveTo(headP.x, crownY - 0.75 * headScale * sc, headP.x + 1.45 * headScale * sc, crownY + 0.30 * sc);
    ctx.quadraticCurveTo(headP.x, crownY + 0.52 * sc, headP.x - 1.45 * headScale * sc, crownY + 0.30 * sc);
    ctx.closePath();
    ctx.fill();
    strokeGoldenCalligraphy(ctx, sc, coreGold, 'rgba(196, 140, 42, 0.26)', 0.82);
  } else if (headgear === 'kanzashi') {
    ctx.strokeStyle = 'rgba(244, 214, 128, 0.82)';
    ctx.lineWidth = Math.max(0.5, 0.08 * sc);
    ctx.beginPath();
    ctx.moveTo(crownX - 0.46 * sc, crownY + 0.02 * sc);
    ctx.lineTo(crownX + 0.46 * sc, crownY - 0.14 * sc);
    ctx.stroke();
    ctx.fillStyle = 'rgba(236, 160, 176, 0.85)';
    ctx.beginPath();
    ctx.arc(crownX + 0.46 * sc, crownY - 0.14 * sc, 0.11 * sc, 0, Math.PI * 2);
    ctx.fill();
  } else if (headgear === 'hachimaki' || headgear === 'ribbon') {
    ctx.strokeStyle = headgear === 'ribbon' ? 'rgba(236, 150, 170, 0.82)' : 'rgba(240, 226, 176, 0.82)';
    ctx.lineWidth = Math.max(0.6, 0.12 * sc);
    ctx.beginPath();
    ctx.moveTo(headP.x - hw * 0.94, headP.y - hh * 0.40);
    ctx.quadraticCurveTo(headP.x, headP.y - hh * 0.28, headP.x + hw * 0.94, headP.y - hh * 0.40);
    // Trailing tie ends
    ctx.moveTo(headP.x - faceSign * hw * 0.94, headP.y - hh * 0.40);
    ctx.quadraticCurveTo(headP.x - faceSign * (hw + 0.3 * sc), headP.y - hh * 0.2, headP.x - faceSign * (hw + 0.45 * sc), headP.y + Math.sin(timeSec * 3) * 0.08 * sc);
    ctx.stroke();
  }

  ctx.restore();

  // Concentric turquoise & gold water ripples when wading, sinking, swimming, or floating in water (`submerge > 0.05`)
  if (submerge > 0.05) {
    ctx.save();
    const ripplePhase = (timeSec * (isSwimming ? 2.4 : 1.1)) % 1;
    for (let r = 0; r < 2; r++) {
      const u = (ripplePhase + r * 0.5) % 1;
      const rx = (1.6 + u * 2.8) * sc;
      const ry = rx * 0.38;
      ctx.strokeStyle = r === 0
        ? `rgba(145, 236, 255, ${(1 - u) * 0.65})`
        : `rgba(255, 232, 138, ${(1 - u) * 0.52})`;
      ctx.lineWidth = Math.max(0.8, 0.14 * sc);
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + 0.15 * sc, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
