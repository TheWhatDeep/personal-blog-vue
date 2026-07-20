import { ObjectPool } from '../core/ObjectPool.js'
import { SpatialGrid } from '../core/SpatialGrid.js'
import { createEnemy } from '../entities/Enemy.js'
import { TILE, TILE_SIZE } from './TileMap.js'
import { dist } from '../core/MathUtil.js'

/**
 * Runtime state of the current dungeon floor: tilemap, rooms, entities,
 * pooled projectiles / floating combat text, dynamic hazard zones and
 * boss telegraphs. Systems (physics, combat, AI, ...) operate on this.
 */
export class World {
	constructor(game, dungeon) {
		this.game = game
		this.map = dungeon.map
		this.rooms = dungeon.rooms
		this.corridors = dungeon.corridors
		this.biome = dungeon.biome
		this.floor = dungeon.floor
		this.isBossFloor = dungeon.isBoss
		this.arena = dungeon.arena || null
		this.playerStart = dungeon.playerStart

		this.enemies = []
		this.props = [] // chests, barrels, shrines, shop, torches, portal
		this.pickups = []
		this.hazards = [] // dynamic zones (poison clouds, lava pools, webs, void)
		this.telegraphs = [] // boss attack warnings
		this.effects = [] // short-lived visuals: slash sprites, lightning lines, rings
		this.puzzles = []
		this.boss = null
		this.grid = new SpatialGrid(48)

		this.projectiles = new ObjectPool(
			() => ({}),
			(p) => {
				p.dead = false
				p.pierce = 0
				p.status = null
				p.explode = false
				p.radius = 0
				p.colors = null
				p.rot = 0
				p.spin = 0
			},
			128
		)

		this.texts = new ObjectPool(
			() => ({}),
			(t) => {
				t.t = 0
			},
			64
		)

		this.instantiate(dungeon.spawns)
	}

	instantiate(spawns) {
		for (const s of spawns) {
			switch (s.kind) {
				case 'enemy':
					this.spawnEnemy(s.id, s.x, s.y, { elite: s.elite, room: s.room ?? -1 })
					break
				case 'boss':
					// deferred: BossManager spawns when the player enters the arena
					this.pendingBoss = s
					break
				case 'chest':
					this.props.push({ kind: 'chest', x: s.x, y: s.y, r: 8, opened: false, locked: !!s.locked, room: s.room ?? -1, rarityBonus: s.rarityBonus ?? 0 })
					break
				case 'barrel':
					this.props.push({ kind: 'barrel', x: s.x, y: s.y, r: 6, hp: 1, dead: false })
					break
				case 'shrine':
					this.props.push({ kind: 'shrine', x: s.x, y: s.y, r: 8, used: false })
					break
				case 'shop':
					this.props.push({ kind: 'shop', x: s.x, y: s.y, r: 8, wares: this.game.loot.generateShopWares(this.floor) })
					break
				case 'torch':
					this.props.push({ kind: 'torch', x: s.x, y: s.y, r: 4, t: Math.random() * 10 })
					break
				case 'gold':
					this.dropPickup('gold', s.x, s.y, { amount: s.amount })
					break
				case 'puzzle':
					this.puzzles.push({ room: s.room, plates: s.plates.map((p) => ({ ...p, pressed: false })), done: false, x: s.x, y: s.y })
					break
			}
		}
	}

	spawnEnemy(id, x, y, opts = {}) {
		const e = createEnemy(id, x, y, opts)
		this.enemies.push(e)
		return e
	}

	/**
	 * Spawn a projectile. opts: {x, y, angle, speed, damage, team, sprite,
	 * range, pierce, status, explode, radius, colors, spin}
	 */
	fireProjectile(opts) {
		const p = this.projectiles.obtain()
		p.kind = 'projectile'
		p.x = opts.x
		p.y = opts.y
		p.vx = Math.cos(opts.angle) * opts.speed
		p.vy = Math.sin(opts.angle) * opts.speed
		p.rot = opts.angle
		p.spin = opts.spin ?? 0
		p.r = opts.r ?? 3
		p.damage = opts.damage
		p.team = opts.team
		p.sprite = opts.sprite ?? 'orb_fire'
		p.life = (opts.range ?? 200) / opts.speed
		p.pierce = opts.pierce ?? 0
		p.status = opts.status ?? null
		p.explode = opts.explode ?? false
		p.radius = opts.radius ?? 0
		p.colors = opts.colors ?? null
		p.crit = opts.crit ?? false
		return p
	}

	addHazard(opts) {
		this.hazards.push({
			x: opts.x, y: opts.y, r: opts.r,
			kind: opts.kind, // poison | lava | web | void | cloud
			damage: opts.damage ?? 0,
			tick: opts.tick ?? 0.5,
			timer: 0,
			duration: opts.duration ?? 5,
			team: opts.team ?? 'enemy', // team that placed it (damages the other side)
			status: opts.status ?? null,
			color: opts.color ?? 0x664ad27a,
		})
	}

	addTelegraph(opts) {
		this.telegraphs.push({
			shape: opts.shape ?? 'circle',
			x: opts.x, y: opts.y, r: opts.r ?? 20,
			x2: opts.x2 ?? 0, y2: opts.y2 ?? 0, width: opts.width ?? 6,
			t: 0,
			dur: opts.dur ?? 0.8,
			color: opts.color ?? 0x40ffffff,
			onDone: opts.onDone ?? null,
			follow: opts.follow ?? null, // entity to track (rotating beams)
			angle: opts.angle ?? 0,
			length: opts.length ?? 0,
		})
		this.game.audio.play('telegraph', 0.6)
	}

	floatText(x, y, text, color = 0xffffffff, scale = 1) {
		const t = this.texts.obtain()
		t.x = x + (Math.random() - 0.5) * 8
		t.y = y
		t.vy = -28
		t.text = text
		t.color = color
		t.scale = scale
		t.t = 0
		t.dur = 0.8
	}

	dropPickup(type, x, y, opts = {}) {
		const a = Math.random() * Math.PI * 2
		const spd = 30 + Math.random() * 40
		this.pickups.push({
			type, // gold | heart | mana | potion_hp | potion_mp | item
			x, y,
			vx: Math.cos(a) * spd,
			vy: Math.sin(a) * spd,
			r: 5,
			amount: opts.amount ?? 1,
			item: opts.item ?? null,
			age: 0,
		})
	}

	/** Rooms the player currently stands in get discovered (for minimap + spawns). */
	roomAt(x, y) {
		const tx = x / TILE_SIZE
		const ty = y / TILE_SIZE
		for (const r of this.rooms) {
			if (tx >= r.x - 0.5 && tx <= r.x + r.w + 0.5 && ty >= r.y - 0.5 && ty <= r.y + r.h + 0.5) return r
		}
		return null
	}

	checkRoomCleared(roomIndex) {
		if (roomIndex < 0) return
		const room = this.rooms[roomIndex]
		if (!room || room.cleared) return
		const remaining = this.enemies.some((e) => !e.dead && e.room === roomIndex && e.team === 'enemy')
		if (!remaining) {
			room.cleared = true
			// unlock this room's chest
			for (const p of this.props) {
				if (p.kind === 'chest' && p.room === roomIndex) p.locked = false
			}
			this.game.audio.play('chest')
		}
	}

	update(dt) {
		const game = this.game
		const player = game.player

		this._updateProjectiles(dt)
		this._updateHazards(dt)
		for (let i = this.effects.length - 1; i >= 0; i--) {
			const fx = this.effects[i]
			fx.t += dt
			if (fx.t >= fx.dur) this.effects.splice(i, 1)
		}
		this._updateTelegraphs(dt)
		this._updatePickups(dt, player)
		this._updateTexts(dt)
		this._updatePuzzles(player)

		for (const prop of this.props) {
			if (prop.kind === 'torch') {
				prop.t += dt
				if (Math.random() < dt * 8) {
					game.particles.burst({ x: prop.x, y: prop.y - 5, count: 1, color: [0xff2a8aff, 0xff66d1ff], speed: 8, life: 0.4, gravity: -30, jitter: 2 })
				}
			}
		}

		// discover rooms + reveal map around player
		const room = this.roomAt(player.x, player.y)
		if (room && !room.discovered) {
			room.discovered = true
			if (room.type === 'secret') {
				game.stats.increment('secretsFound')
				game.ui.toast('You found a secret room!')
			}
		}
		this.map.exploreCircle(player.x, player.y, 6)
	}

	_updateProjectiles(dt) {
		const game = this.game
		const player = game.player
		const active = this.projectiles.active

		for (let i = 0; i < active.length; i++) {
			const p = active[i]
			if (!p.__poolAlive || p.dead) continue
			p.life -= dt
			p.x += p.vx * dt
			p.y += p.vy * dt
			if (p.spin) p.rot += p.spin * dt

			let hit = false
			if (p.life <= 0) hit = true
			else if (this.map.isSolidAt(p.x, p.y)) {
				hit = true
				// projectiles crack secret walls
				const tx = Math.floor(p.x / TILE_SIZE)
				const ty = Math.floor(p.y / TILE_SIZE)
				if (this.map.get(tx, ty) === TILE.CRACK) this.breakCrack(tx, ty)
			} else if (p.team === 'player') {
				// vs enemies (spatial grid rebuilt by physics each tick)
				let target = null
				this.grid.query(p.x, p.y, p.r + 10, (e) => {
					if (target || e.dead || e.team !== 'enemy') return
					const rr = p.r + e.r
					if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) target = e
				})
				if (target) {
					game.combat.damageEntity(target, p.damage, { crit: p.crit, status: p.status, knockback: 60, kx: p.vx, ky: p.vy })
					if (p.pierce > 0) p.pierce--
					else hit = true
				}
				// vs breakable props
				if (!hit) {
					for (const prop of this.props) {
						if (prop.kind === 'barrel' && !prop.dead && dist(prop.x, prop.y, p.x, p.y) < prop.r + p.r) {
							game.combat.breakBarrel(prop)
							hit = true
							break
						}
					}
				}
			} else {
				// vs player
				const rr = p.r + player.r
				if (!player.dead && (player.x - p.x) ** 2 + (player.y - p.y) ** 2 < rr * rr) {
					game.combat.damagePlayer(p.damage, { status: p.status, kx: p.vx, ky: p.vy })
					hit = true
				}
				// vs player summons
				if (!hit) {
					let summon = null
					this.grid.query(p.x, p.y, p.r + 10, (e) => {
						if (summon || e.dead || e.team !== 'player') return
						const rr2 = p.r + e.r
						if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr2 * rr2) summon = e
					})
					if (summon) {
						game.combat.damageEntity(summon, p.damage, {})
						hit = true
					}
				}
			}

			if (hit) {
				if (p.explode && p.team === 'player') {
					game.combat.explode(p.x, p.y, p.radius, p.damage, 'player', p.status)
				}
				if (p.colors) {
					game.particles.burst({ x: p.x, y: p.y, count: 6, color: p.colors, speed: 50, life: 0.35 })
				}
				p.dead = true
				this.projectiles.release(p)
			}
		}
		this.projectiles.sweep()
	}

	breakCrack(tx, ty) {
		// break the whole cracked segment
		const stack = [[tx, ty]]
		while (stack.length) {
			const [cx, cy] = stack.pop()
			if (this.map.get(cx, cy) !== TILE.CRACK) continue
			this.map.set(cx, cy, TILE.FLOOR)
			this.game.particles.burst({ x: cx * TILE_SIZE + 8, y: cy * TILE_SIZE + 8, count: 8, color: 0xff8a8a9a, speed: 40, life: 0.5 })
			stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
		}
		this.game.audio.play('explosion', 0.5)
	}

	_updateHazards(dt) {
		const game = this.game
		const player = game.player
		for (let i = this.hazards.length - 1; i >= 0; i--) {
			const h = this.hazards[i]
			h.duration -= dt
			h.timer -= dt
			if (h.duration <= 0) {
				this.hazards.splice(i, 1)
				continue
			}
			if (h.timer <= 0) {
				h.timer = h.tick
				// webs slow instead of damage
				if (h.team === 'enemy') {
					if (!player.dead && dist(player.x, player.y, h.x, h.y) < h.r + player.r) {
						if (h.damage > 0) game.combat.damagePlayer(h.damage, { noKnockback: true })
						if (h.status) game.statusFx.apply(player, h.status)
					}
				} else {
					this.grid.query(h.x, h.y, h.r + 12, (e) => {
						if (e.dead || e.team !== 'enemy') return
						if (dist(e.x, e.y, h.x, h.y) < h.r + e.r) {
							if (h.damage > 0) game.combat.damageEntity(e, h.damage, { noKnockback: true })
							if (h.status) game.statusFx.apply(e, h.status)
						}
					})
				}
				if (Math.random() < 0.7) {
					game.particles.burst({ x: h.x + (Math.random() - 0.5) * h.r * 1.5, y: h.y + (Math.random() - 0.5) * h.r * 1.5, count: 2, color: h.color | 0xff000000, speed: 12, life: 0.5, gravity: -20 })
				}
			}
		}
	}

	_updateTelegraphs(dt) {
		for (let i = this.telegraphs.length - 1; i >= 0; i--) {
			const t = this.telegraphs[i]
			t.t += dt
			if (t.t >= t.dur) {
				this.telegraphs.splice(i, 1)
				if (t.onDone) t.onDone(this.game)
			}
		}
	}

	_updatePickups(dt, player) {
		const game = this.game
		for (let i = this.pickups.length - 1; i >= 0; i--) {
			const p = this.pickups[i]
			p.age += dt
			p.vx *= Math.pow(0.02, dt)
			p.vy *= Math.pow(0.02, dt)
			// magnet toward player
			const d = dist(p.x, p.y, player.x, player.y)
			if (d < 44 && p.age > 0.35) {
				const pull = (44 - d) * 14
				p.vx += ((player.x - p.x) / (d || 1)) * pull * dt * 8
				p.vy += ((player.y - p.y) / (d || 1)) * pull * dt * 8
			}
			p.x += p.vx * dt
			p.y += p.vy * dt

			if (d < player.r + 6 && p.age > 0.25 && !player.dead) {
				if (game.loot.collectPickup(p)) this.pickups.splice(i, 1)
			}
		}
	}

	_updateTexts(dt) {
		const active = this.texts.active
		for (const t of active) {
			if (!t.__poolAlive) continue
			t.t += dt
			t.y += t.vy * dt
			t.vy *= 0.92
			if (t.t >= t.dur) this.texts.release(t)
		}
		this.texts.sweep()
	}

	_updatePuzzles(player) {
		const game = this.game
		for (const puzzle of this.puzzles) {
			if (puzzle.done) continue
			const ptx = Math.floor(player.x / TILE_SIZE)
			const pty = Math.floor(player.y / TILE_SIZE)
			for (const plate of puzzle.plates) {
				if (!plate.pressed && plate.tx === ptx && plate.ty === pty) {
					plate.pressed = true
					this.map.set(plate.tx, plate.ty, TILE.PLATE_DOWN)
					game.audio.play('ui_select')
					game.particles.burst({ x: player.x, y: player.y, count: 6, color: 0xffffd37c, speed: 30, life: 0.4 })
				}
			}
			if (puzzle.plates.length > 0 && puzzle.plates.every((p) => p.pressed)) {
				puzzle.done = true
				this.props.push({ kind: 'chest', x: puzzle.x, y: puzzle.y, r: 8, opened: false, locked: false, rarityBonus: 1 })
				game.audio.play('chest')
				game.ui.toast('The plates click into place... a chest appears!')
			}
		}
	}

	/** All living entities that can be hit (enemies + summons), for AoE queries. */
	livingEnemies() {
		return this.enemies.filter((e) => !e.dead && e.team === 'enemy')
	}
}
