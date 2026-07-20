import { Rng } from '../core/Rng.js'

/**
 * Procedural chiptune composer.
 *
 * Tracks are deterministic (seeded) 32-step patterns in a minor scale:
 * bass, lead, pad and drums. Every biome gets an ambient theme and every
 * boss gets a faster, more aggressive one — unique music without shipping
 * audio files, and new themes are just new seed/param entries.
 */

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]

/**
 * @param {object} opts {seed, tempo, root, aggressive, scale}
 * @returns music track definition consumed by AudioSystem
 */
export function composeTrack(opts) {
	const rng = new Rng(opts.seed)
	const scale = opts.scale === 'phrygian' ? PHRYGIAN : MINOR
	const steps = 32
	const bass = new Array(steps).fill(null)
	const lead = new Array(steps).fill(null)
	const pad = new Array(steps).fill(null)
	const kick = new Array(steps).fill(false)
	const hat = new Array(steps).fill(false)
	const snare = new Array(steps).fill(false)

	// chord progression over 4 bars (degrees of the scale)
	const degrees = [0, rng.pick([3, 5]), rng.pick([2, 4]), rng.pick([4, 5])]

	for (let bar = 0; bar < 4; bar++) {
		const rootDeg = degrees[bar]
		for (let s = 0; s < 8; s++) {
			const i = bar * 8 + s
			// bass: root pulse with passing notes
			if (s % (opts.aggressive ? 1 : 2) === 0) {
				const deg = s === 6 && rng.chance(0.5) ? rootDeg + 4 : rootDeg
				bass[i] = degreeToSemis(scale, deg) - 24
			}
			// lead: sparse melody, denser when aggressive
			const leadChance = opts.aggressive ? 0.5 : 0.28
			if (rng.chance(leadChance)) {
				lead[i] = degreeToSemis(scale, rootDeg + rng.int(0, 6)) + (rng.chance(0.3) ? 12 : 0)
			}
			// pad: chord tone at bar start
			if (s === 0) pad[i] = degreeToSemis(scale, rootDeg) - 12
			// drums
			if (opts.aggressive) {
				if (s % 2 === 0) kick[i] = true
				if (s % 2 === 1) hat[i] = true
				if (s === 4) snare[i] = true
			} else {
				if (s === 0) kick[i] = true
				if (s === 4 && rng.chance(0.6)) hat[i] = true
			}
		}
	}

	return {
		tempo: opts.tempo,
		root: opts.root,
		steps,
		bass,
		lead,
		pad,
		kick,
		hat,
		snare,
		leadWave: opts.aggressive ? 'square' : 'triangle',
		leadVol: opts.aggressive ? 0.09 : 0.06,
		bassVol: opts.aggressive ? 0.16 : 0.12,
		padVol: opts.aggressive ? 0.05 : 0.08,
	}
}

function degreeToSemis(scale, degree) {
	const oct = Math.floor(degree / scale.length)
	return scale[((degree % scale.length) + scale.length) % scale.length] + oct * 12
}

/** Named tracks: 5 biome ambients, 5 boss themes, menu + endless. */
export const MUSIC = {
	menu: composeTrack({ seed: 101, tempo: 70, root: 45, aggressive: false }),
	endless: composeTrack({ seed: 990, tempo: 128, root: 43, aggressive: true, scale: 'phrygian' }),

	biome_crypt: composeTrack({ seed: 11, tempo: 78, root: 45, aggressive: false }),
	biome_caverns: composeTrack({ seed: 22, tempo: 82, root: 41, aggressive: false }),
	biome_forge: composeTrack({ seed: 33, tempo: 92, root: 43, aggressive: false, scale: 'phrygian' }),
	biome_glacier: composeTrack({ seed: 44, tempo: 74, root: 48, aggressive: false }),
	biome_abyss: composeTrack({ seed: 55, tempo: 86, root: 40, aggressive: false, scale: 'phrygian' }),

	boss_tyrant: composeTrack({ seed: 111, tempo: 132, root: 43, aggressive: true }),
	boss_spider: composeTrack({ seed: 222, tempo: 140, root: 41, aggressive: true, scale: 'phrygian' }),
	boss_golem: composeTrack({ seed: 333, tempo: 124, root: 38, aggressive: true }),
	boss_lich: composeTrack({ seed: 444, tempo: 136, root: 46, aggressive: true }),
	boss_void: composeTrack({ seed: 555, tempo: 148, root: 36, aggressive: true, scale: 'phrygian' }),
}
