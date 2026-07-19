import { SKILLS, skillDamage, skillCooldown } from '../data/skills.js'
import { dist, TAU } from '../core/MathUtil.js'

/**
 * Skill system: interprets data-driven skill definitions with generic
 * executors keyed by `def.type`. Adding a skill type = adding one executor;
 * adding a skill = adding a data entry.
 */
export class SkillSystem {
	constructor(game) {
		this.game = game
		this.executors = {
			projectile: this._castProjectile.bind(this),
			multishot: this._castMultishot.bind(this),
			nova: this._castNova.bind(this),
			dash: this._castDash.bind(this),
			heal: this._castHeal.bind(this),
			cloud: this._castCloud.bind(this),
			chain: this._castChain.bind(this),
			shield: this._castShield.bind(this),
			summon: this._castSummon.bind(this),
			spin: this._castSpin.bind(this),
		}
	}

	/** Attempt to cast skill in slot `index` of the player's kit. */
	cast(index) {
		const game = this.game
		const player = game.player
		const slot = player.skills[index]
		if (!slot || player.dead || player.rollTime > 0) return false
		const def = SKILLS[slot.id]
		if (!def) return false

		if (slot.cd > 0) return false
		if (player.mana < def.mana) {
			game.audio.play('error', 0.5)
			game.world.floatText(player.x, player.y - 12, 'No mana!', 0xff8080ff, 0.9)
			return false
		}

		const executor = this.executors[def.type]
		if (!executor) return false

		player.mana -= def.mana
		slot.cd = skillCooldown(def, slot.level) * (1 - player.cdr)
		executor(def, slot.level)
		if (def.sound) game.audio.play(def.sound)
		game.events.emit('skill:cast', def.id)
		return true
	}

	_dmg(def, level) {
		return Math.round(skillDamage(def, level) * this.game.player.skillPower)
	}

	_aim() {
		const p = this.game.player
		return Math.atan2(p.facingY, p.facingX)
	}

	_castProjectile(def, level) {
		const game = this.game
		const p = game.player
		game.world.fireProjectile({
			x: p.x + p.facingX * 6, y: p.y + p.facingY * 6,
			angle: this._aim(),
			speed: def.speed,
			damage: this._dmg(def, level),
			team: 'player',
			sprite: def.sprite,
			range: def.range,
			status: def.status,
			explode: def.explode,
			radius: def.radius,
			colors: def.colors,
			crit: game.combat.rollCrit(),
		})
	}

	_castMultishot(def, level) {
		const game = this.game
		const p = game.player
		const base = this._aim()
		const dmg = this._dmg(def, level)
		for (let i = 0; i < def.count; i++) {
			const t = def.count === 1 ? 0 : i / (def.count - 1) - 0.5
			game.world.fireProjectile({
				x: p.x + p.facingX * 6, y: p.y + p.facingY * 6,
				angle: base + t * def.spread,
				speed: def.speed,
				damage: dmg,
				team: 'player',
				sprite: def.sprite,
				range: def.range,
				status: def.status,
				colors: def.colors,
				crit: game.combat.rollCrit(),
			})
		}
	}

	_castNova(def, level) {
		const game = this.game
		const p = game.player
		const dmg = this._dmg(def, level)
		game.world.effects.push({ type: 'ring', x: p.x, y: p.y, r: def.radius, t: 0, dur: 0.35, color: def.colors ? def.colors[0] : 0xffffffff })
		game.particles.burst({ x: p.x, y: p.y, count: 22, color: def.colors, speed: def.radius * 2.2, life: 0.45, drag: 0.85 })
		game.camera.shake(0.25)
		game.world.grid.query(p.x, p.y, def.radius + 12, (e) => {
			if (e.dead || e.team !== 'enemy') return
			if (dist(p.x, p.y, e.x, e.y) < def.radius + e.r) {
				game.combat.damageEntity(e, dmg, {
					status: def.status,
					knockback: def.knockback ?? 120,
					kx: e.x - p.x, ky: e.y - p.y,
				})
			}
		})
		if (def.selfHeal) {
			p.hp = Math.min(p.maxHp, p.hp + def.selfHeal * p.skillPower)
			game.world.floatText(p.x, p.y - 12, `+${Math.round(def.selfHeal * p.skillPower)}`, 0xff4dc763, 1)
		}
	}

	_castDash(def, level) {
		const game = this.game
		const p = game.player
		const angle = this._aim()
		const dmg = this._dmg(def, level)
		const startX = p.x
		const startY = p.y

		// step the dash in small increments so walls stop it cleanly
		const steps = 10
		const stepLen = def.distance / steps
		const hitSet = new Set()
		for (let i = 0; i < steps; i++) {
			const moved = game.world.map.moveCircle(p.x, p.y, p.r, Math.cos(angle) * stepLen, Math.sin(angle) * stepLen)
			p.x = moved.x
			p.y = moved.y
			if (dmg > 0) {
				game.world.grid.query(p.x, p.y, 14, (e) => {
					if (e.dead || e.team !== 'enemy' || hitSet.has(e.id)) return
					if (dist(p.x, p.y, e.x, e.y) < e.r + p.r + 4) {
						hitSet.add(e.id)
						game.combat.damageEntity(e, dmg, {
							knockback: def.knockback ?? 100,
							kx: Math.cos(angle), ky: Math.sin(angle),
						})
					}
				})
			}
		}

		p.iframes = Math.max(p.iframes, 0.3)
		if (def.buff) p.addBuff({ id: def.buff.id, timeLeft: def.buff.duration })

		// trail
		const trail = Math.hypot(p.x - startX, p.y - startY)
		const n = Math.max(3, Math.floor(trail / 8))
		for (let i = 0; i < n; i++) {
			const t = i / n
			game.particles.burst({
				x: startX + (p.x - startX) * t,
				y: startY + (p.y - startY) * t,
				count: 2, color: def.colors, speed: 15, life: 0.35,
			})
		}
	}

	_castHeal(def, level) {
		const game = this.game
		const p = game.player
		const amount = Math.round(def.amount * Math.pow(1.25, level - 1) * p.skillPower)
		p.hp = Math.min(p.maxHp, p.hp + amount)
		game.world.floatText(p.x, p.y - 12, `+${amount}`, 0xff4dc763, 1.2)
		game.particles.burst({ x: p.x, y: p.y, count: 16, color: def.colors, speed: 40, life: 0.7, gravity: -60 })
	}

	_castCloud(def, level) {
		const game = this.game
		const p = game.player
		const range = Math.min(def.range, 999)
		game.world.addHazard({
			x: p.x + p.facingX * range * 0.6,
			y: p.y + p.facingY * range * 0.6,
			r: def.radius,
			kind: 'cloud',
			damage: this._dmg(def, level),
			tick: def.tick,
			duration: def.duration + level * 0.5,
			team: 'player',
			status: def.status,
			color: def.colors ? (def.colors[0] & 0x00ffffff) | 0x55000000 : 0x554ad27a,
		})
	}

	_castChain(def, level) {
		const game = this.game
		const p = game.player
		const dmg = this._dmg(def, level)
		let fromX = p.x
		let fromY = p.y
		let range = def.range
		const hit = new Set()

		for (let j = 0; j <= def.jumps; j++) {
			let best = null
			let bestD = Infinity
			for (const e of game.world.enemies) {
				if (e.dead || e.team !== 'enemy' || hit.has(e.id)) continue
				const d = dist(fromX, fromY, e.x, e.y)
				if (d < range && d < bestD && game.world.map.lineOfSight(fromX, fromY, e.x, e.y)) {
					bestD = d
					best = e
				}
			}
			if (!best) break
			hit.add(best.id)
			game.world.effects.push({ type: 'line', x: fromX, y: fromY, x2: best.x, y2: best.y, t: 0, dur: 0.18, color: def.colors[0] })
			game.particles.burst({ x: best.x, y: best.y, count: 6, color: def.colors, speed: 40, life: 0.3 })
			game.combat.damageEntity(best, dmg, { status: def.status, crit: j === 0 && game.combat.rollCrit() })
			fromX = best.x
			fromY = best.y
			range = def.jumpRange
			if (def.jumpRange <= 0) break
		}
	}

	_castShield(def, level) {
		const game = this.game
		const p = game.player
		p.shieldHp = Math.round(def.absorb * Math.pow(1.2, level - 1) * p.skillPower)
		p.addBuff({ id: 'shield', timeLeft: def.duration })
		if (def.healPerSecond) p.addBuff({ id: 'sanctuary_heal', timeLeft: def.duration, healPerSecond: def.healPerSecond * p.skillPower })
		game.particles.burst({ x: p.x, y: p.y, count: 14, color: def.colors, speed: 30, life: 0.6, drag: 0.85 })
	}

	_castSummon(def, level) {
		const game = this.game
		const p = game.player
		// cap active summons from this skill
		const alive = p.summons.filter((s) => !s.dead)
		while (alive.length >= 2) {
			game.combat.killEntity(alive.shift())
		}
		for (let i = 0; i < (def.summonCount ?? 1); i++) {
			const s = game.world.spawnEnemy(def.summonId, p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 20, {
				team: 'player',
				lifetime: def.duration + level * 3,
				hpMul: Math.pow(1.3, level - 1),
				dmgMul: Math.pow(1.25, level - 1) * p.skillPower,
			})
			s.aggro = true
			p.summons.push(s)
			game.particles.burst({ x: s.x, y: s.y, count: 12, color: def.colors, speed: 40, life: 0.6 })
		}
	}

	_castSpin(def, level) {
		const game = this.game
		const p = game.player
		const dmg = Math.round((skillDamage(def, level) + p.attackDamage * 0.5) * p.skillPower)
		// spinning slash visual
		for (let i = 0; i < 4; i++) {
			game.world.effects.push({
				type: 'sprite', sprite: 'slash',
				x: p.x + Math.cos((i / 4) * TAU) * def.radius * 0.5,
				y: p.y + Math.sin((i / 4) * TAU) * def.radius * 0.5,
				rot: (i / 4) * TAU, t: -i * 0.03, dur: 0.15, scale: 1.2,
			})
		}
		game.camera.shake(0.2)
		game.world.grid.query(p.x, p.y, def.radius + 12, (e) => {
			if (e.dead || e.team !== 'enemy') return
			if (dist(p.x, p.y, e.x, e.y) < def.radius + e.r) {
				game.combat.damageEntity(e, dmg, {
					crit: game.combat.rollCrit(),
					knockback: def.knockback ?? 100,
					kx: e.x - p.x, ky: e.y - p.y,
				})
			}
		})
	}
}
