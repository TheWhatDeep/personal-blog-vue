/**
 * Enemy archetype definitions, consumed by the Enemy factory and AISystem.
 *
 * `ai` picks a behavior profile (finite state machine tuning) — movement
 * and attack styles are behavior data, not subclasses. Elite variants are
 * generated at spawn time via ELITE_MODIFIER.
 */
export const ENEMIES = {
	slime: {
		id: 'slime', name: 'Slime', sprite: 'slime',
		hp: 18, speed: 42, damage: 6, xp: 6, radius: 6,
		detect: 90, attackRange: 14, attackCd: 1.1, ai: 'melee',
		lootTier: 0, poise: 8, hopper: true,
		split: { count: 2, scale: 0.65, hpMul: 0.35 }, // splits on death
	},
	skeleton: {
		id: 'skeleton', name: 'Skeleton', sprite: 'skeleton',
		hp: 26, speed: 55, damage: 8, xp: 9, radius: 6,
		detect: 110, attackRange: 16, attackCd: 0.9, ai: 'melee',
		lootTier: 0, poise: 14,
	},
	goblin_archer: {
		id: 'goblin_archer', name: 'Goblin Archer', sprite: 'goblin_archer',
		hp: 20, speed: 60, damage: 7, xp: 10, radius: 6,
		detect: 150, attackRange: 120, attackCd: 1.6, ai: 'ranged',
		projectile: { sprite: 'arrow', speed: 170 },
		keepDistance: 90, lootTier: 0, poise: 12,
	},
	cultist: {
		id: 'cultist', name: 'Cultist', sprite: 'cultist',
		hp: 24, speed: 50, damage: 10, xp: 14, radius: 6,
		detect: 160, attackRange: 130, attackCd: 2.2, ai: 'ranged',
		projectile: { sprite: 'orb_fire', speed: 120, status: { id: 'burn', duration: 2, power: 3 } },
		keepDistance: 100, lootTier: 1, poise: 14,
	},
	assassin: {
		id: 'assassin', name: 'Assassin', sprite: 'assassin',
		hp: 22, speed: 95, damage: 12, xp: 16, radius: 6,
		detect: 170, attackRange: 16, attackCd: 1.4, ai: 'assassin',
		dashSpeed: 260, dashRange: 90, recoverTime: 1.2, lootTier: 1, poise: 16,
	},
	brute: {
		id: 'brute', name: 'Brute', sprite: 'brute',
		hp: 70, speed: 34, damage: 16, xp: 24, radius: 8,
		detect: 120, attackRange: 20, attackCd: 1.6, ai: 'tank',
		knockbackResist: 0.8, slamRadius: 34, lootTier: 1, poise: 70,
	},
	brute_frost: {
		id: 'brute_frost', name: 'Frostbound Brute', sprite: 'brute_frost',
		hp: 85, speed: 32, damage: 18, xp: 30, radius: 8,
		detect: 120, attackRange: 20, attackCd: 1.7, ai: 'tank',
		knockbackResist: 0.85, slamRadius: 36, lootTier: 2, poise: 80,
		slamStatus: { id: 'freeze', duration: 1.2, power: 0.6 },
	},
	necromancer: {
		id: 'necromancer', name: 'Necromancer', sprite: 'necromancer',
		hp: 34, speed: 45, damage: 9, xp: 26, radius: 6,
		detect: 170, attackRange: 150, attackCd: 3.5, ai: 'summoner',
		summonId: 'skeleton', summonMax: 3, keepDistance: 120,
		projectile: { sprite: 'orb_bone', speed: 110 }, lootTier: 2, poise: 20,
	},
	bat: {
		id: 'bat', name: 'Cave Bat', sprite: 'bat',
		hp: 12, speed: 85, damage: 5, xp: 6, radius: 5,
		detect: 130, attackRange: 12, attackCd: 0.8, ai: 'flyer',
		flying: true, swoopSpeed: 160, lootTier: 0, poise: 6,
	},
	bat_frost: {
		id: 'bat_frost', name: 'Frost Bat', sprite: 'bat_frost',
		hp: 16, speed: 90, damage: 7, xp: 9, radius: 5,
		detect: 140, attackRange: 12, attackCd: 0.8, ai: 'flyer',
		flying: true, swoopSpeed: 175, lootTier: 1, poise: 8,
		touchStatus: { id: 'freeze', duration: 0.8, power: 0.5 },
	},
	bomber: {
		id: 'bomber', name: 'Walking Bomb', sprite: 'bomber',
		hp: 16, speed: 70, damage: 22, xp: 12, radius: 6,
		detect: 130, attackRange: 20, attackCd: 1, ai: 'bomber',
		fuseTime: 0.8, blastRadius: 40, lootTier: 0, poise: 10,
	},
	spiderling: {
		id: 'spiderling', name: 'Spiderling', sprite: 'spiderling',
		hp: 10, speed: 105, damage: 4, xp: 4, radius: 4,
		detect: 140, attackRange: 10, attackCd: 0.7, ai: 'melee',
		lootTier: 0, poise: 4,
	},
	wisp: {
		id: 'wisp', name: 'Void Wisp', sprite: 'wisp',
		hp: 20, speed: 75, damage: 9, xp: 15, radius: 4,
		detect: 160, attackRange: 110, attackCd: 1.8, ai: 'ranged',
		flying: true, projectile: { sprite: 'orb_void', speed: 140 },
		keepDistance: 80, lootTier: 1, poise: 10,
	},

	lancer: {
		id: 'lancer', name: 'Lancer', sprite: 'lancer',
		hp: 40, speed: 42, damage: 18, xp: 22, radius: 7,
		detect: 170, attackRange: 150, attackCd: 2.6, ai: 'lancer',
		chargeSpeed: 300, chargeTelegraph: 0.75, recoverTime: 1.0,
		lootTier: 1, poise: 40,
	},
	rider: {
		id: 'rider', name: 'Orc Rider', sprite: 'rider',
		hp: 34, speed: 125, damage: 14, xp: 20, radius: 7,
		detect: 190, attackRange: 100, attackCd: 2.2, ai: 'rider',
		orbitRadius: 90, diveSpeed: 290, recoverTime: 0.7,
		lootTier: 1, poise: 24,
	},
	shield_skeleton: {
		id: 'shield_skeleton', name: 'Shielded Skeleton', sprite: 'shield_skeleton',
		hp: 45, speed: 44, damage: 10, xp: 20, radius: 7,
		detect: 130, attackRange: 18, attackCd: 1.2, ai: 'melee',
		shield: true, guardBreak: 32, // frontal block until this much damage is blocked
		knockbackResist: 0.5, lootTier: 1, poise: 50,
	},

	// ---- player summons (team: player) --------------------------------------
	summon_skeleton: {
		id: 'summon_skeleton', name: 'Risen Skeleton', sprite: 'skeleton',
		hp: 30, speed: 70, damage: 7, xp: 0, radius: 6,
		detect: 140, attackRange: 16, attackCd: 0.8, ai: 'melee', lootTier: -1, poise: 24,
	},
	summon_wolf: {
		id: 'summon_wolf', name: 'Spirit Wolf', sprite: 'assassin',
		hp: 45, speed: 110, damage: 10, xp: 0, radius: 6,
		detect: 160, attackRange: 16, attackCd: 0.6, ai: 'melee', lootTier: -1, poise: 30,
	},
}

/** Multipliers + visual treatment applied to elite spawns. */
export const ELITE_MODIFIER = {
	hp: 2.6, damage: 1.5, speed: 1.12, xp: 3, scale: 1.3,
	lootBonus: 2, // rarity roll bonus tiers
	tint: 0xff3ad2ff, // golden glow (ABGR)
}
