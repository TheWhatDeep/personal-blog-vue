import { SPRITES } from './PixelArt.js'
import { Rng } from '../core/Rng.js'

/**
 * Builds the single texture atlas the whole game renders from.
 *
 * Contents:
 *  - every pixel-art sprite defined in PixelArt.js
 *  - procedurally shaded floor/wall tiles for each biome
 *  - a bitmap font baked from the platform monospace font (alpha-thresholded
 *    to keep the pixel aesthetic and rendered white so it can be tinted)
 *  - a solid white region used for rects, lines, particles and bars
 *
 * One atlas + one shader = the whole frame batches into ~2 draw calls.
 */

const ATLAS_SIZE = 512
const PAD = 1

export class Atlas {
	constructor() {
		this.canvas = document.createElement('canvas')
		this.canvas.width = ATLAS_SIZE
		this.canvas.height = ATLAS_SIZE
		this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
		this.regions = {}
		this.font = null
		// shelf packer state
		this._x = 0
		this._y = 0
		this._rowH = 0
	}

	/** @param {Array} biomes biome descriptors from data/biomes.js */
	build(biomes) {
		const ctx = this.ctx
		ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE)

		// white block (used by rect/line/particle rendering) — sample its center
		// so bilinear/edge bleed can never pick up transparent neighbors
		const wr = this._alloc(8, 8)
		ctx.fillStyle = '#ffffff'
		ctx.fillRect(wr.x, wr.y, 8, 8)
		this.regions.white = this._region(wr.x + 2, wr.y + 2, 4, 4)

		for (const [name, def] of Object.entries(SPRITES)) {
			this._packPixelDef(name, def)
		}

		for (const biome of biomes) {
			this._packTiles(biome)
		}

		this._packFont()
		return this
	}

	_alloc(w, h) {
		if (this._x + w + PAD > ATLAS_SIZE) {
			this._x = 0
			this._y += this._rowH + PAD
			this._rowH = 0
		}
		if (this._y + h + PAD > ATLAS_SIZE) {
			throw new Error('Texture atlas overflow — increase ATLAS_SIZE')
		}
		const slot = { x: this._x, y: this._y }
		this._x += w + PAD
		this._rowH = Math.max(this._rowH, h)
		return slot
	}

	_region(x, y, w, h) {
		return {
			u0: x / ATLAS_SIZE,
			v0: y / ATLAS_SIZE,
			u1: (x + w) / ATLAS_SIZE,
			v1: (y + h) / ATLAS_SIZE,
			w,
			h,
		}
	}

	_packPixelDef(name, def) {
		const rows = def.rows
		const h = rows.length
		const w = rows[0].length
		const slot = this._alloc(w, h)
		const ctx = this.ctx
		for (let y = 0; y < h; y++) {
			const row = rows[y]
			for (let x = 0; x < w; x++) {
				const ch = row[x]
				if (ch === '.' || ch === ' ' || ch === undefined) continue
				const color = def.pal[ch]
				if (!color) continue
				ctx.fillStyle = color
				ctx.fillRect(slot.x + x, slot.y + y, 1, 1)
			}
		}
		this.regions[name] = this._region(slot.x, slot.y, w, h)
	}

	/** Generate noise-shaded 16x16 floor variants + wall tile for one biome. */
	_packTiles(biome) {
		const rng = new Rng(biome.tileSeed ?? 1234)
		const ctx = this.ctx

		for (let variant = 0; variant < 2; variant++) {
			const slot = this._alloc(16, 16)
			for (let y = 0; y < 16; y++) {
				for (let x = 0; x < 16; x++) {
					let c = biome.floorColor
					const r = rng.next()
					if (r < 0.08) c = biome.floorDark
					else if (r > 0.94) c = biome.floorLight
					// subtle grid seams
					if (x === 0 || y === 0) c = shade(c, -8)
					ctx.fillStyle = c
					ctx.fillRect(slot.x + x, slot.y + y, 1, 1)
				}
			}
			this.regions[`floor_${biome.id}_${variant}`] = this._region(slot.x, slot.y, 16, 16)
		}

		// wall: lit top cap + darker face with brick seams
		{
			const slot = this._alloc(16, 16)
			for (let y = 0; y < 16; y++) {
				for (let x = 0; x < 16; x++) {
					let c
					if (y < 4) c = biome.wallTop
					else {
						c = biome.wallColor
						const brickRow = ((y - 4) / 4) | 0
						const seamX = (x + (brickRow % 2) * 8) % 16
						if ((y - 4) % 4 === 3 || seamX === 0) c = shade(biome.wallColor, -25)
						else if (rng.next() < 0.06) c = shade(biome.wallColor, 12)
					}
					ctx.fillStyle = c
					ctx.fillRect(slot.x + x, slot.y + y, 1, 1)
				}
			}
			this.regions[`wall_${biome.id}`] = this._region(slot.x, slot.y, 16, 16)
		}

		// hazard tile (lava / spikes pit base / void)
		{
			const slot = this._alloc(16, 16)
			for (let y = 0; y < 16; y++) {
				for (let x = 0; x < 16; x++) {
					let c = biome.hazardColor
					const r = rng.next()
					if (r < 0.18) c = biome.hazardGlow
					ctx.fillStyle = c
					ctx.fillRect(slot.x + x, slot.y + y, 1, 1)
				}
			}
			this.regions[`hazard_${biome.id}`] = this._region(slot.x, slot.y, 16, 16)
		}
	}

	_packFont() {
		const ctx = this.ctx
		const cellW = 8
		const cellH = 10
		ctx.font = 'bold 8px monospace'
		ctx.textBaseline = 'top'
		ctx.fillStyle = '#ffffff'

		const glyphs = {}
		for (let code = 33; code <= 126; code++) {
			const ch = String.fromCharCode(code)
			const slot = this._alloc(cellW, cellH)
			ctx.fillText(ch, slot.x + 1, slot.y + 1)
			glyphs[code] = {
				region: this._region(slot.x, slot.y, cellW - 1, cellH),
				advance: 6,
			}
		}

		// Threshold alpha + force white so text renders crisp and tintable
		const img = ctx.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE)
		const d = img.data
		for (let i = 0; i < d.length; i += 4) {
			const a = d[i + 3]
			if (a > 0 && a < 255) {
				if (a >= 90) {
					d[i + 3] = 255
					// only whiten thresholded (font) pixels: sprites are drawn opaque
					d[i] = d[i + 1] = d[i + 2] = 255
				} else {
					d[i + 3] = 0
				}
			}
		}
		ctx.putImageData(img, 0, 0)

		this.font = { glyphs, lineHeight: 10, spaceWidth: 6 }
	}
}

/** Lighten/darken a #rrggbb color by delta per channel. */
function shade(hex, delta) {
	const n = parseInt(hex.slice(1), 16)
	const r = Math.max(0, Math.min(255, (n >> 16) + delta))
	const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + delta))
	const b = Math.max(0, Math.min(255, (n & 0xff) + delta))
	return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
