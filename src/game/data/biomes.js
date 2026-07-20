/**
 * Biome definitions: tile colors (rasterized into the atlas), enemy spawn
 * pools, ambience and the boss that closes the biome out.
 *
 * The dungeon is 15 floors: 5 biomes x 3 floors, with the biome boss on
 * every third floor. Adding a biome = adding an entry here plus a boss.
 */
export const FLOORS_PER_BIOME = 3

export const BIOMES = [
	{
		id: 'crypt',
		name: 'The Sunken Crypt',
		floorColor: '#4a4454', floorDark: '#3b3644', floorLight: '#585264',
		wallColor: '#2e2a38', wallTop: '#1c1a24',
		hazardColor: '#233024', hazardGlow: '#39543b', hazardType: 'spikes',
		clearColor: [0.07, 0.06, 0.09],
		tileSeed: 91,
		music: 'biome_crypt',
		boss: 'tyrant',
		enemies: [
			{ item: 'slime', weight: 4 },
			{ item: 'skeleton', weight: 4 },
			{ item: 'goblin_archer', weight: 2 },
			{ item: 'bat', weight: 2 },
		],
	},
	{
		id: 'caverns',
		name: 'Web-Choked Caverns',
		floorColor: '#3d4a3f', floorDark: '#2f3a31', floorLight: '#4b5a4d',
		wallColor: '#26302a', wallTop: '#161d19',
		hazardColor: '#1c3822', hazardGlow: '#3f8a1e', hazardType: 'poison',
		clearColor: [0.05, 0.08, 0.06],
		tileSeed: 92,
		music: 'biome_caverns',
		boss: 'broodmother',
		enemies: [
			{ item: 'spiderling', weight: 5 },
			{ item: 'slime', weight: 2 },
			{ item: 'goblin_archer', weight: 3 },
			{ item: 'assassin', weight: 2 },
			{ item: 'bat', weight: 2 },
		],
	},
	{
		id: 'forge',
		name: 'The Molten Forge',
		floorColor: '#54423a', floorDark: '#43342e', floorLight: '#665048',
		wallColor: '#382a26', wallTop: '#241a18',
		hazardColor: '#8a2c10', hazardGlow: '#ff8a2a', hazardType: 'lava',
		clearColor: [0.1, 0.05, 0.04],
		tileSeed: 93,
		music: 'biome_forge',
		boss: 'colossus',
		enemies: [
			{ item: 'brute', weight: 4 },
			{ item: 'cultist', weight: 3 },
			{ item: 'bomber', weight: 3 },
			{ item: 'skeleton', weight: 2 },
		],
	},
	{
		id: 'glacier',
		name: 'The Howling Glacier',
		floorColor: '#4a5a6e', floorDark: '#3b4858', floorLight: '#5c7088',
		wallColor: '#2c3a4c', wallTop: '#1a2430',
		hazardColor: '#274050', hazardGlow: '#8fd3ff', hazardType: 'frost',
		clearColor: [0.05, 0.07, 0.1],
		tileSeed: 94,
		music: 'biome_glacier',
		boss: 'lich',
		enemies: [
			{ item: 'bat_frost', weight: 3 },
			{ item: 'brute_frost', weight: 3 },
			{ item: 'cultist', weight: 3 },
			{ item: 'assassin', weight: 2 },
			{ item: 'necromancer', weight: 2 },
		],
	},
	{
		id: 'abyss',
		name: 'The Screaming Abyss',
		floorColor: '#3a2e4e', floorDark: '#2c2340', floorLight: '#48395e',
		wallColor: '#241c34', wallTop: '#140f20',
		hazardColor: '#160b26', hazardGlow: '#b06cff', hazardType: 'void',
		clearColor: [0.06, 0.04, 0.1],
		tileSeed: 95,
		music: 'biome_abyss',
		boss: 'sovereign',
		enemies: [
			{ item: 'wisp', weight: 3 },
			{ item: 'necromancer', weight: 3 },
			{ item: 'assassin', weight: 3 },
			{ item: 'cultist', weight: 2 },
			{ item: 'bomber', weight: 2 },
			{ item: 'brute', weight: 2 },
		],
	},
]

export function biomeForFloor(floor) {
	const idx = Math.min(BIOMES.length - 1, Math.floor((floor - 1) / FLOORS_PER_BIOME))
	return BIOMES[idx]
}

export function isBossFloor(floor) {
	return floor % FLOORS_PER_BIOME === 0 && floor <= BIOMES.length * FLOORS_PER_BIOME
}

export const FINAL_FLOOR = BIOMES.length * FLOORS_PER_BIOME
