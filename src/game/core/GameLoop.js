/**
 * Fixed-timestep game loop.
 *
 * Simulation always advances in constant STEP increments, which keeps
 * physics, cooldowns and AI deterministic regardless of display refresh
 * rate. Rendering happens once per animation frame and is fully separated
 * from update logic.
 */
export const STEP = 1 / 60

const MAX_FRAME_TIME = 0.25 // spiral-of-death guard (tab switch, breakpoint)

export class GameLoop {
	/**
	 * @param {(dt: number) => void} update  fixed-step simulation tick
	 * @param {(alpha: number) => void} render  draw call, alpha = interpolation factor
	 */
	constructor(update, render) {
		this.update = update
		this.render = render
		this.running = false
		this.accumulator = 0
		this.lastTime = 0
		this.fps = 60
		this._fpsCounter = 0
		this._fpsTimer = 0
		this._raf = 0
		this._tick = this._tick.bind(this)
	}

	start() {
		if (this.running) return
		this.running = true
		this.lastTime = performance.now()
		this.accumulator = 0
		this._raf = requestAnimationFrame(this._tick)
	}

	stop() {
		this.running = false
		cancelAnimationFrame(this._raf)
	}

	_tick(now) {
		if (!this.running) return
		this._raf = requestAnimationFrame(this._tick)

		let frame = (now - this.lastTime) / 1000
		this.lastTime = now
		if (frame > MAX_FRAME_TIME) frame = MAX_FRAME_TIME

		this._fpsTimer += frame
		this._fpsCounter++
		if (this._fpsTimer >= 0.5) {
			this.fps = Math.round(this._fpsCounter / this._fpsTimer)
			this._fpsCounter = 0
			this._fpsTimer = 0
		}

		this.accumulator += frame
		while (this.accumulator >= STEP) {
			this.update(STEP)
			this.accumulator -= STEP
		}
		this.render(this.accumulator / STEP)
	}
}
