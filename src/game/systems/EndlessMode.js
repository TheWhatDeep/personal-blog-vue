import { BIOMES } from '../data/biomes.js'
import { BOSS_LIST } from '../data/bosses.js'
import { BALANCE } from '../data/balance.js'
import { TILE_SIZE } from '../world/TileMap.js'
import { TAU } from '../core/MathUtil.js'

/**
 * Endless mode: unlocked by defeating the fifth boss.
 *
 * Difficulty rises smoothly (no spikes): a scalar grows with wave count and
 * elapsed time, and multiplies enemy health/damage while spawn size and
 * enemy variety climb. Every 5th wave is an elite wave; every 8th wave a
 * random boss (rescaled) appears. Environmental hazards seep in over time.
 */
const WAVE_BREATHER = 6 // seconds between clearing a wave and the next one

export class EndlessMode {
	constructor(game) {
		this.game = game
		this.reset()
	}

	reset() {
		this.active = false
		this.wave = 0
		this.time = 0
		this.spawnTimer = 3
		this.waveActive = false
		this.bossWaveActive = false
	}

	start() {
		this.reset()
		this.active = true
	}

	/** Smooth difficulty scalar: +12% per wave, +2%/minute, no step spikes. */
	difficulty() {
		return 1 + this.wave * 0.12 + (this.time / 60) * 0.02
	}

	update(dt) {
		if (!this.active) return
		const game = this.game
		const world = game.world
		this.time += dt

		const aliveEnemies = world.enemies.some((e) => !e.dead && e.team === 'enemy')

		if (this.waveActive) {
			if (!aliveEnemies && !(this.bossWaveActive && game.bossManager.active)) {
				// wave cleared
				this.waveActive = false
				this.bossWaveActive = false
				this.spawnTimer = WAVE_BREATHER
				game.stats.setMax('bestEndlessWave', this.wave)
				game.save.highscore('bestEndlessWave', this.wave)
				game.ui.toast(`Wave ${this.wave} cleared!`, 0xff4dc763)
				// breather reward
				if (this.wave % 3 === 0) {
					world.dropPickup('potion_hp', game.player.x + 20, game.player.y)
				}
			}
			return
		}

		this.spawnTimer -= dt
		if (this.spawnTimer <= 0) {
			this.wave++
			this.waveActive = true
			this._spawnWave()
		}
	}

	_spawnWave() {
		const game = this.game
		const world = game.world
		const player = game.player
		const d = this.difficulty()
		const isEliteWave = this.wave % 5 === 0
		const isBossWave = this.wave % 8 === 0

		game.audio.play('boss_roar', isBossWave ? 1 : 0.4)
		game.ui.toast(
			isBossWave ? `WAVE ${this.wave} — A CHAMPION APPROACHES` :
			isEliteWave ? `WAVE ${this.wave} — ELITE WAVE` : `WAVE ${this.wave}`,
			isBossWave ? 0xff5a5aff : isEliteWave ? 0xff3ad2ff : 0xffffffff
		)

		if (isBossWave) {
			this.bossWaveActive = true
			const bossDef = BOSS_LIST[Math.floor(Math.random() * BOSS_LIST.length)]
			const pos = this._spawnPoint(120)
			// scale wave bosses down from their (now beefy) story HP,
			// up with difficulty — see data/balance.js
			game.bossManager._spawn({ bossId: bossDef.id, x: pos.x, y: pos.y, hpMul: BALANCE.arenaBossHpFrac * d })
			return
		}

		// enemy variety expands with waves: early waves draw from the first
		// biomes, later waves from all of them
		const biomePool = BIOMES.slice(0, Math.min(BIOMES.length, 1 + Math.floor(this.wave / 3)))
		const count = Math.min(24, 4 + Math.floor(this.wave * 1.3))

		for (let i = 0; i < count; i++) {
			const biome = biomePool[Math.floor(Math.random() * biomePool.length)]
			const id = pickWeighted(biome.enemies)
			const pos = this._spawnPoint(100 + Math.random() * 60)
			const elite = isEliteWave ? Math.random() < 0.5 : Math.random() < 0.05 + this.wave * 0.004
			const e = world.spawnEnemy(id, pos.x, pos.y, {
				elite,
				hpMul: d,
				dmgMul: 0.7 + d * 0.3,
				xpMul: 1 + this.wave * 0.05,
			})
			e.aggro = true
			game.particles.burst({ x: pos.x, y: pos.y, count: 6, color: 0xffb06cff, speed: 40, life: 0.5 })
		}

		// environmental hazards creep in at higher waves
		if (this.wave >= 6) {
			const hazards = Math.min(4, Math.floor(this.wave / 6))
			for (let i = 0; i < hazards; i++) {
				const pos = this._spawnPoint(60 + Math.random() * 80)
				world.addHazard({
					x: pos.x, y: pos.y, r: 26,
					kind: 'void', damage: 4 + Math.floor(d), tick: 0.5,
					duration: 12, team: 'enemy',
					status: null, color: 0x55b06cff,
				})
			}
		}
	}

	/** Find a walkable spawn point roughly `radius` px from the player. */
	_spawnPoint(radius) {
		const world = this.game.world
		const player = this.game.player
		for (let tries = 0; tries < 30; tries++) {
			const a = Math.random() * TAU
			const x = player.x + Math.cos(a) * radius
			const y = player.y + Math.sin(a) * radius
			// radius-aware so nothing spawns half-embedded in a wall
			if (!world.map._circleHits(x, y, 9)) return { x, y }
		}
		// fallback: room center
		const room = world.rooms[Math.floor(Math.random() * world.rooms.length)]
		return { x: room.cx, y: room.cy }
	}
}

function pickWeighted(entries) {
	let total = 0
	for (const e of entries) total += e.weight
	let roll = Math.random() * total
	for (const e of entries) {
		roll -= e.weight
		if (roll <= 0) return e.item
	}
	return entries[0].item
}
