import Cairo from 'cairo';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const FRAME_INTERVAL_MS = 33;
const PARTICLE_COUNT = 150;
const TAU = Math.PI * 2;
const GRID_COS = Math.SQRT1_2;

function seeded(index, salt = 0) {
    const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
}

const PALETTES = {
    current: [
        [0.34, 0.84, 1.0],
        [0.68, 0.42, 1.0],
        [1.0, 0.42, 0.68],
    ],
    gravity: [
        [0.48, 0.74, 1.0],
        [0.78, 0.32, 1.0],
        [1.0, 0.32, 0.58],
    ],
};

function loadPreset() {
    const path = GLib.build_filenamev([
        GLib.get_user_data_dir(),
        'app.openlbg.wallpapers',
        'live-wallpaper.json',
    ]);
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (ok)
            return JSON.parse(new TextDecoder().decode(bytes)).preset ?? 'current';
    } catch (error) {
        console.warn(`OpenLBG: cannot load particle preset: ${error.message}`);
    }
    return 'current';
}

export default class OpenLBGLiveWallpaperExtension extends Extension {
    enable() {
        this._phase = 0;
        this._magneticDots = null;
        this._preset = loadPreset();
        this._area = new St.DrawingArea({
            name: 'openlbg-live-wallpaper',
            reactive: false,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
        });
        this._repaintId = this._area.connect('repaint', area => this._repaint(area));
        Main.layoutManager._backgroundGroup.add_child(this._area);
        Main.layoutManager._backgroundGroup.set_child_above_sibling(this._area, null);

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._area?.set_size(global.stage.width, global.stage.height);
        });
        this._frameId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_INTERVAL_MS, () => {
            this._phase += 0.018;
            this._area?.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._frameId) {
            GLib.Source.remove(this._frameId);
            this._frameId = null;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        if (this._area && this._repaintId) {
            this._area.disconnect(this._repaintId);
            this._repaintId = null;
        }
        this._area?.destroy();
        this._area = null;
    }

    _repaint(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        const [pointerX, pointerY] = global.get_pointer();

        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        switch (this._preset) {
        case 'tides':
            this._paintTides(cr, width, height, pointerX, pointerY);
            break;
        case 'rain':
            this._paintRain(cr, width, height, pointerX, pointerY);
            break;
        case 'garden':
            this._paintGarden(cr, width, height, pointerX, pointerY);
            break;
        case 'stars':
            this._paintStars(cr, width, height, pointerX, pointerY);
            break;
        case 'chrome':
            this._paintChrome(cr, width, height, pointerX, pointerY);
            break;
        case 'sand':
            this._paintSand(cr, width, height, pointerX, pointerY);
            break;
        case 'sea':
            this._paintSea(cr, width, height, pointerX, pointerY);
            break;
        case 'fluid':
            this._paintFluid(cr, width, height, pointerX, pointerY);
            break;
        case 'magnetic':
            this._paintMagnetic(cr, width, height, pointerX, pointerY);
            break;
        case 'diamond':
            this._paintDiamond(cr, width, height);
            break;
        case 'constellation':
            this._paintConstellation(cr, width, height, pointerX, pointerY);
            break;
        case 'vector':
            this._paintVectorField(cr, width, height, pointerX, pointerY);
            break;
        case 'granular':
            this._paintGranular(cr, width, height, pointerX, pointerY);
            break;
        default:
            this._paintParticles(cr, width, height, pointerX, pointerY);
        }

        cr.$dispose();
    }

    _paintParticles(cr, width, height, pointerX, pointerY) {
        const palette = PALETTES[this._preset] ?? PALETTES.current;
        const centerX = width * 0.44 + (pointerX - width * 0.5) * 0.085;
        const centerY = height * 0.48 + (pointerY - height * 0.5) * 0.075;

        for (let index = 0; index < PARTICLE_COUNT; index++) {
            const ring = index % 34;
            const angle = this._phase * (0.52 + index % 9 * 0.045) + index * 2.39996;
            const radius = 26 + ring * Math.min(width, height) * 0.0128;
            const wave = Math.sin(this._phase * 1.7 + index * 0.41) * 13;
            const x = centerX + Math.cos(angle) * (radius + wave) * 1.46;
            const y = centerY + Math.sin(angle) * (radius + wave) * 0.58;
            const previousX = centerX + Math.cos(angle - 0.065) * (radius + wave) * 1.46;
            const previousY = centerY + Math.sin(angle - 0.065) * (radius + wave) * 0.58;
            const color = palette[index % palette.length];
            const size = 1.2 + index % 5 * 0.48;

            cr.setLineWidth(Math.max(0.7, size * 0.45));
            cr.setSourceRGBA(color[0], color[1], color[2], 0.18);
            cr.moveTo(previousX, previousY);
            cr.lineTo(x, y);
            cr.stroke();

            cr.setSourceRGBA(color[0], color[1], color[2], 0.10);
            cr.arc(x, y, size * 4.2, 0, Math.PI * 2);
            cr.fill();
            cr.setSourceRGBA(color[0], color[1], color[2], 0.88);
            cr.arc(x, y, size, 0, Math.PI * 2);
            cr.fill();
        }
    }

    _paintTides(cr, width, height, pointerX, pointerY) {
        const palette = [
            [0.26, 0.91, 0.82],
            [0.25, 0.69, 1.0],
            [0.14, 0.46, 0.84],
            [0.94, 0.69, 0.30],
        ];
        const streamCount = Math.max(18, Math.round(height / 42));
        const gap = height / (streamCount + 1);
        const influenceX = Math.max(180, width * 0.17);
        const influenceY = Math.max(110, height * 0.24);
        const step = Math.max(12, Math.round(width / 150));

        for (let stream = 0; stream < streamCount; stream++) {
            const baseY = gap * (stream + 1);
            const color = palette[stream % palette.length];
            const major = stream % 4 === 0;

            for (const glow of [true, false]) {
                let first = true;
                for (let x = -step; x <= width + step; x += step) {
                    const ambient = Math.sin(x * 0.006 + stream * 0.82 + this._phase * 0.72) * gap * 0.48
                        + Math.sin(x * 0.0022 - stream * 0.37 - this._phase * 0.31) * gap * 0.35;
                    const dx = (x - pointerX) / influenceX;
                    const distanceY = baseY + ambient - pointerY;
                    const side = distanceY === 0 ? (stream % 2 ? 1 : -1) : Math.sign(distanceY);
                    const verticalCloseness = Math.exp(-Math.abs(distanceY) / influenceY);
                    const displacement = side * influenceY * 0.72 * Math.exp(-(dx * dx) * 1.8) * verticalCloseness;
                    const y = baseY + ambient + displacement;
                    if (first) {
                        cr.moveTo(x, y);
                        first = false;
                    } else {
                        cr.lineTo(x, y);
                    }
                }
                cr.setLineWidth(glow ? (major ? 7.0 : 3.0) : (major ? 1.8 : 0.85));
                cr.setSourceRGBA(color[0], color[1], color[2], glow ? (major ? 0.055 : 0.025) : (major ? 0.62 : 0.28));
                cr.stroke();
            }

            if (major) {
                const sparkX = (this._phase * (220 + stream * 4) + stream * 137) % (width + 100) - 50;
                const sparkY = baseY + Math.sin(sparkX * 0.006 + stream * 0.82 + this._phase * 0.72) * gap * 0.48;
                cr.setSourceRGBA(color[0], color[1], color[2], 0.9);
                cr.arc(sparkX, sparkY, 1.8, 0, Math.PI * 2);
                cr.fill();
            }
        }
    }

    _paintRain(cr, width, height, pointerX, pointerY) {
        const influence = Math.max(130, width * 0.1);
        for (let index = 0; index < 78; index++) {
            const size = 1.2 + seeded(index, 3) * 3.5;
            const speed = 16 + seeded(index, 4) * 34;
            let x = seeded(index, 1) * width;
            const y = (seeded(index, 2) * height + this._phase * speed * 3.4) % (height + 90) - 45;
            const dx = x - pointerX;
            const dy = y - pointerY;
            const distance = Math.hypot(dx, dy);
            if (distance < influence)
                x += dx / Math.max(distance, 1) * (influence - distance) * 0.18;

            cr.setLineWidth(Math.max(0.5, size * 0.35));
            cr.setSourceRGBA(0.48, 0.82, 1.0, 0.24);
            cr.moveTo(x, y - size * (4.2 + speed * 0.035));
            cr.curveTo(x - 1.5, y - size * 2.5, x + 1.2, y - size, x, y);
            cr.stroke();
            cr.setSourceRGBA(0.78, 0.93, 1.0, 0.42);
            cr.arc(x, y, size * 0.62, 0, TAU);
            cr.fill();
        }
    }

    _paintGarden(cr, width, height, pointerX, pointerY) {
        for (let index = 0; index < 36; index++) {
            const x = (0.02 + seeded(index, 1) * 0.96) * width;
            const stemHeight = height * (0.12 + seeded(index, 2) * 0.52);
            const topY = height - stemHeight;
            const distance = Math.hypot(x - pointerX, topY - pointerY);
            const attraction = Math.max(0, 1 - distance / (width * 0.34));
            const breeze = Math.sin(this._phase * 0.88 + seeded(index, 3) * TAU) * width * 0.012;
            const lean = breeze + (pointerX - x) * attraction * 0.12;
            const color = index % 4 === 0 ? [0.49, 0.46, 1.0] : index % 3 === 0 ? [0.25, 0.85, 1.0] : [0.20, 0.93, 0.70];

            cr.setLineWidth(0.7 + seeded(index, 4) * 0.9);
            cr.setSourceRGBA(color[0], color[1], color[2], 0.38);
            cr.moveTo(x, height + 3);
            cr.curveTo(x, height - stemHeight * 0.25, x + lean * 0.3, height - stemHeight * 0.64, x + lean, topY);
            cr.stroke();
            cr.setSourceRGBA(color[0], color[1], color[2], 0.14 + attraction * 0.18);
            cr.arc(x + lean, topY, 7 + attraction * 9, 0, TAU);
            cr.fill();
            cr.setSourceRGBA(color[0], color[1], color[2], 0.54 + attraction * 0.38);
            cr.arc(x + lean, topY, 1.4 + seeded(index, 5) * 2.4, 0, TAU);
            cr.fill();
        }
    }

    _paintStars(cr, width, height, pointerX, pointerY) {
        const stars = [];
        for (let index = 0; index < 82; index++) {
            stars.push({
                x: (0.025 + seeded(index, 1) * 0.95) * width + Math.sin(this._phase * 0.12 + seeded(index, 3) * TAU) * 2,
                y: (0.035 + seeded(index, 2) * 0.92) * height + Math.cos(this._phase * 0.1 + seeded(index, 3) * TAU) * 1.5,
                size: 0.55 + seeded(index, 4) * 1.5,
            });
        }
        for (let index = 0; index < stars.length; index++) {
            const star = stars[index];
            const pointerDistance = Math.hypot(star.x - pointerX, star.y - pointerY);
            if (pointerDistance < width * 0.21) {
                for (let offset = 1; offset <= 4; offset++) {
                    const other = stars[(index + offset) % stars.length];
                    const distance = Math.hypot(star.x - other.x, star.y - other.y);
                    if (distance < width * 0.1) {
                        cr.setLineWidth(0.65);
                        cr.setSourceRGBA(0.48, 0.66, 1.0, (1 - distance / (width * 0.1)) * 0.24);
                        cr.moveTo(star.x, star.y);
                        cr.lineTo(other.x, other.y);
                        cr.stroke();
                    }
                }
            }
            const glow = Math.max(0, 1 - pointerDistance / (width * 0.24));
            cr.setSourceRGBA(0.48, 0.68, 1.0, 0.08 + glow * 0.12);
            cr.arc(star.x, star.y, 5 + glow * 8, 0, TAU);
            cr.fill();
            cr.setSourceRGBA(0.82, 0.9, 1.0, 0.48 + glow * 0.48);
            cr.arc(star.x, star.y, star.size + glow * 0.8, 0, TAU);
            cr.fill();
        }
    }

    _paintChrome(cr, width, height, pointerX, pointerY) {
        for (let band = 0; band < 16; band++) {
            let first = true;
            for (let x = -10; x <= width + 10; x += Math.max(10, width / 160)) {
                const base = height * (0.08 + band * 0.057);
                const wave = Math.sin(x * 0.006 + band * 0.73 + this._phase * 0.43) * height * 0.032;
                const dx = (x - pointerX) / Math.max(180, width * 0.16);
                const ripple = Math.sin(Math.abs(x - pointerX) * 0.028 - this._phase * 4.8) * Math.exp(-dx * dx) * height * 0.022;
                const lift = ripple * Math.exp(-Math.abs(base - pointerY) / (height * 0.28));
                const y = base + wave + lift;
                if (first) {
                    cr.moveTo(x, y);
                    first = false;
                } else {
                    cr.lineTo(x, y);
                }
            }
            const bright = band % 3 === 0;
            cr.setLineWidth(bright ? 1.7 : 0.75);
            cr.setSourceRGBA(bright ? 0.76 : 0.42, bright ? 0.9 : 0.58, 1.0, bright ? 0.42 : 0.15);
            cr.stroke();
        }
    }

    _paintSand(cr, width, height, pointerX, pointerY) {
        const influence = Math.max(120, width * 0.1);
        for (let index = 0; index < 230; index++) {
            const speed = 13 + seeded(index, 4) * 32;
            let x = (seeded(index, 1) * width + this._phase * (5 + seeded(index, 3) * 9)) % (width + 24) - 12;
            let y = (seeded(index, 2) * height + this._phase * speed * 2.3) % (height + 30) - 15;
            const dx = x - pointerX;
            const dy = y - pointerY;
            const distance = Math.hypot(dx, dy);
            if (distance < influence) {
                const force = (influence - distance) * 0.22;
                x += dx / Math.max(distance, 1) * force;
                y += dy / Math.max(distance, 1) * force;
            }
            const palette = index % 3 === 0 ? [1.0, 0.72, 0.36] : index % 3 === 1 ? [1.0, 0.38, 0.31] : [0.69, 0.5, 0.85];
            cr.setSourceRGBA(palette[0], palette[1], palette[2], 0.28 + seeded(index, 6) * 0.58);
            cr.arc(x, y, 0.55 + seeded(index, 5) * 1.25, 0, TAU);
            cr.fill();
        }
    }

    _paintSea(cr, width, height, pointerX, pointerY) {
        for (let index = 0; index < 8; index++) {
            const x = (0.08 + seeded(index, 1) * 0.84) * width + Math.sin(this._phase * 0.36 + seeded(index, 5) * TAU) * width * 0.025;
            const travel = height * 1.3;
            const y = ((seeded(index, 2) * travel - this._phase * (4 + seeded(index, 4) * 7)) % travel + travel) % travel - height * 0.15;
            const radius = Math.min(width, height) * (0.035 + seeded(index, 3) * 0.045);
            const distance = Math.hypot(x - pointerX, y - pointerY);
            const proximity = Math.max(0, 1 - distance / (width * 0.23));
            const pulse = 0.72 + Math.sin(this._phase * 3.2 + seeded(index, 5) * TAU) * 0.16 + proximity * 0.5;
            const color = index % 3 === 0 ? [0.94, 0.5, 1.0] : index % 2 === 0 ? [0.4, 0.88, 1.0] : [0.5, 0.58, 1.0];

            cr.setSourceRGBA(color[0], color[1], color[2], 0.08 + proximity * 0.14);
            cr.arc(x, y, radius * (1.35 + proximity * 0.35), 0, TAU);
            cr.fill();
            cr.setLineWidth(1.2);
            cr.setSourceRGBA(color[0], color[1], color[2], 0.32 + proximity * 0.5);
            cr.arc(x, y, radius * pulse, Math.PI, TAU);
            cr.curveTo(x + radius * 0.55, y + radius * 0.42, x - radius * 0.55, y + radius * 0.42, x - radius * pulse, y);
            cr.closePath();
            cr.stroke();
            for (let tentacle = -2; tentacle <= 2; tentacle++) {
                cr.setLineWidth(0.55);
                cr.setSourceRGBA(color[0], color[1], color[2], 0.16 + proximity * 0.24);
                cr.moveTo(x + tentacle * radius * 0.18, y + radius * 0.25);
                cr.curveTo(
                    x + tentacle * radius * 0.2 + Math.sin(this._phase * 1.7 + tentacle) * 6,
                    y + radius * 0.75,
                    x + tentacle * radius * 0.28,
                    y + radius * 1.05,
                    x + tentacle * radius * 0.2 + Math.cos(this._phase * 1.2 + tentacle) * 8,
                    y + radius * 1.45
                );
                cr.stroke();
            }
        }
    }

    _paintFluid(cr, width, height, pointerX, pointerY) {
        const palette = [
            [0.05, 0.76, 1.0],
            [0.28, 0.32, 1.0],
            [0.72, 0.12, 1.0],
            [1.0, 0.12, 0.5],
            [0.12, 0.92, 0.76],
        ];
        const influence = Math.max(220, Math.min(width, height) * 0.38);

        for (let ribbon = 0; ribbon < 22; ribbon++) {
            const color = palette[ribbon % palette.length];
            const originX = seeded(ribbon, 1) * width;
            const originY = seeded(ribbon, 2) * height;
            const orbit = Math.min(width, height) * (0.05 + seeded(ribbon, 3) * 0.2);
            const angle = this._phase * (0.32 + seeded(ribbon, 4) * 0.46) + seeded(ribbon, 5) * TAU;
            let x = originX + Math.cos(angle) * orbit;
            let y = originY + Math.sin(angle * 0.83) * orbit * 0.62;
            const distance = Math.hypot(x - pointerX, y - pointerY);
            const proximity = Math.max(0, 1 - distance / influence);
            x += (pointerX - x) * proximity * 0.14;
            y += (pointerY - y) * proximity * 0.14;

            const tangentX = Math.cos(angle + Math.PI * 0.5);
            const tangentY = Math.sin(angle + Math.PI * 0.5);
            const length = Math.min(width, height) * (0.11 + seeded(ribbon, 6) * 0.2);
            const curl = Math.sin(this._phase * 1.3 + ribbon * 0.72) * length * 0.45;

            for (const layer of [3.8, 2.2, 1.0]) {
                cr.setLineWidth((7 + seeded(ribbon, 7) * 15) * layer);
                cr.setLineCap(Cairo.LineCap.ROUND);
                cr.setSourceRGBA(
                    color[0],
                    color[1],
                    color[2],
                    layer > 3 ? 0.018 + proximity * 0.012 : layer > 2 ? 0.035 : 0.13 + proximity * 0.11
                );
                cr.moveTo(x - tangentX * length, y - tangentY * length);
                cr.curveTo(
                    x - tangentX * length * 0.28 + tangentY * curl,
                    y - tangentY * length * 0.28 - tangentX * curl,
                    x + tangentX * length * 0.28 - tangentY * curl,
                    y + tangentY * length * 0.28 + tangentX * curl,
                    x + tangentX * length,
                    y + tangentY * length
                );
                cr.stroke();
            }

            const poolRadius = Math.min(width, height) * (0.015 + seeded(ribbon, 8) * 0.035) * (1 + proximity * 0.35);
            cr.setSourceRGBA(color[0], color[1], color[2], 0.05 + proximity * 0.06);
            cr.arc(x, y, poolRadius * 2.6, 0, TAU);
            cr.fill();
            cr.setSourceRGBA(color[0], color[1], color[2], 0.18 + proximity * 0.16);
            cr.arc(x, y, poolRadius, 0, TAU);
            cr.fill();
        }
    }

    _paintMagnetic(cr, width, height, pointerX, pointerY) {
        const spacing = 34;
        if (!this._magneticDots || this._magneticDots.width !== width || this._magneticDots.height !== height) {
            const dots = [];
            const columns = Math.ceil(width / spacing) + 1;
            const rows = Math.ceil(height / spacing) + 1;
            const offsetX = width % spacing / 2;
            const offsetY = height % spacing / 2;
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    const x = offsetX + column * spacing;
                    const y = offsetY + row * spacing;
                    dots.push({restX: x, restY: y, x, y, vx: 0, vy: 0});
                }
            }
            this._magneticDots = {width, height, dots};
        }

        cr.setSourceRGBA(0.067, 0.059, 0.047, 0.94);
        cr.rectangle(0, 0, width, height);
        cr.fill();
        const influence = Math.max(190, Math.min(width, height) * 0.19);
        const influenceSquared = influence * influence;

        for (const dot of this._magneticDots.dots) {
            const dx = dot.x - pointerX;
            const dy = dot.y - pointerY;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared < influenceSquared && distanceSquared > 0.01) {
                const distance = Math.sqrt(distanceSquared);
                const falloff = 1 - distance / influence;
                const force = falloff * falloff * 9.5;
                dot.vx += -dx / distance * force;
                dot.vy += -dy / distance * force;
            }
            dot.vx += (dot.restX - dot.x) * 0.055;
            dot.vy += (dot.restY - dot.y) * 0.055;
            dot.vx *= 0.89;
            dot.vy *= 0.89;
            dot.x += dot.vx;
            dot.y += dot.vy;

            const proximity = Math.max(0, 1 - Math.sqrt(distanceSquared) / influence);
            if (proximity > 0.45)
                cr.setSourceRGBA(0.85, 1.0, 0.39, 0.44 + proximity * 0.3);
            else
                cr.setSourceRGBA(1.0, 1.0, 1.0, 0.48);
            cr.arc(dot.x, dot.y, 1.25 + proximity * 0.45, 0, TAU);
            cr.fill();
        }
    }

    _paintDiamond(cr, width, height) {
        cr.setSourceRGBA(0, 0, 0, 0.96);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        const cell = Math.max(76, Math.min(118, Math.min(width, height) * 0.105));
        const extent = Math.hypot(width, height) * 0.72;
        const toScreen = (gridX, gridY) => ({
            x: GRID_COS * gridX - GRID_COS * gridY + width * 0.5,
            y: GRID_COS * gridX + GRID_COS * gridY + height * 0.5,
        });
        const diagonalAlpha = (x, y) => {
            const distance = Math.abs(x / width - y / height);
            const value = Math.max(0, Math.min(1, (distance - 0.12) / 0.72));
            const fade = value * value * (3 - 2 * value);
            return 1 - fade;
        };

        cr.setLineWidth(0.7);
        for (let grid = -extent; grid <= extent; grid += cell) {
            const verticalStart = toScreen(grid, -extent);
            const verticalEnd = toScreen(grid, extent);
            const horizontalStart = toScreen(-extent, grid);
            const horizontalEnd = toScreen(extent, grid);
            cr.setSourceRGBA(1, 1, 1, 0.045);
            cr.moveTo(verticalStart.x, verticalStart.y);
            cr.lineTo(verticalEnd.x, verticalEnd.y);
            cr.stroke();
            cr.moveTo(horizontalStart.x, horizontalStart.y);
            cr.lineTo(horizontalEnd.x, horizontalEnd.y);
            cr.stroke();
        }

        for (let gridX = -extent; gridX <= extent; gridX += cell) {
            for (let gridY = -extent; gridY <= extent; gridY += cell) {
                const point = toScreen(gridX, gridY);
                if (point.x < -5 || point.x > width + 5 || point.y < -5 || point.y > height + 5)
                    continue;
                const alpha = diagonalAlpha(point.x, point.y) * 0.24;
                cr.setSourceRGBA(1, 1, 1, alpha);
                cr.moveTo(point.x, point.y - 3.2);
                cr.lineTo(point.x + 0.8, point.y);
                cr.lineTo(point.x, point.y + 3.2);
                cr.lineTo(point.x - 0.8, point.y);
                cr.closePath();
                cr.fill();
            }
        }

        const loopTime = this._phase * 1000 % 64000;
        for (let index = 0; index < 22; index++) {
            const start = index / 22 * 64000;
            const age = (loopTime - start + 64000) % 64000;
            if (age > 28000)
                continue;
            const attack = Math.min(1, age / 900);
            const decay = age < 12500 ? 1 : Math.max(0, 1 - (age - 12500) / 15500);
            const level = attack * decay;
            const gridX = (Math.floor(seeded(index, 11) * 13) - 6) * cell;
            const gridY = (Math.floor(seeded(index, 12) * 9) - 4) * cell;
            const origin = toScreen(gridX, gridY);
            if (origin.x < 0 || origin.x > width || origin.y < 0 || origin.y > height)
                continue;
            const reach = Math.min(3.4, age / 3600) * cell;
            const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dx, dy] of directions) {
                const end = toScreen(gridX + dx * reach, gridY + dy * reach);
                cr.setLineWidth(0.9);
                cr.setSourceRGBA(0.91, 0.86, 1.0, level * 0.52);
                cr.moveTo(origin.x, origin.y);
                cr.lineTo(end.x, end.y);
                cr.stroke();
            }
            cr.setSourceRGBA(0.9, 0.84, 1.0, level * 0.12);
            cr.arc(origin.x, origin.y, 16, 0, TAU);
            cr.fill();
            cr.setSourceRGBA(1, 1, 1, level * 0.86);
            cr.moveTo(origin.x, origin.y - 10);
            cr.lineTo(origin.x + 1.4, origin.y);
            cr.lineTo(origin.x, origin.y + 10);
            cr.lineTo(origin.x - 1.4, origin.y);
            cr.closePath();
            cr.fill();
        }
    }

    _paintConstellation(cr, width, height, pointerX, pointerY) {
        cr.setSourceRGBA(0.067, 0.059, 0.047, 0.95);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        const radials = 24;
        const rings = 14;
        const centerX = width * 0.5;
        const centerY = height * 0.5;
        const maximumRadius = Math.hypot(width, height) * 0.56;
        const nodes = [{x: centerX, y: centerY}];

        for (let ring = 1; ring <= rings; ring++) {
            const radius = maximumRadius * ring / rings;
            for (let spoke = 0; spoke < radials; spoke++) {
                const index = ring * radials + spoke;
                const angle = spoke * TAU / radials - Math.PI * 0.5;
                const jitter = 1 + (seeded(index, 21) - 0.5) * 0.18;
                let x = centerX + Math.cos(angle) * radius * jitter + Math.sin(this._phase * 0.38 + seeded(index, 22) * TAU) * 3.5;
                let y = centerY + Math.sin(angle) * radius * jitter + Math.cos(this._phase * 0.31 + seeded(index, 23) * TAU) * 3.5;
                const dx = x - pointerX;
                const dy = y - pointerY;
                const distance = Math.hypot(dx, dy);
                if (distance < 105 && distance > 0.1) {
                    const push = (1 - distance / 105) * 28;
                    x += dx / distance * push;
                    y += dy / distance * push;
                }
                nodes.push({x, y});
            }
        }

        const drawStrand = (start, end, alpha, phase) => {
            const middleX = (start.x + end.x) * 0.5;
            const middleY = (start.y + end.y) * 0.5;
            const deltaX = end.x - start.x;
            const deltaY = end.y - start.y;
            const length = Math.hypot(deltaX, deltaY) || 1;
            const bow = Math.sin(this._phase * 0.55 + phase) * 6;
            let controlX = middleX - deltaY / length * bow;
            let controlY = middleY + deltaX / length * bow;
            const pointerDx = pointerX - middleX;
            const pointerDy = pointerY - middleY;
            const pointerDistance = Math.hypot(pointerDx, pointerDy);
            const bend = 18 * Math.exp(-(pointerDistance * pointerDistance) / (280 * 280));
            if (pointerDistance > 0.1) {
                controlX -= pointerDx / pointerDistance * bend;
                controlY -= pointerDy / pointerDistance * bend;
                alpha *= 1 - Math.exp(-(pointerDistance * pointerDistance) / (170 * 170)) * 0.75;
            }
            cr.setLineWidth(0.65);
            cr.setSourceRGBA(1, 1, 1, alpha);
            cr.moveTo(start.x, start.y);
            cr.curveTo(
                start.x + (controlX - start.x) * 0.67,
                start.y + (controlY - start.y) * 0.67,
                end.x + (controlX - end.x) * 0.67,
                end.y + (controlY - end.y) * 0.67,
                end.x,
                end.y
            );
            cr.stroke();
        };

        for (let spoke = 0; spoke < radials; spoke++) {
            let previous = nodes[0];
            for (let ring = 1; ring <= rings; ring++) {
                const current = nodes[1 + (ring - 1) * radials + spoke];
                drawStrand(previous, current, 0.34 * (1 - ring / (rings + 3)), spoke * 0.37 + ring);
                previous = current;
            }
        }
        for (let ring = 1; ring <= rings; ring++) {
            for (let spoke = 0; spoke < radials; spoke++) {
                const current = nodes[1 + (ring - 1) * radials + spoke];
                const next = nodes[1 + (ring - 1) * radials + (spoke + 1) % radials];
                drawStrand(current, next, 0.17 * (1 - ring / (rings + 3)), spoke + ring * 0.4);
            }
        }

        for (let index = 0; index < nodes.length; index++) {
            const node = nodes[index];
            const distance = Math.hypot(pointerX - node.x, pointerY - node.y);
            const fade = 1 - Math.exp(-(distance * distance) / (160 * 160)) * 0.78;
            cr.setSourceRGBA(1, 1, 1, (index === 0 ? 0.45 : 0.16) * fade);
            cr.arc(node.x, node.y, index === 0 ? 1.8 : 1.05, 0, TAU);
            cr.fill();
        }
    }

    _paintVectorField(cr, width, height, pointerX, pointerY) {
        cr.setSourceRGBA(0.067, 0.059, 0.047, 0.96);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        const spacing = 44;
        const shaft = 10;
        const head = 4.5;
        for (let x = spacing * 0.5; x < width; x += spacing) {
            for (let y = spacing * 0.5; y < height; y += spacing) {
                const flow = Math.sin(x * 0.007 + this._phase * 0.72) * Math.PI
                    + Math.cos(y * 0.007 + this._phase * 0.43) * Math.PI;
                const dx = pointerX - x;
                const dy = pointerY - y;
                const distance = Math.hypot(dx, dy);
                const proximity = Math.exp(-distance / 320);
                const target = Math.atan2(dy, dx);
                let difference = target - flow;
                while (difference > Math.PI)
                    difference -= TAU;
                while (difference < -Math.PI)
                    difference += TAU;
                const wobble = 0.12 * (1 - proximity * 0.7) * Math.sin(this._phase * 0.7 + x * 0.013 + y * 0.017);
                const angle = flow + difference * proximity + wobble;
                const cosine = Math.cos(angle);
                const sine = Math.sin(angle);
                const alpha = 0.07 + Math.exp(-(distance * distance) / (230 * 230)) * 0.78;
                const tipX = x + cosine * shaft;
                const tipY = y + sine * shaft;
                const tailX = x - cosine * shaft;
                const tailY = y - sine * shaft;
                cr.setSourceRGBA(1, 1, 1, alpha);
                cr.setLineWidth(1.1);
                cr.setLineCap(Cairo.LineCap.ROUND);
                cr.moveTo(tailX, tailY);
                cr.lineTo(tipX, tipY);
                cr.stroke();
                const headAngle = Math.PI - Math.PI / 5;
                cr.setLineWidth(0.9);
                cr.moveTo(tipX, tipY);
                cr.lineTo(tipX + Math.cos(angle + headAngle) * head, tipY + Math.sin(angle + headAngle) * head);
                cr.moveTo(tipX, tipY);
                cr.lineTo(tipX + Math.cos(angle - headAngle) * head, tipY + Math.sin(angle - headAngle) * head);
                cr.stroke();
            }
        }
    }

    _paintGranular(cr, width, height, pointerX, pointerY) {
        cr.setSourceRGBA(0.067, 0.059, 0.047, 0.96);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        const count = Math.min(2200, Math.round(width * height / 780));
        const radius = 220;
        const connectionDistance = 42;
        const buckets = new Map();
        const keyFor = (x, y) => `${Math.floor(x / connectionDistance)}:${Math.floor(y / connectionDistance)}`;

        for (let index = 0; index < count; index++) {
            const x = seeded(index, 31) * width;
            const y = seeded(index, 32) * height;
            const dx = x - pointerX;
            const dy = y - pointerY;
            const distanceSquared = dx * dx + dy * dy;
            const brightness = Math.exp(-distanceSquared / (radius * radius * 0.25));
            const alpha = 0.15 + brightness * 0.72;
            const size = 0.8 + brightness * 0.8;
            cr.setSourceRGBA(1, 1, 1, alpha);
            cr.rectangle(x - size * 0.5, y - size * 0.5, size, size);
            cr.fill();

            if (brightness < 0.06)
                continue;
            const cellX = Math.floor(x / connectionDistance);
            const cellY = Math.floor(y / connectionDistance);
            for (let offsetX = -1; offsetX <= 1; offsetX++) {
                for (let offsetY = -1; offsetY <= 1; offsetY++) {
                    const nearby = buckets.get(`${cellX + offsetX}:${cellY + offsetY}`) ?? [];
                    for (const other of nearby) {
                        const pairDistance = Math.hypot(x - other.x, y - other.y);
                        if (pairDistance >= connectionDistance)
                            continue;
                        cr.setLineWidth(0.5);
                        cr.setSourceRGBA(1, 1, 1, Math.min(brightness, other.brightness) * 0.18);
                        cr.moveTo(x, y);
                        cr.lineTo(other.x, other.y);
                        cr.stroke();
                    }
                }
            }
            const key = keyFor(x, y);
            if (!buckets.has(key))
                buckets.set(key, []);
            buckets.get(key).push({x, y, brightness});
        }
    }
}
