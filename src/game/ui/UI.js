import { rgba, withAlpha } from '../gfx/Renderer.js'
import { CLASS_LIST } from '../data/classes.js'
import { SKILLS, skillCooldown } from '../data/skills.js'
import { RARITIES } from '../data/items.js'
import { ACHIEVEMENTS } from '../systems/SaveSystem.js'
import { TILE, TILE_SIZE, TileMap } from '../world/TileMap.js'
import { pieceInfo, CLS_NAMES, PIECES, computeTileVisuals, buildVisualLUT } from '../world/TileVisuals.js'

const FLOORISH_UI = new Set([TILE.FLOOR, TILE.STAIRS, TILE.HAZARD, TILE.PLATE, TILE.PLATE_DOWN, TILE.GATE])
const TILE_NAMES = Object.fromEntries(Object.entries(TILE).map(([k, v]) => [v, k]))

/**
 * UI system: pixel-art HUD and all menu screens, drawn through the same
 * sprite batch as the world (screen-space pass). Menus are keyboard/gamepad
 * driven via the same action mapping as gameplay.
 */

const COL = {
	panel: rgba(16, 14, 24, 235),
	panelLight: rgba(34, 30, 48, 235),
	border: rgba(90, 80, 120, 255),
	text: rgba(232, 226, 240, 255),
	dim: rgba(140, 132, 160, 255),
	gold: rgba(232, 181, 58, 255),
	hp: rgba(200, 56, 56, 255),
	hpBack: rgba(60, 20, 20, 255),
	mana: rgba(59, 110, 214, 255),
	manaBack: rgba(18, 28, 60, 255),
	xp: rgba(120, 200, 80, 255),
	shield: rgba(210, 200, 150, 255),
	sel: rgba(255, 230, 140, 255),
	danger: rgba(255, 90, 90, 255),
	good: rgba(100, 220, 120, 255),
}

export class UI {
	constructor(game) {
		this.game = game
		this.sel = 0 // generic menu cursor
		this.subSel = 0
		this.tab = 0 // inventory tabs: 0 gear, 1 character, 2 skills
		this.toasts = [] // {text, color, t}
		this.banner = null // {text, t}
		this.hurtFlash = 0
		this.chronoT = 0
		this.shopOpen = null // shop prop being browsed
		this.menuT = 0
	}

	toast(text, color = COL.text) {
		// dedupe: repeating an active toast refreshes it instead of stacking
		const dup = this.toasts.find((t) => t.text === text)
		if (dup) {
			dup.t = 3.2
			return
		}
		this.toasts.push({ text, color, t: 3.2 })
		if (this.toasts.length > 4) this.toasts.shift()
	}

	bossBanner(text) {
		this.banner = { text, t: 3 }
	}

	update(dt) {
		this.menuT += dt
		this.hurtFlash = Math.max(0, this.hurtFlash - dt)
		this.chronoT = Math.max(0, this.chronoT - dt)
		if (this.banner) {
			this.banner.t -= dt
			if (this.banner.t <= 0) this.banner = null
		}
		for (let i = this.toasts.length - 1; i >= 0; i--) {
			this.toasts[i].t -= dt
			if (this.toasts[i].t <= 0) this.toasts.splice(i, 1)
		}
	}

	// =============================================================== rendering

	render() {
		const game = this.game
		const r = game.renderer
		r.beginUI()

		switch (game.state) {
			case 'menu': this.drawMainMenu(r); break
			case 'classSelect': this.drawClassSelect(r); break
			case 'playing': this.drawHUD(r); break
			case 'paused': this.drawHUD(r); this.drawPause(r); break
			case 'inventory': this.drawHUD(r); this.drawInventory(r); break
			case 'settings': this.drawSettings(r); break
			case 'stats': this.drawStats(r); break
			case 'shop': this.drawHUD(r); this.drawShop(r); break
			case 'debug': this.drawHUD(r); this.drawDebug(r); break
			case 'assetPreview': this.drawAssetPreview(r); break
			case 'dead': this.drawDeath(r); break
			case 'victory': this.drawVictory(r); break
			case 'editor': this.game.editor.drawUI(r); break
		}

		if (game.debugWalls && game.world && game.state === 'playing') this.drawWallInspector(r)
		if (!game.world?.conformance) this.drawToasts(r)
		r.flush()
	}

	/** Dev: wall-resolver diagnostics for the tile under the mouse cursor. */
	drawWallInspector(r) {
		const game = this.game
		const map = game.world.map
		if (!map.visCls) return
		const wx = game.camera.renderX + game.input.mouseX
		const wy = game.camera.renderY + game.input.mouseY
		const tx = Math.floor(wx / 16)
		const ty = Math.floor(wy / 16)
		if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return
		const i = ty * map.w + tx
		const p0 = pieceInfo(map.vis0[i])
		const p1 = pieceInfo(map.vis1[i])
		const mask =
			(FLOORISH_UI.has(map.get(tx, ty - 1)) ? 'N' : '-') +
			(FLOORISH_UI.has(map.get(tx, ty + 1)) ? 'S' : '-') +
			(FLOORISH_UI.has(map.get(tx - 1, ty)) ? 'W' : '-') +
			(FLOORISH_UI.has(map.get(tx + 1, ty)) ? 'E' : '-')
		const lines = [
			`cell ${tx},${ty}  tile=${TILE_NAMES[map.get(tx, ty)] ?? map.get(tx, ty)}`,
			`floor mask ${mask}`,
			`class ${CLS_NAMES[map.visCls[i]] ?? '?'}${map.visFlag[i] & 1 ? ' [FALLBACK]' : ''}${map.visFlag[i] & 2 ? ' [ERROR]' : ''}`,
			`base  ${p0 ? `${p0.name} @ (${p0.cell[0]},${p0.cell[1]})` : '-'}`,
			`over  ${p1 ? `${p1.name} @ (${p1.cell[0]},${p1.cell[1]})` : '-'}`,
		]
		const x = 6
		const y = r.viewH - 6 - lines.length * 8
		r.rect(x - 2, y - 2, 150, lines.length * 8 + 4, rgba(8, 6, 14, 220))
		for (let li = 0; li < lines.length; li++) {
			r.text(lines[li], x, y + li * 8, rgba(180, 240, 255, 255))
		}
		// highlight the inspected cell
		r.flush()
		r.beginWorld(game.camera)
		r.rectOutline(tx * 16, ty * 16, 16, 16, rgba(120, 255, 255, 255))
		r.flush()
		r.beginUI()
	}

	panel(r, x, y, w, h, title = null) {
		r.rect(x, y, w, h, COL.panel)
		r.rectOutline(x, y, w, h, COL.border)
		if (title) {
			r.rect(x, y, w, 12, COL.panelLight)
			r.text(title, x + w / 2, y + 2, COL.sel, 1, 'center')
		}
	}

	bar(r, x, y, w, h, frac, color, back) {
		r.rect(x, y, w, h, back)
		r.rect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, frac)), h - 2, color)
		r.rectOutline(x, y, w, h, COL.border)
	}

	// ---- HUD (Diablo-style: orbs in the corners, skill belt at the bottom) ------

	/** Liquid-filled orb: dark glass sphere filling from the bottom. */
	orb(r, cx, cy, radius, frac, color, darkColor) {
		r.circleFill(cx, cy, radius, rgba(12, 10, 18, 220))
		const level = cy + radius - Math.min(1, Math.max(0, frac)) * 2 * radius
		const step = 2
		for (let y = -radius; y < radius; y += step) {
			const sy = cy + y
			if (sy + step < level) continue
			const half = Math.sqrt(Math.max(0, radius * radius - y * y))
			// slightly darker liquid near the bottom for depth
			r.rect(cx - half, Math.max(sy, level), half * 2, step - (Math.max(sy, level) - sy), y > radius * 0.3 ? darkColor : color)
		}
		// glass shine + rim
		r.rect(cx - radius * 0.45, cy - radius * 0.65, radius * 0.35, 2, rgba(255, 255, 255, 60))
		r.circleOutline(cx, cy, radius, COL.border, 1, 28)
	}

	drawHUD(r) {
		const game = this.game
		const p = game.player
		if (!p) return
		// conformance test map renders clean: nothing but the wall grammar
		if (game.world?.conformance) return
		const vw = r.viewW
		const vh = r.viewH

		this.drawMinimap(r)
		this.drawBossBar(r)

		// ---- bottom belt ----
		const orbR = 19
		const beltY = vh - 26

		// health orb (left) + mana orb (right)
		this.orb(r, 26, vh - 26, orbR, p.hp / p.maxHp, COL.hp, rgba(140, 30, 30, 255))
		r.text(`${Math.ceil(p.hp)}`, 26, vh - 30, COL.text, 1, 'center')
		r.text(`LV${p.level}`, 26, vh - 50, COL.gold, 1, 'center')
		if (p.shieldHp > 0) {
			r.circleOutline(26, vh - 26, orbR + 2, withAlpha(COL.shield, 0.8), 1, 28)
		}
		this.orb(r, vw - 26, vh - 26, orbR, p.mana / p.maxMana, COL.mana, rgba(24, 50, 140, 255))
		r.text(`${Math.ceil(p.mana)}`, vw - 26, vh - 30, COL.text, 1, 'center')

		// skill belt + potions, centered
		const size = 18
		const slots = p.skills.length + 2
		const totalW = slots * (size + 4) + 8
		let x = (vw - totalW) / 2
		const y = beltY - size / 2
		r.rect(x - 6, y - 4, totalW + 12, size + 10, rgba(12, 10, 18, 200))
		r.rectOutline(x - 6, y - 4, totalW + 12, size + 10, COL.border)

		for (let i = 0; i < p.skills.length; i++) {
			const slot = p.skills[i]
			const def = SKILLS[slot.id]
			r.rect(x, y, size, size, COL.panel)
			r.rectOutline(x, y, size, size, COL.border)
			r.sprite(def.icon, x + size / 2, y + size / 2)
			if (slot.cd > 0) {
				const maxCd = skillCooldown(def, slot.level) * (1 - p.cdr)
				const frac = slot.cd / maxCd
				r.rect(x, y + size * (1 - frac), size, size * frac, rgba(0, 0, 0, 170))
				r.text(slot.cd.toFixed(0), x + size / 2, y + 5, COL.text, 1, 'center')
			} else if (p.mana < def.mana) {
				r.rect(x, y, size, size, rgba(20, 30, 80, 150))
			}
			r.text(`${i + 1}`, x + 2, y + size - 7, COL.dim)
			x += size + 4
		}
		// potion slots
		x += 8
		for (const [icon, key, count] of [['potion_red', 'Q', p.potions.hp], ['potion_blue', 'R', p.potions.mp]]) {
			r.rect(x, y, size, size, COL.panel)
			r.rectOutline(x, y, size, size, COL.border)
			r.sprite(icon, x + size / 2, y + size / 2 - 1, count > 0 ? 0xffffffff : rgba(90, 90, 90, 255))
			r.text(`${count}`, x + size - 4, y + size - 7, count > 0 ? COL.text : COL.dim, 1, 'center')
			r.text(key, x + 2, y + size - 7, COL.dim)
			x += size + 4
		}

		// gold next to the belt
		r.sprite('coin', (vw - totalW) / 2 - 24, beltY)
		r.text(`${p.gold}`, (vw - totalW) / 2 - 16, beltY - 3, COL.gold)

		// combo pips above the belt
		if (p.comboTimer > 0 && p.comboCount > 0) {
			const px = vw / 2 - 10
			for (let i = 0; i < 3; i++) {
				const lit = i < p.comboCount
				r.rect(px + i * 8, beltY - size - 8, 6, 3, lit ? COL.gold : rgba(60, 55, 75, 255))
			}
		}

		// XP strip along the very bottom
		r.rect(0, vh - 3, vw, 3, rgba(20, 30, 16, 255))
		r.rect(0, vh - 3, vw * (p.xp / p.xpNext), 3, COL.xp)

		// attribute/skill point reminder
		if (p.attrPoints > 0 || p.skillPoints > 0) {
			if (Math.sin(this.menuT * 5) > 0) {
				r.text('[TAB] points to spend!', vw / 2, beltY - size - 20, COL.sel, 1, 'center')
			}
		}

		// floor / wave label (top, small — the view stays clear)
		const label = game.mode === 'custom' ? 'CUSTOM MAP — TEST' :
			game.mode === 'endless' ? `ARENA — WAVE ${game.endless.wave}` :
			`FLOOR ${game.floor} — ${game.world.biome.name}`
		r.text(label, vw / 2, 4, COL.dim, 1, 'center')

		// interact prompt
		if (game.interactPrompt) {
			r.text(`[E] ${game.interactPrompt}`, vw / 2, vh - 64, COL.sel, 1, 'center')
		}

		// debug/perf overlay
		if (game.showPerf) {
			r.text(`fps ${game.loop.fps} · draw ${r.drawCalls} · enemies ${game.world.enemies.length} · fx ${game.particles.pool.active.length}`, 4, 4, COL.dim)
			if (game.godMode) r.text('GOD MODE', 4, 14, COL.gold)
		} else if (game.godMode) {
			r.text('GOD MODE', 4, 4, COL.gold)
		}

		// hurt vignette + low hp warning
		if (this.hurtFlash > 0) {
			r.rect(0, 0, vw, vh, withAlpha(rgba(255, 40, 40, 90), this.hurtFlash * 2))
		}
		if (p.hp / p.maxHp < 0.25 && !p.dead) {
			const a = 0.25 + 0.2 * Math.sin(this.menuT * 6)
			r.rectOutline(1, 1, vw - 2, vh - 2, withAlpha(COL.danger, a), 2)
		}
		// chrono (time-slow) tint
		if (this.chronoT > 0) {
			r.rect(0, 0, vw, vh, rgba(180, 60, 200, 26))
		}
		// perfect-dodge witch time: cool blue wash
		if (game.witchTimeT > 0) {
			r.rect(0, 0, vw, vh, withAlpha(rgba(120, 200, 255, 30), Math.min(1, game.witchTimeT * 2)))
		}

		// boss banner
		if (this.banner) {
			const a = Math.min(1, this.banner.t)
			r.textBig(this.banner.text, vw / 2, vh * 0.3, withAlpha(rgba(255, 80, 80, 255), a), 1.5, 'center')
		}
	}

	drawMinimap(r) {
		const game = this.game
		const world = game.world
		const map = world.map
		const mw = 76
		const mh = 62
		const x0 = r.viewW - mw - 6
		const y0 = 6
		r.rect(x0, y0, mw, mh, rgba(10, 8, 16, 200))
		r.rectOutline(x0, y0, mw, mh, COL.border)

		const step = 2 // sample every 2 tiles
		const sx = (mw - 4) / (map.w / step)
		const sy = (mh - 4) / (map.h / step)
		for (let ty = 0; ty < map.h; ty += step) {
			for (let tx = 0; tx < map.w; tx += step) {
				if (!map.explored[ty * map.w + tx]) continue
				const t = map.get(tx, ty)
				if (t === TILE.VOID || t === TILE.WALL || t === TILE.CRACK) continue
				let c = rgba(90, 84, 110, 255)
				if (t === TILE.STAIRS) c = rgba(120, 240, 255, 255)
				else if (t === TILE.HAZARD) c = rgba(180, 80, 40, 255)
				else if (t === TILE.GATE) c = rgba(255, 210, 90, 255)
				r.rect(x0 + 2 + (tx / step) * sx, y0 + 2 + (ty / step) * sy, Math.max(1, sx), Math.max(1, sy), c)
			}
		}
		// player dot
		const px = x0 + 2 + (game.player.x / TILE_SIZE / step) * sx
		const py = y0 + 2 + (game.player.y / TILE_SIZE / step) * sy
		r.rect(px - 1, py - 1, 2, 2, rgba(120, 255, 120, 255))
		// boss dot
		if (world.boss && !world.boss.dead) {
			r.rect(x0 + 2 + (world.boss.x / TILE_SIZE / step) * sx - 1, y0 + 2 + (world.boss.y / TILE_SIZE / step) * sy - 1, 3, 3, COL.danger)
		}
	}

	drawBossBar(r) {
		const world = this.game.world
		const boss = world.boss
		if (!boss || boss.dead) return
		const w = Math.min(220, r.viewW - 180)
		const x = (r.viewW - w) / 2
		const y = 28
		r.textBig(boss.bossDef.name, r.viewW / 2, y - 14, COL.danger, 1, 'center')
		this.bar(r, x, y, w, 8, boss.hp / boss.maxHp, COL.hp, COL.hpBack)
		// phase pips
		const phases = boss.bossDef.phases.length
		for (let i = 1; i < phases; i++) {
			const frac = boss.bossDef.phases[i - 1].hpAbove
			r.rect(x + w * frac, y, 1, 8, rgba(255, 255, 255, 120))
		}
		// posture bar: fill it to break the boss' stance
		const bm = this.game.bossManager
		const poiseMax = boss.bossDef.poise ?? 200
		if (bm.staggeredT > 0) {
			const flash = Math.floor(this.menuT * 10) % 2 === 0
			this.bar(r, x + w * 0.15, y + 10, w * 0.7, 4, 1, flash ? rgba(122, 232, 255, 255) : rgba(255, 255, 255, 255), rgba(20, 30, 40, 255))
		} else {
			this.bar(r, x + w * 0.15, y + 10, w * 0.7, 4, bm.stagger / poiseMax, rgba(232, 181, 58, 255), rgba(40, 32, 14, 255))
		}
	}

	drawToasts(r) {
		let y = r.viewH - 76
		for (let i = this.toasts.length - 1; i >= 0; i--) {
			const t = this.toasts[i]
			const a = Math.min(1, t.t)
			r.text(t.text, r.viewW / 2, y, withAlpha(t.color, a), 1, 'center')
			y -= 11
		}
	}

	// ---- screens ------------------------------------------------------------------

	drawMainMenu(r) {
		const game = this.game
		const cx = r.viewW / 2
		const cy = r.viewH / 2

		// animated title backdrop
		r.rect(0, 0, r.viewW, r.viewH, rgba(10, 8, 18, 255))
		for (let i = 0; i < 24; i++) {
			const t = this.menuT * 0.3 + i * 1.7
			const x = (Math.sin(t) * 0.5 + 0.5) * r.viewW
			const y = ((i * 53 + this.menuT * 6) % (r.viewH + 20)) - 10
			r.rect(x, y, 2, 2, rgba(120, 100, 200, 60))
		}

		r.textBig('DUNGEON', cx, cy - 88, rgba(232, 181, 58, 255), 2.5, 'center')
		r.textBig('DEPTHS', cx, cy - 54, rgba(180, 120, 255, 255), 2.5, 'center')
		r.text('a roguelite dungeon crawler', cx, cy - 16, COL.dim, 1, 'center')

		const items = [
			{ label: 'Arena — Wave Survival', enabled: true },
			{ label: 'Dungeon Run', enabled: true },
			{ label: 'Map Editor', enabled: true },
			{ label: 'Records & Achievements', enabled: true },
			{ label: 'Settings', enabled: true },
		]
		this.drawMenuList(r, items, cx, cy + 8, this.sel)

		r.text('WASD move · SPACE attack · SHIFT dodge · 1-4 skills · E interact', cx, r.viewH - 26, COL.dim, 1, 'center')
		r.text('F fullscreen · gamepad supported', cx, r.viewH - 13, COL.dim, 1, 'center')
	}

	drawMenuList(r, items, cx, y, sel) {
		for (let i = 0; i < items.length; i++) {
			const it = items[i]
			const selected = i === sel
			const color = !it.enabled ? COL.dim : selected ? COL.sel : COL.text
			if (selected) r.text('>', cx - r.measureText(it.label) / 2 - 10, y, COL.sel)
			r.text(it.label, cx, y, color, 1, 'center')
			y += 13
		}
	}

	drawClassSelect(r) {
		const game = this.game
		const cx = r.viewW / 2
		r.rect(0, 0, r.viewW, r.viewH, rgba(10, 8, 18, 255))
		r.textBig(game.pendingMode === 'endless' ? 'ENDLESS MODE — CHOOSE YOUR HERO' : 'CHOOSE YOUR HERO', cx, 10, COL.sel, 1, 'center')

		const n = CLASS_LIST.length
		const cardW = 56
		const gap = 6
		const totalW = n * cardW + (n - 1) * gap
		let x = cx - totalW / 2

		for (let i = 0; i < n; i++) {
			const c = CLASS_LIST[i]
			const unlocked = game.save.isClassUnlocked(c)
			const selected = i === this.sel
			const y = 34
			r.rect(x, y, cardW, 64, selected ? COL.panelLight : COL.panel)
			r.rectOutline(x, y, cardW, 64, selected ? COL.sel : COL.border)
			const bob = selected ? Math.sin(this.menuT * 4) * 2 : 0
			r.animSprite(c.sprite, this.menuT, x + cardW / 2, y + 24 + bob, unlocked ? 0xffffffff : rgba(60, 60, 60, 255), 0, false, 2, selected ? 6 : 3)
			r.text(unlocked ? c.name : '???', x + cardW / 2, y + 50, unlocked ? COL.text : COL.dim, 1, 'center')
			x += cardW + gap
		}

		// details of selected
		const c = CLASS_LIST[this.sel]
		const unlocked = game.save.isClassUnlocked(c)
		const py = 108
		this.panel(r, cx - 130, py, 260, 96)
		if (unlocked) {
			r.text(c.name, cx, py + 6, COL.sel, 1.2, 'center')
			const lines = c.desc.split('\n')
			lines.forEach((line, i) => r.text(line, cx, py + 22 + i * 10, COL.text, 1, 'center'))
			r.text(`HP ${c.hp}   Mana ${c.mana}   Speed ${c.speed}`, cx, py + 46, COL.dim, 1, 'center')
			r.text(`Weapon: ${c.weapon.name}`, cx, py + 58, COL.dim, 1, 'center')
			r.text(`Passive — ${c.passive.name}: ${c.passive.desc}`, cx, py + 70, COL.good, 1, 'center')
			const skills = c.skills.map((s) => SKILLS[s.id].name).join(' · ')
			r.text(skills, cx, py + 82, COL.mana, 1, 'center')
		} else {
			r.text('LOCKED', cx, py + 30, COL.dim, 1.4, 'center')
			r.text(c.unlock.hint, cx, py + 54, COL.text, 1, 'center')
		}

		r.text('ENTER select · ESC back', cx, r.viewH - 14, COL.dim, 1, 'center')
	}

	drawPause(r) {
		const cx = r.viewW / 2
		const cy = r.viewH / 2
		r.rect(0, 0, r.viewW, r.viewH, rgba(0, 0, 0, 150))
		this.panel(r, cx - 70, cy - 50, 140, 100, 'PAUSED')
		const items = [
			{ label: 'Resume', enabled: true },
			{ label: 'Character & Items', enabled: true },
			{ label: 'Settings', enabled: true },
			{ label: this.game.mode === 'custom' ? 'Back to Editor' : 'Abandon Run', enabled: true },
		]
		this.drawMenuList(r, items, cx, cy - 28, this.sel)
	}

	drawSettings(r) {
		const game = this.game
		const s = game.save.settings
		const cx = r.viewW / 2
		const cy = r.viewH / 2
		r.rect(0, 0, r.viewW, r.viewH, rgba(10, 8, 18, game.runActive ? 150 : 255))
		this.panel(r, cx - 100, cy - 62, 200, 124, 'SETTINGS')

		const rows = [
			{ label: 'Master Volume', value: s.volumes.master },
			{ label: 'Music Volume', value: s.volumes.music },
			{ label: 'SFX Volume', value: s.volumes.sfx },
			{ label: 'Screen Shake', value: s.screenShake ? 'ON' : 'OFF' },
			{ label: 'Level Scaling', value: s.levelScaling ? 'ON' : 'OFF' },
			{ label: 'Fullscreen', value: document.fullscreenElement ? 'ON' : 'OFF' },
			{ label: 'Back', value: '' },
		]
		let y = cy - 42
		for (let i = 0; i < rows.length; i++) {
			const selected = i === this.sel
			const color = selected ? COL.sel : COL.text
			r.text(rows[i].label, cx - 88, y, color)
			if (typeof rows[i].value === 'number') {
				// slider
				const sx = cx + 18
				const sw = 62
				r.rect(sx, y + 2, sw, 4, COL.manaBack)
				r.rect(sx, y + 2, sw * rows[i].value, 4, selected ? COL.sel : COL.mana)
			} else {
				r.text(String(rows[i].value), cx + 50, y, color)
			}
			y += 16
		}
		r.text('LEFT/RIGHT adjust · ENTER toggle · ESC back', cx, cy + 48, COL.dim, 1, 'center')
	}

	drawStats(r) {
		const game = this.game
		const cx = r.viewW / 2
		r.rect(0, 0, r.viewW, r.viewH, rgba(10, 8, 18, 255))
		r.textBig('RECORDS & ACHIEVEMENTS', cx, 6, COL.sel, 1, 'center')

		const st = game.save.data.stats
		const hs = game.save.data.highscores
		this.panel(r, 10, 26, r.viewW / 2 - 16, 96, 'STATISTICS')
		const stats = [
			`Enemies slain: ${st.kills}`,
			`Bosses defeated: ${st.bossKills}`,
			`Deepest floor: ${st.floorsReached}`,
			`Gold collected: ${st.goldCollected}`,
			`Chests opened: ${st.chestsOpened}`,
			`Secrets found: ${st.secretsFound}`,
			`Deaths: ${st.deaths}`,
		]
		stats.forEach((line, i) => r.text(line, 16, 42 + i * 10, COL.text))

		this.panel(r, r.viewW / 2 + 6, 26, r.viewW / 2 - 16, 96, 'HIGH SCORES')
		const scores = [
			`Best floor: ${hs.bestFloor}`,
			`Best level: ${hs.bestLevel}`,
			`Most kills (run): ${hs.mostKillsRun}`,
			`Best endless wave: ${hs.bestEndlessWave}`,
		]
		scores.forEach((line, i) => r.text(line, r.viewW / 2 + 12, 42 + i * 10, COL.text))

		// achievements grid
		const done = game.save.data.achievements
		this.panel(r, 10, 128, r.viewW - 20, r.viewH - 148, `ACHIEVEMENTS (${done.length}/${ACHIEVEMENTS.length})`)
		let y = 144
		let x = 16
		const colW = (r.viewW - 32) / 2
		ACHIEVEMENTS.forEach((a, i) => {
			const unlocked = done.includes(a.id)
			r.text(`${unlocked ? '*' : 'o'} ${a.name}`, x, y, unlocked ? COL.gold : COL.dim)
			r.text(a.desc, x + 8, y + 9, unlocked ? COL.text : COL.dim)
			y += 21
			if (y > r.viewH - 34 && x < colW) {
				y = 144
				x += colW
			}
		})
		r.text('ESC back', r.viewW / 2, r.viewH - 12, COL.dim, 1, 'center')
	}

	// ---- inventory / character ------------------------------------------------------

	drawInventory(r) {
		const game = this.game
		const p = game.player
		r.rect(0, 0, r.viewW, r.viewH, rgba(0, 0, 0, 170))
		const cx = r.viewW / 2

		const tabs = ['EQUIPMENT', 'CHARACTER', 'SKILLS']
		// measured layout so tab labels never collide regardless of font
		const gap = 14
		const total = tabs.reduce((w, t) => w + r.measureText(t, 1, true) + gap, -gap)
		let tx = cx - total / 2
		tabs.forEach((t, i) => {
			r.textBig(t, tx, 6, i === this.tab ? COL.sel : COL.dim)
			tx += r.measureText(t, 1, true) + gap
		})
		r.text('Q/E or L/R switch tabs', cx, r.viewH - 12, COL.dim, 1, 'center')

		if (this.tab === 0) this.drawGearTab(r)
		else if (this.tab === 1) this.drawCharacterTab(r)
		else this.drawSkillsTab(r)
	}

	drawGearTab(r) {
		const game = this.game
		const p = game.player
		const left = 12
		// equipped panel
		this.panel(r, left, 20, 96, 92, 'EQUIPPED')
		const slots = ['weapon', 'armor', 'ring', 'boots', 'relic']
		slots.forEach((slot, i) => {
			const item = p.equipment[slot]
			const y = 36 + i * 14
			r.text(slot, left + 6, y, COL.dim)
			if (item) {
				r.sprite(item.icon, left + 48, y + 4)
				r.text(item.name.slice(0, 8), left + 56, y, RARITIES[item.rarity].color)
			} else {
				r.text('-', left + 52, y, COL.dim)
			}
		})

		// inventory grid 6x4
		const gx = left + 104
		const gy = 20
		this.panel(r, gx, gy, 6 * 20 + 10, 4 * 20 + 24, `BAG (${p.inventory.length}/24)`)
		for (let i = 0; i < 24; i++) {
			const col = i % 6
			const row = (i / 6) | 0
			const x = gx + 6 + col * 20
			const y = gy + 17 + row * 20
			const selected = i === this.sel
			r.rect(x, y, 18, 18, selected ? COL.panelLight : rgba(24, 20, 36, 255))
			r.rectOutline(x, y, 18, 18, selected ? COL.sel : COL.border)
			const item = p.inventory[i]
			if (item) r.sprite(item.icon, x + 9, y + 9)
		}

		// item details
		const item = p.inventory[this.sel]
		const dx = gx + 6 * 20 + 18
		this.panel(r, dx, gy, r.viewW - dx - 10, 4 * 20 + 24)
		if (item) {
			r.text(item.name, dx + 6, gy + 6, RARITIES[item.rarity].color)
			r.text(RARITIES[item.rarity].name + ' ' + item.slot, dx + 6, gy + 17, COL.dim)
			r.text(`${item.stat} +${item.statValue}`, dx + 6, gy + 30, COL.text)
			item.affixes.forEach((af, i) => {
				r.text(af.text, dx + 6, gy + 42 + i * 10, COL.good)
			})
			r.text('ENTER equip · X sell', dx + 6, gy + 92, COL.dim)
			// comparison with equipped
			const equipped = p.equipment[item.slot]
			if (equipped) {
				const diff = item.statValue - equipped.statValue
				r.text(`vs equipped: ${diff >= 0 ? '+' : ''}${diff}`, dx + 6, gy + 80, diff >= 0 ? COL.good : COL.danger)
			}
		} else {
			r.text('empty slot', dx + 6, gy + 6, COL.dim)
		}
	}

	drawCharacterTab(r) {
		const game = this.game
		const p = game.player
		const cx = r.viewW / 2
		this.panel(r, cx - 120, 20, 116, 120, 'ATTRIBUTES')
		r.text(`Points: ${p.attrPoints}`, cx - 112, 36, p.attrPoints > 0 ? COL.sel : COL.dim)
		const attrs = [
			['str', 'Strength', 'melee damage'],
			['dex', 'Dexterity', 'crit + atk speed'],
			['int', 'Intellect', 'skills + mana'],
			['vit', 'Vitality', 'health + defense'],
		]
		attrs.forEach(([key, label, hint], i) => {
			const y = 48 + i * 22
			const selected = this.sel === i
			r.text(`${selected ? '>' : ' '}${label}`, cx - 116, y, selected ? COL.sel : COL.text)
			r.text(`${p.attributes[key]}`, cx - 30, y, COL.gold)
			r.text(hint, cx - 112, y + 11, COL.dim)
		})

		this.panel(r, cx + 4, 20, 116, 120, 'STATS')
		const rows = [
			`Damage: ${p.attackDamage}`,
			`Crit: ${(p.critChance * 100).toFixed(0)}% x${p.critMult}`,
			`Defense: ${p.defense}`,
			`Speed: ${p.moveSpeed.toFixed(0)}`,
			`Skill power: ${(p.skillPower * 100).toFixed(0)}%`,
			`CDR: ${(p.cdr * 100).toFixed(0)}%`,
			`Lifesteal: ${(p.lifesteal * 100).toFixed(0)}%`,
		]
		rows.forEach((line, i) => r.text(line, cx + 10, 36 + i * 12, COL.text))
		r.text('ENTER spend point', cx, 150, COL.dim, 1, 'center')
	}

	drawSkillsTab(r) {
		const game = this.game
		const p = game.player
		const cx = r.viewW / 2
		this.panel(r, cx - 130, 20, 260, 140, `SKILLS (points: ${p.skillPoints})`)
		p.skills.forEach((slot, i) => {
			const def = SKILLS[slot.id]
			const y = 38 + i * 24
			const selected = this.sel === i
			r.sprite(def.icon, cx - 116, y + 4)
			r.text(`${selected ? '>' : ' '}${def.name}  Lv${slot.level}${slot.level >= 5 ? ' MAX' : ''}`, cx - 104, y, selected ? COL.sel : COL.text)
			r.text(def.desc, cx - 104, y + 10, COL.dim)
		})
		// locked skills preview
		const locked = game.player.classDef.skills.filter((s) => s.unlockLevel > p.level)
		locked.forEach((s, i) => {
			r.text(`? ${SKILLS[s.id].name} — unlocks at level ${s.unlockLevel}`, cx - 104, 38 + (p.skills.length + i) * 24, COL.dim)
		})
		r.text('ENTER upgrade (+25% dmg, -6% cd)', cx, 166, COL.dim, 1, 'center')
	}

	drawShop(r) {
		const game = this.game
		const shop = this.shopOpen
		if (!shop) return
		const cx = r.viewW / 2
		r.rect(0, 0, r.viewW, r.viewH, rgba(0, 0, 0, 150))
		this.panel(r, cx - 110, 30, 220, 130, 'TRAVELING MERCHANT')
		r.text(`Your gold: ${game.player.gold}`, cx, 46, COL.gold, 1, 'center')
		shop.wares.forEach((w, i) => {
			const y = 60 + i * 16
			const selected = i === this.sel
			const afford = game.player.gold >= w.price && !w.sold
			r.sprite(w.icon, cx - 96, y + 4)
			const label = w.sold ? 'SOLD' : w.name
			r.text(`${selected ? '>' : ' '}${label}`, cx - 86, y, w.sold ? COL.dim : selected ? COL.sel : afford ? COL.text : COL.dim)
			if (!w.sold) r.text(`${w.price}g`, cx + 84, y, afford ? COL.gold : COL.danger, 1, 'right')
		})
		r.text('ENTER buy · ESC leave', cx, 148, COL.dim, 1, 'center')
	}

	/**
	 * Dev-only inspector for the v5.2 pack: page 0 = tileset grid, page 1 =
	 * props/enemies, page 2 = animations. Cells are labeled with their grid
	 * coordinates so slicing/mapping mistakes are visible at a glance.
	 */
	drawAssetPreview(r) {
		const game = this.game
		r.rect(0, 0, r.viewW, r.viewH, rgba(16, 14, 24, 255))
		const page = this.previewPage ?? 0
		const titles = ['v5 TILESET rows 0-4', 'v5 TILESET rows 5-9', 'v5 PROPS + ENEMIES (v5p_col_row)', 'v5 ANIMATIONS', 'v5 FLOOR CONFORMANCE']
		r.textBig(titles[page], r.viewW / 2, 8, rgba(255, 220, 140, 255), 1, 'center')
		r.text('LEFT/RIGHT: page   ESC: back', r.viewW / 2, 24, rgba(160, 160, 180, 255), 1, 'center')

		const S = 2 // draw cells at 2x
		const cell = 16 * S
		if (page === 0 || page === 1) {
			const ox = Math.floor((r.viewW - 10 * (cell + 6)) / 2)
			const oy = 44
			const row0 = page * 5
			for (let row = row0; row < row0 + 5; row++) {
				for (let col = 0; col < 10; col++) {
					const x = ox + col * (cell + 6)
					const y = oy + (row - row0) * (cell + 14)
					const reg = r.atlas.regions[`v5t_${col}_${row}`]
					if (!reg) continue
					r.rectOutline(x - 1, y - 1, cell + 2, cell + 2, rgba(60, 55, 80, 255))
					r.draw(reg, x, y, cell, cell)
					r.text(`${col},${row}`, x + cell / 2, y + cell + 1, rgba(140, 140, 165, 255), 1, 'center')
				}
			}
		} else if (page === 2) {
			const ox = Math.floor((r.viewW - 12 * (cell + 6)) / 2)
			const oy = 44
			for (let row = 0; row < 5; row++) {
				for (let col = 0; col < 12; col++) {
					const x = ox + col * (cell + 6)
					const y = oy + row * (cell + 14)
					const reg = r.atlas.regions[`v5p_${col}_${row}`]
					if (!reg) continue
					r.rectOutline(x - 1, y - 1, cell + 2, cell + 2, rgba(60, 55, 80, 255))
					r.draw(reg, x, y, cell, cell)
					r.text(`${col},${row}`, x + cell / 2, y + cell + 1, rgba(120, 120, 140, 255), 1, 'center')
				}
			}
			for (let i = 0; i < 4; i++) {
				const x = ox + i * (cell + 10)
				const y = oy + 5 * (cell + 14) + 4
				const reg = r.atlas.regions[`v5e_${i}`]
				if (!reg) continue
				r.draw(reg, x, y, cell, cell)
				r.text(`e${i}`, x + cell / 2, y + cell + 1, rgba(120, 120, 140, 255), 1, 'center')
			}
		} else if (page === 4) {
			this.drawFloorConformance(r)
		} else {
			const anims = [
				'v5_torch', 'v5_torch_light', 'v5_gate', 'v5_peaks', 'v5_chest',
				'v5_chest_small', 'v5_coin', 'v5_key_gold', 'v5_key_silver',
				'v5_flag_blue', 'v5_flag_red',
			]
			const perRow = 6
			for (let i = 0; i < anims.length; i++) {
				const name = anims[i]
				const frames = r.atlas.anims[name]
				if (!frames) continue
				const x = 40 + (i % perRow) * 100
				const y = 52 + Math.floor(i / perRow) * 100
				const f0 = frames[0]
				const w = f0.w * S
				const h = f0.h * S
				r.rectOutline(x - 2, y - 2, w + 4, h + 4, rgba(60, 55, 80, 255))
				// draw current frame at 2x plus the full frame strip at 1x under it
				const fi = Math.floor(this.menuT * 8) % frames.length
				r.draw(frames[fi], x, y, w, h)
				for (let j = 0; j < frames.length; j++) {
					r.draw(frames[j], x + j * (f0.w + 1), y + h + 6, f0.w, f0.h)
				}
				r.text(`${name} x${frames.length}`, x, y + h + 6 + f0.h + 2, rgba(150, 150, 170, 255))
			}
		}
	}

	/**
	 * Floor conformance exhibits: standalone pieces, assembled motifs, a
	 * quiet base field, a production-density field from the real resolver,
	 * and a deliberately orphaned quadrant marked as an error fixture.
	 */
	drawFloorConformance(r) {
		const cell = (name, idx) => r.atlas.regions[`v5t_${PIECES[name][idx][0]}_${PIECES[name][idx][1]}`]
		const label = (t, x, y, c = rgba(150, 150, 170, 255)) => r.text(t, x, y, c)
		const S = 2
		let x = 14
		const y0 = 38

		// 1-2: standalone base + wear, labeled with atlas coords
		for (const [name, count] of [['floor', 3], ['floorWear', 1]]) {
			for (let i = 0; i < count; i++) {
				const reg = cell(name, i)
				r.rectOutline(x - 1, y0 - 1, 34, 34, rgba(60, 55, 80, 255))
				r.draw(reg, x, y0, 32, 32)
				label(`${name === 'floor' ? 'base' : 'wear'}`, x, y0 + 36)
				label(`${PIECES[name][i][0]},${PIECES[name][i][1]}`, x, y0 + 44)
				x += 44
			}
		}
		x += 12
		// 3: motifs assembled atomically
		for (const name of ['motifMottled', 'motifSlab']) {
			for (let q = 0; q < 4; q++) {
				r.draw(cell(name, q), x + (q % 2) * 16 * S, y0 + Math.floor(q / 2) * 16 * S, 16 * S, 16 * S)
			}
			r.rectOutline(x - 1, y0 - 1, 32 * S + 2, 32 * S + 2, rgba(90, 200, 120, 255))
			label(name, x, y0 + 32 * S + 4, rgba(120, 220, 150, 255))
			label(`${PIECES[name].map(([c, rr]) => `${c},${rr}`).join(' ')}`, x, y0 + 32 * S + 12)
			x += 32 * S + 26
		}
		// 7: deliberately orphaned quadrant = error fixture
		r.draw(cell('motifMottled', 0), x, y0, 32, 32)
		r.rectOutline(x - 2, y0 - 2, 36, 36, rgba(255, 0, 255, 255))
		label('ORPHAN QUADRANT', x - 4, y0 + 36, rgba(255, 80, 255, 255))
		label('= FORBIDDEN', x - 4, y0 + 44, rgba(255, 80, 255, 255))
		x += 60
		// big panel: cataloged, unused in production
		for (let qy = 0; qy < 3; qy++) {
			for (let qx = 0; qx < 4; qx++) {
				r.draw(r.atlas.regions[`v5t_${6 + qx}_${2 + qy}`], x + qx * 16, y0 + qy * 16, 16, 16)
			}
		}
		r.rectOutline(x - 1, y0 - 1, 66, 50, rgba(200, 180, 90, 255))
		label('4x3 panel (cataloged,', x, y0 + 52, rgba(220, 200, 120, 255))
		label('unused in production)', x, y0 + 60)

		// 4: quiet base field (hash-picked, exactly the production base pool)
		const fy = 128
		label('QUIET BASE FIELD (base pool only)', 14, fy - 8, rgba(255, 230, 150, 255))
		for (let ty = 0; ty < 5; ty++) {
			for (let tx = 0; tx < 22; tx++) {
				const pool = PIECES.floor
				const [c, rr] = pool[(tx * 7 + ty * 13) % pool.length]
				r.draw(r.atlas.regions[`v5t_${c}_${rr}`], 14 + tx * 16, fy + ty * 16, 16, 16)
			}
		}

		// 5: production-density field straight from the resolver
		const py = 240
		label('PRODUCTION DENSITY (real resolver, seed 777, incl. borders + motifs)', 14, py - 8, rgba(255, 230, 150, 255))
		if (!this._floorField) {
			const m = new TileMap(36, 8)
			for (let ty = 1; ty < 7; ty++) for (let tx = 1; tx < 35; tx++) m.set(tx, ty, TILE.FLOOR)
			for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 36; tx++) {
				if (m.get(tx, ty) === TILE.VOID) {
					let touch = false
					for (let oy = -1; oy <= 1 && !touch; oy++) for (let ox = -1; ox <= 1; ox++) if (m.get(tx + ox, ty + oy) === TILE.FLOOR) { touch = true; break }
					if (touch) m.set(tx, ty, TILE.WALL)
				}
			}
			computeTileVisuals(m, [], 777)
			this._floorField = m
		}
		const lut = buildVisualLUT(r.atlas, 'crypt')
		if (lut) {
			const m = this._floorField
			for (let ty = 0; ty < m.h; ty++) {
				for (let tx = 0; tx < m.w; tx++) {
					const p0 = m.vis0[ty * m.w + tx]
					const p1 = m.vis1[ty * m.w + tx]
					if (p0) r.draw(lut[p0 - 1], 14 + tx * 16, py + ty * 16, 16, 16)
					if (p1) r.draw(lut[p1 - 1], 14 + tx * 16, py + ty * 16, 16, 16)
				}
			}
			label(`motifs placed: ${m.visMotifs.length}`, 14, py + 8 * 16 + 4, rgba(120, 220, 150, 255))
		}
	}

	drawDebug(r) {
		const game = this.game
		const actions = game.debugActions()
		const w = 170
		const h = actions.length * 9 + 26
		const x = 10
		const y = 16
		r.rect(0, 0, r.viewW, r.viewH, rgba(0, 0, 0, 120))
		this.panel(r, x, y, w, h, 'DEBUG')
		actions.forEach((a, i) => {
			const selected = i === this.sel
			r.text(`${selected ? '>' : ' '}${a.label}`, x + 6, y + 17 + i * 9, selected ? COL.sel : a.label.includes('(!)') ? COL.danger : COL.text)
		})
		r.text('ENTER apply · ` / ESC close', x + 6, y + h - 9, COL.dim)
	}

	drawDeath(r) {
		const game = this.game
		const cx = r.viewW / 2
		const cy = r.viewH / 2
		r.rect(0, 0, r.viewW, r.viewH, rgba(20, 4, 8, 230))
		r.textBig('YOU DIED', cx, cy - 64, COL.danger, 2, 'center')
		const run = game.runSummary || {}
		const lines = [
			run.wave != null ? `Wave reached: ${run.wave}` : `Floor reached: ${run.floor ?? 1}`,
			`Level: ${run.level ?? 1}`,
			`Enemies slain: ${run.kills ?? 0}`,
			`Gold collected: ${run.gold ?? 0}`,
			run.newBest ? 'NEW BEST FLOOR!' : '',
		]
		lines.forEach((l, i) => l && r.text(l, cx, cy - 24 + i * 12, i === 4 ? COL.gold : COL.text, 1, 'center'))
		this.drawMenuList(r, [{ label: 'Try Again', enabled: true }, { label: 'Main Menu', enabled: true }], cx, cy + 44, this.sel)
	}

	drawVictory(r) {
		const game = this.game
		const cx = r.viewW / 2
		const cy = r.viewH / 2
		r.rect(0, 0, r.viewW, r.viewH, rgba(8, 6, 20, 235))
		for (let i = 0; i < 40; i++) {
			const t = this.menuT + i * 0.61
			const x = (Math.sin(t * 0.7 + i) * 0.5 + 0.5) * r.viewW
			const y = ((i * 37 + this.menuT * 20) % r.viewH)
			r.rect(x, y, 2, 2, rgba(232, 181, 58, 120))
		}
		r.textBig('VICTORY!', cx, cy - 68, COL.gold, 2, 'center')
		r.text('The Void Sovereign is no more.', cx, cy - 34, COL.text, 1, 'center')
		r.text('The depths below are endless... how far can you go?', cx, cy - 22, COL.dim, 1, 'center')
		this.drawMenuList(r, [
			{ label: 'Descend into Endless Mode', enabled: true },
			{ label: 'Return to Menu', enabled: true },
		], cx, cy + 8, this.sel)
	}
}
