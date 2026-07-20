/**
 * Status effect system.
 *
 * Effects live on entities as {id, timeLeft, power, tickTimer}. This system
 * applies/refreshes them, runs damage-over-time ticks and exposes movement/
 * damage modifiers that other systems read.
 *
 * Built-in effects:
 *   burn   — fire DoT (power = dps)
 *   poison — nature DoT (power = dps), stacks duration
 *   freeze — slow (power = fraction of speed removed)
 *   shock  — +30% damage taken
 *   stun   — cannot move or act
 *   chrono — boss time-manipulation slow on the player
 */
const FX_COLORS = {
	burn: 0xff2a8aff,
	poison: 0xff4ad27a,
	freeze: 0xffffd38f,
	shock: 0xff4ae9ff,
	stun: 0xff7ce8ff,
	chrono: 0xffff6cd8,
}

export class StatusEffects {
	constructor(game) {
		this.game = game
	}

	apply(entity, def) {
		if (!entity.statuses) entity.statuses = []
		const existing = entity.statuses.find((s) => s.id === def.id)
		if (existing) {
			existing.timeLeft = Math.max(existing.timeLeft, def.duration)
			existing.power = Math.max(existing.power, def.power ?? 1)
		} else {
			entity.statuses.push({ id: def.id, timeLeft: def.duration, power: def.power ?? 1, tickTimer: 0 })
		}
	}

	update(dt) {
		const game = this.game
		const world = game.world
		this._updateEntity(game.player, dt, true)
		for (const e of world.enemies) {
			if (!e.dead) this._updateEntity(e, dt, false)
		}
		if (world.boss && !world.boss.dead) this._updateEntity(world.boss, dt, false)
	}

	_updateEntity(e, dt, isPlayer) {
		const game = this.game
		if (!e.statuses || e.statuses.length === 0) return
		for (let i = e.statuses.length - 1; i >= 0; i--) {
			const s = e.statuses[i]
			s.timeLeft -= dt
			if (s.timeLeft <= 0) {
				e.statuses.splice(i, 1)
				continue
			}
			if (s.id === 'burn' || s.id === 'poison') {
				s.tickTimer -= dt
				if (s.tickTimer <= 0) {
					s.tickTimer = 0.5
					const dmg = Math.max(1, Math.round(s.power * 0.5))
					if (isPlayer) game.combat.damagePlayer(dmg, { noKnockback: true, isDot: true })
					else game.combat.damageEntity(e, dmg, { noKnockback: true, isDot: true, dotColor: FX_COLORS[s.id] })
				}
			}
			// ambient status particles
			if (Math.random() < dt * 5) {
				game.particles.burst({ x: e.x, y: e.y - 4, count: 1, color: FX_COLORS[s.id], speed: 12, life: 0.4, gravity: -25, jitter: 6 })
			}
		}
	}

	/** Combined modifiers other systems poll. */
	modifiers(e) {
		let speedMul = 1
		let damageTakenMul = 1
		let stunned = false
		if (e.statuses) {
			for (const s of e.statuses) {
				if (s.id === 'freeze' || s.id === 'chrono') speedMul *= Math.max(0.1, 1 - s.power)
				if (s.id === 'shock') damageTakenMul *= 1.3
				if (s.id === 'stun') stunned = true
			}
		}
		return { speedMul, damageTakenMul, stunned }
	}
}
