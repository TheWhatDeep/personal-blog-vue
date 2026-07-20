import { rgba, withAlpha } from '../gfx/Renderer.js'
import { CLASS_LIST } from '../data/classes.js'
import { SKILLS, skillCooldown } from '../data/skills.js'
import { RARITIES } from '../data/items.js'
import { ACHIEVEMENTS } from '../systems/SaveSystem.js'
import { TILE, TILE_SIZE } from '../world/TileMap.js'

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
		this.toasts.push({ text, color, t: 3.2 })
		if (this.toasts.length > 5) this.toasts.shift()
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
			case 'dead': this.drawDeath(r); break
			case 'victory': this.drawVictory(r); break
		}

		this.drawToasts(r)
		r.flush()
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

	// ---- HUD -------------------------------------------------------------------

	drawHUD(r) {
		const game = this.game
		const p = game.player
		if (!p) return
		const vw = r.viewW

		// health / mana / xp
		this.bar(r, 8, 8, 90, 9, p.hp / p.maxHp, COL.hp, COL.hpBack)
		r.text(`${Math.ceil(p.hp)}/${p.maxHp}`, 53, 9, COL.text, 1, 'center')
		if (p.shieldHp > 0) {
			this.bar(r, 8, 8, 90, 3, Math.min(1, p.shieldHp / p.maxHp), COL.shield, COL.hpBack)
		}
		this.bar(r, 8, 19, 74, 7, p.mana / p.maxMana, COL.mana, COL.manaBack)
		this.bar(r, 8, 28, 74, 4, p.xp / p.xpNext, COL.xp, rgba(24, 40, 18, 255))
		r.text(`Lv${p.level}`, 86, 19, COL.text)

		// gold + potions
		r.sprite('coin', 14, 42)
		r.text(`${p.gold}`, 22, 38, COL.gold)
		r.sprite('potion_red', 60, 42)
		r.text(`x${p.potions.hp}`, 68, 38, p.potions.hp > 0 ? COL.text : COL.dim)
		r.sprite('potion_blue', 92, 42)
		r.text(`x${p.potions.mp}`, 100, 38, p.potions.mp > 0 ? COL.text : COL.dim)

		// attribute/skill point reminder
		if (p.attrPoints > 0 || p.skillPoints > 0) {
			const pulse = Math.sin(this.menuT * 5) > 0
			if (pulse) r.text('[TAB] points to spend!', 8, 52, COL.sel)
		}

		this.drawSkillSlots(r, p)
		this.drawMinimap(r)
		this.drawBossBar(r)

		// floor / wave label
		const label = game.mode === 'endless'
			? `ENDLESS — WAVE ${game.endless.wave}`
			: `FLOOR ${game.floor} — ${game.world.biome.name}`
		r.text(label, vw / 2, 4, COL.dim, 1, 'center')

		// interact prompt
		if (game.interactPrompt) {
			r.text(`[E] ${game.interactPrompt}`, vw / 2, r.viewH - 46, COL.sel, 1, 'center')
		}

		// combo indicator
		if (p.comboCount > 1 && p.comboTimer > 0) {
			r.text(`COMBO x${p.comboCount}`, vw / 2, r.viewH - 60, COL.gold, 1, 'center')
		}

		// hurt vignette + low hp warning
		if (this.hurtFlash > 0) {
			r.rect(0, 0, vw, r.viewH, withAlpha(rgba(255, 40, 40, 90), this.hurtFlash * 2))
		}
		if (p.hp / p.maxHp < 0.25 && !p.dead) {
			const a = 0.25 + 0.2 * Math.sin(this.menuT * 6)
			r.rectOutline(1, 1, vw - 2, r.viewH - 2, withAlpha(COL.danger, a), 2)
		}
		// chrono (time-slow) tint
		if (this.chronoT > 0) {
			r.rect(0, 0, vw, r.viewH, rgba(180, 60, 200, 26))
		}

		// boss banner
		if (this.banner) {
			const a = Math.min(1, this.banner.t)
			r.text(this.banner.text, vw / 2, r.viewH * 0.3, withAlpha(rgba(255, 80, 80, 255), a), 2, 'center')
		}
	}

	drawSkillSlots(r, p) {
		const game = this.game
		const n = p.skills.length
		const size = 18
		const totalW = n * (size + 4)
		let x = (r.viewW - totalW) / 2
		const y = r.viewH - 26

		for (let i = 0; i < n; i++) {
			const slot = p.skills[i]
			const def = SKILLS[slot.id]
			r.rect(x, y, size, size, COL.panel)
			r.rectOutline(x, y, size, size, COL.border)
			r.sprite(def.icon, x + size / 2, y + size / 2)
			// cooldown sweep
			if (slot.cd > 0) {
				const maxCd = skillCooldown(def, slot.level) * (1 - p.cdr)
				const frac = slot.cd / maxCd
				r.rect(x, y + size * (1 - frac), size, size * frac, rgba(0, 0, 0, 160))
				r.text(slot.cd.toFixed(0), x + size / 2, y + 5, COL.text, 1, 'center')
			} else if (p.mana < def.mana) {
				r.rect(x, y, size, size, rgba(20, 30, 80, 140))
			}
			r.text(`${i + 1}`, x + 2, y + size - 8, COL.dim)
			x += size + 4
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
		const y = 26
		r.text(boss.bossDef.name, r.viewW / 2, y - 11, COL.danger, 1, 'center')
		this.bar(r, x, y, w, 8, boss.hp / boss.maxHp, COL.hp, COL.hpBack)
		// phase pips
		const phases = boss.bossDef.phases.length
		for (let i = 1; i < phases; i++) {
			const frac = boss.bossDef.phases[i - 1].hpAbove
			r.rect(x + w * frac, y, 1, 8, rgba(255, 255, 255, 120))
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

		r.text('DUNGEON', cx, cy - 76, rgba(232, 181, 58, 255), 4, 'center')
		r.text('DEPTHS', cx, cy - 44, rgba(180, 120, 255, 255), 4, 'center')
		r.text('a roguelite dungeon crawler', cx, cy - 16, COL.dim, 1, 'center')

		const endlessUnlocked = game.save.data.endlessUnlocked
		const items = [
			{ label: 'New Run', enabled: true },
			{ label: endlessUnlocked ? 'Endless Mode' : 'Endless Mode (defeat the Void Sovereign)', enabled: endlessUnlocked },
			{ label: 'Records & Achievements', enabled: true },
			{ label: 'Settings', enabled: true },
		]
		this.drawMenuList(r, items, cx, cy + 4, this.sel)

		r.text('WASD move · SPACE attack · SHIFT dodge · 1-4 skills · E interact', cx, r.viewH - 22, COL.dim, 1, 'center')
		r.text('F fullscreen · gamepad supported', cx, r.viewH - 12, COL.dim, 1, 'center')
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
		r.text(game.pendingMode === 'endless' ? 'ENDLESS MODE — CHOOSE YOUR HERO' : 'CHOOSE YOUR HERO', cx, 12, COL.sel, 1.5, 'center')

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
			{ label: 'Abandon Run', enabled: true },
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
		r.text('RECORDS & ACHIEVEMENTS', cx, 8, COL.sel, 1.4, 'center')

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
		let tx = cx - 90
		tabs.forEach((t, i) => {
			r.text(t, tx, 6, i === this.tab ? COL.sel : COL.dim)
			tx += 70
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
			const y = 50 + i * 20
			const selected = this.sel === i
			r.text(`${selected ? '>' : ' '}${label}`, cx - 116, y, selected ? COL.sel : COL.text)
			r.text(`${p.attributes[key]}`, cx - 30, y, COL.gold)
			r.text(hint, cx - 116, y + 9, COL.dim)
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

	drawDeath(r) {
		const game = this.game
		const cx = r.viewW / 2
		const cy = r.viewH / 2
		r.rect(0, 0, r.viewW, r.viewH, rgba(20, 4, 8, 230))
		r.text('YOU DIED', cx, cy - 60, COL.danger, 3, 'center')
		const run = game.runSummary || {}
		const lines = [
			`Floor reached: ${run.floor ?? 1}`,
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
		r.text('VICTORY!', cx, cy - 64, COL.gold, 3, 'center')
		r.text('The Void Sovereign is no more.', cx, cy - 34, COL.text, 1, 'center')
		r.text('The depths below are endless... how far can you go?', cx, cy - 22, COL.dim, 1, 'center')
		this.drawMenuList(r, [
			{ label: 'Descend into Endless Mode', enabled: true },
			{ label: 'Return to Menu', enabled: true },
		], cx, cy + 8, this.sel)
	}
}
