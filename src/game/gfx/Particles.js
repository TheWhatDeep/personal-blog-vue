import { ObjectPool } from '../core/ObjectPool.js'
import { withAlpha } from './Renderer.js'
import { TAU } from '../core/MathUtil.js'

/**
 * Pooled particle system. Particles are simple colored quads (the atlas'
 * white pixel) with velocity, drag, gravity and fade-out — enough for
 * hits, deaths, spell effects and environmental ambience.
 */
export class ParticleSystem {
	constructor() {
		this.pool = new ObjectPool(
			() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: 0xffffffff, drag: 1, gravity: 0, shrink: true }),
			(p) => {
				p.life = 0
				p.maxLife = 1
				p.drag = 1
				p.gravity = 0
				p.shrink = true
			},
			256
		)
	}

	/**
	 * Spawn a radial burst.
	 * @param {object} opts {x, y, count, color, speed, life, size, spread, angle, drag, gravity}
	 */
	burst(opts) {
		const count = opts.count ?? 8
		const baseAngle = opts.angle ?? 0
		const spread = opts.spread ?? TAU
		for (let i = 0; i < count; i++) {
			const p = this.pool.obtain()
			const a = baseAngle + (Math.random() - 0.5) * spread
			const spd = (opts.speed ?? 60) * (0.4 + Math.random() * 0.8)
			p.x = opts.x + (Math.random() - 0.5) * (opts.jitter ?? 4)
			p.y = opts.y + (Math.random() - 0.5) * (opts.jitter ?? 4)
			p.vx = Math.cos(a) * spd
			p.vy = Math.sin(a) * spd
			p.maxLife = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.7)
			p.life = p.maxLife
			p.size = opts.size ?? 2
			p.color = Array.isArray(opts.color) ? opts.color[(Math.random() * opts.color.length) | 0] : opts.color
			p.drag = opts.drag ?? 0.9
			p.gravity = opts.gravity ?? 0
			p.shrink = opts.shrink ?? true
		}
	}

	update(dt) {
		const active = this.pool.active
		for (let i = 0; i < active.length; i++) {
			const p = active[i]
			if (!p.__poolAlive) continue
			p.life -= dt
			if (p.life <= 0) {
				this.pool.release(p)
				continue
			}
			p.vx *= Math.pow(p.drag, dt * 60)
			p.vy *= Math.pow(p.drag, dt * 60)
			p.vy += p.gravity * dt
			p.x += p.vx * dt
			p.y += p.vy * dt
		}
		this.pool.sweep()
	}

	render(renderer, camera) {
		const active = this.pool.active
		for (let i = 0; i < active.length; i++) {
			const p = active[i]
			const t = p.life / p.maxLife
			if (!camera.isVisible(p.x, p.y, 8)) continue
			const size = p.shrink ? Math.max(1, p.size * t) : p.size
			renderer.rect(p.x - size / 2, p.y - size / 2, size, size, withAlpha(p.color, Math.min(1, t * 2)))
		}
	}

	clear() {
		this.pool.releaseAll()
	}
}
