/**
 * Data-driven sound effect definitions.
 *
 * Each SFX is a list of synth layers played together:
 *   wave  : oscillator type or 'noise'
 *   from/to : frequency sweep in Hz (ignored for noise)
 *   dur   : seconds
 *   vol   : peak gain
 *   delay : start offset in seconds
 *   curve : 'exp' (default) or 'lin' fade-out
 * New sounds are added here, not in engine code.
 */
export const SFX = {
	swing: [{ wave: 'noise', dur: 0.09, vol: 0.25, hp: 900 }],
	shoot: [{ wave: 'square', from: 700, to: 240, dur: 0.1, vol: 0.18 }],
	bow: [{ wave: 'noise', dur: 0.06, vol: 0.18, hp: 1200 }, { wave: 'triangle', from: 500, to: 900, dur: 0.07, vol: 0.14 }],
	hit: [{ wave: 'square', from: 220, to: 90, dur: 0.08, vol: 0.28 }, { wave: 'noise', dur: 0.05, vol: 0.2 }],
	crit: [{ wave: 'square', from: 420, to: 90, dur: 0.14, vol: 0.34 }, { wave: 'noise', dur: 0.09, vol: 0.26 }],
	hurt: [{ wave: 'sawtooth', from: 300, to: 80, dur: 0.18, vol: 0.32 }],
	enemy_die: [{ wave: 'sawtooth', from: 260, to: 40, dur: 0.28, vol: 0.3 }, { wave: 'noise', dur: 0.2, vol: 0.2 }],
	player_die: [{ wave: 'sawtooth', from: 400, to: 30, dur: 0.9, vol: 0.4 }, { wave: 'noise', dur: 0.6, vol: 0.25, delay: 0.1 }],
	explosion: [{ wave: 'noise', dur: 0.45, vol: 0.5, lp: 900 }, { wave: 'sine', from: 130, to: 30, dur: 0.4, vol: 0.5 }],
	dash: [{ wave: 'noise', dur: 0.12, vol: 0.2, hp: 600 }, { wave: 'sine', from: 300, to: 700, dur: 0.1, vol: 0.12 }],
	footstep: [{ wave: 'noise', dur: 0.04, vol: 0.07, lp: 500 }],

	skill_fire: [{ wave: 'noise', dur: 0.25, vol: 0.28, lp: 1400 }, { wave: 'sawtooth', from: 300, to: 90, dur: 0.2, vol: 0.2 }],
	skill_frost: [{ wave: 'sine', from: 900, to: 200, dur: 0.3, vol: 0.25 }, { wave: 'noise', dur: 0.2, vol: 0.15, hp: 2000 }],
	skill_lightning: [{ wave: 'sawtooth', from: 1400, to: 100, dur: 0.16, vol: 0.3 }, { wave: 'noise', dur: 0.1, vol: 0.25, hp: 1500 }],
	skill_heal: [{ wave: 'sine', from: 500, to: 900, dur: 0.3, vol: 0.22 }, { wave: 'sine', from: 750, to: 1200, dur: 0.3, vol: 0.16, delay: 0.08 }],
	skill_poison: [{ wave: 'triangle', from: 300, to: 120, dur: 0.35, vol: 0.22 }, { wave: 'noise', dur: 0.3, vol: 0.12, lp: 700 }],
	skill_shield: [{ wave: 'triangle', from: 200, to: 500, dur: 0.25, vol: 0.25 }],
	skill_summon: [{ wave: 'triangle', from: 100, to: 400, dur: 0.4, vol: 0.24 }, { wave: 'sine', from: 60, to: 200, dur: 0.4, vol: 0.2 }],

	pickup_coin: [{ wave: 'square', from: 900, to: 1400, dur: 0.09, vol: 0.16 }],
	pickup_item: [{ wave: 'square', from: 500, to: 800, dur: 0.1, vol: 0.18 }, { wave: 'square', from: 800, to: 1200, dur: 0.12, vol: 0.16, delay: 0.09 }],
	pickup_heart: [{ wave: 'sine', from: 500, to: 800, dur: 0.15, vol: 0.2 }],
	potion: [{ wave: 'sine', from: 300, to: 700, dur: 0.25, vol: 0.22 }],
	chest: [{ wave: 'square', from: 300, to: 500, dur: 0.12, vol: 0.2 }, { wave: 'square', from: 600, to: 1000, dur: 0.16, vol: 0.18, delay: 0.12 }],
	levelup: [
		{ wave: 'square', from: 520, to: 520, dur: 0.1, vol: 0.2 },
		{ wave: 'square', from: 660, to: 660, dur: 0.1, vol: 0.2, delay: 0.1 },
		{ wave: 'square', from: 780, to: 780, dur: 0.2, vol: 0.22, delay: 0.2 },
	],
	stairs: [{ wave: 'triangle', from: 400, to: 150, dur: 0.35, vol: 0.25 }],
	shrine: [{ wave: 'sine', from: 700, to: 1400, dur: 0.5, vol: 0.2 }],
	buy: [{ wave: 'square', from: 1000, to: 1300, dur: 0.08, vol: 0.16 }, { wave: 'square', from: 1300, to: 1600, dur: 0.08, vol: 0.14, delay: 0.08 }],
	error: [{ wave: 'square', from: 200, to: 150, dur: 0.15, vol: 0.2 }],

	boss_roar: [{ wave: 'sawtooth', from: 150, to: 40, dur: 0.8, vol: 0.45 }, { wave: 'noise', dur: 0.6, vol: 0.3, lp: 500 }],
	boss_die: [
		{ wave: 'sawtooth', from: 300, to: 20, dur: 1.2, vol: 0.45 },
		{ wave: 'noise', dur: 1.0, vol: 0.35, lp: 800 },
		{ wave: 'sine', from: 90, to: 20, dur: 1.2, vol: 0.4 },
	],
	telegraph: [{ wave: 'triangle', from: 800, to: 400, dur: 0.15, vol: 0.14 }],
	achievement: [
		{ wave: 'square', from: 660, to: 660, dur: 0.09, vol: 0.18 },
		{ wave: 'square', from: 880, to: 880, dur: 0.09, vol: 0.18, delay: 0.09 },
		{ wave: 'square', from: 1100, to: 1100, dur: 0.18, vol: 0.2, delay: 0.18 },
	],

	ui_move: [{ wave: 'square', from: 600, to: 600, dur: 0.04, vol: 0.08 }],
	ui_select: [{ wave: 'square', from: 700, to: 1000, dur: 0.08, vol: 0.14 }],
	ui_back: [{ wave: 'square', from: 500, to: 300, dur: 0.08, vol: 0.12 }],
}
