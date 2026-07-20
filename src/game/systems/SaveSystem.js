/**
 * Save system: persists settings, statistics, achievements, high scores,
 * class/endless unlocks to localStorage. Run state is roguelite — only
 * meta-progression persists, which is what makes permanent unlocks matter.
 */
const SAVE_KEY = 'dungeondepths_save_v1'

export const ACHIEVEMENTS = [
	{ id: 'first_blood', name: 'First Blood', desc: 'Slay your first enemy', stat: 'kills', value: 1 },
	{ id: 'slayer', name: 'Slayer', desc: 'Slay 100 enemies', stat: 'kills', value: 100 },
	{ id: 'exterminator', name: 'Exterminator', desc: 'Slay 1000 enemies', stat: 'kills', value: 1000 },
	{ id: 'boss_slayer', name: 'Boss Slayer', desc: 'Defeat your first boss', stat: 'bossKills', value: 1 },
	{ id: 'deep_delver', name: 'Deep Delver', desc: 'Reach floor 6', stat: 'floorsReached', value: 6 },
	{ id: 'abyss_walker', name: 'Abyss Walker', desc: 'Reach floor 13', stat: 'floorsReached', value: 13 },
	{ id: 'world_savior', name: 'Savior of the Depths', desc: 'Defeat the Void Sovereign', stat: 'sovereignKills', value: 1 },
	{ id: 'hoarder', name: 'Hoarder', desc: 'Collect 1000 gold total', stat: 'goldCollected', value: 1000 },
	{ id: 'treasure_hunter', name: 'Treasure Hunter', desc: 'Open 20 chests', stat: 'chestsOpened', value: 20 },
	{ id: 'secret_seeker', name: 'Secret Seeker', desc: 'Find 5 secret rooms', stat: 'secretsFound', value: 5 },
	{ id: 'elite_hunter', name: 'Elite Hunter', desc: 'Slay 25 elite enemies', stat: 'eliteKills', value: 25 },
	{ id: 'endless_10', name: 'Unstoppable', desc: 'Survive 10 endless waves', stat: 'bestEndlessWave', value: 10 },
	{ id: 'endless_25', name: 'Eternal', desc: 'Survive 25 endless waves', stat: 'bestEndlessWave', value: 25 },
]

const DEFAULT_SAVE = () => ({
	settings: {
		volumes: { master: 0.8, music: 0.7, sfx: 0.8 },
		screenShake: true,
		showDamageNumbers: true,
		levelScaling: true, // souls-like equalizer: enemies scale with overleveling
	},
	stats: {
		kills: 0, eliteKills: 0, bossKills: 0, sovereignKills: 0,
		deaths: 0, floorsReached: 1, goldCollected: 0, chestsOpened: 0,
		secretsFound: 0, itemsFound: 0, runs: 0, playtime: 0,
		bestEndlessWave: 0,
	},
	achievements: [],
	highscores: { bestFloor: 0, bestLevel: 0, mostKillsRun: 0, bestEndlessWave: 0 },
	endlessUnlocked: false,
})

export class SaveSystem {
	constructor(game) {
		this.game = game
		this.data = DEFAULT_SAVE()
		this.load()
	}

	load() {
		try {
			const raw = localStorage.getItem(SAVE_KEY)
			if (raw) {
				const parsed = JSON.parse(raw)
				// deep-merge over defaults so new fields survive old saves
				this.data = {
					...DEFAULT_SAVE(),
					...parsed,
					settings: { ...DEFAULT_SAVE().settings, ...parsed.settings, volumes: { ...DEFAULT_SAVE().settings.volumes, ...parsed.settings?.volumes } },
					stats: { ...DEFAULT_SAVE().stats, ...parsed.stats },
					highscores: { ...DEFAULT_SAVE().highscores, ...parsed.highscores },
				}
			}
		} catch (e) {
			console.warn('Save load failed, starting fresh', e)
			this.data = DEFAULT_SAVE()
		}
	}

	save() {
		try {
			localStorage.setItem(SAVE_KEY, JSON.stringify(this.data))
		} catch (e) {
			// storage may be unavailable (private mode) — game still works
		}
	}

	/** Increment a lifetime statistic and check achievements. */
	increment(stat, amount = 1) {
		if (this.data.stats[stat] === undefined) this.data.stats[stat] = 0
		this.data.stats[stat] += amount
		this.checkAchievements()
	}

	setMax(stat, value) {
		if ((this.data.stats[stat] ?? 0) < value) {
			this.data.stats[stat] = value
			this.checkAchievements()
		}
	}

	highscore(key, value) {
		if ((this.data.highscores[key] ?? 0) < value) {
			this.data.highscores[key] = value
			this.save()
			return true
		}
		return false
	}

	checkAchievements() {
		for (const a of ACHIEVEMENTS) {
			if (this.data.achievements.includes(a.id)) continue
			if ((this.data.stats[a.stat] ?? 0) >= a.value) {
				this.data.achievements.push(a.id)
				this.game.ui?.toast(`Achievement: ${a.name}!`, 0xff3ad2e8)
				this.game.audio?.play('achievement')
			}
		}
		this.save()
	}

	isClassUnlocked(classDef) {
		if (classDef.unlock.type === 'default') return true
		return (this.data.stats[classDef.unlock.stat] ?? 0) >= classDef.unlock.value
	}

	get settings() {
		return this.data.settings
	}
}
