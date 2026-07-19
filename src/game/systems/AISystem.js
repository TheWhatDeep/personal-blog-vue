import { angleTo, dist, TAU } from '../core/MathUtil.js'

/**
 * Enemy AI: a finite state machine (idle → patrol → chase → attack →
 * recover → dead) with per-archetype behavior profiles selected by
 * `def.ai`. Profiles tune how the shared states move and attack — melee,
 * ranged kiter, dash assassin, slam tank, summoner, erratic flyer and
 * walking bomb — so new enemies are data + a profile choice.
 *
 * Player summons run the same FSM with the target flipped to the nearest
 * enemy instead of the player.
 */
export class AISystem {
	constructor(game) {
		this.game = game
	}

	update(dt) {
		const game = this.game
		const world = game.world
		const player = game.player

		for (const e of world.enemies) {
			if (e.dead) continue
			if (e.kind === 'boss') continue // bosses are driven by the BossManager

			e.animT += dt * 8
			e.flash = Math.max(0, e.flash - dt)
			e.stateTime += dt
			e.attackTimer = Math.max(0, e.attackTimer - dt)
			e.touchTimer = Math.max(0, e.touchTimer - dt)

			// summons expire
			if (e.lifetime !== Infinity) {
				e.lifetime -= dt
				if (e.lifetime <= 0) {
					game.combat.killEntity(e)
					continue
				}
			}

			const mods = game.statusFx.modifiers(e)
			if (mods.stunned) {
				e.vx = 0
				e.vy = 0
				continue
			}

			const target = this._pickTarget(e)
			this._runState(e, target, mods, dt)

			if (e.vx !== 0) e.facing = e.vx > 0 ? 1 : -1

			// contact damage vs the player (enemy team only)
			if (e.team === 'enemy' && !player.dead && e.touchTimer <= 0) {
				const rr = e.r + player.r + 1
				if ((e.x - player.x) ** 2 + (e.y - player.y) ** 2 < rr * rr) {
					e.touchTimer = 0.8
					game.combat.damagePlayer(e.damage, {
						kx: player.x - e.x, ky: player.y - e.y,
						status: e.def.touchStatus, source: e,
					})
				}
			}
		}

		// prune dead enemies (keep array tight for perf)
		if (world.enemies.length > 0 && world.enemies.some((e) => e.dead)) {
			world.enemies = world.enemies.filter((e) => !e.dead)
		}
	}

	_pickTarget(e) {
		const game = this.game
		if (e.team === 'enemy') {
			// prefer player summons if closer than the player? Keep it simple: player.
			return game.player.dead ? null : game.player
		}
		// player summon: nearest living enemy
		let best = null
		let bestD = Infinity
		for (const other of game.world.enemies) {
			if (other.dead || other.team !== 'enemy') continue
			const d = (other.x - e.x) ** 2 + (other.y - e.y) ** 2
			if (d < bestD) {
				bestD = d
				best = other
			}
		}
		if (game.world.boss && !game.world.boss.dead) {
			const b = game.world.boss
			const d = (b.x - e.x) ** 2 + (b.y - e.y) ** 2
			if (d < bestD) best = b
		}
		return best
	}

	_setState(e, state) {
		e.state = state
		e.stateTime = 0
	}

	_runState(e, target, mods, dt) {
		const game = this.game
		const def = e.def
		const speed = e.speed * mods.speedMul
		e.vx = 0
		e.vy = 0

		if (!target) {
			this._idleWander(e, speed, dt)
			return
		}

		const d = dist(e.x, e.y, target.x, target.y)

		switch (e.state) {
			case 'idle': {
				// detection: radius + line of sight (aggro is sticky once set)
				if (e.aggro || (d < def.detect && game.world.map.lineOfSight(e.x, e.y, target.x, target.y))) {
					e.aggro = true
					this._setState(e, 'chase')
					break
				}
				if (e.stateTime > 2 + Math.random() * 2) {
					// pick a patrol point near home
					const a = Math.random() * TAU
					e.patrolX = e.homeX + Math.cos(a) * 30
					e.patrolY = e.homeY + Math.sin(a) * 30
					this._setState(e, 'patrol')
				}
				break
			}

			case 'patrol': {
				if (e.aggro || (d < def.detect && game.world.map.lineOfSight(e.x, e.y, target.x, target.y))) {
					e.aggro = true
					this._setState(e, 'chase')
					break
				}
				const pd = dist(e.x, e.y, e.patrolX, e.patrolY)
				if (pd < 6 || e.stateTime > 3) {
					this._setState(e, 'idle')
				} else {
					const a = angleTo(e.x, e.y, e.patrolX, e.patrolY)
					e.vx = Math.cos(a) * speed * 0.5
					e.vy = Math.sin(a) * speed * 0.5
				}
				break
			}

			case 'chase':
				this._chase(e, target, d, speed, dt)
				break

			case 'attack':
				this._attack(e, target, d, speed, dt)
				break

			case 'recover':
				// brief vulnerable pause after attacking
				if (e.stateTime > (def.recoverTime ?? 0.5)) this._setState(e, 'chase')
				break
		}
	}

	_idleWander(e, speed, dt) {
		// no target (player dead): drift near home
		if (Math.random() < dt * 0.3) {
			const a = Math.random() * TAU
			e.patrolX = e.homeX + Math.cos(a) * 20
			e.patrolY = e.homeY + Math.sin(a) * 20
		}
	}

	_chase(e, target, d, speed) {
		const def = e.def
		const game = this.game
		const a = angleTo(e.x, e.y, target.x, target.y)

		switch (def.ai) {
			case 'ranged':
			case 'summoner': {
				// kite: stay near keepDistance, attack when ready + LOS
				const keep = def.keepDistance ?? 90
				if (d < keep - 15) {
					e.vx = -Math.cos(a) * speed
					e.vy = -Math.sin(a) * speed
				} else if (d > def.attackRange) {
					e.vx = Math.cos(a) * speed
					e.vy = Math.sin(a) * speed
				}
				if (d <= def.attackRange && e.attackTimer <= 0 && game.world.map.lineOfSight(e.x, e.y, target.x, target.y)) {
					this._setState(e, 'attack')
				}
				break
			}

			case 'assassin': {
				if (d <= def.dashRange && e.attackTimer <= 0) {
					// wind up a dash through the target
					e.dashX = Math.cos(a)
					e.dashY = Math.sin(a)
					this._setState(e, 'attack')
				} else {
					e.vx = Math.cos(a) * speed
					e.vy = Math.sin(a) * speed
				}
				break
			}

			case 'flyer': {
				// orbit with wander, swoop in when ready
				e.orbitDir = e.orbitDir || (Math.random() < 0.5 ? 1 : -1)
				if (e.attackTimer <= 0 && d < def.detect) {
					this._setState(e, 'attack')
					break
				}
				const orbitA = a + Math.PI / 2 * e.orbitDir
				const inOut = d > 60 ? 0.7 : -0.4 // spiral toward ~60px ring
				e.vx = (Math.cos(orbitA) + Math.cos(a) * inOut) * speed * 0.8
				e.vy = (Math.sin(orbitA) + Math.sin(a) * inOut) * speed * 0.8
				if (Math.random() < 0.02) e.orbitDir *= -1
				break
			}

			case 'bomber': {
				e.vx = Math.cos(a) * speed
				e.vy = Math.sin(a) * speed
				if (d <= def.attackRange) {
					e.fuse = def.fuseTime
					this._setState(e, 'attack')
				}
				break
			}

			default: {
				// melee + tank: straight pursuit
				e.vx = Math.cos(a) * speed
				e.vy = Math.sin(a) * speed
				if (d <= def.attackRange + target.r && e.attackTimer <= 0) {
					this._setState(e, 'attack')
				}
			}
		}
	}

	_attack(e, target, d, speed) {
		const def = e.def
		const game = this.game
		const a = angleTo(e.x, e.y, target.x, target.y)

		switch (def.ai) {
			case 'ranged': {
				// brief windup, then fire
				if (e.stateTime > 0.35) {
					game.world.fireProjectile({
						x: e.x, y: e.y, angle: a,
						speed: def.projectile.speed,
						damage: e.damage,
						team: e.team === 'player' ? 'player' : 'enemy',
						sprite: def.projectile.sprite,
						range: def.attackRange * 1.3,
						status: def.projectile.status,
						colors: [0xff5a5aff],
					})
					game.audio.play('shoot', 0.5)
					e.attackTimer = def.attackCd
					this._setState(e, 'recover')
				}
				break
			}

			case 'summoner': {
				if (e.stateTime > 0.6) {
					const world = game.world
					const owned = world.enemies.filter((s) => !s.dead && s.summoner === e.id).length
					if (owned < def.summonMax) {
						const s = world.spawnEnemy(def.summonId, e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, { room: e.room })
						s.summoner = e.id
						s.aggro = true
						game.audio.play('skill_summon', 0.6)
						game.particles.burst({ x: s.x, y: s.y, count: 10, color: 0xffd86c8b, speed: 50, life: 0.5 })
					} else if (def.projectile) {
						game.world.fireProjectile({
							x: e.x, y: e.y, angle: a,
							speed: def.projectile.speed, damage: e.damage,
							team: 'enemy', sprite: def.projectile.sprite,
							range: def.attackRange * 1.3,
						})
						game.audio.play('shoot', 0.5)
					}
					e.attackTimer = def.attackCd
					this._setState(e, 'recover')
				}
				break
			}

			case 'assassin': {
				// telegraphed dash strike
				if (e.stateTime < 0.35) {
					e.flash = 0.05 // flicker warning
				} else if (e.stateTime < 0.55) {
					e.vx = e.dashX * def.dashSpeed
					e.vy = e.dashY * def.dashSpeed
					if (e.team === 'enemy' && !target.dead && dist(e.x, e.y, target.x, target.y) < e.r + target.r + 2 && e.touchTimer <= 0) {
						e.touchTimer = 0.8
						game.combat.damagePlayer(e.damage, { kx: e.dashX, ky: e.dashY, source: e })
					}
				} else {
					e.attackTimer = def.attackCd
					this._setState(e, 'recover')
				}
				break
			}

			case 'tank': {
				// ground slam with telegraph
				if (e.stateTime < 0.1 && !e.slamTelegraphed) {
					e.slamTelegraphed = true
					game.world.addTelegraph({
						x: e.x, y: e.y, r: def.slamRadius, dur: 0.7,
						color: 0x300000ff,
						onDone: (g) => {
							if (e.dead) return
							e.slamTelegraphed = false
							g.particles.burst({ x: e.x, y: e.y, count: 16, color: 0xff6a7a8a, speed: 100, life: 0.4 })
							g.camera.shake(0.3)
							g.audio.play('explosion', 0.6)
							const p = g.player
							if (!p.dead && dist(e.x, e.y, p.x, p.y) < def.slamRadius + p.r) {
								g.combat.damagePlayer(e.damage, { kx: p.x - e.x, ky: p.y - e.y, status: def.slamStatus, source: e })
							}
						},
					})
				}
				if (e.stateTime > 0.8) {
					e.attackTimer = def.attackCd
					this._setState(e, 'recover')
				}
				break
			}

			case 'flyer': {
				// swoop through the target
				if (e.stateTime < 0.1) {
					e.dashX = Math.cos(a)
					e.dashY = Math.sin(a)
				}
				if (e.stateTime < 0.5) {
					e.vx = e.dashX * def.swoopSpeed
					e.vy = e.dashY * def.swoopSpeed
				} else {
					e.attackTimer = def.attackCd
					this._setState(e, 'recover')
				}
				break
			}

			case 'bomber': {
				// fuse burns down, then detonate
				e.fuse -= 1 / 60
				e.flash = 0.05
				e.vx = Math.cos(a) * speed * 0.5
				e.vy = Math.sin(a) * speed * 0.5
				if (e.fuse <= 0) {
					e.exploded = true
					game.combat.explode(e.x, e.y, def.blastRadius, e.damage, 'enemy')
					game.combat.killEntity(e)
				}
				break
			}

			default: {
				// melee strike: short windup, hit if still in range
				if (e.stateTime > 0.25) {
					const reach = def.attackRange + target.r + 4
					if (dist(e.x, e.y, target.x, target.y) < reach) {
						if (e.team === 'enemy') {
							game.combat.damagePlayer(e.damage, { kx: target.x - e.x, ky: target.y - e.y, source: e })
						} else {
							game.combat.damageEntity(target, e.damage, { knockback: 60, kx: target.x - e.x, ky: target.y - e.y })
						}
					}
					e.attackTimer = def.attackCd
					this._setState(e, 'recover')
				}
				break
			}
		}
	}
}
