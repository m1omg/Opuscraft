import type { IconSpec } from '../data/types';

type Draw = (c: CanvasRenderingContext2D, fg: string) => void;

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function shadeHex(n: number, f: number): string {
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// helpers -------------------------------------------------------------------
function poly(c: CanvasRenderingContext2D, pts: number[], fill = true): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) c.fill();
  else c.stroke();
}
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill = true): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) c.fill();
  else c.stroke();
}
function line(c: CanvasRenderingContext2D, ...pts: number[]): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.stroke();
}

const G: Record<string, Draw> = {
  sword(c) {
    c.save();
    c.translate(32, 32);
    c.rotate(-Math.PI / 4);
    poly(c, [-3, -24, 3, -24, 3, 10, -3, 10]);
    poly(c, [-3, -24, 0, -29, 3, -24]);
    c.fillRect(-11, 10, 22, 4);
    c.fillRect(-2.5, 14, 5, 10);
    circle(c, 0, 26, 3);
    c.restore();
  },
  axe(c) {
    c.save();
    c.translate(32, 32);
    c.rotate(-0.6);
    c.fillRect(-2, -24, 4, 50);
    c.beginPath();
    c.moveTo(2, -20);
    c.quadraticCurveTo(22, -16, 18, 2);
    c.quadraticCurveTo(10, -6, 2, -4);
    c.fill();
    c.restore();
  },
  spear(c) {
    c.save();
    c.translate(32, 32);
    c.rotate(-Math.PI / 4);
    c.fillRect(-2, -14, 4, 40);
    poly(c, [-6, -14, 0, -28, 6, -14]);
    c.restore();
  },
  bow(c) {
    c.lineWidth = 4;
    c.beginPath();
    c.arc(18, 32, 22, -1.2, 1.2);
    c.stroke();
    c.lineWidth = 1.5;
    line(c, 25.5, 11, 25.5, 53);
    c.lineWidth = 2.5;
    line(c, 10, 32, 54, 32);
    poly(c, [54, 32, 46, 27, 46, 37]);
  },
  rifle(c) {
    c.save();
    c.translate(32, 32);
    c.rotate(-0.5);
    c.fillRect(-26, -3, 40, 5);
    c.fillRect(-6, -1, 30, 9);
    c.fillRect(-14, 2, 4, 7);
    c.restore();
  },
  staff(c) {
    c.fillRect(30, 16, 4, 42);
    circle(c, 32, 13, 8);
  },
  shield(c) {
    c.beginPath();
    c.moveTo(32, 8);
    c.lineTo(52, 15);
    c.quadraticCurveTo(52, 44, 32, 57);
    c.quadraticCurveTo(12, 44, 12, 15);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(30, 12, 4, 40);
  },
  helm(c) {
    c.beginPath();
    c.arc(32, 34, 20, Math.PI, 0);
    c.lineTo(52, 50);
    c.lineTo(40, 50);
    c.lineTo(40, 38);
    c.lineTo(24, 38);
    c.lineTo(24, 50);
    c.lineTo(12, 50);
    c.closePath();
    c.fill();
  },
  skull(c) {
    circle(c, 32, 28, 17);
    c.fillRect(22, 38, 20, 12);
    c.fillStyle = 'rgba(0,0,0,0.7)';
    circle(c, 25, 29, 5);
    circle(c, 39, 29, 5);
    poly(c, [32, 34, 29, 40, 35, 40]);
  },
  bone(c) {
    c.save();
    c.translate(32, 32);
    c.rotate(-0.7);
    c.fillRect(-18, -4, 36, 8);
    for (const s of [-1, 1]) {
      circle(c, s * 19, -5, 6);
      circle(c, s * 19, 5, 6);
    }
    c.restore();
  },
  tree(c) {
    c.fillRect(29, 40, 6, 16);
    poly(c, [32, 6, 50, 32, 14, 32]);
    poly(c, [32, 18, 54, 44, 10, 44]);
  },
  sapling(c) {
    c.fillRect(30, 30, 4, 26);
    c.beginPath();
    c.ellipse(22, 26, 10, 6, -0.6, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(42, 22, 10, 6, 0.6, 0, Math.PI * 2);
    c.fill();
  },
  leaf(c) {
    c.beginPath();
    c.moveTo(12, 52);
    c.quadraticCurveTo(10, 12, 52, 10);
    c.quadraticCurveTo(54, 50, 12, 52);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 2;
    line(c, 14, 50, 48, 14);
  },
  moon(c) {
    c.beginPath();
    c.arc(32, 32, 20, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    circle(c, 42, 26, 18);
    c.globalCompositeOperation = 'source-over';
  },
  sun(c) {
    circle(c, 32, 32, 12);
    c.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(c, 32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17, 32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26);
    }
  },
  star(c) {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 9 : 23;
      pts.push(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
    }
    poly(c, pts);
  },
  flame(c) {
    c.beginPath();
    c.moveTo(32, 6);
    c.quadraticCurveTo(52, 30, 46, 46);
    c.quadraticCurveTo(40, 58, 32, 58);
    c.quadraticCurveTo(20, 58, 18, 44);
    c.quadraticCurveTo(16, 30, 26, 22);
    c.quadraticCurveTo(26, 34, 32, 36);
    c.quadraticCurveTo(28, 20, 32, 6);
    c.fill();
  },
  frost(c) {
    c.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      const dx = Math.cos(a) * 24;
      const dy = Math.sin(a) * 24;
      line(c, 32 - dx, 32 - dy, 32 + dx, 32 + dy);
    }
    c.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = 32 + Math.cos(a) * 15;
      const y = 32 + Math.sin(a) * 15;
      line(c, x, y, x + Math.cos(a + 0.8) * 6, y + Math.sin(a + 0.8) * 6);
      line(c, x, y, x + Math.cos(a - 0.8) * 6, y + Math.sin(a - 0.8) * 6);
    }
  },
  bolt(c) {
    poly(c, [36, 6, 16, 36, 30, 36, 24, 58, 48, 26, 34, 26, 42, 6]);
  },
  drop(c) {
    c.beginPath();
    c.moveTo(32, 8);
    c.quadraticCurveTo(50, 32, 48, 42);
    c.arc(32, 42, 16, 0, Math.PI);
    c.quadraticCurveTo(14, 32, 32, 8);
    c.fill();
  },
  cross(c) {
    c.fillRect(26, 10, 12, 44);
    c.fillRect(10, 26, 44, 12);
  },
  heart(c) {
    c.beginPath();
    c.moveTo(32, 54);
    c.bezierCurveTo(6, 36, 10, 10, 32, 22);
    c.bezierCurveTo(54, 10, 58, 36, 32, 54);
    c.fill();
  },
  eye(c) {
    c.beginPath();
    c.moveTo(6, 32);
    c.quadraticCurveTo(32, 8, 58, 32);
    c.quadraticCurveTo(32, 56, 6, 32);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.75)';
    circle(c, 32, 32, 9);
  },
  eye2(c) {
    G.eye(c, '');
    c.fillStyle = 'rgba(255,240,180,0.9)';
    for (let i = 0; i < 6; i++) circle(c, 10 + i * 9, 12 + (i % 2) * 4, 2);
  },
  boot(c) {
    poly(c, [20, 8, 36, 8, 36, 38, 54, 44, 54, 54, 16, 54, 20, 38]);
  },
  hammer(c) {
    c.save();
    c.translate(32, 32);
    c.rotate(-0.7);
    c.fillRect(-2, -10, 5, 36);
    c.fillRect(-14, -22, 30, 14);
    c.restore();
  },
  pick(c) {
    c.save();
    c.translate(32, 32);
    c.rotate(-0.7);
    c.fillRect(-2, -16, 5, 42);
    c.beginPath();
    c.moveTo(-24, -10);
    c.quadraticCurveTo(0, -26, 24, -10);
    c.quadraticCurveTo(0, -18, -24, -10);
    c.fill();
    c.restore();
  },
  coin(c) {
    circle(c, 32, 32, 20);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    circle(c, 32, 32, 14);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = 'bold 20px serif';
    c.textAlign = 'center';
    c.fillText('G', 32, 39);
  },
  log(c) {
    c.fillRect(8, 22, 48, 18);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(10, 31, 5, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(14, 28, 30, 2);
  },
  house(c) {
    poly(c, [32, 8, 56, 30, 8, 30]);
    c.fillRect(14, 30, 36, 24);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(28, 40, 9, 14);
  },
  castle(c) {
    c.fillRect(12, 24, 40, 30);
    for (let i = 0; i < 5; i++) c.fillRect(12 + i * 9, 16, 5, 10);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath();
    c.arc(32, 46, 6, Math.PI, 0);
    c.fillRect(26, 46, 12, 8);
    c.fill();
  },
  tower(c) {
    c.fillRect(22, 18, 20, 38);
    for (let i = 0; i < 3; i++) c.fillRect(20 + i * 9, 10, 6, 10);
  },
  tent(c) {
    poly(c, [32, 8, 56, 54, 8, 54]);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    poly(c, [32, 30, 40, 54, 24, 54]);
  },
  book(c) {
    c.fillRect(12, 12, 40, 40);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(30, 12, 4, 40);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(16, 18, 10, 2);
    c.fillRect(16, 24, 10, 2);
    c.fillRect(38, 18, 10, 2);
  },
  scroll(c) {
    c.fillRect(14, 14, 36, 36);
    circle(c, 14, 32, 5);
    circle(c, 50, 32, 5);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 4; i++) c.fillRect(20, 20 + i * 7, 24, 2);
  },
  potion(c) {
    c.fillRect(27, 8, 10, 10);
    c.beginPath();
    c.arc(32, 38, 17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.4)';
    circle(c, 26, 33, 4);
  },
  ring(c) {
    c.lineWidth = 7;
    circle(c, 32, 36, 15, false);
    poly(c, [32, 8, 40, 18, 32, 24, 24, 18]);
  },
  gem(c) {
    poly(c, [20, 12, 44, 12, 54, 26, 32, 54, 10, 26]);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    poly(c, [20, 12, 44, 12, 38, 26, 26, 26]);
  },
  crown(c) {
    poly(c, [10, 46, 12, 18, 22, 32, 32, 14, 42, 32, 52, 18, 54, 46]);
    c.fillRect(10, 46, 44, 6);
  },
  banner(c) {
    c.fillRect(14, 6, 4, 52);
    poly(c, [18, 10, 52, 10, 44, 24, 52, 38, 18, 38]);
  },
  claw(c) {
    c.lineWidth = 5;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(14 + i * 13, 10);
      c.quadraticCurveTo(26 + i * 13, 32, 18 + i * 13, 54);
      c.stroke();
    }
  },
  fang(c) {
    poly(c, [12, 14, 24, 14, 18, 50]);
    poly(c, [40, 14, 52, 14, 46, 50]);
    c.fillRect(8, 8, 48, 7);
  },
  paw(c) {
    c.beginPath();
    c.ellipse(32, 40, 14, 12, 0, 0, Math.PI * 2);
    c.fill();
    circle(c, 16, 24, 6);
    circle(c, 27, 16, 6);
    circle(c, 38, 16, 6);
    circle(c, 49, 24, 6);
  },
  fist(c) {
    c.fillRect(16, 22, 32, 26);
    for (let i = 0; i < 4; i++) circle(c, 20 + i * 8, 22, 5);
    c.fillRect(12, 30, 8, 14);
  },
  feather(c) {
    c.beginPath();
    c.moveTo(14, 54);
    c.quadraticCurveTo(20, 10, 50, 8);
    c.quadraticCurveTo(46, 40, 14, 54);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 2;
    line(c, 14, 54, 44, 14);
  },
  spider(c) {
    circle(c, 32, 36, 11);
    circle(c, 32, 22, 7);
    c.lineWidth = 3;
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++) line(c, 32 + s * 6, 32 + i * 3, 32 + s * 18, 22 + i * 8, 32 + s * 26, 30 + i * 8);
  },
  web(c) {
    c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(c, 32, 32, 32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26);
    }
    for (let r = 8; r <= 24; r += 8) circle(c, 32, 32, r, false);
  },
  swirl(c) {
    c.lineWidth = 5;
    c.beginPath();
    for (let t = 0; t < 14; t += 0.2) c.lineTo(32 + Math.cos(t) * t * 1.8, 32 + Math.sin(t) * t * 1.8);
    c.stroke();
  },
  cloud(c) {
    circle(c, 22, 34, 11);
    circle(c, 34, 26, 14);
    circle(c, 46, 34, 10);
    c.fillRect(22, 34, 24, 11);
  },
  orb(c) {
    circle(c, 32, 32, 18);
    c.fillStyle = 'rgba(255,255,255,0.45)';
    circle(c, 26, 26, 6);
  },
  aura(c) {
    c.lineWidth = 3;
    circle(c, 32, 32, 22, false);
    circle(c, 32, 32, 14, false);
    circle(c, 32, 32, 6);
  },
  meteor(c) {
    circle(c, 40, 40, 13);
    c.lineWidth = 5;
    line(c, 8, 8, 30, 30);
    line(c, 18, 6, 34, 24);
    line(c, 6, 18, 24, 34);
  },
  totem(c) {
    c.fillRect(24, 12, 16, 44);
    c.fillRect(14, 20, 36, 6);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(27, 32, 4, 4);
    c.fillRect(33, 32, 4, 4);
    c.fillRect(28, 42, 8, 3);
  },
  drum(c) {
    c.beginPath();
    c.ellipse(32, 22, 18, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(14, 22, 36, 24);
    c.lineWidth = 3;
    line(c, 10, 6, 26, 18);
    line(c, 54, 6, 38, 18);
  },
  mask(c) {
    c.beginPath();
    c.moveTo(14, 12);
    c.quadraticCurveTo(32, 6, 50, 12);
    c.quadraticCurveTo(52, 46, 32, 56);
    c.quadraticCurveTo(12, 46, 14, 12);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.75)';
    poly(c, [20, 24, 29, 26, 27, 32, 20, 30]);
    poly(c, [44, 24, 35, 26, 37, 32, 44, 30]);
    c.fillRect(26, 42, 12, 3);
  },
  gear(c) {
    for (let i = 0; i < 8; i++) {
      c.save();
      c.translate(32, 32);
      c.rotate((i / 8) * Math.PI * 2);
      c.fillRect(-4, -26, 8, 10);
      c.restore();
    }
    circle(c, 32, 32, 17);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    circle(c, 32, 32, 7);
  },
  bomb(c) {
    circle(c, 30, 38, 17);
    c.fillRect(36, 14, 8, 10);
    c.fillStyle = '#ffd060';
    circle(c, 46, 10, 4);
  },
  cannon(c) {
    c.save();
    c.translate(30, 34);
    c.rotate(-0.5);
    c.fillRect(-8, -7, 34, 14);
    c.restore();
    circle(c, 24, 44, 10);
  },
  hourglass(c) {
    c.fillRect(14, 8, 36, 5);
    c.fillRect(14, 51, 36, 5);
    poly(c, [18, 13, 46, 13, 34, 32, 46, 51, 18, 51, 30, 32]);
  },
  chain(c) {
    c.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(18 + i * 14, 22 + i * 10, 9, 6, 0.7, 0, Math.PI * 2);
      c.stroke();
    }
  },
  ghost(c) {
    c.beginPath();
    c.arc(32, 26, 16, Math.PI, 0);
    c.lineTo(48, 54);
    c.lineTo(42, 48);
    c.lineTo(37, 54);
    c.lineTo(32, 48);
    c.lineTo(27, 54);
    c.lineTo(22, 48);
    c.lineTo(16, 54);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.7)';
    circle(c, 26, 26, 4);
    circle(c, 38, 26, 4);
  },
  dagger(c) {
    c.save();
    c.translate(32, 32);
    c.rotate(-Math.PI / 4);
    poly(c, [-4, -6, 0, -28, 4, -6]);
    c.fillRect(-9, -6, 18, 4);
    c.fillRect(-2.5, -2, 5, 14);
    c.restore();
  },
  twinblades(c) {
    for (const s of [-1, 1]) {
      c.save();
      c.translate(32, 32);
      c.rotate((s * Math.PI) / 4);
      poly(c, [-3, -4, 0, -28, 3, -4]);
      c.fillRect(-7, -4, 14, 3);
      c.fillRect(-2, -1, 4, 12);
      c.restore();
    }
  },
  arrowUp(c) {
    poly(c, [32, 6, 52, 30, 40, 30, 40, 56, 24, 56, 24, 30, 12, 30]);
  },
  beast(c) {
    c.beginPath();
    c.ellipse(30, 38, 20, 12, 0, 0, Math.PI * 2);
    c.fill();
    circle(c, 50, 28, 9);
    poly(c, [44, 22, 48, 10, 52, 22]);
    c.fillRect(14, 44, 5, 12);
    c.fillRect(38, 44, 5, 12);
  },
  golem(c) {
    c.fillRect(20, 20, 24, 22);
    c.fillRect(25, 8, 14, 12);
    c.fillRect(10, 22, 9, 20);
    c.fillRect(45, 22, 9, 20);
    c.fillRect(21, 42, 9, 14);
    c.fillRect(34, 42, 9, 14);
  },
  // command glyphs
  move(c) {
    poly(c, [10, 50, 30, 10, 36, 30, 54, 36]);
  },
  stop(c) {
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      pts.push(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
    }
    poly(c, pts);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(18, 28, 28, 8);
  },
  hold(c) {
    G.shield(c, '');
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(22, 24, 20, 6);
    c.fillRect(22, 34, 20, 6);
  },
  attack(c) {
    G.sword(c, '');
    c.save();
    c.translate(64, 0);
    c.scale(-1, 1);
    G.sword(c, '');
    c.restore();
  },
  patrol(c) {
    c.lineWidth = 5;
    c.beginPath();
    c.arc(32, 32, 18, 0.3, Math.PI - 0.3);
    c.stroke();
    c.beginPath();
    c.arc(32, 32, 18, Math.PI + 0.3, -0.3);
    c.stroke();
    poly(c, [8, 30, 14, 40, 20, 30]);
    poly(c, [44, 34, 50, 24, 56, 34]);
  },
  gather(c) {
    G.pick(c, '');
  },
  repair(c) {
    G.hammer(c, '');
  },
  return(c) {
    G.house(c, '');
  },
  build(c) {
    G.hammer(c, '');
    c.globalAlpha = 0.5;
    c.fillRect(30, 40, 26, 16);
    c.globalAlpha = 1;
  },
  build2(c) {
    G.castle(c, '');
  },
  rally(c) {
    G.banner(c, '');
  },
  cancel(c) {
    c.lineWidth = 8;
    c.lineCap = 'round';
    line(c, 16, 16, 48, 48);
    line(c, 48, 16, 16, 48);
  },
  learn(c) {
    G.book(c, '');
    c.fillStyle = '#ffd040';
    c.fillRect(46, 2, 6, 18);
    c.fillRect(40, 8, 18, 6);
  },
  upgrade(c) {
    G.arrowUp(c, '');
  },
  garrison(c) {
    G.house(c, '');
  },
  item(c) {
    G.gem(c, '');
  },
};

const cache = new Map<string, string>();

/** Data URL of a 64x64 icon for a glyph on a colored background. */
export function iconURL(spec: IconSpec | undefined): string {
  const s = spec ?? { glyph: 'orb', bg: 0x444455 };
  const key = `${s.glyph}|${s.bg}|${s.fg ?? ''}`;
  let url = cache.get(key);
  if (url) return url;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  const grad = c.createRadialGradient(24, 20, 4, 32, 32, 46);
  grad.addColorStop(0, shadeHex(s.bg, 1.7));
  grad.addColorStop(1, shadeHex(s.bg, 0.55));
  c.fillStyle = grad;
  c.fillRect(0, 0, 64, 64);
  // inner bevel
  c.strokeStyle = 'rgba(255,255,255,0.18)';
  c.lineWidth = 2;
  c.strokeRect(1, 1, 62, 62);
  const fg = s.fg !== undefined ? hex(s.fg) : '#f4ead2';
  c.fillStyle = fg;
  c.strokeStyle = fg;
  c.shadowColor = 'rgba(0,0,0,0.75)';
  c.shadowBlur = 4;
  c.shadowOffsetY = 2;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  (G[s.glyph] ?? G.orb)(c, fg);
  url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

/** Small resource icon canvases for the top bar. */
export function resourceIcon(kind: 'gold' | 'lumber' | 'food' | 'upkeep'): string {
  const map = { gold: { glyph: 'coin', bg: 0x8a6a1a }, lumber: { glyph: 'log', bg: 0x3a5a2a }, food: { glyph: 'house', bg: 0x7a4a2a }, upkeep: { glyph: 'hourglass', bg: 0x4a4a5a } };
  return iconURL(map[kind]);
}
