/**
 * Data-driven skill registry.
 *
 * A skill is pure data: the SkillSystem interprets its `type` with a generic
 * executor (projectile / nova / dash / heal / cloud / chain / shield /
 * summon / multishot / spin). New skills — including class variants — are
 * new entries here, not new code.
 *
 * Scaling per skill level: damage +25%, cooldown -6% (see SkillSystem).
 */
export const SKILLS = {
	// ---- mage -------------------------------------------------------------
	fireball: {
		id: 'fireball', name: 'Fireball', icon: 'icon_fireball',
		desc: 'Hurl an exploding orb of flame that burns enemies.',
		type: 'projectile', mana: 12, cooldown: 1.6, damage: 22,
		range: 220, speed: 170, radius: 34, sprite: 'orb_fire',
		status: { id: 'burn', duration: 2.5, power: 4 },
		explode: true, sound: 'skill_fire', colors: [0xff2a8aff, 0xff66d1ff, 0xff1543d8],
	},
	frost_nova: {
		id: 'frost_nova', name: 'Frost Nova', icon: 'icon_frost',
		desc: 'A ring of ice erupts around you, freezing enemies.',
		type: 'nova', mana: 18, cooldown: 6, damage: 16, radius: 64,
		status: { id: 'freeze', duration: 2.2, power: 0.85 },
		sound: 'skill_frost', colors: [0xffffd38f, 0xffd89f4a, 0xffe3f0ff],
	},
	chain_lightning: {
		id: 'chain_lightning', name: 'Chain Lightning', icon: 'icon_bolt',
		desc: 'Lightning arcs between up to 5 enemies.',
		type: 'chain', mana: 20, cooldown: 5, damage: 18, range: 150,
		jumps: 5, jumpRange: 90,
		status: { id: 'shock', duration: 1.2, power: 1.3 },
		sound: 'skill_lightning', colors: [0xff4ae9ff, 0xffffffff],
	},
	arcane_barrier: {
		id: 'arcane_barrier', name: 'Arcane Barrier', icon: 'icon_shield',
		desc: 'Absorb damage with a shield of pure mana.',
		type: 'shield', mana: 22, cooldown: 12, absorb: 40, duration: 6,
		sound: 'skill_shield', colors: [0xffd66e3b, 0xffff9c6c],
	},

	// ---- warrior ------------------------------------------------------------
	whirlwind: {
		id: 'whirlwind', name: 'Whirlwind', icon: 'icon_whirl',
		desc: 'Spin with your weapon, striking all nearby enemies.',
		type: 'spin', mana: 14, cooldown: 4, damage: 18, radius: 42,
		knockback: 180, sound: 'swing', colors: [0xffffffff, 0xffb1a59a],
	},
	shield_wall: {
		id: 'shield_wall', name: 'Shield Wall', icon: 'icon_shield',
		desc: 'Brace behind your shield, blocking most damage.',
		type: 'shield', mana: 15, cooldown: 12, absorb: 55, duration: 5,
		sound: 'skill_shield', colors: [0xffb1a59a, 0xffe3d8cf],
	},
	heroic_charge: {
		id: 'heroic_charge', name: 'Heroic Charge', icon: 'icon_dash',
		desc: 'Charge forward, damaging and knocking back enemies.',
		type: 'dash', mana: 12, cooldown: 5, damage: 20, distance: 90,
		knockback: 260, sound: 'dash', colors: [0xffb1a59a, 0xff3434c0],
	},
	shockwave: {
		id: 'shockwave', name: 'Shockwave', icon: 'icon_smite',
		desc: 'Slam the ground, staggering everything around you.',
		type: 'nova', mana: 20, cooldown: 8, damage: 26, radius: 70,
		knockback: 320, status: { id: 'stun', duration: 1.0, power: 1 },
		sound: 'explosion', colors: [0xff6a7a8a, 0xffb1a59a],
	},

	// ---- rogue ---------------------------------------------------------------
	shadowstep: {
		id: 'shadowstep', name: 'Shadowstep', icon: 'icon_shadow',
		desc: 'Vanish and reappear ahead; your next hit always crits.',
		type: 'dash', mana: 10, cooldown: 4, damage: 0, distance: 80,
		buff: { id: 'guaranteed_crit', duration: 3 },
		sound: 'dash', colors: [0xff2e2626, 0xffff6cb0],
	},
	fan_of_knives: {
		id: 'fan_of_knives', name: 'Fan of Knives', icon: 'icon_arrows',
		desc: 'Throw a fan of five poisoned daggers.',
		type: 'multishot', mana: 14, cooldown: 3, damage: 10,
		count: 5, spread: 0.9, speed: 220, range: 160, sprite: 'orb_poison',
		status: { id: 'poison', duration: 3, power: 3 },
		sound: 'bow', colors: [0xff4ad27a, 0xffcfd8e3],
	},
	poison_vial: {
		id: 'poison_vial', name: 'Poison Vial', icon: 'icon_poison',
		desc: 'Shatter a vial, leaving a toxic cloud that lingers.',
		type: 'cloud', mana: 18, cooldown: 7, damage: 6, radius: 48,
		duration: 4, tick: 0.5, range: 120,
		status: { id: 'poison', duration: 2, power: 4 },
		sound: 'skill_poison', colors: [0xff4ad27a, 0xff1e8a3f],
	},
	blade_flurry: {
		id: 'blade_flurry', name: 'Blade Flurry', icon: 'icon_whirl',
		desc: 'A lightning-fast spin of blades with a wide reach.',
		type: 'spin', mana: 16, cooldown: 5, damage: 14, radius: 50,
		knockback: 80, sound: 'swing', colors: [0xffcfd8e3, 0xff4ad27a],
	},

	// ---- ranger ---------------------------------------------------------------
	multishot: {
		id: 'multishot', name: 'Multishot', icon: 'icon_arrows',
		desc: 'Loose three arrows in a spreading volley.',
		type: 'multishot', mana: 12, cooldown: 2.5, damage: 14,
		count: 3, spread: 0.5, speed: 260, range: 220, sprite: 'arrow',
		sound: 'bow', colors: [0xff4dc763],
	},
	tumble: {
		id: 'tumble', name: 'Tumble', icon: 'icon_dash',
		desc: 'Roll away quickly, avoiding all damage.',
		type: 'dash', mana: 8, cooldown: 3, damage: 0, distance: 70,
		sound: 'dash', colors: [0xff2b5a8a, 0xff63c74d],
	},
	toxic_trap: {
		id: 'toxic_trap', name: 'Toxic Trap', icon: 'icon_poison',
		desc: 'Plant a trap that erupts into poison gas.',
		type: 'cloud', mana: 16, cooldown: 8, damage: 8, radius: 44,
		duration: 5, tick: 0.5, range: 90,
		status: { id: 'poison', duration: 3, power: 4 },
		sound: 'skill_poison', colors: [0xff4ad27a, 0xff1e8a3f],
	},
	spirit_wolf: {
		id: 'spirit_wolf', name: 'Spirit Wolf', icon: 'icon_skull',
		desc: 'Summon a spectral companion that fights beside you.',
		type: 'summon', mana: 25, cooldown: 18, damage: 8,
		summonId: 'summon_wolf', summonCount: 1, duration: 15,
		sound: 'skill_summon', colors: [0xffff8a5a, 0xffffffff],
	},

	// ---- cleric ----------------------------------------------------------------
	heal: {
		id: 'heal', name: 'Healing Light', icon: 'icon_heal',
		desc: 'Restore a portion of your health.',
		type: 'heal', mana: 20, cooldown: 8, amount: 30,
		sound: 'skill_heal', colors: [0xff4dc763, 0xffffffff],
	},
	smite: {
		id: 'smite', name: 'Smite', icon: 'icon_smite',
		desc: 'Call down holy fire on the nearest enemy.',
		type: 'chain', mana: 14, cooldown: 3, damage: 24, range: 140,
		jumps: 1, jumpRange: 0,
		sound: 'skill_lightning', colors: [0xff3ab5e8, 0xff66d1ff],
	},
	sanctuary: {
		id: 'sanctuary', name: 'Sanctuary', icon: 'icon_shield',
		desc: 'A blessed ward absorbs damage and pulses healing.',
		type: 'shield', mana: 24, cooldown: 14, absorb: 35, duration: 6,
		healPerSecond: 2,
		sound: 'skill_shield', colors: [0xff3ab5e8, 0xffffffff],
	},
	holy_nova: {
		id: 'holy_nova', name: 'Holy Nova', icon: 'icon_frost',
		desc: 'A burst of radiance damages foes and mends your wounds.',
		type: 'nova', mana: 22, cooldown: 9, damage: 20, radius: 60,
		selfHeal: 10, knockback: 160,
		sound: 'skill_heal', colors: [0xff66d1ff, 0xffffffff],
	},
}

export function skillDamage(def, level) {
	return Math.round((def.damage || 0) * Math.pow(1.25, level - 1))
}

export function skillCooldown(def, level) {
	return def.cooldown * Math.pow(0.94, level - 1)
}
