/**
 * Boss definitions: five unique bosses, one per biome.
 *
 * A boss is a phase list; each phase (entered at an HP threshold) loops a
 * `sequence` of attack moves executed by the BossManager. Move types are
 * generic mechanics (radial / spiral / slam / meteor / beam / charge /
 * summon / clones / hazard / timeslow / teleport / chase) so bosses are
 * assembled from data. Later phases are faster and denser — bosses get more
 * aggressive as they take damage, not just tankier.
 */
export const BOSSES = {
	tyrant: {
		id: 'tyrant', name: 'The Grave Tyrant', sprite: 'boss_tyrant',
		music: 'boss_tyrant', hp: 6000, speed: 30, radius: 12, touchDamage: 14,
		xp: 700, poise: 400, projectileSprite: 'orb_bone',
		desc: 'Undead king of the Sunken Crypt.',
		loot: { relicName: 'Crown of the Tyrant', gold: [120, 180] },
		phases: [
			{
				hpAbove: 0.65, speedMul: 1,
				sequence: [
					{ type: 'chase', dur: 1.6 },
					{ type: 'slam', radius: 44, damage: 18, telegraph: 0.8, wait: 0.8 },
					{ type: 'radial', count: 8, speed: 90, damage: 10, wait: 1.2 },
					{ type: 'summon', id: 'skeleton', count: 2, max: 4, wait: 1.0 },
				],
			},
			{
				hpAbove: 0.3, speedMul: 1.2,
				sequence: [
					{ type: 'charge', speed: 240, damage: 20, telegraph: 0.6, wait: 0.5 },
					{ type: 'radial', count: 12, speed: 105, damage: 11, wait: 0.9 },
					{ type: 'slam', radius: 52, damage: 22, telegraph: 0.65, ring: { count: 10, speed: 120 }, wait: 0.7 },
					{ type: 'summon', id: 'skeleton', count: 3, max: 5, wait: 0.8 },
				],
			},
			{
				hpAbove: 0, speedMul: 1.45,
				sequence: [
					{ type: 'radial', count: 16, speed: 115, damage: 12, wait: 0.7 },
					{ type: 'charge', speed: 270, damage: 24, telegraph: 0.45, wait: 0.35 },
					{ type: 'meteor', count: 6, radius: 26, damage: 16, telegraph: 0.9, interval: 0.18, wait: 1.0 },
					{ type: 'slam', radius: 60, damage: 26, telegraph: 0.5, ring: { count: 14, speed: 135 }, wait: 0.6 },
				],
			},
		],
	},

	broodmother: {
		id: 'broodmother', name: 'Broodmother Vex', sprite: 'boss_spider',
		music: 'boss_spider', hp: 11000, speed: 55, radius: 13, touchDamage: 16,
		xp: 1300, poise: 550, projectileSprite: 'orb_poison',
		desc: 'Venomous matriarch of the Caverns.',
		loot: { relicName: 'Fang of the Brood', gold: [180, 260] },
		phases: [
			{
				hpAbove: 0.6, speedMul: 1,
				sequence: [
					{ type: 'charge', speed: 250, damage: 18, telegraph: 0.7, wait: 0.6 },
					{ type: 'hazard', kind: 'web', count: 3, radius: 30, duration: 6, wait: 0.8 },
					{ type: 'summon', id: 'spiderling', count: 3, max: 6, wait: 1.0 },
					{ type: 'radial', count: 10, speed: 95, damage: 11, wait: 1.1 },
				],
			},
			{
				hpAbove: 0.25, speedMul: 1.25,
				sequence: [
					{ type: 'spiral', duration: 2.2, rate: 0.09, speed: 100, damage: 12, arms: 2, wait: 0.8 },
					{ type: 'charge', speed: 280, damage: 22, telegraph: 0.5, wait: 0.4 },
					{ type: 'hazard', kind: 'poison', count: 4, radius: 34, duration: 5, wait: 0.6 },
					{ type: 'summon', id: 'spiderling', count: 4, max: 8, wait: 0.9 },
				],
			},
			{
				hpAbove: 0, speedMul: 1.5,
				sequence: [
					{ type: 'charge', speed: 310, damage: 24, telegraph: 0.4, wait: 0.3 },
					{ type: 'charge', speed: 310, damage: 24, telegraph: 0.4, wait: 0.3 },
					{ type: 'spiral', duration: 2.6, rate: 0.07, speed: 115, damage: 13, arms: 3, wait: 0.7 },
					{ type: 'hazard', kind: 'web', count: 5, radius: 32, duration: 7, wait: 0.5 },
				],
			},
		],
	},

	colossus: {
		id: 'colossus', name: 'The Forge Colossus', sprite: 'boss_golem',
		music: 'boss_golem', hp: 16000, speed: 24, radius: 14, touchDamage: 20,
		xp: 2000, poise: 850, projectileSprite: 'orb_fire',
		desc: 'A furnace given hateful life.',
		loot: { relicName: 'Molten Core', gold: [240, 360] },
		phases: [
			{
				hpAbove: 0.65, speedMul: 1,
				sequence: [
					{ type: 'beam', beams: 1, duration: 3.2, rotSpeed: 0.9, length: 140, damage: 14, telegraph: 1.0, wait: 0.8 },
					{ type: 'slam', radius: 56, damage: 24, telegraph: 0.9, ring: { count: 8, speed: 100 }, wait: 1.0 },
					{ type: 'meteor', count: 5, radius: 28, damage: 18, telegraph: 1.0, interval: 0.25, wait: 1.2 },
				],
			},
			{
				hpAbove: 0.35, speedMul: 1.15,
				sequence: [
					{ type: 'beam', beams: 2, duration: 3.6, rotSpeed: 1.1, length: 150, damage: 16, telegraph: 0.8, wait: 0.7 },
					{ type: 'hazard', kind: 'lava', count: 4, radius: 30, duration: 8, wait: 0.6 },
					{ type: 'meteor', count: 8, radius: 28, damage: 20, telegraph: 0.85, interval: 0.2, wait: 1.0 },
					{ type: 'slam', radius: 62, damage: 26, telegraph: 0.7, ring: { count: 12, speed: 115 }, wait: 0.8 },
				],
			},
			{
				hpAbove: 0, speedMul: 1.3,
				sequence: [
					{ type: 'beam', beams: 3, duration: 4.0, rotSpeed: 1.35, length: 160, damage: 18, telegraph: 0.7, wait: 0.5 },
					{ type: 'meteor', count: 12, radius: 30, damage: 22, telegraph: 0.7, interval: 0.14, wait: 0.8 },
					{ type: 'hazard', kind: 'lava', count: 6, radius: 32, duration: 10, wait: 0.5 },
					{ type: 'radial', count: 18, speed: 110, damage: 14, wait: 0.7 },
				],
			},
		],
	},

	lich: {
		id: 'lich', name: 'Maleth the Frost Lich', sprite: 'boss_lich',
		music: 'boss_lich', hp: 22000, speed: 40, radius: 12, touchDamage: 18,
		xp: 2800, poise: 700, projectileSprite: 'orb_frost',
		desc: 'Master of ice and stolen time.',
		loot: { relicName: 'Heart of Winter', gold: [320, 480] },
		phases: [
			{
				hpAbove: 0.7, speedMul: 1,
				sequence: [
					{ type: 'spiral', duration: 2.4, rate: 0.08, speed: 95, damage: 13, arms: 2, status: { id: 'freeze', duration: 1.2, power: 0.5 }, wait: 0.9 },
					{ type: 'teleport', wait: 0.4 },
					{ type: 'radial', count: 14, speed: 100, damage: 13, wait: 0.9 },
					{ type: 'summon', id: 'bat_frost', count: 2, max: 4, wait: 0.8 },
				],
			},
			{
				hpAbove: 0.4, speedMul: 1.2,
				sequence: [
					{ type: 'timeslow', factor: 0.45, duration: 3, wait: 0.5 },
					{ type: 'spiral', duration: 3.0, rate: 0.065, speed: 110, damage: 14, arms: 3, wait: 0.7 },
					{ type: 'teleport', wait: 0.3 },
					{ type: 'clones', count: 2, hpFrac: 0.06, wait: 1.2 },
					{ type: 'radial', count: 18, speed: 110, damage: 14, status: { id: 'freeze', duration: 1.4, power: 0.55 }, wait: 0.8 },
				],
			},
			{
				hpAbove: 0, speedMul: 1.4,
				sequence: [
					{ type: 'timeslow', factor: 0.35, duration: 3.5, wait: 0.4 },
					{ type: 'meteor', count: 10, radius: 26, damage: 20, telegraph: 0.75, interval: 0.15, wait: 0.6 },
					{ type: 'spiral', duration: 3.4, rate: 0.055, speed: 120, damage: 15, arms: 4, wait: 0.6 },
					{ type: 'teleport', wait: 0.25 },
					{ type: 'clones', count: 3, hpFrac: 0.05, wait: 1.0 },
				],
			},
		],
	},

	sovereign: {
		id: 'sovereign', name: 'The Void Sovereign', sprite: 'boss_void',
		music: 'boss_void', hp: 30000, speed: 48, radius: 14, touchDamage: 24,
		xp: 4500, poise: 1000, projectileSprite: 'orb_void',
		desc: 'The abyss looks back.',
		loot: { relicName: 'Eye of the Sovereign', gold: [500, 800] },
		phases: [
			{
				hpAbove: 0.7, speedMul: 1,
				sequence: [
					{ type: 'teleport', wait: 0.35 },
					{ type: 'spiral', duration: 2.6, rate: 0.075, speed: 105, damage: 15, arms: 2, wait: 0.8 },
					{ type: 'summon', id: 'wisp', count: 2, max: 4, wait: 0.7 },
					{ type: 'radial', count: 16, speed: 110, damage: 15, wait: 0.8 },
					{ type: 'hazard', kind: 'void', count: 3, radius: 28, duration: 9, wait: 0.6 },
				],
			},
			{
				hpAbove: 0.4, speedMul: 1.25,
				sequence: [
					{ type: 'beam', beams: 2, duration: 3.2, rotSpeed: 1.2, length: 150, damage: 17, telegraph: 0.7, wait: 0.6 },
					{ type: 'teleport', wait: 0.3 },
					{ type: 'meteor', count: 8, radius: 28, damage: 22, telegraph: 0.7, interval: 0.16, wait: 0.7 },
					{ type: 'spiral', duration: 3.0, rate: 0.06, speed: 120, damage: 16, arms: 3, wait: 0.6 },
					{ type: 'hazard', kind: 'void', count: 4, radius: 30, duration: 10, wait: 0.5 },
				],
			},
			{
				hpAbove: 0, speedMul: 1.5,
				sequence: [
					{ type: 'timeslow', factor: 0.4, duration: 3, wait: 0.4 },
					{ type: 'teleport', wait: 0.25 },
					{ type: 'spiral', duration: 3.5, rate: 0.05, speed: 130, damage: 17, arms: 4, wait: 0.5 },
					{ type: 'charge', speed: 320, damage: 26, telegraph: 0.4, wait: 0.3 },
					{ type: 'meteor', count: 12, radius: 30, damage: 24, telegraph: 0.6, interval: 0.12, wait: 0.6 },
					{ type: 'radial', count: 22, speed: 120, damage: 16, wait: 0.6 },
				],
			},
		],
	},
}

export const BOSS_LIST = Object.values(BOSSES)
