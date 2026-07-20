import { SKILLS, skillCooldown } from '../data/skills.js'
import { clamp } from '../core/MathUtil.js'

/**
 * The player entity. Holds base attributes, equipment, unlocked skills and
 * derived combat stats. Class behavior differences (passives, weapons)
 * come from the class definition + recalcStats(), not subclasses.
 */
export class Player {
	constructor(classDef) {
		this.kind = 'player'
		this.team = 'player'
		this.classDef = classDef
		this.x = 0
		this.y = 0
		this.vx = 0
		this.vy = 0
		this.kbx = 0
		this.kby = 0
		this.r = 5
		this.facingX = 1
		this.facingY = 0
		this.dead = false

		this.level = 1
		this.xp = 0
		this.gold = 0
		this.attrPoints = 0
		this.skillPoints = 0
		this.attributes = { str: 5, dex: 5, int: 5, vit: 5 }

		this.potions = { hp: 2, mp: 1 }
		this.inventory = [] // item objects (max INVENTORY_SIZE)
		this.equipment = { weapon: null, armor: null, ring: null, boots: null, relic: null }

		// unlocked skills: slot order matches class kit
		this.skills = classDef.skills
			.filter((s) => s.unlockLevel <= 1)
			.map((s) => ({ id: s.id, level: 1, cd: 0 }))

		// transient combat state
		this.iframes = 0
		this.attackCd = 0
		this.dodgeCd = 0
		this.rollTime = 0
		this.rollDirX = 0
		this.rollDirY = 0
		this.comboCount = 0
		this.comboTimer = 0
		this.flash = 0
		this.animT = 0
		this.moving = false
		this.footstepT = 0
		this.buffs = [] // {id, timeLeft, ...data}
		this.shieldHp = 0
		this.statuses = []
		this.summons = []

		this.recalcStats()
		this.hp = this.maxHp
		this.mana = this.maxMana
	}

	get xpNext() {
		return Math.floor(20 * Math.pow(this.level, 1.5))
	}

	/** Recompute all derived stats from class + attributes + equipment. */
	recalcStats() {
		const c = this.classDef
		const a = this.attributes
		const eq = Object.values(this.equipment).filter(Boolean)

		const affix = (key) => {
			let total = 0
			for (const item of eq) {
				for (const af of item.affixes || []) {
					if (af.apply === key) total += af.value
				}
			}
			return total
		}

		a.str = this.baseAttr('str') + affix('str')
		a.dex = this.baseAttr('dex') + affix('dex')
		a.int = this.baseAttr('int') + affix('int')
		a.vit = this.baseAttr('vit') + affix('vit')

		this.maxHp = c.hp + a.vit * 6 + affix('maxHp')
		this.maxMana = c.mana + a.int * 4 + affix('maxMana')
		this.manaRegen = (c.manaRegen + a.int * 0.12) * (c.passive.id === 'arcane_mind' ? 2 : 1)

		const weapon = this.equipment.weapon
		const weaponBonus = weapon ? weapon.statValue : 0
		const scaling = c.weapon.type === 'melee' ? a.str : a.dex
		this.attackDamage = c.weapon.damage + weaponBonus + Math.floor(scaling * 0.9)
		this.attackCooldown = c.weapon.cooldown * (1 - Math.min(0.35, a.dex * 0.004))

		this.critChance = 0.05 + a.dex * 0.004 + affix('crit') / 100 + (c.passive.id === 'opportunist' ? 0.2 : 0)
		this.critMult = c.passive.id === 'opportunist' ? 2.5 : 2.0

		this.defense = (this.equipment.armor ? this.equipment.armor.statValue : 0) + Math.floor(a.vit * 0.5)
		this.damageTakenMul = c.passive.id === 'iron_skin' ? 0.8 : 1.0

		const bootBonus = this.equipment.boots ? this.equipment.boots.statValue : 0
		this.moveSpeed = (c.speed + bootBonus) *
			(1 + affix('moveSpeed') / 100) *
			(c.passive.id === 'fleet_foot' ? 1.12 : 1)

		this.skillPower = (1 + a.int * 0.012 + affix('int') * 0) *
			(c.passive.id === 'arcane_mind' ? 1.25 : 1) +
			(this.equipment.relic ? this.equipment.relic.statValue * 0.05 : 0) +
			(this.equipment.ring ? this.equipment.ring.statValue * 0.03 : 0)

		this.cdr = Math.min(0.4, affix('cdr') / 100)
		this.lifesteal = affix('lifesteal') / 100
		this.xpGain = 1 + affix('xpGain') / 100
		this.thorns = affix('thorns')
		this.potionPower = c.passive.id === 'blessed' ? 1.5 : 1
		this.hpRegen = c.passive.id === 'blessed' ? 0.8 : 0

		this.hp = Math.min(this.hp ?? this.maxHp, this.maxHp)
		this.mana = Math.min(this.mana ?? this.maxMana, this.maxMana)
	}

	baseAttr(key) {
		if (!this._spent) this._spent = { str: 0, dex: 0, int: 0, vit: 0 }
		return 5 + this._spent[key] + (this.level - 1) // small automatic growth per level
	}

	spendAttribute(key) {
		if (this.attrPoints <= 0) return false
		if (!this._spent) this._spent = { str: 0, dex: 0, int: 0, vit: 0 }
		const w = this.classDef.statWeights[key] || 1
		this._spent[key] += Math.round(2 * w)
		this.attrPoints--
		this.recalcStats()
		return true
	}

	addXp(amount, game) {
		this.xp += Math.round(amount * this.xpGain)
		let leveled = false
		while (this.xp >= this.xpNext) {
			this.xp -= this.xpNext
			this.level++
			this.attrPoints += 3
			if (this.level % 2 === 0) this.skillPoints++
			leveled = true
			// unlock class skills at their level gates
			for (const s of this.classDef.skills) {
				if (s.unlockLevel <= this.level && !this.skills.some((k) => k.id === s.id)) {
					this.skills.push({ id: s.id, level: 1, cd: 0 })
					game.ui.toast(`New skill: ${SKILLS[s.id].name}!`)
				}
			}
		}
		if (leveled) {
			this.recalcStats()
			this.hp = this.maxHp // level-up refill: keeps long sessions moving
			this.mana = this.maxMana
			game.audio.play('levelup')
			game.events.emit('player:levelup', this.level)
		}
	}

	upgradeSkill(index) {
		const s = this.skills[index]
		if (!s || this.skillPoints <= 0 || s.level >= 5) return false
		s.level++
		this.skillPoints--
		return true
	}

	hasBuff(id) {
		return this.buffs.some((b) => b.id === id)
	}

	addBuff(buff) {
		const existing = this.buffs.find((b) => b.id === buff.id)
		if (existing) Object.assign(existing, buff)
		else this.buffs.push(buff)
	}

	consumeBuff(id) {
		const i = this.buffs.findIndex((b) => b.id === id)
		if (i >= 0) this.buffs.splice(i, 1)
	}

	usePotion(type, game) {
		if (this.potions[type] <= 0) {
			game.audio.play('error')
			return
		}
		this.potions[type]--
		if (type === 'hp') {
			this.hp = clamp(this.hp + 40 * this.potionPower, 0, this.maxHp)
			game.particles.burst({ x: this.x, y: this.y, count: 10, color: 0xff4d4de0, speed: 40, life: 0.6 })
		} else {
			this.mana = clamp(this.mana + 40, 0, this.maxMana)
			game.particles.burst({ x: this.x, y: this.y, count: 10, color: 0xffd66e3b, speed: 40, life: 0.6 })
		}
		game.audio.play('potion')
	}

	/** Fixed-step update: timers, regen, movement + roll physics. */
	update(game, dt) {
		const input = game.input

		this.iframes = Math.max(0, this.iframes - dt)
		this.attackCd = Math.max(0, this.attackCd - dt)
		this.dodgeCd = Math.max(0, this.dodgeCd - dt)
		this.flash = Math.max(0, this.flash - dt)
		this.comboTimer = Math.max(0, this.comboTimer - dt)
		if (this.comboTimer === 0) this.comboCount = 0
		for (const s of this.skills) s.cd = Math.max(0, s.cd - dt)
		for (let i = this.buffs.length - 1; i >= 0; i--) {
			const b = this.buffs[i]
			if (b.timeLeft !== undefined) {
				b.timeLeft -= dt
				if (b.id === 'sanctuary_heal') this.hp = clamp(this.hp + (b.healPerSecond || 0) * dt, 0, this.maxHp)
				if (b.timeLeft <= 0) {
					if (b.id === 'shield') this.shieldHp = 0
					this.buffs.splice(i, 1)
				}
			}
		}

		this.mana = clamp(this.mana + this.manaRegen * dt, 0, this.maxMana)
		if (this.hpRegen) this.hp = clamp(this.hp + this.hpRegen * dt, 0, this.maxHp)

		// status-effect movement modifiers (freeze/chrono slow, stun)
		let speedMul = 1
		let stunned = false
		for (const st of this.statuses) {
			if (st.id === 'freeze' || st.id === 'chrono') speedMul *= 1 - st.power
			if (st.id === 'stun') stunned = true
		}

		if (this.rollTime > 0) {
			// dodge roll: fixed dash along roll direction with iframes
			this.rollTime -= dt
			this.vx = this.rollDirX * this.moveSpeed * 2.6
			this.vy = this.rollDirY * this.moveSpeed * 2.6
		} else if (!stunned) {
			this.vx = input.moveX * this.moveSpeed * speedMul
			this.vy = input.moveY * this.moveSpeed * speedMul
		} else {
			this.vx = 0
			this.vy = 0
		}

		this.moving = Math.abs(this.vx) + Math.abs(this.vy) > 1
		if (this.moving) {
			this.animT += dt * 10
			this.footstepT -= dt
			if (this.footstepT <= 0) {
				this.footstepT = 0.32
				game.audio.play('footstep')
			}
		}

		if (input.moveX !== 0 || input.moveY !== 0 || input.hasAimStick) {
			this.facingX = input.aimX
			this.facingY = input.aimY
		}

		// knockback impulse decays quickly
		this.kbx *= Math.pow(0.0002, dt)
		this.kby *= Math.pow(0.0002, dt)

		const moved = game.world.map.moveCircle(
			this.x, this.y, this.r,
			(this.vx + this.kbx) * dt,
			(this.vy + this.kby) * dt
		)
		this.x = moved.x
		this.y = moved.y
	}

	tryDodge(game) {
		if (this.dodgeCd > 0 || this.rollTime > 0) return
		const input = game.input
		let dx = input.moveX
		let dy = input.moveY
		if (dx === 0 && dy === 0) {
			dx = this.facingX
			dy = this.facingY
		}
		const len = Math.hypot(dx, dy) || 1
		this.rollDirX = dx / len
		this.rollDirY = dy / len
		this.rollTime = 0.26
		this.dodgeCd = 0.85
		this.iframes = Math.max(this.iframes, 0.32)
		game.audio.play('dash')
		game.particles.burst({ x: this.x, y: this.y, count: 6, color: 0xffcccccc, speed: 30, life: 0.3 })
	}
}

export const INVENTORY_SIZE = 24
