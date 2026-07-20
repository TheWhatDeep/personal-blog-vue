/**
 * Player class definitions. Each class differs in stats, weapon, passive
 * ability, skill kit and upgrade emphasis — encouraging distinct playstyles.
 *
 * Passive effects are implemented by id in Combat/Player; weapon `type`
 * selects a generic attack executor (melee arc / projectile).
 */
export const CLASSES = {
	warrior: {
		id: 'warrior', name: 'Warrior', sprite: 'hero_warrior',
		desc: 'Unbreakable front-liner. Trades speed for raw\nsurvivability and crushing melee blows.',
		hp: 130, mana: 50, speed: 78, manaRegen: 3,
		weapon: {
			type: 'melee', name: 'Greatsword', icon: 'item_sword',
			damage: 14, range: 26, arc: 2.0, cooldown: 0.55, knockback: 190,
		},
		passive: {
			id: 'iron_skin', name: 'Iron Skin',
			desc: 'Take 20% less damage from all sources.',
		},
		// attribute gains per point: emphasizes str/vit builds
		statWeights: { str: 1.2, dex: 0.8, int: 0.6, vit: 1.2 },
		skills: [
			{ id: 'whirlwind', unlockLevel: 1 },
			{ id: 'heroic_charge', unlockLevel: 3 },
			{ id: 'shield_wall', unlockLevel: 5 },
			{ id: 'shockwave', unlockLevel: 8 },
		],
		unlock: { type: 'default' },
	},

	rogue: {
		id: 'rogue', name: 'Rogue', sprite: 'hero_rogue',
		desc: 'Lethal skirmisher. Fast, fragile, and built\naround critical strikes and poison.',
		hp: 85, mana: 60, speed: 100, manaRegen: 4,
		weapon: {
			type: 'melee', name: 'Twin Daggers', icon: 'item_dagger',
			damage: 8, range: 20, arc: 1.4, cooldown: 0.28, knockback: 60,
		},
		passive: {
			id: 'opportunist', name: 'Opportunist',
			desc: '+20% critical chance. Crits deal 2.5x damage.',
		},
		statWeights: { str: 0.8, dex: 1.4, int: 0.7, vit: 0.8 },
		skills: [
			{ id: 'fan_of_knives', unlockLevel: 1 },
			{ id: 'shadowstep', unlockLevel: 3 },
			{ id: 'poison_vial', unlockLevel: 5 },
			{ id: 'blade_flurry', unlockLevel: 8 },
		],
		unlock: { type: 'default' },
	},

	mage: {
		id: 'mage', name: 'Mage', sprite: 'hero_mage',
		desc: 'Glass cannon. Devastating elemental magic\nfueled by a deep mana pool.',
		hp: 70, mana: 110, speed: 84, manaRegen: 7,
		weapon: {
			type: 'projectile', name: 'Apprentice Staff', icon: 'item_staff',
			damage: 10, range: 190, cooldown: 0.5, speed: 210, sprite: 'orb_void', manaPerShot: 0,
		},
		passive: {
			id: 'arcane_mind', name: 'Arcane Mind',
			desc: '+25% skill damage and double mana regen.',
		},
		statWeights: { str: 0.5, dex: 0.8, int: 1.5, vit: 0.7 },
		skills: [
			{ id: 'fireball', unlockLevel: 1 },
			{ id: 'frost_nova', unlockLevel: 3 },
			{ id: 'chain_lightning', unlockLevel: 5 },
			{ id: 'arcane_barrier', unlockLevel: 8 },
		],
		unlock: { type: 'default' },
	},

	ranger: {
		id: 'ranger', name: 'Ranger', sprite: 'hero_ranger',
		desc: 'Mobile sharpshooter. Kites enemies with\npiercing arrows and a loyal companion.',
		hp: 95, mana: 70, speed: 94, manaRegen: 5,
		weapon: {
			type: 'projectile', name: 'Longbow', icon: 'item_bow',
			damage: 11, range: 240, cooldown: 0.45, speed: 300, sprite: 'arrow', pierce: 1,
		},
		passive: {
			id: 'fleet_foot', name: 'Fleet Foot',
			desc: '+12% movement speed; arrows pierce one extra enemy.',
		},
		statWeights: { str: 0.7, dex: 1.3, int: 0.8, vit: 0.9 },
		skills: [
			{ id: 'multishot', unlockLevel: 1 },
			{ id: 'tumble', unlockLevel: 3 },
			{ id: 'toxic_trap', unlockLevel: 5 },
			{ id: 'spirit_wolf', unlockLevel: 8 },
		],
		unlock: { type: 'achievement', stat: 'bossKills', value: 1, hint: 'Defeat your first boss' },
	},

	cleric: {
		id: 'cleric', name: 'Cleric', sprite: 'hero_cleric',
		desc: 'Holy battlemage. Sustains through any fight\nwith healing and radiant smites.',
		hp: 110, mana: 90, speed: 80, manaRegen: 5,
		weapon: {
			type: 'melee', name: 'Warhammer', icon: 'item_mace',
			damage: 12, range: 24, arc: 1.7, cooldown: 0.6, knockback: 150,
		},
		passive: {
			id: 'blessed', name: 'Blessed',
			desc: 'Slowly regenerate health; potions heal 50% more.',
		},
		statWeights: { str: 1.0, dex: 0.7, int: 1.2, vit: 1.1 },
		skills: [
			{ id: 'smite', unlockLevel: 1 },
			{ id: 'heal', unlockLevel: 3 },
			{ id: 'holy_nova', unlockLevel: 5 },
			{ id: 'sanctuary', unlockLevel: 8 },
		],
		unlock: { type: 'achievement', stat: 'floorsReached', value: 6, hint: 'Reach floor 6' },
	},
}

export const CLASS_LIST = Object.values(CLASSES)
