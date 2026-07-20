import { BOSSES } from '../data/bosses.js'
import { TILE, TILE_SIZE } from '../world/TileMap.js'
import { angleTo, dist, TAU } from '../core/MathUtil.js'

/**
 * Boss system. Spawns the biome boss when the player enters the arena,
 * seals the entrance, drives phase-based attack sequences (with telegraphs
 * for every dangerous move), swaps in the boss soundtrack, and hands out
 * unique loot on death.
 *
 * Attack moves are generic executors interpreted from data/bosses.js —
 * a new boss is a new data entry composed from these mechanics.
 */
export class BossManager {
	constructor(game) {
		this.game = game
		this.reset()
	}

	reset() {
		this.boss = null
		this.def = null
		this.phaseIndex = -1
		this.moveIndex = 0
		this.moveTime = 0
		this.moveStarted = false
		this.introT = 0
		this.dmgScale = 1
		this.stagger = 0
		this.staggeredT = 0
		this.spiral = null
		this.beams = null
		this.charging = null
		this.meteorQueue = []
		this.sealTiles = []
	}

	get active() {
		return this.boss && !this.boss.dead
	}

	/** Boss attack damage through the difficulty equalizer. */
	_dmg(amount) {
		return Math.round(amount * (this.dmgScale ?? 1))
	}

	/** Posture damage: filling the meter breaks the boss' stance. */
	addStagger(amount) {
		if (!this.boss || this.staggeredT > 0) return
		this.stagger += amount
		const max = this.def.poise ?? 200
		if (this.stagger >= max) {
			this.stagger = 0
			this.staggeredT = 2.2
			// interrupt everything the boss was doing
			this.spiral = null
			this.beams = null
			this.charging = null
			this.boss.attackPoseT = 0
			this.moveStarted = false
			const g = this.game
			g.world.floatText(this.boss.x, this.boss.y - this.boss.r - 10, 'STAGGERED!', 0xff3ad2ff, 1.3)
			g.particles.burst({ x: this.boss.x, y: this.boss.y, count: 22, color: [0xff3ad2ff, 0xffffffff], speed: 110, life: 0.6 })
			g.camera.shake(0.4)
			g.hitStop = Math.max(g.hitStop, 0.07)
			g.audio.play('boss_roar', 0.7)
		}
	}

	update(dt) {
		const game = this.game
		const world = game.world

		// spawn when the player steps into the arena
		if (world.pendingBoss && !this.boss) {
			const arena = world.arena
			const p = game.player
			const tx = p.x / TILE_SIZE
			const ty = p.y / TILE_SIZE
			if (tx > arena.x + 1 && tx < arena.x + arena.w - 1 && ty > arena.y + 1 && ty < arena.y + arena.h - 2) {
				this._spawn(world.pendingBoss)
				world.pendingBoss = null
			}
		}

		if (!this.boss) return
		const boss = this.boss
		if (boss.dead) return

		boss.animT += dt // seconds clock
		boss.flash = Math.max(0, boss.flash - dt)
		boss.touchTimer = Math.max(0, boss.touchTimer - dt)
		boss.movingT = Math.max(0, (boss.movingT ?? 0) - dt)
		boss.attackPoseT = Math.max(0, (boss.attackPoseT ?? 0) - dt)

		if (this.introT > 0) {
			this.introT -= dt
			return
		}

		// posture broken: the boss reels, takes bonus damage, does nothing
		if (this.staggeredT > 0) {
			this.staggeredT -= dt
			boss.vx = 0
			boss.vy = 0
			return
		}
		// posture slowly recovers while unbroken
		this.stagger = Math.max(0, this.stagger - dt * (this.def.poise ?? 200) * 0.06)

		// phase transitions (bosses grow more aggressive at HP thresholds)
		const frac = boss.hp / boss.maxHp
		let targetPhase = this.def.phases.length - 1
		for (let i = 0; i < this.def.phases.length; i++) {
			if (frac > this.def.phases[i].hpAbove) {
				targetPhase = i
				break
			}
		}
		if (targetPhase !== this.phaseIndex) {
			this.phaseIndex = targetPhase
			this.moveIndex = 0
			this.moveTime = 0
			this.moveStarted = false
			this.spiral = null
			this.beams = null
			if (targetPhase > 0) {
				game.audio.play('boss_roar')
				game.camera.shake(0.5)
				game.ui.toast(`${this.def.name} grows furious!`, 0xff5a5aff)
				game.particles.burst({ x: boss.x, y: boss.y, count: 24, color: [0xffffffff, boss.tint], speed: 120, life: 0.6 })
			}
		}

		const phase = this.def.phases[this.phaseIndex]
		this._runSequence(phase, dt)
		this._updateContinuous(phase, dt)
		this._touchDamage()

		// statuses can slow bosses too (they resist heavily via short durations)
		const mods = game.statusFx.modifiers(boss)
		boss.speedMul = mods.speedMul
	}

	_spawn(spawn) {
		const game = this.game
		const def = BOSSES[spawn.bossId]
		this.def = def

		// endless mode / repeat scaling + souls-like level equalizer
		const scaling = game.levelScaling()
		const hpMul = (spawn.hpMul ?? 1) * scaling.hp
		this.dmgScale = scaling.dmg
		const boss = {
			id: -1,
			kind: 'boss',
			def: { knockbackResist: 0.95, lootTier: 2, flying: false, ai: 'boss' },
			bossDef: def,
			team: 'enemy',
			x: spawn.x, y: spawn.y,
			vx: 0, vy: 0, kbx: 0, kby: 0,
			r: def.radius,
			scale: 1,
			hp: Math.round(def.hp * hpMul),
			maxHp: Math.round(def.hp * hpMul),
			damage: def.touchDamage,
			speed: def.speed,
			xp: def.xp,
			elite: false,
			tint: 0xffffffff,
			state: 'boss',
			stateTime: 0,
			attackTimer: 0,
			touchTimer: 0,
			statuses: [],
			flash: 0,
			animT: 0,
			facing: 1,
			dead: false,
			room: -1,
			lifetime: Infinity,
			aggro: true,
			speedMul: 1,
			movingT: 0,
			attackPoseT: 0,
		}
		this.boss = boss
		game.world.boss = boss
		game.world.enemies.push(boss) // so combat/physics/grid treat it uniformly

		this.introT = 1.8
		this.phaseIndex = 0
		game.audio.setTrack(def.music)
		game.audio.play('boss_roar')
		game.camera.shake(0.6)
		game.ui.bossBanner(def.name)
		game.events.emit('boss:spawned', def.id)

		this._sealArena()
	}

	/** Close the arena entrance behind the player. */
	_sealArena() {
		const world = this.game.world
		const arena = world.arena
		if (!arena) return
		this.sealTiles = []
		const y = arena.y + arena.h
		for (let tx = arena.x; tx < arena.x + arena.w; tx++) {
			for (let ty = y; ty < y + 2; ty++) {
				if (world.map.get(tx, ty) === TILE.FLOOR) {
					world.map.set(tx, ty, TILE.WALL)
					this.sealTiles.push([tx, ty])
				}
			}
		}
	}

	_unsealArena() {
		const world = this.game.world
		for (const [tx, ty] of this.sealTiles) {
			world.map.set(tx, ty, TILE.FLOOR)
		}
		this.sealTiles = []
	}

	_runSequence(phase, dt) {
		const seq = phase.sequence
		const move = seq[this.moveIndex % seq.length]
		const game = this.game
		const boss = this.boss

		if (!this.moveStarted) {
			this.moveStarted = true
			this.moveTime = 0
			this._startMove(move, phase)
		}

		this.moveTime += dt

		// active window (chase / spiral / beam / charge run over time)
		const activeDur = move.dur ?? move.duration ?? (move.telegraph ?? 0)
		if (move.type === 'chase' && this.moveTime < activeDur) {
			const p = game.player
			const a = angleTo(boss.x, boss.y, p.x, p.y)
			const spd = boss.speed * phase.speedMul * (boss.speedMul ?? 1)
			this._moveBoss(Math.cos(a) * spd, Math.sin(a) * spd, dt)
		} else if (move.type !== 'chase' && !this.charging && !this.beams) {
			// gentle drift toward the player while attacking
			const p = game.player
			const d = dist(boss.x, boss.y, p.x, p.y)
			if (d > 60) {
				const a = angleTo(boss.x, boss.y, p.x, p.y)
				const spd = boss.speed * 0.35 * phase.speedMul * (boss.speedMul ?? 1)
				this._moveBoss(Math.cos(a) * spd, Math.sin(a) * spd, dt)
			}
		}

		const total = activeDur + (move.wait ?? 0.3)
		if (this.moveTime >= total && !this.charging && this.meteorQueue.length === 0) {
			this.moveIndex++
			this.moveStarted = false
		}
	}

	_moveBoss(vx, vy, dt) {
		const boss = this.boss
		if (Math.abs(vx) + Math.abs(vy) > 4) boss.movingT = 0.15 // drives walk anim
		const map = this.game.world.map
		const moved = map.moveCircle(boss.x, boss.y, boss.r, (vx + boss.kbx) * dt, (vy + boss.kby) * dt)
		boss.x = moved.x
		boss.y = moved.y
		boss.kbx *= Math.pow(0.0002, dt)
		boss.kby *= Math.pow(0.0002, dt)
		if (vx !== 0) boss.facing = vx > 0 ? 1 : -1
	}

	_startMove(move, phase) {
		const game = this.game
		const world = game.world
		const boss = this.boss
		const player = game.player

		// most attack moves play the boss' attack animation strip
		if (!['chase', 'teleport', 'timeslow'].includes(move.type)) {
			boss.attackPoseT = Math.max(boss.attackPoseT ?? 0, (move.telegraph ?? 0) + 0.8)
		}

		switch (move.type) {
			case 'chase':
				break

			case 'radial': {
				for (let i = 0; i < move.count; i++) {
					const a = (i / move.count) * TAU + Math.random() * 0.2
					world.fireProjectile({
						x: boss.x, y: boss.y, angle: a,
						speed: move.speed, damage: this._dmg(move.damage),
						team: 'enemy', sprite: this.def.projectileSprite,
						range: 300, status: move.status, colors: [0xffb06cff],
					})
				}
				game.audio.play('shoot')
				break
			}

			case 'spiral':
				this.spiral = { timeLeft: move.duration, rate: move.rate, timer: 0, base: Math.random() * TAU, move }
				break

			case 'slam': {
				const sx = boss.x
				const sy = boss.y
				world.addTelegraph({
					x: sx, y: sy, r: move.radius, dur: move.telegraph, color: 0x330000ff,
					onDone: (g) => {
						if (boss.dead) return
						g.camera.shake(0.5)
						g.audio.play('explosion')
						g.particles.burst({ x: boss.x, y: boss.y, count: 24, color: [0xff6a7a8a, 0xffffffff], speed: 130, life: 0.5 })
						const p = g.player
						if (!p.dead && dist(boss.x, boss.y, p.x, p.y) < move.radius + p.r) {
							g.combat.damagePlayer(this._dmg(move.damage), { kx: p.x - boss.x, ky: p.y - boss.y })
						}
						if (move.ring) {
							for (let i = 0; i < move.ring.count; i++) {
								const a = (i / move.ring.count) * TAU
								world.fireProjectile({
									x: boss.x, y: boss.y, angle: a,
									speed: move.ring.speed, damage: this._dmg(move.damage * 0.6),
									team: 'enemy', sprite: this.def.projectileSprite, range: 260,
								})
							}
						}
					},
				})
				break
			}

			case 'meteor': {
				// queue staggered strikes around the player's position
				this.meteorQueue = []
				for (let i = 0; i < move.count; i++) {
					this.meteorQueue.push({ delay: i * move.interval, move })
				}
				break
			}

			case 'beam': {
				const base = angleTo(boss.x, boss.y, player.x, player.y)
				this.beams = {
					telegraphLeft: move.telegraph,
					timeLeft: move.duration,
					angle: base,
					move,
					tickTimer: 0,
				}
				game.audio.play('telegraph')
				break
			}

			case 'charge': {
				const a = angleTo(boss.x, boss.y, player.x, player.y)
				const len = Math.min(160, dist(boss.x, boss.y, player.x, player.y) + 50)
				world.addTelegraph({
					shape: 'line',
					x: boss.x, y: boss.y,
					x2: boss.x + Math.cos(a) * len, y2: boss.y + Math.sin(a) * len,
					width: boss.r * 2, dur: move.telegraph, color: 0x330000ff,
					onDone: () => {
						if (boss.dead) return
						this.charging = { dx: Math.cos(a), dy: Math.sin(a), timeLeft: len / move.speed, move, hit: false }
						game.audio.play('dash')
					},
				})
				break
			}

			case 'summon': {
				const owned = world.enemies.filter((e) => !e.dead && e.summoner === 'boss').length
				const n = Math.min(move.count, (move.max ?? 4) - owned)
				for (let i = 0; i < n; i++) {
					const a = Math.random() * TAU
					const s = world.spawnEnemy(move.id, boss.x + Math.cos(a) * 30, boss.y + Math.sin(a) * 30, {})
					s.summoner = 'boss'
					s.aggro = true
					game.particles.burst({ x: s.x, y: s.y, count: 8, color: 0xffb06cff, speed: 50, life: 0.5 })
				}
				if (n > 0) game.audio.play('skill_summon')
				break
			}

			case 'clones': {
				for (let i = 0; i < move.count; i++) {
					const a = Math.random() * TAU
					const c = world.spawnEnemy('cultist', boss.x + Math.cos(a) * 40, boss.y + Math.sin(a) * 40, {
						hpMul: (boss.maxHp * move.hpFrac) / 24,
						dmgMul: 1.2 * (this.dmgScale ?? 1),
					})
					c.spriteOverride = this.def.sprite
					c.scale = 0.55
					c.summoner = 'boss'
					c.aggro = true
					game.particles.burst({ x: c.x, y: c.y, count: 10, color: 0xffffd38f, speed: 60, life: 0.5 })
				}
				game.audio.play('skill_summon')
				break
			}

			case 'hazard': {
				const arena = world.arena
				const colors = { web: 0x55cfd8e3, poison: 0x554ad27a, lava: 0x552a5aff, void: 0x55b06cff }
				for (let i = 0; i < move.count; i++) {
					const hx = (arena.x + 2 + Math.random() * (arena.w - 4)) * TILE_SIZE
					const hy = (arena.y + 2 + Math.random() * (arena.h - 4)) * TILE_SIZE
					world.addTelegraph({
						x: hx, y: hy, r: move.radius, dur: 0.7, color: 0x2200ffff,
						onDone: (g) => {
							g.world.addHazard({
								x: hx, y: hy, r: move.radius,
								kind: move.kind,
								damage: move.kind === 'web' ? 0 : this._dmg(5),
								tick: 0.5,
								duration: move.duration,
								team: 'enemy',
								status: move.kind === 'web' ? { id: 'freeze', duration: 0.6, power: 0.65 } :
									move.kind === 'poison' ? { id: 'poison', duration: 2, power: 3 } :
									move.kind === 'lava' ? { id: 'burn', duration: 2, power: 4 } : null,
								color: colors[move.kind] ?? 0x55ffffff,
							})
						},
					})
				}
				break
			}

			case 'timeslow': {
				game.statusFx.apply(player, { id: 'chrono', duration: move.duration, power: 1 - move.factor })
				game.ui.toast('Time slows around you...', 0xffff6cd8)
				game.audio.play('skill_frost')
				game.ui.chronoT = move.duration
				break
			}

			case 'teleport': {
				game.particles.burst({ x: boss.x, y: boss.y, count: 16, color: [0xffb06cff, 0xff2a1a4a], speed: 70, life: 0.5 })
				const arena = world.arena
				for (let tries = 0; tries < 20; tries++) {
					const nx = (arena.x + 3 + Math.random() * (arena.w - 6)) * TILE_SIZE
					const ny = (arena.y + 3 + Math.random() * (arena.h - 6)) * TILE_SIZE
					const d = dist(nx, ny, player.x, player.y)
					if (d > 50 && d < 130 && !world.map.isSolidAt(nx, ny)) {
						boss.x = nx
						boss.y = ny
						break
					}
				}
				game.particles.burst({ x: boss.x, y: boss.y, count: 16, color: [0xffb06cff, 0xffffffff], speed: 70, life: 0.5 })
				game.audio.play('dash')
				break
			}
		}
	}

	/** Per-tick continuation of spiral / beams / charge / meteors. */
	_updateContinuous(phase, dt) {
		const game = this.game
		const world = game.world
		const boss = this.boss
		const player = game.player

		// sustained attacks keep the attack animation playing
		if (this.spiral || this.beams || this.charging) {
			boss.attackPoseT = Math.max(boss.attackPoseT, 0.2)
		}

		if (this.spiral) {
			const s = this.spiral
			s.timeLeft -= dt
			s.timer -= dt
			if (s.timer <= 0) {
				s.timer = s.rate
				s.base += 0.37
				for (let arm = 0; arm < s.move.arms; arm++) {
					world.fireProjectile({
						x: boss.x, y: boss.y,
						angle: s.base + (arm / s.move.arms) * TAU,
						speed: s.move.speed, damage: this._dmg(s.move.damage),
						team: 'enemy', sprite: this.def.projectileSprite,
						range: 280, status: s.move.status,
					})
				}
			}
			if (s.timeLeft <= 0) this.spiral = null
		}

		if (this.beams) {
			const b = this.beams
			if (b.telegraphLeft > 0) {
				b.telegraphLeft -= dt
			} else {
				b.timeLeft -= dt
				b.angle += b.move.rotSpeed * dt
				b.tickTimer -= dt
				// damage: distance from player to each beam ray
				if (b.tickTimer <= 0 && !player.dead) {
					for (let i = 0; i < b.move.beams; i++) {
						const a = b.angle + (i / b.move.beams) * TAU
						const d = pointRayDistance(player.x, player.y, boss.x, boss.y, a, b.move.length)
						if (d < 7 + player.r) {
							b.tickTimer = 0.4
							game.combat.damagePlayer(this._dmg(b.move.damage), { kx: player.x - boss.x, ky: player.y - boss.y })
							break
						}
					}
				}
				if (b.timeLeft <= 0) this.beams = null
			}
		}

		if (this.charging) {
			const c = this.charging
			c.timeLeft -= dt
			this._moveBoss(c.dx * c.move.speed, c.dy * c.move.speed, dt)
			game.particles.burst({ x: boss.x, y: boss.y, count: 1, color: 0xffb1a59a, speed: 20, life: 0.3 })
			if (!c.hit && !player.dead && dist(boss.x, boss.y, player.x, player.y) < boss.r + player.r + 2) {
				c.hit = true
				game.combat.damagePlayer(this._dmg(c.move.damage), { kx: c.dx, ky: c.dy })
			}
			if (c.timeLeft <= 0) this.charging = null
		}

		if (this.meteorQueue.length) {
			for (const m of this.meteorQueue) m.delay -= dt
			while (this.meteorQueue.length && this.meteorQueue[0].delay <= 0) {
				const { move } = this.meteorQueue.shift()
				const mx = player.x + (Math.random() - 0.5) * 110
				const my = player.y + (Math.random() - 0.5) * 110
				world.addTelegraph({
					x: mx, y: my, r: move.radius, dur: move.telegraph, color: 0x33005aff,
					onDone: (g) => {
						g.combat.explode(mx, my, move.radius, this._dmg(move.damage), 'enemy', null, [0xff2a8aff, 0xff66d1ff])
					},
				})
			}
		}
	}

	_touchDamage() {
		const game = this.game
		const boss = this.boss
		const player = game.player
		if (player.dead || boss.touchTimer > 0) return
		const rr = boss.r + player.r + 1
		if ((boss.x - player.x) ** 2 + (boss.y - player.y) ** 2 < rr * rr) {
			boss.touchTimer = 1.0
			game.combat.damagePlayer(this._dmg(this.def.touchDamage), { kx: player.x - boss.x, ky: player.y - boss.y })
		}
	}

	/** Called via the 'boss:died' event. */
	onBossDied() {
		const game = this.game
		const world = game.world
		const boss = this.boss
		if (!boss) return

		game.audio.play('boss_die')
		game.camera.shake(0.9)
		game.particles.burst({ x: boss.x, y: boss.y, count: 60, color: [0xffffffff, 0xffb06cff, 0xff3ad2ff], speed: 150, life: 1.0 })

		// clear leftover boss minions + attacks
		for (const e of world.enemies) {
			if (!e.dead && e.summoner === 'boss') game.combat.killEntity(e)
		}
		this.spiral = null
		this.beams = null
		this.charging = null
		this.meteorQueue = []
		world.telegraphs.length = 0
		this._unsealArena()

		game.player.addXp(this.def.xp, game)
		game.loot.bossLoot(boss, this.def)
		game.stats.increment('bossKills')
		if (this.def.id === 'sovereign') game.stats.increment('sovereignKills')

		if (game.mode === 'endless') {
			// endless bosses just award loot; waves continue
		} else if (this.def.id === 'sovereign') {
			// final boss: open the victory portal
			world.props.push({ kind: 'portal', x: boss.x, y: boss.y, r: 10 })
			game.save.data.endlessUnlocked = true
			game.save.save()
			game.ui.toast('A portal to the endless depths opens...', 0xffb06cff)
		} else {
			// reveal stairs down at the arena center
			const arena = world.arena
			world.map.set(Math.floor(arena.cx / TILE_SIZE), Math.floor(arena.cy / TILE_SIZE), TILE.STAIRS)
			game.ui.toast('The way deeper is open!', 0xff7cf6ff)
		}

		game.audio.setTrack(game.mode === 'endless' ? 'endless' : world.biome.music)
		world.boss = null
		this.boss = null
		this.def = null
	}
}

/** Distance from point P to a ray segment starting at O with angle a, length L. */
function pointRayDistance(px, py, ox, oy, angle, length) {
	const dx = Math.cos(angle)
	const dy = Math.sin(angle)
	let t = (px - ox) * dx + (py - oy) * dy
	t = Math.max(0, Math.min(length, t))
	const cx = ox + dx * t
	const cy = oy + dy * t
	return Math.hypot(px - cx, py - cy)
}
