import { GameLoop, STEP } from './core/GameLoop.js'
import { EventBus } from './core/EventBus.js'
import { Rng } from './core/Rng.js'
import { Renderer, rgba, withAlpha } from './gfx/Renderer.js'
import { Atlas } from './gfx/Atlas.js'
import { loadAssetPack, applyAssetPack } from './gfx/AssetPack.js'
import { Camera } from './gfx/Camera.js'
import { ParticleSystem } from './gfx/Particles.js'
import { Input } from './input/Input.js'
import { AudioSystem } from './audio/AudioSystem.js'
import { Player } from './entities/Player.js'
import { World } from './world/World.js'
import { generateDungeon, generateArenaFloor } from './world/DungeonGenerator.js'
import { TILE, TILE_SIZE } from './world/TileMap.js'
import { BIOMES, biomeForFloor, FINAL_FLOOR } from './data/biomes.js'
import { CLASSES, CLASS_LIST } from './data/classes.js'
import { SKILLS } from './data/skills.js'
import { Physics } from './systems/Physics.js'
import { Combat } from './systems/Combat.js'
import { StatusEffects } from './systems/StatusEffects.js'
import { AISystem } from './systems/AISystem.js'
import { SkillSystem } from './systems/SkillSystem.js'
import { LootSystem } from './systems/LootSystem.js'
import { BossManager } from './systems/BossManager.js'
import { EndlessMode } from './systems/EndlessMode.js'
import { SaveSystem } from './systems/SaveSystem.js'
import { UI } from './ui/UI.js'
import { MapEditor } from './editor/MapEditor.js'
import { dist } from './core/MathUtil.js'

/**
 * Game orchestrator: owns the systems, the state machine
 * (menu → classSelect → playing ⇄ paused/inventory/shop → dead/victory)
 * and the render pipeline. Systems communicate through the event bus and
 * shared game reference — no system knows about the internals of another.
 */
export class Game {
	constructor(canvas) {
		this.canvas = canvas
		this.events = new EventBus()
		this.renderer = new Renderer(canvas)
		this.atlas = new Atlas().build(BIOMES)
		this.renderer.setAtlas(this.atlas)

		// Compose the downloaded asset pack over the procedural atlas; if it
		// fails to load, the procedural art above already covers everything.
		loadAssetPack()
			.then((imgs) => {
				applyAssetPack(this.atlas, imgs)
				this.renderer.setAtlas(this.atlas)
			})
			.catch((e) => console.warn('Asset pack unavailable, using procedural art:', e))
		this.camera = new Camera(this.renderer)
		this.particles = new ParticleSystem()
		this.input = new Input(window)
		this.audio = new AudioSystem()
		this.save = new SaveSystem(this)
		this.stats = this.save // alias: stats live in the save system

		this.combat = new Combat(this)
		this.statusFx = new StatusEffects(this)
		this.physics = new Physics(this)
		this.ai = new AISystem(this)
		this.skillSystem = new SkillSystem(this)
		this.loot = new LootSystem(this)
		this.bossManager = new BossManager(this)
		this.endless = new EndlessMode(this)
		this.ui = new UI(this)
		this.editor = new MapEditor(this)
		this.input.attachMouse(canvas, this.renderer)

		this.state = 'menu'
		this.prevState = 'menu'
		this.mode = 'story' // story | endless
		this.pendingMode = 'story'
		this.floor = 1
		this.player = null
		this.world = null
		this.runActive = false
		this.runKills = 0
		this.runSummary = null
		this.interactPrompt = null
		this.interactTarget = null
		this.deathTimer = 0
		this.saveTimer = 0
		this.rng = new Rng()
		this.godMode = false
		this.showPerf = false
		this.hitStop = 0 // brief sim freeze on meaty hits
		this.witchTimeT = 0 // perfect-dodge time dilation

		// apply persisted settings
		const s = this.save.settings
		this.audio.volumes = { ...s.volumes }
		this.camera.shakeEnabled = s.screenShake

		this._wireEvents()

		this.loop = new GameLoop(
			(dt) => this.update(dt),
			() => this.render()
		)

		this._onResize = () => this.renderer.resize()
		window.addEventListener('resize', this._onResize)
	}

	start() {
		this.audio.setTrack('menu')
		this.loop.start()
	}

	destroy() {
		this.loop.stop()
		this.input.destroy()
		this.audio.destroy()
		this.renderer.destroy()
		window.removeEventListener('resize', this._onResize)
		this.save.save()
	}

	_wireEvents() {
		this.events.on('player:died', () => {
			this.stats.increment('deaths')
			this.deathTimer = 1.6
			this.runSummary = {
				wave: this.mode === 'endless' ? this.endless.wave : null,
				floor: this.mode === 'endless' ? this.save.data.highscores.bestFloor : this.floor,
				level: this.player.level,
				kills: this.runKills,
				gold: this.player.gold,
				newBest: this.mode !== 'endless' && this.save.highscore('bestFloor', this.floor),
			}
			this.save.highscore('bestLevel', this.player.level)
			this.save.highscore('mostKillsRun', this.runKills)
			this.save.save()
		})
		this.events.on('player:hurt', () => {
			this.ui.hurtFlash = 0.35
		})
		this.events.on('enemy:died', () => {
			this.runKills++
		})
		this.events.on('boss:died', () => this.bossManager.onBossDied())
	}

	// ============================================================ run lifecycle

	startRun(classId, mode) {
		this.mode = mode
		this.player = new Player(CLASSES[classId])
		this.runActive = true
		this.runKills = 0
		this.floor = 1
		this.stats.increment('runs')
		this.bossManager.reset()
		this.endless.reset()

		if (mode === 'endless') {
			this._loadEndlessArena()
		} else if (mode === 'custom') {
			const dungeon = this.editor.buildDungeon()
			if (!dungeon) {
				this.state = 'editor'
				return
			}
			this.world = new World(this, dungeon)
			this._placePlayer()
			this.audio.setTrack(dungeon.biome.music)
			this.ui.toast('Testing your map — stairs or death return to the editor')
		} else {
			this.loadFloor(1)
		}
		this.state = 'playing'
	}

	/** Leave a custom-map test and return to the editor. */
	exitCustomTest(msg) {
		this.mode = 'story'
		this.runActive = false
		this.player = null
		this.world = null
		this.bossManager.reset()
		this.state = 'editor'
		this.audio.setTrack('menu')
		if (msg) this.editor.toast(msg)
	}

	openEditor() {
		this.state = 'editor'
		this.audio.setTrack('menu')
		this.camera.snapTo(this.editor.camX, this.editor.camY)
	}

	exitEditor() {
		this.state = 'menu'
		this.ui.sel = 0
	}

	/** Continue the current character into endless mode (post-victory). */
	continueToEndless() {
		this.mode = 'endless'
		this.bossManager.reset()
		this._loadEndlessArena()
		this.state = 'playing'
	}

	_loadEndlessArena() {
		const dungeon = generateArenaFloor(this.rng)
		this.world = new World(this, dungeon)
		this._placePlayer()
		this.endless.start()
		this.audio.setTrack('endless')
		this.ui.toast('THE ARENA — survive the waves!', 0xffb06cff)
	}

	loadFloor(floor) {
		this.floor = floor
		this.stats.setMax('floorsReached', floor)
		this.save.highscore('bestFloor', floor)
		this.bossManager.reset()

		const dungeon = generateDungeon(floor, this.rng)
		this.world = new World(this, dungeon)
		this._placePlayer()
		this.audio.setTrack(dungeon.biome.music)
		this.ui.toast(dungeon.isBoss ? 'Something ancient stirs here...' : `Floor ${floor} — ${dungeon.biome.name}`)
		this.particles.clear()
	}

	_placePlayer() {
		const p = this.player
		p.x = this.world.playerStart.x
		p.y = this.world.playerStart.y
		// never spawn inside a solid tile (editor maps, decorated spawn rooms)
		const fixed = this.world.map.depenetrate(p.x, p.y, p.r)
		p.x = fixed.x
		p.y = fixed.y
		p.kbx = p.kby = 0
		p.summons = []
		this.camera.snapTo(p.x, p.y)
	}

	nextFloor() {
		this.audio.play('stairs')
		this.loadFloor(this.floor + 1)
	}

	/**
	 * Souls-like difficulty equalizer: when the player's level exceeds the
	 * floor's expected level, enemies and bosses scale up so clearing
	 * earlier/lower floors while overleveled stays dangerous. Endless mode
	 * has its own wave-based curve and is left alone.
	 */
	levelScaling() {
		if (!this.save.settings.levelScaling || !this.player || this.mode === 'endless') {
			return { hp: 1, dmg: 1 }
		}
		const expected = 1 + (this.floor - 1) * 1.7
		const over = Math.max(0, this.player.level - expected)
		return {
			hp: Math.min(3.2, 1 + over * 0.13),
			dmg: Math.min(2.6, 1 + over * 0.09),
		}
	}

	endRun(toState) {
		this.runActive = false
		this.player = null
		this.world = null
		this.state = toState
		this.ui.sel = 0
		this.audio.setTrack('menu')
	}

	// ============================================================ fixed update

	update(dt) {
		this.input.update()
		if (this.input.anyPressed) this.audio.unlock()

		if (this.input.pressed('fullscreen')) this.toggleFullscreen()

		this.ui.update(dt)
		this.camera.update(dt)
		this.particles.update(dt)

		switch (this.state) {
			case 'playing': this.updatePlaying(dt); break
			case 'menu': this.updateMenu(); break
			case 'classSelect': this.updateClassSelect(); break
			case 'paused': this.updatePaused(); break
			case 'inventory': this.updateInventory(); break
			case 'settings': this.updateSettings(); break
			case 'stats': this.updateStatsScreen(); break
			case 'shop': this.updateShop(); break
			case 'dead': this.updateDeath(); break
			case 'victory': this.updateVictory(); break
			case 'debug': this.updateDebug(); break
			case 'editor': this.editor.update(dt); break
		}

		this.input.consumeAny()

		// periodic autosave of meta progression
		this.saveTimer += dt
		if (this.saveTimer > 10) {
			this.saveTimer = 0
			this.save.data.stats.playtime += 10
			this.save.save()
		}
	}

	updatePlaying(dt) {
		const input = this.input
		const player = this.player

		// hit-stop: freeze the simulation for a few frames on meaty hits
		if (this.hitStop > 0) {
			this.hitStop -= dt
			return
		}
		// perfect-dodge time dilation ticks down in real time
		this.witchTimeT = Math.max(0, (this.witchTimeT ?? 0) - dt)

		// mouse aim: point attacks/skills at the cursor (twin-stick style)
		if (input.mouseAiming && !player.dead) {
			const wx = this.camera.renderX + input.mouseX
			const wy = this.camera.renderY + input.mouseY
			const len = Math.hypot(wx - player.x, wy - player.y) || 1
			input.aimX = (wx - player.x) / len
			input.aimY = (wy - player.y) / len
		}

		if (!player.dead) {
			if (input.pressed('debug')) {
				this.state = 'debug'
				this.ui.sel = 0
				return
			}
			if (input.pressed('pause')) {
				this.state = 'paused'
				this.ui.sel = 0
				return
			}
			if (input.pressed('inventory')) {
				this.state = 'inventory'
				this.ui.sel = 0
				this.ui.tab = 0
				return
			}

			player.update(this, dt)

			if (input.isDown('attack') || input.mouseDown?.[0]) this.combat.playerAttack()
			if (input.pressed('dodge')) player.tryDodge(this)
			if (input.pressed('skill1')) this.skillSystem.cast(0)
			if (input.pressed('skill2')) this.skillSystem.cast(1)
			if (input.pressed('skill3')) this.skillSystem.cast(2)
			if (input.pressed('skill4')) this.skillSystem.cast(3)
			if (input.pressed('potion')) player.usePotion('hp', this)
			if (input.pressed('potion2')) player.usePotion('mp', this)

			this._updateInteraction()
			if (input.pressed('interact') && this.interactTarget) this._doInteract()
			// interacting can end the run (custom-map exit, victory portal)
			if (this.state !== 'playing' || !this.world) return
		}

		this.ai.update(dt)
		this.bossManager.update(dt)
		this.physics.update(dt)
		this.world.update(dt)
		this.statusFx.update(dt)
		if (this.mode === 'endless') this.endless.update(dt)

		this.camera.follow(player.x, player.y, dt)

		// death → summary screen after a beat (custom tests return to the editor)
		if (player.dead && this.deathTimer > 0) {
			this.deathTimer -= dt
			if (this.deathTimer <= 0) {
				if (this.mode === 'custom') this.exitCustomTest('You died — tweak the map and try again!')
				else {
					this.state = 'dead'
					this.ui.sel = 0
				}
			}
		}
	}

	_updateInteraction() {
		const player = this.player
		const world = this.world
		this.interactPrompt = null
		this.interactTarget = null

		// stairs under feet
		if (world.map.tileAt(player.x, player.y) === TILE.STAIRS) {
			this.interactPrompt = 'Descend'
			this.interactTarget = { kind: 'stairs' }
			return
		}

		let best = null
		let bestD = 26
		for (const prop of world.props) {
			if (prop.dead) continue
			const d = dist(player.x, player.y, prop.x, prop.y)
			if (d < bestD) {
				if (prop.kind === 'chest' && !prop.opened) best = prop
				else if (prop.kind === 'shrine' && !prop.used) best = prop
				else if (prop.kind === 'shop') best = prop
				else if (prop.kind === 'portal') best = prop
				else continue
				bestD = d
			}
		}
		if (best) {
			this.interactTarget = best
			this.interactPrompt =
				best.kind === 'chest' ? (best.locked ? 'Locked (clear the room)' : 'Open chest') :
				best.kind === 'shrine' ? 'Pray at the shrine' :
				best.kind === 'shop' ? 'Browse wares' :
				best.kind === 'portal' ? 'Enter the portal' : null
		}
	}

	_doInteract() {
		const t = this.interactTarget
		switch (t.kind) {
			case 'stairs':
				if (this.mode === 'custom') this.exitCustomTest('Map complete! Nice work.')
				else this.nextFloor()
				break
			case 'chest':
				if (!t.locked) this.loot.openChest(t)
				else this.audio.play('error')
				break
			case 'shrine': {
				t.used = true
				const p = this.player
				p.hp = p.maxHp
				p.mana = p.maxMana
				this.audio.play('shrine')
				this.particles.burst({ x: p.x, y: p.y, count: 20, color: [0xfffff67c, 0xffffffff], speed: 50, life: 0.8, gravity: -50 })
				this.ui.toast('You feel restored.')
				break
			}
			case 'shop':
				this.ui.shopOpen = t
				this.ui.sel = 0
				this.state = 'shop'
				break
			case 'portal': {
				// story complete!
				this.runSummary = { floor: this.floor, level: this.player.level, kills: this.runKills, gold: this.player.gold }
				this.state = 'victory'
				this.ui.sel = 0
				this.audio.play('achievement')
				break
			}
		}
	}

	// ============================================================ menu states

	_menuNav(count) {
		const input = this.input
		if (input.pressed('down')) {
			this.ui.sel = (this.ui.sel + 1) % count
			this.audio.play('ui_move')
		}
		if (input.pressed('up')) {
			this.ui.sel = (this.ui.sel - 1 + count) % count
			this.audio.play('ui_move')
		}
	}

	updateMenu() {
		const input = this.input
		this._menuNav(5)
		if (input.pressed('confirm')) {
			this.audio.play('ui_select')
			switch (this.ui.sel) {
				case 0:
					// Arena wave survival: the combat test bed, open from the start
					this.pendingMode = 'endless'
					this.state = 'classSelect'
					this.ui.sel = 0
					break
				case 1:
					this.pendingMode = 'story'
					this.state = 'classSelect'
					this.ui.sel = 0
					break
				case 2:
					this.openEditor()
					break
				case 3:
					this.state = 'stats'
					break
				case 4:
					this.state = 'settings'
					this.prevState = 'menu'
					this.ui.sel = 0
					break
			}
		}
	}

	updateClassSelect() {
		const input = this.input
		const n = CLASS_LIST.length
		if (input.pressed('right')) {
			this.ui.sel = (this.ui.sel + 1) % n
			this.audio.play('ui_move')
		}
		if (input.pressed('left')) {
			this.ui.sel = (this.ui.sel - 1 + n) % n
			this.audio.play('ui_move')
		}
		if (input.pressed('cancel')) {
			this.state = this.pendingMode === 'custom' ? 'editor' : 'menu'
			this.ui.sel = 0
			this.audio.play('ui_back')
			return
		}
		if (input.pressed('confirm')) {
			const c = CLASS_LIST[this.ui.sel]
			if (this.save.isClassUnlocked(c)) {
				this.audio.play('ui_select')
				this.startRun(c.id, this.pendingMode)
			} else {
				this.audio.play('error')
			}
		}
	}

	updatePaused() {
		const input = this.input
		this._menuNav(4)
		if (input.pressed('cancel') || input.pressed('pause')) {
			this.state = 'playing'
			this.audio.play('ui_back')
			return
		}
		if (input.pressed('confirm')) {
			this.audio.play('ui_select')
			switch (this.ui.sel) {
				case 0: this.state = 'playing'; break
				case 1: this.state = 'inventory'; this.ui.sel = 0; this.ui.tab = 0; break
				case 2: this.state = 'settings'; this.prevState = 'paused'; this.ui.sel = 0; break
				case 3:
					if (this.mode === 'custom') this.exitCustomTest()
					else this.endRun('menu')
					break
			}
		}
	}

	updateInventory() {
		const input = this.input
		const ui = this.ui
		const p = this.player

		if (input.pressed('cancel') || input.pressed('inventory') || input.pressed('pause')) {
			this.state = 'playing'
			this.audio.play('ui_back')
			return
		}
		if (input.pressed('potion')) {
			ui.tab = (ui.tab + 2) % 3
			ui.sel = 0
			this.audio.play('ui_move')
		}
		if (input.pressed('interact')) {
			ui.tab = (ui.tab + 1) % 3
			ui.sel = 0
			this.audio.play('ui_move')
		}

		if (ui.tab === 0) {
			// bag grid navigation (6 columns x 4 rows)
			if (input.pressed('right')) ui.sel = Math.min(23, ui.sel + 1)
			if (input.pressed('left')) ui.sel = Math.max(0, ui.sel - 1)
			if (input.pressed('down')) ui.sel = Math.min(23, ui.sel + 6)
			if (input.pressed('up')) ui.sel = Math.max(0, ui.sel - 6)
			if (input.pressed('confirm') && p.inventory[ui.sel]) {
				this.loot.equipFromInventory(ui.sel)
			}
			if (input.pressed('sell') && p.inventory[ui.sel]) {
				this.loot.sellFromInventory(ui.sel)
			}
		} else if (ui.tab === 1) {
			this._menuNav(4)
			if (input.pressed('confirm')) {
				const keys = ['str', 'dex', 'int', 'vit']
				if (p.spendAttribute(keys[ui.sel])) this.audio.play('ui_select')
				else this.audio.play('error')
			}
		} else {
			this._menuNav(Math.max(1, p.skills.length))
			if (input.pressed('confirm')) {
				if (p.upgradeSkill(ui.sel)) this.audio.play('levelup')
				else this.audio.play('error')
			}
		}
	}

	updateSettings() {
		const input = this.input
		const s = this.save.settings
		this._menuNav(7)

		const adjust = (delta) => {
			const vols = ['master', 'music', 'sfx']
			if (this.ui.sel < 3) {
				const key = vols[this.ui.sel]
				s.volumes[key] = Math.round(Math.max(0, Math.min(1, s.volumes[key] + delta)) * 10) / 10
				this.audio.setVolume(key, s.volumes[key])
				this.audio.play('ui_move')
			}
		}
		if (input.pressed('right')) adjust(0.1)
		if (input.pressed('left')) adjust(-0.1)

		if (input.pressed('confirm')) {
			switch (this.ui.sel) {
				case 3:
					s.screenShake = !s.screenShake
					this.camera.shakeEnabled = s.screenShake
					this.audio.play('ui_select')
					break
				case 4:
					s.levelScaling = !s.levelScaling
					this.audio.play('ui_select')
					break
				case 5:
					this.toggleFullscreen()
					break
				case 6:
					this.save.save()
					this.state = this.prevState
					this.ui.sel = 0
					this.audio.play('ui_back')
					break
			}
		}
		if (input.pressed('cancel')) {
			this.save.save()
			this.state = this.prevState
			this.ui.sel = 0
			this.audio.play('ui_back')
		}
	}

	updateStatsScreen() {
		if (this.input.pressed('cancel') || this.input.pressed('confirm')) {
			this.state = 'menu'
			this.audio.play('ui_back')
		}
	}

	updateShop() {
		const input = this.input
		const shop = this.ui.shopOpen
		if (!shop || input.pressed('cancel') || input.pressed('pause')) {
			this.state = 'playing'
			this.ui.shopOpen = null
			this.audio.play('ui_back')
			return
		}
		this._menuNav(shop.wares.length)
		if (input.pressed('confirm')) {
			this.loot.buyWare(shop.wares[this.ui.sel])
		}
	}

	updateDeath() {
		const input = this.input
		this._menuNav(2)
		if (input.pressed('confirm')) {
			this.audio.play('ui_select')
			if (this.ui.sel === 0) {
				// retry with the same class + mode
				const classId = this.player.classDef.id
				this.startRun(classId, this.mode === 'endless' ? 'endless' : 'story')
			} else {
				this.endRun('menu')
			}
		}
	}

	updateVictory() {
		const input = this.input
		this._menuNav(2)
		if (input.pressed('confirm')) {
			this.audio.play('ui_select')
			if (this.ui.sel === 0) this.continueToEndless()
			else this.endRun('menu')
		}
	}

	/** Perfect dodge: rolled through an attack in its final moments. */
	triggerPerfectDodge() {
		if (this.witchTimeT > 0) return
		this.witchTimeT = 1.1
		this.hitStop = Math.max(this.hitStop, 0.05)
		const player = this.player
		player.dodgeCd = 0
		// the world crawls: enemies slowed hard, enemy projectiles crawl
		for (const e of this.world.enemies) {
			if (!e.dead && e.team === 'enemy') this.statusFx.apply(e, { id: 'freeze', duration: 1.1, power: 0.65 })
		}
		this.world.projSlowT = 1.1
		this.world.floatText(player.x, player.y - 14, 'PERFECT!', 0xff7ce8ff, 1.2)
		this.particles.burst({ x: player.x, y: player.y, count: 14, color: [0xffffe9b0, 0xffff8a5a], speed: 70, life: 0.5 })
		this.audio.play('skill_frost', 0.9)
	}

	/** Debug/cheat panel actions ([`] or F9 in a run). Labels are dynamic. */
	debugActions() {
		const p = this.player
		const give = (msg) => this.ui.toast(msg, 0xff3ad2e8)
		return [
			{ label: `God Mode: ${this.godMode ? 'ON' : 'OFF'}`, fn: () => { this.godMode = !this.godMode } },
			{ label: `Perf Overlay: ${this.showPerf ? 'ON' : 'OFF'}`, fn: () => { this.showPerf = !this.showPerf } },
			{ label: '+1,000 Gold', fn: () => { p.gold += 1000; give('+1000g') } },
			{ label: '+5 Attribute Points', fn: () => { p.attrPoints += 5; give('+5 attribute points') } },
			{ label: '+5 Skill Points', fn: () => { p.skillPoints += 5; give('+5 skill points') } },
			{ label: 'Level Up', fn: () => p.addXp(p.xpNext - p.xp, this) },
			{ label: 'Full Heal & Mana', fn: () => { p.hp = p.maxHp; p.mana = p.maxMana } },
			{
				label: 'Give Epic Item', fn: () => {
					const item = this.loot.generateItem(this.floor, { forceRarity: 3, classId: p.classDef.id })
					this.world.dropPickup('item', p.x, p.y - 10, { item })
				},
			},
			{
				label: 'Give Legendary Item', fn: () => {
					const item = this.loot.generateItem(this.floor, { forceRarity: 4, classId: p.classDef.id })
					this.world.dropPickup('item', p.x, p.y - 10, { item })
				},
			},
			{ label: '+5 Potions (each)', fn: () => { p.potions.hp += 5; p.potions.mp += 5; give('+5 potions') } },
			{
				label: 'Learn Random New Skill', fn: () => {
					const known = new Set(p.skills.map((s) => s.id))
					const pool = Object.keys(SKILLS).filter((id) => !known.has(id))
					if (!pool.length || p.skills.length >= 8) return give('No more skill slots')
					const id = pool[Math.floor(Math.random() * pool.length)]
					p.skills.push({ id, level: 1, cd: 0 })
					give(`Learned ${SKILLS[id].name}!`)
				},
			},
			{
				label: 'Remove Last Skill', fn: () => {
					if (p.skills.length > 1) give(`Forgot ${SKILLS[p.skills.pop().id].name}`)
				},
			},
			{ label: 'All Skills +1 Level', fn: () => { for (const s of p.skills) s.level = Math.min(5, s.level + 1) } },
			{
				label: 'Spawn Enemy Pack', fn: () => {
					for (let i = 0; i < 5; i++) {
						const id = this.rng.weighted(this.world.biome.enemies)
						const e = this.world.spawnEnemy(id, p.x + this.rng.range(-60, 60), p.y + this.rng.range(-60, 60))
						e.aggro = true
					}
				},
			},
			{
				label: 'Spawn Elite', fn: () => {
					const id = this.rng.weighted(this.world.biome.enemies)
					const e = this.world.spawnEnemy(id, p.x + 50, p.y, { elite: true })
					e.aggro = true
				},
			},
			{
				label: 'Kill All Enemies', fn: () => {
					for (const e of [...this.world.enemies]) {
						if (!e.dead && e.team === 'enemy') this.combat.killEntity(e)
					}
				},
			},
			{ label: 'Next Floor', fn: () => { if (this.mode === 'story') { this.loadFloor(this.floor + 1); this.state = 'playing' } } },
			{ label: 'Previous Floor', fn: () => { if (this.mode === 'story' && this.floor > 1) { this.loadFloor(this.floor - 1); this.state = 'playing' } } },
			{
				label: 'Go To Boss Floor', fn: () => {
					if (this.mode !== 'story') return
					this.loadFloor(Math.min(FINAL_FLOOR, Math.ceil(this.floor / 3) * 3))
					this.state = 'playing'
				},
			},
			{
				label: 'Unlock Everything', fn: () => {
					this.save.setMax('bossKills', 1)
					this.save.setMax('floorsReached', 6)
					this.save.data.endlessUnlocked = true
					this.save.save()
					give('All classes + endless unlocked')
				},
			},
			{
				label: 'Reset Save (!)', fn: () => {
					localStorage.clear()
					this.save.load()
					give('Save wiped')
				},
			},
		]
	}

	updateDebug() {
		const input = this.input
		const actions = this.debugActions()
		this._menuNav(actions.length)
		if (input.pressed('cancel') || input.pressed('debug') || input.pressed('pause')) {
			this.state = 'playing'
			this.audio.play('ui_back')
			return
		}
		if (input.pressed('confirm')) {
			this.audio.play('ui_select')
			actions[this.ui.sel].fn()
		}
	}

	toggleFullscreen() {
		const el = this.canvas.parentElement || this.canvas
		if (document.fullscreenElement) {
			document.exitFullscreen?.()
		} else {
			el.requestFullscreen?.()
		}
	}

	// ============================================================ rendering

	render() {
		const r = this.renderer
		const inWorld = this.world && this.player &&
			['playing', 'paused', 'inventory', 'shop', 'dead', 'victory'].includes(this.state)

		if (inWorld) {
			const c = this.world.biome.clearColor
			r.clear(c[0], c[1], c[2])
			this.camera.prepare()
			r.beginWorld(this.camera)
			this.renderWorld(r)
			r.flush()
		} else if (this.state === 'editor') {
			r.clear(0.05, 0.04, 0.08)
			this.camera.prepare()
			r.beginWorld(this.camera)
			this.editor.renderWorld(r)
			r.flush()
		} else {
			r.clear(0.04, 0.03, 0.07)
		}

		this.ui.render()
	}

	renderWorld(r) {
		const world = this.world
		const map = world.map
		const cam = this.camera
		const atlas = this.atlas
		const biome = world.biome

		// ---- tiles (culled to camera) ----
		const b = cam.bounds(24)
		const tx0 = Math.max(0, Math.floor(b.x0 / TILE_SIZE))
		const ty0 = Math.max(0, Math.floor(b.y0 / TILE_SIZE))
		const tx1 = Math.min(map.w - 1, Math.ceil(b.x1 / TILE_SIZE))
		const ty1 = Math.min(map.h - 1, Math.ceil(b.y1 / TILE_SIZE))

		const floorR = [atlas.regions[`floor_${biome.id}_0`], atlas.regions[`floor_${biome.id}_1`]]
		const wallR = atlas.regions[`wall_${biome.id}`]
		const hazardR = atlas.regions[`hazard_${biome.id}`]

		for (let ty = ty0; ty <= ty1; ty++) {
			for (let tx = tx0; tx <= tx1; tx++) {
				const t = map.get(tx, ty)
				if (t === TILE.VOID) continue
				const x = tx * TILE_SIZE
				const y = ty * TILE_SIZE
				switch (t) {
					case TILE.FLOOR:
						r.draw(floorR[map.variants[ty * map.w + tx]], x, y, TILE_SIZE, TILE_SIZE)
						break
					case TILE.WALL:
						r.draw(wallR, x, y, TILE_SIZE, TILE_SIZE)
						break
					case TILE.CRACK:
						r.draw(wallR, x, y, TILE_SIZE, TILE_SIZE, rgba(200, 190, 230, 255))
						r.rect(x + 5, y + 3, 1, 9, rgba(20, 18, 28, 255))
						r.rect(x + 9, y + 6, 1, 7, rgba(20, 18, 28, 255))
						break
					case TILE.STAIRS:
						r.draw(floorR[0], x, y, TILE_SIZE, TILE_SIZE)
						r.sprite('stairs', x + 8, y + 8)
						break
					case TILE.HAZARD: {
						const pulse = biome.hazardType === 'lava' ? 0.85 + 0.15 * Math.sin(this.ui.menuT * 3 + tx + ty) : 1
						r.draw(hazardR, x, y, TILE_SIZE, TILE_SIZE, rgba(255 * pulse, 255 * pulse, 255 * pulse, 255))
						if (biome.hazardType === 'spikes') r.sprite('spikes', x + 8, y + 8)
						break
					}
					case TILE.PLATE:
						r.draw(floorR[0], x, y, TILE_SIZE, TILE_SIZE)
						r.rectOutline(x + 4, y + 4, 8, 8, rgba(220, 200, 120, 255))
						break
					case TILE.PLATE_DOWN:
						r.draw(floorR[0], x, y, TILE_SIZE, TILE_SIZE)
						r.rect(x + 4, y + 4, 8, 8, rgba(120, 200, 120, 160))
						break
				}
			}
		}

		// ---- hazard zones ----
		for (const h of world.hazards) {
			if (!cam.isVisible(h.x, h.y, h.r + 16)) continue
			const fade = Math.min(1, h.duration)
			r.circleFill(h.x, h.y, h.r, withAlpha(h.color, fade))
			r.circleOutline(h.x, h.y, h.r, withAlpha(h.color | 0xff000000, 0.35 * fade))
		}

		// ---- telegraphs (attack warnings) ----
		for (const t of world.telegraphs) {
			const prog = t.t / t.dur
			const pulse = 0.35 + 0.3 * Math.sin(this.ui.menuT * 12)
			if (t.shape === 'line') {
				r.line(t.x, t.y, t.x2, t.y2, withAlpha(rgba(255, 60, 60, 255), 0.25 + prog * 0.3), t.width)
			} else {
				r.circleFill(t.x, t.y, t.r * Math.min(1, prog * 1.15), withAlpha(rgba(255, 50, 50, 90), 0.5 + pulse * 0.3))
				r.circleOutline(t.x, t.y, t.r, withAlpha(rgba(255, 80, 80, 255), 0.5 + prog * 0.5))
			}
		}

		// ---- boss beams ----
		const beams = this.bossManager.beams
		if (beams && this.bossManager.boss) {
			const boss = this.bossManager.boss
			const active = beams.telegraphLeft <= 0
			for (let i = 0; i < beams.move.beams; i++) {
				const a = beams.angle + (i / beams.move.beams) * Math.PI * 2
				const ex = boss.x + Math.cos(a) * beams.move.length
				const ey = boss.y + Math.sin(a) * beams.move.length
				if (active) {
					r.line(boss.x, boss.y, ex, ey, rgba(255, 120, 40, 230), 5)
					r.line(boss.x, boss.y, ex, ey, rgba(255, 230, 150, 255), 2)
					if (Math.random() < 0.3) {
						const t = Math.random()
						this.particles.burst({ x: boss.x + (ex - boss.x) * t, y: boss.y + (ey - boss.y) * t, count: 1, color: 0xff2a8aff, speed: 20, life: 0.3 })
					}
				} else {
					r.line(boss.x, boss.y, ex, ey, rgba(255, 80, 80, 90), 2)
				}
			}
		}

		// ---- pickups ----
		for (const p of world.pickups) {
			if (!cam.isVisible(p.x, p.y, 12)) continue
			const bob = Math.sin(p.age * 5) * 1.5
			const sprite =
				p.type === 'gold' ? 'coin' :
				p.type === 'heart' ? 'heart' :
				p.type === 'mana' ? 'mana_gem' :
				p.type === 'potion_hp' ? 'potion_red' :
				p.type === 'potion_mp' ? 'potion_blue' :
				p.type === 'book' ? 'item_tome' :
				p.item ? p.item.icon : 'coin'
			r.animSprite(sprite, p.age, p.x, p.y + bob - 3, 0xffffffff)
			if (p.type === 'item' && p.item && p.item.rarity >= 2) {
				// rarity glimmer for good drops
				r.circleOutline(p.x, p.y - 3, 7 + Math.sin(p.age * 4) * 1.5, withAlpha(RARITY_GLOW[p.item.rarity] ?? 0xffffffff, 0.5))
			}
		}

		// ---- props ----
		for (const prop of world.props) {
			if (prop.dead || !cam.isVisible(prop.x, prop.y, 20)) continue
			switch (prop.kind) {
				case 'chest':
					this._shadow(r, prop.x, prop.y + 4, 10)
					r.sprite(prop.opened ? 'chest_open' : 'chest', prop.x, prop.y, prop.locked ? rgba(150, 130, 170, 255) : 0xffffffff)
					break
				case 'barrel':
					this._shadow(r, prop.x, prop.y + 4, 8)
					r.sprite('barrel', prop.x, prop.y)
					break
				case 'shrine': {
					this._shadow(r, prop.x, prop.y + 5, 10)
					const glow = prop.used ? rgba(120, 120, 120, 255) : 0xffffffff
					r.sprite('shrine', prop.x, prop.y, glow)
					break
				}
				case 'shop':
					this._shadow(r, prop.x, prop.y + 6, 10)
					r.animSprite('shop_npc', prop.t ?? this.ui.menuT, prop.x, prop.y)
					break
				case 'torch':
					r.animSprite('torch', prop.t, prop.x, prop.y, 0xffffffff, 0, false, 1, 8)
					break
				case 'portal': {
					const s = 1 + Math.sin(this.ui.menuT * 3) * 0.08
					r.sprite('portal', prop.x, prop.y, 0xffffffff, this.ui.menuT * 0.8, false, s)
					break
				}
			}
		}

		// ---- entities (y-sorted for correct overlap) ----
		const drawables = []
		for (const e of world.enemies) {
			if (!e.dead && cam.isVisible(e.x, e.y, 32)) drawables.push(e)
		}
		if (!this.player.dead) drawables.push(this.player)
		drawables.sort((a, b) => a.y - b.y)
		for (const e of drawables) {
			if (e.kind === 'player') this._drawPlayer(r, e)
			else this._drawEnemy(r, e)
		}

		// ---- projectiles ----
		for (const p of world.projectiles.active) {
			if (!p.__poolAlive || p.dead) continue
			if (!cam.isVisible(p.x, p.y, 12)) continue
			r.sprite(p.sprite, p.x, p.y, 0xffffffff, p.rot)
		}

		// ---- transient effects ----
		for (const fx of world.effects) {
			if (fx.t < 0) continue
			const a = 1 - fx.t / fx.dur
			if (fx.type === 'anim') {
				// death animations: play through once, fade at the very end
				const frames = this.atlas.anims[fx.name]
				if (frames) {
					const t = Math.min(fx.t, (frames.length - 0.01) / fx.fps)
					const alpha = Math.min(1, a * 4)
					r.animSprite(fx.name, t, fx.x, fx.y, withAlpha(0xffffffff, alpha), 0, fx.flipX, fx.scale ?? 1, fx.fps)
				}
			} else if (fx.type === 'sprite') {
				r.sprite(fx.sprite, fx.x, fx.y, withAlpha(0xffffffff, a), fx.rot, false, fx.scale ?? 1)
			} else if (fx.type === 'line') {
				r.line(fx.x, fx.y, fx.x2, fx.y2, withAlpha(fx.color, a), 2)
				r.line(fx.x, fx.y, fx.x2, fx.y2, withAlpha(0xffffffff, a * 0.8), 1)
			} else if (fx.type === 'ring') {
				const prog = fx.t / fx.dur
				r.circleOutline(fx.x, fx.y, fx.r * prog, withAlpha(fx.color, a), 2)
			}
		}

		this.particles.render(r, cam)

		// ---- damage numbers / floating text ----
		for (const t of world.texts.active) {
			if (!t.__poolAlive) continue
			const a = 1 - t.t / t.dur
			r.text(t.text, t.x, t.y, withAlpha(t.color, a), t.scale, 'center')
		}
	}

	_shadow(r, x, y, w) {
		r.rect(x - w / 2, y, w, 3, rgba(0, 0, 0, 70))
	}

	_drawPlayer(r, p) {
		// i-frame blink
		if (p.iframes > 0 && p.rollTime <= 0 && Math.floor(p.iframes * 14) % 2 === 0) return
		this._shadow(r, p.x, p.y + 5, 10)

		const anims = this.atlas.anims
		const base = p.classDef.sprite
		let rot = 0
		if (p.rollTime > 0) {
			rot = ((0.26 - p.rollTime) / 0.26) * Math.PI * 2 * (p.rollDirX >= 0 ? 1 : -1)
		}

		// pick the animation: attack strip plays once > walk cycle > idle
		let name = base
		let t = p.animT
		let fps = 6
		let ox = 0
		let oy = 0
		if (p.attackAnim > 0 && anims[`${base}_attack`]) {
			// combo stages use distinct swing strips where the pack has them
			let variant = '_attack'
			if (p.attackVariant === 3) variant = anims[`${base}_attack3`] ? '_attack3' : anims[`${base}_attack2`] ? '_attack2' : '_attack'
			else if (p.attackVariant === 2) variant = anims[`${base}_attack2`] ? '_attack2' : '_attack'
			name = base + variant
			const dur = p.attackAnimDur || 0.3
			t = Math.min(dur - p.attackAnim, dur - 0.001)
			fps = anims[name].length / dur
			ox = p.facingX * 1.5 // slight lunge under the swing
			oy = p.facingY * 1.5
		} else if (p.moving && anims[`${base}_walk`]) {
			name = `${base}_walk`
			t = p.walkT
			fps = 12
		}

		const tint = p.flash > 0 ? rgba(255, 90, 90, 255) : 0xffffffff
		r.animSprite(name, t, p.x + ox, p.y - 3 + oy, tint, rot, p.facingX < 0, 1, fps)
		// shield bubble
		if (p.shieldHp > 0) {
			r.circleOutline(p.x, p.y - 2, 11 + Math.sin(this.ui.menuT * 6), withAlpha(rgba(220, 210, 160, 255), 0.6))
		}
	}

	_drawEnemy(r, e) {
		this._shadow(r, e.x, e.y + e.r - 1, e.r * 1.6)
		const def = e.def
		const sprite = e.spriteOverride ?? (e.kind === 'boss' ? e.bossDef.sprite : def.sprite)
		const anims = this.atlas.anims
		const isMoving = Math.abs(e.vx) + Math.abs(e.vy) > 2
		const hasRealWalk = !!anims[`${sprite}_walk`]

		let bob = 0
		if (def.flying) bob = Math.sin(e.animT * 9) * 3
		else if (!hasRealWalk && isMoving) bob = Math.sin(e.animT * 11) * 1.2
		let rot = 0
		let scale = e.scale
		if (e.kind === 'boss') scale = e.scale * (1 + Math.sin(e.animT * 3) * 0.02)

		let tint = e.tint
		if (e.flash > 0) tint = rgba(255, 80, 80, 255)
		else if (e.team === 'player') tint = rgba(140, 220, 255, 255)

		// attack telegraph: red pulse + "!" during the wind-up
		if ((e.attackWindup ?? 0) > 0) {
			if (Math.floor(this.ui.menuT * 14) % 2 === 0) tint = rgba(255, 110, 110, 255)
			r.text('!', e.x, e.y - e.r * 2 - 12, rgba(255, 90, 90, 255), 1, 'center')
		}

		// state-based animation: hurt/flinch > attack strip > walk cycle > idle
		let name = sprite
		let t = e.animT
		let fps = 6
		const attacking = e.kind === 'boss' ? e.attackPoseT > 0 : e.state === 'attack'
		if ((e.flash > 0 || e.state === 'flinch') && anims[`${sprite}_hurt`]) {
			name = `${sprite}_hurt`
			t = 0.12 - e.flash
			fps = 16
		} else if (attacking && anims[`${sprite}_attack`]) {
			name = `${sprite}_attack`
			t = e.kind === 'boss' ? e.animT : e.stateTime
			fps = 12
		} else if ((e.kind === 'boss' ? e.movingT > 0 : isMoving) && anims[`${sprite}_walk`]) {
			name = `${sprite}_walk`
			fps = 12
		}
		r.animSprite(name, t, e.x, e.y - e.r * 0.5 + bob, tint, rot, e.facing < 0, scale, fps)

		// mini health bar when damaged (bosses use the big UI bar)
		if (e.kind !== 'boss' && e.hp < e.maxHp && e.team === 'enemy') {
			const w = 14
			const frac = e.hp / e.maxHp
			r.rect(e.x - w / 2, e.y - e.r - 8, w, 2, rgba(40, 12, 12, 220))
			r.rect(e.x - w / 2, e.y - e.r - 8, w * frac, 2, e.elite ? rgba(255, 210, 80, 255) : rgba(220, 60, 60, 255))
		}
	}
}

const RARITY_GLOW = {
	2: rgba(214, 137, 59, 255),
	3: rgba(216, 79, 176, 255),
	4: rgba(58, 181, 232, 255),
}
