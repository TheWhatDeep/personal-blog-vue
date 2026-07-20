import { angleDiff, dist, TAU } from '../core/MathUtil.js'
import { TILE, TILE_SIZE } from '../world/TileMap.js'

/**
 * Combat system: the single damage pipeline for everything in the game.
 *
 * Handles hitboxes (melee arcs, explosions), critical hits, knockback,
 * invulnerability frames, combo attacks, damage numbers, screen shake,
 * lifesteal/thorns, deaths and loot hand-off. All systems route damage
 * through damageEntity/damagePlayer so rules live in one place.
 */
export class Combat {
	constructor(game) {
		this.game = game
	}

	rollCrit() {
		const player = this.game.player
		if (player.hasBuff('guaranteed_crit')) {
			player.consumeBuff('guaranteed_crit')
			return true
		}
		return Math.random() < player.critChance
	}

	/** Player basic attack — melee arc or projectile, from the class weapon. */
	playerAttack() {
		const game = this.game
		const player = game.player
		if (player.attackCd > 0 || player.dead || player.rollTime > 0) return
		const weapon = player.classDef.weapon
		player.attackCd = player.attackCooldown
		// attack animation plays once over most of the swing window
		player.attackAnimDur = Math.min(0.35, player.attackCooldown * 0.9)
		player.attackAnim = player.attackAnimDur
		player.attackVariant = 1

		if (weapon.type === 'melee') {
			// 3-hit combo chain: each stage plays a different swing animation
			// and ramps damage; the third stage is the heavy finisher
			player.comboTimer = 1.0
			player.comboCount = Math.min(3, player.comboCount + 1)
			player.attackVariant = player.comboCount
			const comboMul = 1 + 0.22 * (player.comboCount - 1)
			const finisher = player.comboCount === 3
			if (finisher) player.comboCount = 0

			const crit = this.rollCrit()
			const dmg = Math.round(player.attackDamage * comboMul * (crit ? player.critMult : 1))
			let angle = Math.atan2(player.facingY, player.facingX)

			// melee magnetism: snap the swing toward the nearest target in a
			// generous cone so near-misses connect
			let magnet = null
			let magnetD = Infinity
			game.world.grid.query(player.x, player.y, weapon.range * 1.8, (e) => {
				if (e.dead || e.team !== 'enemy') return
				const d = dist(player.x, player.y, e.x, e.y)
				if (d > weapon.range * 1.8 || d >= magnetD) return
				const to = Math.atan2(e.y - player.y, e.x - player.x)
				if (Math.abs(angleDiff(angle, to)) < 0.9) {
					magnet = to
					magnetD = d
				}
			})
			if (magnet !== null) angle = magnet

			game.audio.play('swing')
			game.world.effects.push({
				type: 'sprite', sprite: 'slash',
				x: player.x + player.facingX * weapon.range * 0.6,
				y: player.y + player.facingY * weapon.range * 0.6,
				rot: angle + Math.PI * 0.75, t: 0, dur: 0.12, scale: finisher ? 1.5 : 1.1,
			})

			const hits = this.meleeArc(player.x, player.y, angle, {
				range: weapon.range,
				arc: weapon.arc,
				damage: dmg,
				crit,
				knockback: weapon.knockback * (finisher ? 1.8 : 1),
			})
			// hit-stop: connecting swings freeze the world for a few frames,
			// heavier on finishers and crits
			if (hits > 0) {
				game.hitStop = Math.max(game.hitStop, 0.03 + player.attackVariant * 0.012 + (crit ? 0.025 : 0))
			}

			// melee can smash cracked walls
			const tx = Math.floor((player.x + player.facingX * weapon.range) / TILE_SIZE)
			const ty = Math.floor((player.y + player.facingY * weapon.range) / TILE_SIZE)
			if (game.world.map.get(tx, ty) === TILE.CRACK) game.world.breakCrack(tx, ty)
		} else {
			const crit = this.rollCrit()
			const angle = Math.atan2(player.facingY, player.facingX)
			const pierce = (weapon.pierce ?? 0) + (player.classDef.passive.id === 'fleet_foot' ? 1 : 0)
			game.world.fireProjectile({
				x: player.x + player.facingX * 6,
				y: player.y + player.facingY * 6,
				angle,
				speed: weapon.speed,
				damage: Math.round(player.attackDamage * (crit ? player.critMult : 1)),
				team: 'player',
				sprite: weapon.sprite,
				range: weapon.range,
				pierce,
				crit,
				colors: [0xffcfd8e3],
			})
			game.audio.play(weapon.sprite === 'arrow' ? 'bow' : 'shoot')
		}
	}

	/** Arc-shaped melee hitbox sweep. Returns number of targets hit. */
	meleeArc(x, y, angle, opts) {
		const game = this.game
		const world = game.world
		let hits = 0
		world.grid.query(x, y, opts.range + 12, (e) => {
			if (e.dead || e.team !== 'enemy') return
			const d = dist(x, y, e.x, e.y)
			if (d > opts.range + e.r) return
			const toTarget = Math.atan2(e.y - y, e.x - x)
			if (Math.abs(angleDiff(angle, toTarget)) > opts.arc / 2 && d > e.r + 4) return
			hits++
			this.damageEntity(e, opts.damage, {
				crit: opts.crit,
				knockback: opts.knockback,
				kx: Math.cos(toTarget),
				ky: Math.sin(toTarget),
				status: opts.status,
			})
		})
		// barrels in the arc
		for (const prop of world.props) {
			if (prop.kind === 'barrel' && !prop.dead && dist(x, y, prop.x, prop.y) < opts.range + prop.r) {
				this.breakBarrel(prop)
			}
		}
		if (hits > 0) game.camera.shake(0.12)
		return hits
	}

	/**
	 * Damage a non-player entity (enemy, summon or boss).
	 * opts: {crit, status, knockback, kx, ky, noKnockback, isDot, dotColor}
	 */
	damageEntity(e, amount, opts = {}) {
		if (e.dead) return
		const game = this.game

		// shielded enemies block frontal hits until their guard breaks;
		// AoE/slams (no hit direction) and rear hits go through
		if (e.def?.shield && !opts.isDot && (e.guardBreakT ?? 0) <= 0 && e.state !== 'flinch') {
			const len = Math.hypot(opts.kx ?? 0, opts.ky ?? 0)
			if (len > 0.01) {
				const facingAttacker = e.facing * ((opts.kx ?? 0) / len) < 0.15
				if (facingAttacker) {
					e.guardMeter = (e.guardMeter ?? 0) + amount
					game.audio.play('skill_shield', 0.6)
					game.particles.burst({ x: e.x - e.facing * 6, y: e.y, count: 5, color: [0xffe3d8cf, 0xffb1a59a], speed: 60, life: 0.25 })
					game.world.floatText(e.x, e.y - e.r - 4, 'BLOCK', 0xffcfd8e3, 0.9)
					if (e.guardMeter >= (e.def.guardBreak ?? 30)) {
						e.guardMeter = 0
						e.guardBreakT = 2.5
						e.state = 'flinch'
						e.stateTime = 0
						game.world.floatText(e.x, e.y - e.r - 12, 'GUARD BREAK!', 0xff3ad2ff, 1.1)
						game.audio.play('crit')
					}
					return
				}
			}
		}

		const mods = game.statusFx.modifiers(e)
		let dmg = Math.max(1, Math.round(amount * mods.damageTakenMul))

		e.hp -= dmg
		e.flash = 0.1
		if (e.team === 'enemy') e.aggro = true

		// staggered bosses take bonus damage
		if (e.kind === 'boss' && game.bossManager.staggeredT > 0) {
			dmg = Math.round(dmg * 1.3)
		}

		// damage numbers: crits pop
		const color = opts.isDot ? (opts.dotColor ?? 0xff4ad27a) : opts.crit ? 0xff3ad2ff : 0xffffffff
		game.world.floatText(e.x, e.y - e.r - 4, String(dmg), color, opts.crit ? 1.4 : 1)

		if (!opts.isDot) {
			// impact particles spray along the hit direction
			const hitAngle = (opts.kx || opts.ky) ? Math.atan2(opts.ky ?? 0, opts.kx ?? 0) : Math.random() * TAU
			game.particles.burst({
				x: e.x, y: e.y, count: opts.crit ? 12 : 6,
				color: [0xff3434c0, 0xff4848e0], speed: 90, life: 0.35,
				angle: hitAngle, spread: 1.3,
			})
			if (opts.crit) game.audio.play('crit')
			else game.audio.play('hit', 0.8)

			// poise: enough damage interrupts what the enemy was doing
			if (e.team === 'enemy') {
				if (e.kind === 'boss') {
					game.bossManager.addStagger(dmg)
				} else {
					e.staggerMeter = (e.staggerMeter ?? 0) + dmg
					const poise = e.def.poise ?? 12
					if (e.staggerMeter >= poise && e.state !== 'flinch') {
						e.staggerMeter = 0
						e.state = 'flinch'
						e.stateTime = 0
						e.vx = 0
						e.vy = 0
						e.attackWindup = 0
					}
				}
			}
		}

		if (opts.status) game.statusFx.apply(e, opts.status)

		if (!opts.noKnockback && opts.knockback) {
			const resist = 1 - (e.def?.knockbackResist ?? 0)
			const len = Math.hypot(opts.kx ?? 0, opts.ky ?? 0) || 1
			e.kbx += ((opts.kx ?? 0) / len) * opts.knockback * resist
			e.kby += ((opts.ky ?? 0) / len) * opts.knockback * resist
		}

		// lifesteal (all damage to enemies is ultimately player-sourced)
		const player = game.player
		if (e.team === 'enemy' && player.lifesteal > 0 && !opts.isDot) {
			player.hp = Math.min(player.maxHp, player.hp + dmg * player.lifesteal)
		}

		if (e.hp <= 0) this.killEntity(e)
	}

	killEntity(e) {
		if (e.dead) return
		const game = this.game
		e.dead = true

		// play the character's death animation as a fire-and-forget effect
		const sprite = e.spriteOverride ?? (e.kind === 'boss' ? e.bossDef.sprite : e.def.sprite)
		const death = game.atlas?.anims?.[`${sprite}_death`]
		if (death) {
			const fps = 10
			game.world.effects.push({
				type: 'anim', name: `${sprite}_death`,
				x: e.x, y: e.y - e.r * 0.5,
				t: 0, dur: death.length / fps + 0.25, fps,
				flipX: e.facing < 0,
				scale: e.kind === 'boss' ? 1 : e.scale,
			})
		}

		game.particles.burst({
			x: e.x, y: e.y, count: e.kind === 'boss' ? 40 : 14,
			color: [0xff3434c0, 0xff2626e0, 0xff4a4a4a], speed: 90, life: 0.6,
		})

		if (e.kind === 'boss') {
			game.events.emit('boss:died', e)
			return
		}

		game.audio.play('enemy_die', 0.7)

		// bombers detonate on death
		if (e.def.ai === 'bomber' && !e.exploded) {
			e.exploded = true
			this.explode(e.x, e.y, e.def.blastRadius, e.damage, 'enemy')
		}

		// volatile elites leave a short-fused blast — telegraphed, dodgeable
		if (e.affix === 'volatile' && !e.exploded) {
			e.exploded = true
			const bx = e.x
			const by = e.y
			game.world.addTelegraph({
				x: bx, y: by, r: 38, dur: 0.55, color: 0x30008aff,
				onDone: (g) => g.combat.explode(bx, by, 38, Math.round(e.damage * 1.3), 'enemy'),
			})
		}

		// slimes split into two smaller slimes
		if (e.def.split && !e.noSplit && e.team === 'enemy') {
			for (let i = 0; i < e.def.split.count; i++) {
				const s = game.world.spawnEnemy(e.def.id, e.x + (i === 0 ? -8 : 8), e.y + 4, {
					noSplit: true,
					scale: e.def.split.scale,
					hpMul: e.def.split.hpMul,
					xpMul: 0.3,
				})
				s.aggro = true
				s.r = Math.max(3, s.r * e.def.split.scale)
			}
		}

		if (e.team === 'enemy') {
			game.player.addXp(e.xp, game)
			game.stats.increment('kills')
			if (e.elite) game.stats.increment('eliteKills')
			game.loot.dropLoot(e)
			game.world.checkRoomCleared(e.room)
			game.events.emit('enemy:died', e)
			game.camera.shake(0.1)
		} else {
			// player summon expired/killed
			const i = game.player.summons.indexOf(e)
			if (i >= 0) game.player.summons.splice(i, 1)
		}
	}

	/**
	 * Damage the player. Respects i-frames, dodge roll, shields, defense.
	 * opts: {status, kx, ky, noKnockback, isDot, isHazard, source}
	 */
	damagePlayer(amount, opts = {}) {
		const game = this.game
		const player = game.player
		if (player.dead || game.godMode) return
		if (!opts.isDot && (player.iframes > 0 || player.rollTime > 0)) {
			// perfect dodge: the attack landed inside the roll's opening window
			if (player.rollTime > 0.11 && !opts.isHazard) game.triggerPerfectDodge()
			return
		}

		// shield buffs absorb first
		let dmg = amount
		if (player.shieldHp > 0 && !opts.isDot) {
			const absorbed = Math.min(player.shieldHp, dmg)
			player.shieldHp -= absorbed
			dmg -= absorbed
			game.particles.burst({ x: player.x, y: player.y, count: 6, color: 0xffe8d3a0, speed: 50, life: 0.3 })
			if (player.shieldHp <= 0) player.consumeBuff('shield')
			if (dmg <= 0) return
		}

		// defense: diminishing-returns reduction
		dmg = Math.max(1, Math.round(dmg * (100 / (100 + player.defense * 4)) * player.damageTakenMul))
		player.hp -= dmg
		player.flash = 0.15
		if (!opts.isDot) player.iframes = Math.max(player.iframes, 0.6)

		if (opts.status) game.statusFx.apply(player, opts.status)
		if (!opts.noKnockback && (opts.kx || opts.ky)) {
			const len = Math.hypot(opts.kx, opts.ky) || 1
			player.kbx += (opts.kx / len) * 140
			player.kby += (opts.ky / len) * 140
		}

		// thorns reflect to the attacker
		if (opts.source && player.thorns > 0 && !opts.source.dead) {
			this.damageEntity(opts.source, player.thorns, { noKnockback: true, isDot: true, dotColor: 0xff8a8a8a })
		}

		// vampiric elites feast on landed hits
		if (opts.source && opts.source.affix === 'vampiric' && !opts.source.dead) {
			const s = opts.source
			s.hp = Math.min(s.maxHp, s.hp + dmg * 1.5)
			game.particles.burst({ x: s.x, y: s.y - 4, count: 6, color: 0xffb04ad2, speed: 30, life: 0.5, gravity: -40 })
		}

		game.world.floatText(player.x, player.y - 10, String(dmg), 0xff4444ff, 1.1)
		game.camera.shake(Math.min(0.45, 0.18 + dmg * 0.006))
		game.hitStop = Math.max(game.hitStop, 0.045) // getting hit has weight too
		game.audio.play('hurt')
		game.events.emit('player:hurt', dmg)

		if (player.hp <= 0) {
			player.hp = 0
			player.dead = true
			game.audio.play('player_die')
			game.camera.shake(0.8)
			game.particles.burst({ x: player.x, y: player.y, count: 30, color: [0xff3434c0, 0xffcccccc], speed: 100, life: 0.8 })
			game.events.emit('player:died')
		}
	}

	/** Area damage burst at a point, hurting the opposing team. */
	explode(x, y, radius, damage, team, status = null, colors = null) {
		const game = this.game
		game.particles.burst({
			x, y, count: 18, speed: 110, life: 0.5,
			color: colors ?? [0xff2a8aff, 0xff66d1ff, 0xff4a4a4a],
		})
		game.camera.shake(0.3)
		game.audio.play('explosion', 0.8)

		if (team === 'player') {
			game.world.grid.query(x, y, radius + 12, (e) => {
				if (e.dead || e.team !== 'enemy') return
				if (dist(x, y, e.x, e.y) < radius + e.r) {
					this.damageEntity(e, damage, {
						status,
						knockback: 160,
						kx: e.x - x, ky: e.y - y,
					})
				}
			})
		} else {
			const player = game.player
			if (!player.dead && dist(x, y, player.x, player.y) < radius + player.r) {
				this.damagePlayer(damage, { status, kx: player.x - x, ky: player.y - y })
			}
			// enemy explosions also hit player summons
			game.world.grid.query(x, y, radius + 12, (e) => {
				if (e.dead || e.team !== 'player') return
				if (dist(x, y, e.x, e.y) < radius + e.r) this.damageEntity(e, damage, {})
			})
		}
	}

	breakBarrel(prop) {
		if (prop.dead) return
		const game = this.game
		prop.dead = true
		game.particles.burst({ x: prop.x, y: prop.y, count: 10, color: [0xff2b5a8a, 0xff18385c], speed: 70, life: 0.5 })
		game.audio.play('hit')
		game.loot.dropBarrelLoot(prop)
	}
}
