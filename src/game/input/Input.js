/**
 * Unified input system: keyboard + gamepad mapped onto named actions.
 *
 * Game code never reads keys directly — it asks for actions ("attack",
 * "skill1", "confirm"), so bindings can change without touching gameplay.
 * Gamepads are polled each frame via the Gamepad API.
 */

const KEY_BINDINGS = {
	up: ['KeyW', 'ArrowUp'],
	down: ['KeyS', 'ArrowDown'],
	left: ['KeyA', 'ArrowLeft'],
	right: ['KeyD', 'ArrowRight'],
	attack: ['Space', 'KeyJ'],
	dodge: ['ShiftLeft', 'ShiftRight', 'KeyK'],
	skill1: ['Digit1'],
	skill2: ['Digit2'],
	skill3: ['Digit3'],
	skill4: ['Digit4'],
	potion: ['KeyQ'],
	potion2: ['KeyR'],
	sell: ['KeyX'],
	interact: ['KeyE'],
	inventory: ['KeyI', 'Tab'],
	pause: ['Escape', 'KeyP'],
	confirm: ['Enter', 'Space', 'KeyJ'],
	cancel: ['Escape', 'KeyK'],
	fullscreen: ['KeyF'],
	debug: ['Backquote', 'F9'],
	test: ['KeyT'], // map editor: test play
}

// standard-mapping gamepad buttons
const PAD_BINDINGS = {
	attack: [0, 7], // A, RT
	dodge: [1, 6], // B, LT
	skill1: [2], // X
	skill2: [3], // Y
	skill3: [4], // LB
	skill4: [5], // RB
	potion: [10], // L3
	potion2: [11], // R3
	sell: [3], // Y (in menus)
	interact: [0],
	inventory: [8], // Select
	pause: [9], // Start
	confirm: [0],
	cancel: [1],
	up: [12],
	down: [13],
	left: [14],
	right: [15],
}

const DEADZONE = 0.25

export class Input {
	constructor(target = window) {
		this.target = target
		this.keys = new Set()
		this.state = {} // action -> bool (this frame)
		this.prev = {} // action -> bool (last frame)
		this.moveX = 0
		this.moveY = 0
		this.aimX = 1
		this.aimY = 0
		this.hasAimStick = false
		this.gamepadActive = false
		this.anyPressed = false
		this._justPressedKeys = new Set()

		this._onKeyDown = (e) => {
			if (e.repeat) return
			this.keys.add(e.code)
			this._justPressedKeys.add(e.code)
			this.anyPressed = true
			this.gamepadActive = false
			// keep browser from scrolling / focusing away mid-game
			if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
				e.preventDefault()
			}
		}
		this._onKeyUp = (e) => this.keys.delete(e.code)
		this._onBlur = () => this.keys.clear()

		target.addEventListener('keydown', this._onKeyDown)
		target.addEventListener('keyup', this._onKeyUp)
		target.addEventListener('blur', this._onBlur)
	}

	/** Poll gamepad + resolve action states. Call once per fixed update. */
	update() {
		const pad = this._activePad()
		const next = {}

		for (const action of Object.keys(KEY_BINDINGS)) {
			// include keys tapped and released between updates so ultra-fast
			// taps are never dropped by the fixed timestep
			let down = KEY_BINDINGS[action].some(
				(code) => this.keys.has(code) || this._justPressedKeys.has(code)
			)
			if (!down && pad) {
				const btns = PAD_BINDINGS[action]
				if (btns) down = btns.some((b) => pad.buttons[b] && pad.buttons[b].pressed)
			}
			next[action] = down
		}
		this._justPressedKeys.clear()

		// movement vector: keyboard digital + left stick analog
		let mx = (next.right ? 1 : 0) - (next.left ? 1 : 0)
		let my = (next.down ? 1 : 0) - (next.up ? 1 : 0)
		if (pad) {
			const ax = pad.axes[0] || 0
			const ay = pad.axes[1] || 0
			if (Math.abs(ax) > DEADZONE || Math.abs(ay) > DEADZONE) {
				mx = ax
				my = ay
				this.gamepadActive = true
			}
			// right stick aiming
			const rx = pad.axes[2] || 0
			const ry = pad.axes[3] || 0
			if (Math.abs(rx) > DEADZONE || Math.abs(ry) > DEADZONE) {
				const len = Math.hypot(rx, ry)
				this.aimX = rx / len
				this.aimY = ry / len
				this.hasAimStick = true
			} else {
				this.hasAimStick = false
			}
			for (const b of pad.buttons) {
				if (b.pressed) {
					this.anyPressed = true
					this.gamepadActive = true
				}
			}
		}
		const mlen = Math.hypot(mx, my)
		if (mlen > 1) {
			mx /= mlen
			my /= mlen
		}
		this.moveX = mx
		this.moveY = my
		// facing follows movement unless the right stick is aiming
		if (!this.hasAimStick && mlen > 0.01) {
			this.aimX = mx / (mlen || 1)
			this.aimY = my / (mlen || 1)
		}

		this.prev = this.state
		this.state = next
	}

	_activePad() {
		if (!navigator.getGamepads) return null
		const pads = navigator.getGamepads()
		for (const p of pads) {
			if (p && p.connected) return p
		}
		return null
	}

	isDown(action) {
		return !!this.state[action]
	}

	/** true only on the frame the action transitioned up -> down */
	pressed(action) {
		return !!this.state[action] && !this.prev[action]
	}

	/** consume the any-input flag (menus: "press any key") */
	consumeAny() {
		const v = this.anyPressed
		this.anyPressed = false
		return v
	}

	/**
	 * Enable mouse tracking against a canvas (used by the map editor).
	 * Exposes mouse position in virtual-pixel UI coordinates plus
	 * pressed/down state for left (0) and right (2) buttons and wheel steps.
	 */
	attachMouse(canvas, renderer) {
		this.mouseX = 0
		this.mouseY = 0
		this.mouseDown = [false, false, false]
		this._mousePressed = [false, false, false]
		this.wheel = 0

		this._onMouseMove = (e) => {
			const rect = canvas.getBoundingClientRect()
			this.mouseX = (e.clientX - rect.left) / renderer.pixelScale
			this.mouseY = (e.clientY - rect.top) / renderer.pixelScale
		}
		this._onMouseDown = (e) => {
			this.mouseDown[e.button] = true
			this._mousePressed[e.button] = true
			this.anyPressed = true
		}
		this._onMouseUp = (e) => {
			this.mouseDown[e.button] = false
		}
		this._onWheel = (e) => {
			this.wheel += Math.sign(e.deltaY)
			e.preventDefault()
		}
		this._onCtx = (e) => e.preventDefault()

		canvas.addEventListener('mousemove', this._onMouseMove)
		canvas.addEventListener('mousedown', this._onMouseDown)
		window.addEventListener('mouseup', this._onMouseUp)
		canvas.addEventListener('wheel', this._onWheel, { passive: false })
		canvas.addEventListener('contextmenu', this._onCtx)
	}

	/** Edge-triggered mouse press; consumed once per read. */
	mousePressed(button = 0) {
		const v = this._mousePressed?.[button] ?? false
		if (this._mousePressed) this._mousePressed[button] = false
		return v
	}

	/** Wheel steps since last read (positive = down). */
	takeWheel() {
		const v = this.wheel || 0
		this.wheel = 0
		return v
	}

	destroy() {
		this.target.removeEventListener('keydown', this._onKeyDown)
		this.target.removeEventListener('keyup', this._onKeyUp)
		this.target.removeEventListener('blur', this._onBlur)
	}
}
