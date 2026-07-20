import { TILE, TILE_SIZE } from '../world/TileMap.js'

/**
 * Physics system: integrates enemy motion (AI intent + knockback), resolves
 * tile collisions, separates overlapping entities via the spatial grid and
 * applies hazard-tile damage. The player integrates in Player.update — this
 * system owns everything else that moves.
 */
export class Physics {
	constructor(game) {
		this.game = game
		this.playerHazardTimer = 0
	}

	update(dt) {
		const game = this.game
		const world = game.world
		const map = world.map

		// rebuild broad-phase grid
		world.grid.clear()
		for (const e of world.enemies) {
			if (!e.dead) world.grid.insert(e)
		}

		// integrate enemies: AI velocity + decaying knockback
		for (const e of world.enemies) {
			if (e.dead) continue
			e.kbx *= Math.pow(0.0002, dt)
			e.kby *= Math.pow(0.0002, dt)
			const dx = (e.vx + e.kbx) * dt
			const dy = (e.vy + e.kby) * dt
			const moved = map.moveCircle(e.x, e.y, e.r, dx, dy)
			e.x = moved.x
			e.y = moved.y

			// wall slam: hard knockback into a wall hurts and staggers
			const kbSpeed = Math.hypot(e.kbx, e.kby)
			if ((moved.hitX || moved.hitY) && kbSpeed > 130) {
				e.kbx = 0
				e.kby = 0
				e.staggerMeter = (e.staggerMeter ?? 0) + 20
				game.particles.burst({ x: e.x, y: e.y, count: 10, color: [0xff8a8a9a, 0xff5a5a6a], speed: 60, life: 0.4 })
				game.camera.shake(0.12)
				game.audio.play('explosion', 0.35)
				game.combat.damageEntity(e, Math.round(4 + kbSpeed * 0.04), { noKnockback: true })
			}
		}

		this._separate(world)
		this._hazardTiles(dt)
	}

	/**
	 * Push overlapping enemies apart so packs don't collapse into one point.
	 * Pushes are wall-checked — an unchecked shove is exactly how crowded
	 * packs used to squeeze entities into solid tiles.
	 */
	_separate(world) {
		const map = world.map
		for (const e of world.enemies) {
			if (e.dead) continue
			world.grid.query(e.x, e.y, e.r + 10, (other) => {
				if (other === e || other.dead) return
				const dx = other.x - e.x
				const dy = other.y - e.y
				const d2 = dx * dx + dy * dy
				const minD = e.r + other.r
				if (d2 > 0.0001 && d2 < minD * minD) {
					const d = Math.sqrt(d2)
					const push = ((minD - d) / d) * 0.5
					const px = dx * push
					const py = dy * push
					if (!map._circleHits(other.x + px, other.y + py, other.r)) {
						other.x += px
						other.y += py
					}
					if (!map._circleHits(e.x - px, e.y - py, e.r)) {
						e.x -= px
						e.y -= py
					}
				}
			})
		}

		// depenetration safety net: eject anything that still ended up inside
		// a solid tile (bad spawn, teleport, old saves)
		for (const e of world.enemies) {
			if (e.dead) continue
			const fixed = map.depenetrate(e.x, e.y, e.r)
			if (fixed.moved) {
				e.x = fixed.x
				e.y = fixed.y
				e.kbx = 0
				e.kby = 0
			}
		}
		const p = this.game.player
		if (p && !p.dead) {
			const fixed = map.depenetrate(p.x, p.y, p.r)
			if (fixed.moved) {
				p.x = fixed.x
				p.y = fixed.y
			}
		}
	}

	_hazardTiles(dt) {
		const game = this.game
		const world = game.world
		const player = game.player
		const biome = world.biome

		// spike traps only hurt while extended (they telegraph via animation)
		const spikeSafe = (x, y) =>
			biome.hazardType === 'spikes' &&
			!world.spikesOut(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))

		this.playerHazardTimer = Math.max(0, this.playerHazardTimer - dt)
		if (!player.dead && player.rollTime <= 0 && this.playerHazardTimer <= 0) {
			if (world.map.tileAt(player.x, player.y) === TILE.HAZARD && !spikeSafe(player.x, player.y)) {
				this.playerHazardTimer = 0.6
				const dmg = 4 + Math.floor(world.floor * 0.8)
				game.combat.damagePlayer(dmg, { noKnockback: true, isHazard: true })
				if (biome.hazardType === 'poison') game.statusFx.apply(player, { id: 'poison', duration: 2, power: 2 })
				if (biome.hazardType === 'frost') game.statusFx.apply(player, { id: 'freeze', duration: 1, power: 0.4 })
				if (biome.hazardType === 'lava') game.statusFx.apply(player, { id: 'burn', duration: 2, power: 3 })
			}
		}

		// grounded enemies burn in hazards too (weaker tick so rooms stay fair)
		for (const e of world.enemies) {
			if (e.dead || e.def.flying) continue
			e.hazardTimer = Math.max(0, (e.hazardTimer || 0) - dt)
			if (e.hazardTimer <= 0 && world.map.tileAt(e.x, e.y) === TILE.HAZARD && !spikeSafe(e.x, e.y)) {
				e.hazardTimer = 0.8
				game.combat.damageEntity(e, 3, { noKnockback: true })
			}
		}
	}
}

export { TILE_SIZE }
