import { damp, clamp } from '../core/MathUtil.js'

/**
 * Smooth-follow camera with trauma-based screen shake.
 * renderX/renderY are the top-left of the visible world rect in world pixels.
 */
export class Camera {
	constructor(renderer) {
		this.renderer = renderer
		this.x = 0 // center, world px
		this.y = 0
		this.zoom = 1
		this.trauma = 0 // 0..1, decays; shake amplitude = trauma^2
		this.shakeEnabled = true
		this.renderX = 0
		this.renderY = 0
		this._shakeX = 0
		this._shakeY = 0
		this._t = 0
	}

	snapTo(x, y) {
		this.x = x
		this.y = y
	}

	follow(x, y, dt) {
		this.x = damp(this.x, x, 0.00002, dt)
		this.y = damp(this.y, y, 0.00002, dt)
	}

	shake(amount) {
		if (!this.shakeEnabled) return
		this.trauma = clamp(this.trauma + amount, 0, 1)
	}

	update(dt) {
		this._t += dt
		this.trauma = Math.max(0, this.trauma - dt * 1.6)
		const amp = this.trauma * this.trauma * 6
		// cheap smooth noise from offset sines
		this._shakeX = amp * Math.sin(this._t * 47.1) * Math.sin(this._t * 13.7 + 1.3)
		this._shakeY = amp * Math.sin(this._t * 39.3 + 4.2) * Math.sin(this._t * 17.3)
	}

	/** Call right before rendering the world pass. */
	prepare() {
		const vw = this.renderer.viewW / this.zoom
		const vh = this.renderer.viewH / this.zoom
		this.renderX = Math.round(this.x + this._shakeX - vw / 2)
		this.renderY = Math.round(this.y + this._shakeY - vh / 2)
	}

	/** Visible world bounds for culling (with margin). */
	bounds(margin = 32) {
		const vw = this.renderer.viewW / this.zoom
		const vh = this.renderer.viewH / this.zoom
		return {
			x0: this.renderX - margin,
			y0: this.renderY - margin,
			x1: this.renderX + vw + margin,
			y1: this.renderY + vh + margin,
		}
	}

	isVisible(x, y, margin = 32) {
		const vw = this.renderer.viewW / this.zoom
		const vh = this.renderer.viewH / this.zoom
		return x > this.renderX - margin && x < this.renderX + vw + margin &&
			y > this.renderY - margin && y < this.renderY + vh + margin
	}
}
