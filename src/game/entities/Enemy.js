import { ENEMIES, ELITE_MODIFIER } from '../data/enemies.js'

/**
 * Enemy factory. Enemies are plain data objects driven by the AISystem's
 * finite state machine — behavior comes from `def.ai` + tuning fields,
 * so new enemy types are data entries, not classes.
 */
let nextId = 1

export function createEnemy(defId, x, y, opts = {}) {
	const def = ENEMIES[defId]
	if (!def) throw new Error(`Unknown enemy: ${defId}`)
	const elite = !!opts.elite
	const hpMul = (opts.hpMul ?? 1) * (elite ? ELITE_MODIFIER.hp : 1)
	const dmgMul = (opts.dmgMul ?? 1) * (elite ? ELITE_MODIFIER.damage : 1)

	return {
		id: nextId++,
		kind: 'enemy',
		def,
		team: opts.team ?? 'enemy',
		x, y,
		vx: 0, vy: 0,
		kbx: 0, kby: 0, // knockback velocity, decays fast
		r: def.radius * (elite ? ELITE_MODIFIER.scale : 1),
		scale: (elite ? ELITE_MODIFIER.scale : 1) * (opts.scale ?? 1),
		hp: Math.round(def.hp * hpMul),
		maxHp: Math.round(def.hp * hpMul),
		damage: Math.round(def.damage * dmgMul),
		speed: def.speed * (elite ? ELITE_MODIFIER.speed : 1),
		xp: Math.round(def.xp * (elite ? ELITE_MODIFIER.xp : 1) * (opts.xpMul ?? 1)),
		elite,
		tint: elite ? ELITE_MODIFIER.tint : 0xffffffff,

		// FSM state
		state: 'idle',
		stateTime: 0,
		attackTimer: 0.5 + Math.random() * 0.5,
		touchTimer: 0,
		patrolX: x,
		patrolY: y,
		homeX: x,
		homeY: y,
		targetX: x,
		targetY: y,
		dashX: 0,
		dashY: 0,
		fuse: -1, // bomber
		summonCount: 0,

		statuses: [],
		flash: 0,
		animT: Math.random() * 10,
		facing: 1,
		dead: false,
		room: opts.room ?? -1,
		lifetime: opts.lifetime ?? Infinity, // player summons expire
		aggro: false,
	}
}
