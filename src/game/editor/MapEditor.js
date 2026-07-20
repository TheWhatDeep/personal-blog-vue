import { TileMap, TILE, TILE_SIZE } from '../world/TileMap.js'
import { BIOMES } from '../data/biomes.js'
import { ENEMIES } from '../data/enemies.js'
import { BOSS_LIST } from '../data/bosses.js'
import { rgba, withAlpha } from '../gfx/Renderer.js'

/**
 * In-game map editor.
 *
 * Mouse-driven tile painting + entity placement on a fixed-size canvas,
 * with three localStorage save slots, JSON export/import, and one-click
 * test play (pick a class, play the map, stairs or death return here).
 *
 * Custom maps reuse the exact runtime path of generated floors: the editor
 * emits the same dungeon description `generateDungeon()` produces, so
 * everything — AI, loot, bosses, minimap — behaves identically.
 */

export const MAP_W = 48
export const MAP_H = 40
const STORE_KEY = 'dungeondepths_maps_v1'

const TILE_BRUSHES = [
	{ id: TILE.FLOOR, name: 'Floor' },
	{ id: TILE.WALL, name: 'Wall' },
	{ id: TILE.HAZARD, name: 'Hazard' },
	{ id: TILE.CRACK, name: 'Secret Wall' },
	{ id: TILE.STAIRS, name: 'Stairs (exit)' },
	{ id: TILE.VOID, name: 'Erase' },
]

const ENEMY_BRUSHES = Object.keys(ENEMIES).filter((id) => !id.startsWith('summon_'))

const PROP_BRUSHES = ['chest', 'barrel', 'shrine', 'shop', 'torch', 'gold']

const CATEGORIES = ['TILES', 'ENEMIES', 'PROPS', 'BOSS', 'START']

const PROP_SPRITES = { chest: 'chest', barrel: 'barrel', shrine: 'shrine', shop: 'shop_npc', torch: 'torch', gold: 'coin' }

export class MapEditor {
	constructor(game) {
		this.game = game
		this.def = this._blank()
		this.category = 0
		this.index = 0
		this.elite = false
		this.menuOpen = false
		this.menuSel = 0
		this.grid = true
		this.camX = (MAP_W * TILE_SIZE) / 2
		this.camY = (MAP_H * TILE_SIZE) / 2
		this.toastMsg = ''
		this.toastT = 0
	}

	_blank() {
		return {
			v: 1,
			w: MAP_W,
			h: MAP_H,
			biome: 'crypt',
			tiles: new Array(MAP_W * MAP_H).fill(TILE.VOID),
			spawns: [], // {kind:'enemy'|'prop'|'boss', id, x, y, elite}
			start: null, // {x, y} world px
		}
	}

	toast(msg) {
		this.toastMsg = msg
		this.toastT = 2.5
	}

	// ============================================================ update

	update(dt) {
		const game = this.game
		const input = game.input
		this.toastT = Math.max(0, this.toastT - dt)

		if (this.menuOpen) {
			this._updateMenu()
			return
		}

		if (input.pressed('pause') || input.pressed('cancel')) {
			this.menuOpen = true
			this.menuSel = 0
			game.audio.play('ui_select')
			return
		}

		// camera pan
		const pan = 240 * dt
		this.camX += input.moveX * pan
		this.camY += input.moveY * pan
		this.camX = Math.max(0, Math.min(MAP_W * TILE_SIZE, this.camX))
		this.camY = Math.max(0, Math.min(MAP_H * TILE_SIZE, this.camY))
		game.camera.snapTo(this.camX, this.camY)

		// category tabs (Q/E) + brush cycling (wheel or [1..9]? use wheel + skill keys)
		if (input.pressed('potion')) this._switchCategory(-1)
		if (input.pressed('interact')) this._switchCategory(1)
		const wheel = input.takeWheel()
		if (wheel) {
			const n = this._brushCount()
			this.index = ((this.index + wheel) % n + n) % n
			game.audio.play('ui_move', 0.5)
		}
		if (input.pressed('dodge')) {
			this.elite = !this.elite
			this.toast(`Elite spawns: ${this.elite ? 'ON' : 'OFF'}`)
		}
		if (input.pressed('fullscreen')) this.grid = !this.grid

		// test play
		if (input.pressed('test')) {
			this.testPlay()
			return
		}

		this._updatePainting()
	}

	_switchCategory(dir) {
		const n = CATEGORIES.length
		this.category = ((this.category + dir) % n + n) % n
		this.index = 0
		this.game.audio.play('ui_move')
	}

	_brushCount() {
		switch (this.category) {
			case 0: return TILE_BRUSHES.length
			case 1: return ENEMY_BRUSHES.length
			case 2: return PROP_BRUSHES.length
			case 3: return BOSS_LIST.length
			default: return 1
		}
	}

	_mouseWorld() {
		const game = this.game
		return {
			x: game.camera.renderX + game.input.mouseX,
			y: game.camera.renderY + game.input.mouseY,
		}
	}

	_updatePainting() {
		const game = this.game
		const input = game.input
		// consume click edges every frame so a click over the palette or a
		// tool switch can never leak a stale placement into the next tool
		const lmb = input.mousePressed(0)
		const rmb = input.mousePressed(2)

		const m = this._mouseWorld()
		const tx = Math.floor(m.x / TILE_SIZE)
		const ty = Math.floor(m.y / TILE_SIZE)
		const inBounds = tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H
		// don't paint through the palette bar
		if (input.mouseY > game.renderer.viewH - 40) return
		if (!inBounds) return

		if (this.category === 0) {
			// tiles: click or hold LMB to paint, RMB to erase
			if (input.mouseDown?.[0] || lmb) this.def.tiles[ty * MAP_W + tx] = TILE_BRUSHES[this.index].id
			if (input.mouseDown?.[2] || rmb) this.def.tiles[ty * MAP_W + tx] = TILE.VOID
			return
		}

		const wx = tx * TILE_SIZE + TILE_SIZE / 2
		const wy = ty * TILE_SIZE + TILE_SIZE / 2

		if (lmb) {
			switch (this.category) {
				case 1:
					this.def.spawns.push({ kind: 'enemy', id: ENEMY_BRUSHES[this.index], x: wx, y: wy, elite: this.elite })
					break
				case 2:
					this.def.spawns.push({ kind: 'prop', id: PROP_BRUSHES[this.index], x: wx, y: wy })
					break
				case 3: {
					// one boss per map
					this.def.spawns = this.def.spawns.filter((s) => s.kind !== 'boss')
					this.def.spawns.push({ kind: 'boss', id: BOSS_LIST[this.index].id, x: wx, y: wy })
					this.toast(`${BOSS_LIST[this.index].name} placed`)
					break
				}
				case 4:
					this.def.start = { x: wx, y: wy }
					break
			}
			game.audio.play('ui_select', 0.5)
		}
		if (rmb && this.category !== 0) {
			// remove nearest spawn under cursor
			let best = -1
			let bestD = 14
			this.def.spawns.forEach((s, i) => {
				const d = Math.hypot(s.x - m.x, s.y - m.y)
				if (d < bestD) {
					bestD = d
					best = i
				}
			})
			if (best >= 0) {
				this.def.spawns.splice(best, 1)
				game.audio.play('ui_back', 0.5)
			}
		}
	}

	// ============================================================ menu

	_menuItems() {
		const slots = this._loadSlots()
		const slotName = (i) => (slots[i] ? `slot ${i + 1} (saved)` : `slot ${i + 1} (empty)`)
		return [
			{ label: 'Resume Editing', fn: () => { this.menuOpen = false } },
			{ label: 'Test Play (T)', fn: () => this.testPlay() },
			{ label: `Biome: ${this.def.biome}`, fn: () => this._cycleBiome() },
			{ label: `Save to ${slotName(0)}`, fn: () => this._save(0) },
			{ label: `Save to ${slotName(1)}`, fn: () => this._save(1) },
			{ label: `Save to ${slotName(2)}`, fn: () => this._save(2) },
			{ label: `Load ${slotName(0)}`, fn: () => this._load(0) },
			{ label: `Load ${slotName(1)}`, fn: () => this._load(1) },
			{ label: `Load ${slotName(2)}`, fn: () => this._load(2) },
			{ label: 'Export JSON file', fn: () => this._export() },
			{ label: 'Import JSON file', fn: () => this._import() },
			{ label: 'Clear Map', fn: () => { this.def = this._blank(); this.toast('Cleared') } },
			{ label: 'Exit to Main Menu', fn: () => this.game.exitEditor() },
		]
	}

	_updateMenu() {
		const game = this.game
		const input = game.input
		const items = this._menuItems()
		if (input.pressed('down')) {
			this.menuSel = (this.menuSel + 1) % items.length
			game.audio.play('ui_move')
		}
		if (input.pressed('up')) {
			this.menuSel = (this.menuSel - 1 + items.length) % items.length
			game.audio.play('ui_move')
		}
		if (input.pressed('cancel') || input.pressed('pause')) {
			this.menuOpen = false
			game.audio.play('ui_back')
			return
		}
		if (input.pressed('confirm')) {
			game.audio.play('ui_select')
			items[this.menuSel].fn()
		}
	}

	_cycleBiome() {
		const ids = BIOMES.map((b) => b.id)
		const i = ids.indexOf(this.def.biome)
		this.def.biome = ids[(i + 1) % ids.length]
	}

	_loadSlots() {
		try {
			return JSON.parse(localStorage.getItem(STORE_KEY)) ?? [null, null, null]
		} catch {
			return [null, null, null]
		}
	}

	_save(i) {
		const slots = this._loadSlots()
		slots[i] = this.def
		try {
			localStorage.setItem(STORE_KEY, JSON.stringify(slots))
			this.toast(`Saved to slot ${i + 1}`)
		} catch {
			this.toast('Save failed (storage unavailable)')
		}
	}

	_load(i) {
		const slots = this._loadSlots()
		if (!slots[i]) {
			this.toast(`Slot ${i + 1} is empty`)
			return
		}
		this.def = slots[i]
		this.menuOpen = false
		this.toast(`Loaded slot ${i + 1}`)
	}

	_export() {
		const blob = new Blob([JSON.stringify(this.def)], { type: 'application/json' })
		const a = document.createElement('a')
		a.href = URL.createObjectURL(blob)
		a.download = 'dungeon-map.json'
		a.click()
		URL.revokeObjectURL(a.href)
		this.toast('Exported dungeon-map.json')
	}

	_import() {
		const inputEl = document.createElement('input')
		inputEl.type = 'file'
		inputEl.accept = '.json,application/json'
		inputEl.onchange = () => {
			const file = inputEl.files?.[0]
			if (!file) return
			file.text().then((text) => {
				try {
					const def = JSON.parse(text)
					if (!Array.isArray(def.tiles) || def.tiles.length !== MAP_W * MAP_H) throw new Error('bad size')
					this.def = { ...this._blank(), ...def }
					this.menuOpen = false
					this.toast('Map imported')
				} catch {
					this.toast('Import failed: not a valid map file')
				}
			})
		}
		inputEl.click()
	}

	// ============================================================ build + test

	/** Emit a dungeon description compatible with generateDungeon() output. */
	buildDungeon() {
		const def = this.def
		const map = new TileMap(MAP_W, MAP_H)
		for (let i = 0; i < def.tiles.length; i++) map.tiles[i] = def.tiles[i]

		// auto-wall: any VOID touching a walkable tile becomes WALL
		for (let ty = 0; ty < MAP_H; ty++) {
			for (let tx = 0; tx < MAP_W; tx++) {
				if (map.get(tx, ty) !== TILE.VOID) continue
				let touches = false
				for (let oy = -1; oy <= 1 && !touches; oy++) {
					for (let ox = -1; ox <= 1; ox++) {
						const t = map.get(tx + ox, ty + oy)
						if (t !== TILE.VOID && t !== TILE.WALL && t !== TILE.CRACK) {
							touches = true
							break
						}
					}
				}
				if (touches) map.set(tx, ty, TILE.WALL)
			}
		}

		for (let i = 0; i < map.tiles.length; i++) map.variants[i] = Math.random() < 0.15 ? 1 : 0

		// player start: explicit marker, else first floor tile
		let start = def.start
		if (!start || map.isSolidAt(start.x, start.y)) {
			start = null
			for (let i = 0; i < def.tiles.length && !start; i++) {
				if (map.tiles[i] === TILE.FLOOR) {
					start = { x: (i % MAP_W) * TILE_SIZE + 8, y: Math.floor(i / MAP_W) * TILE_SIZE + 8 }
				}
			}
		}
		if (!start) {
			this.toast('Paint some floor first!')
			return null
		}

		const spawns = []
		for (const s of def.spawns) {
			if (s.kind === 'enemy') spawns.push({ kind: 'enemy', id: s.id, x: s.x, y: s.y, elite: s.elite, room: -1 })
			else if (s.kind === 'boss') spawns.push({ kind: 'boss', bossId: s.id, x: s.x, y: s.y })
			else if (s.kind === 'prop') {
				if (s.id === 'gold') spawns.push({ kind: 'gold', x: s.x, y: s.y, amount: 25 })
				else spawns.push({ kind: s.id, x: s.x, y: s.y })
			}
		}

		const biome = BIOMES.find((b) => b.id === def.biome) ?? BIOMES[0]
		const cx = (MAP_W * TILE_SIZE) / 2
		const cy = (MAP_H * TILE_SIZE) / 2
		return {
			map,
			rooms: [],
			corridors: [],
			spawns,
			biome,
			floor: 1,
			playerStart: start,
			isBoss: false,
			// boss moves that reference the arena use the whole map on custom floors
			arena: { x: 1, y: 1, w: MAP_W - 2, h: MAP_H - 2, cx, cy },
		}
	}

	testPlay() {
		if (!this.buildDungeon()) return // validates + toasts
		this.game.pendingMode = 'custom'
		this.game.state = 'classSelect'
		this.game.ui.sel = 0
		this.menuOpen = false
	}

	// ============================================================ rendering

	renderWorld(r) {
		const game = this.game
		const atlas = game.atlas
		const biome = BIOMES.find((b) => b.id === this.def.biome) ?? BIOMES[0]
		const cam = game.camera
		const floorR = [atlas.regions[`floor_${biome.id}_0`], atlas.regions[`floor_${biome.id}_1`]]
		const wallR = atlas.regions[`wall_${biome.id}`]
		const hazardR = atlas.regions[`hazard_${biome.id}`]

		const b = cam.bounds(24)
		const tx0 = Math.max(0, Math.floor(b.x0 / TILE_SIZE))
		const ty0 = Math.max(0, Math.floor(b.y0 / TILE_SIZE))
		const tx1 = Math.min(MAP_W - 1, Math.ceil(b.x1 / TILE_SIZE))
		const ty1 = Math.min(MAP_H - 1, Math.ceil(b.y1 / TILE_SIZE))

		for (let ty = ty0; ty <= ty1; ty++) {
			for (let tx = tx0; tx <= tx1; tx++) {
				const t = this.def.tiles[ty * MAP_W + tx]
				const x = tx * TILE_SIZE
				const y = ty * TILE_SIZE
				switch (t) {
					case TILE.FLOOR: r.draw(floorR[(tx + ty) % 2 === 0 ? 0 : 1], x, y, TILE_SIZE, TILE_SIZE); break
					case TILE.WALL: r.draw(wallR, x, y, TILE_SIZE, TILE_SIZE); break
					case TILE.HAZARD:
						r.draw(hazardR, x, y, TILE_SIZE, TILE_SIZE)
						if (biome.hazardType === 'spikes') r.sprite('spikes', x + 8, y + 8)
						break
					case TILE.CRACK:
						r.draw(wallR, x, y, TILE_SIZE, TILE_SIZE, rgba(200, 190, 230, 255))
						r.rect(x + 5, y + 3, 1, 9, rgba(20, 18, 28, 255))
						break
					case TILE.STAIRS:
						r.draw(floorR[0], x, y, TILE_SIZE, TILE_SIZE)
						r.sprite('stairs', x + 8, y + 8)
						break
				}
			}
		}

		// grid
		if (this.grid) {
			const gc = rgba(255, 255, 255, 14)
			for (let tx = tx0; tx <= tx1 + 1; tx++) r.rect(tx * TILE_SIZE, ty0 * TILE_SIZE, 1, (ty1 - ty0 + 1) * TILE_SIZE, gc)
			for (let ty = ty0; ty <= ty1 + 1; ty++) r.rect(tx0 * TILE_SIZE, ty * TILE_SIZE, (tx1 - tx0 + 1) * TILE_SIZE, 1, gc)
		}
		// map border
		r.rectOutline(0, 0, MAP_W * TILE_SIZE, MAP_H * TILE_SIZE, rgba(120, 110, 160, 160))

		// spawns
		for (const s of this.def.spawns) {
			if (s.kind === 'enemy') {
				const sprite = ENEMIES[s.id]?.sprite ?? s.id
				r.animSprite(sprite, this.game.ui.menuT, s.x, s.y - 4, s.elite ? rgba(255, 210, 90, 255) : 0xffffffff, 0, false, 1, 4)
				if (s.elite) r.circleOutline(s.x, s.y, 9, rgba(255, 210, 90, 160), 1, 12)
			} else if (s.kind === 'boss') {
				r.animSprite(`boss_${s.id === 'broodmother' ? 'spider' : s.id === 'colossus' ? 'golem' : s.id === 'sovereign' ? 'void' : s.id}`, this.game.ui.menuT, s.x, s.y - 8, 0xffffffff, 0, false, 1, 4)
			} else {
				r.sprite(PROP_SPRITES[s.id] ?? s.id, s.x, s.y - 3)
			}
		}
		// start marker
		if (this.def.start) {
			r.circleOutline(this.def.start.x, this.def.start.y, 8, rgba(110, 255, 130, 220), 1, 16)
			r.text('S', this.def.start.x, this.def.start.y - 4, rgba(110, 255, 130, 255), 1, 'center')
		}

		// cursor highlight
		const m = this._mouseWorld()
		const ctx2 = Math.floor(m.x / TILE_SIZE)
		const cty = Math.floor(m.y / TILE_SIZE)
		if (ctx2 >= 0 && cty >= 0 && ctx2 < MAP_W && cty < MAP_H && game.input.mouseY < game.renderer.viewH - 40) {
			r.rectOutline(ctx2 * TILE_SIZE, cty * TILE_SIZE, TILE_SIZE, TILE_SIZE, rgba(255, 230, 140, 200))
		}
	}

	drawUI(r) {
		const game = this.game
		const ui = game.ui
		const vw = r.viewW
		const vh = r.viewH

		// palette bar
		const barH = 36
		r.rect(0, vh - barH, vw, barH, rgba(12, 10, 18, 235))
		r.rect(0, vh - barH, vw, 1, rgba(90, 80, 120, 255))

		// category tabs
		let x = 8
		CATEGORIES.forEach((c, i) => {
			r.text(c, x, vh - barH + 4, i === this.category ? rgba(255, 230, 140, 255) : rgba(140, 132, 160, 255))
			x += r.measureText(c) + 10
		})
		r.text('Q/E tabs · wheel brush · LMB place · RMB delete · SHIFT elite · T test · ESC menu', vw - 8, vh - barH + 4, rgba(140, 132, 160, 255), 1, 'right')

		// brush strip
		const names =
			this.category === 0 ? TILE_BRUSHES.map((t) => t.name) :
			this.category === 1 ? ENEMY_BRUSHES :
			this.category === 2 ? PROP_BRUSHES :
			this.category === 3 ? BOSS_LIST.map((b) => b.name) :
			['Click to set the player start']
		let bx = 8
		const by = vh - barH + 16
		names.forEach((n, i) => {
			const selected = i === this.index && this.category !== 4
			const w = r.measureText(n) + 8
			if (bx + w < vw - 8) {
				if (selected) r.rect(bx - 2, by - 2, w, 12, rgba(60, 52, 90, 255))
				r.text(n, bx + 2, by, selected ? rgba(255, 230, 140, 255) : rgba(200, 195, 215, 255))
			}
			bx += w + 4
		})
		if (this.category === 1) {
			r.text(`elite: ${this.elite ? 'ON' : 'off'}`, vw - 8, by, this.elite ? rgba(255, 210, 90, 255) : rgba(140, 132, 160, 255), 1, 'right')
		}

		// toast
		if (this.toastT > 0) {
			r.text(this.toastMsg, vw / 2, vh - barH - 14, withAlpha(rgba(255, 255, 255, 255), Math.min(1, this.toastT)), 1, 'center')
		}

		// editor menu
		if (this.menuOpen) {
			const items = this._menuItems()
			const w = 170
			const h = items.length * 11 + 24
			const mx = (vw - w) / 2
			const my = (vh - h) / 2
			r.rect(0, 0, vw, vh, rgba(0, 0, 0, 140))
			ui.panel(r, mx, my, w, h, 'MAP EDITOR')
			items.forEach((it, i) => {
				const selected = i === this.menuSel
				r.text(`${selected ? '>' : ' '}${it.label}`, mx + 8, my + 16 + i * 11, selected ? rgba(255, 230, 140, 255) : rgba(232, 226, 240, 255))
			})
		}
	}
}
