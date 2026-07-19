/** Shared math helpers. Kept dependency-free and allocation-free. */

export const TAU = Math.PI * 2

export function clamp(v, min, max) {
	return v < min ? min : v > max ? max : v
}

export function lerp(a, b, t) {
	return a + (b - a) * t
}

/** frame-rate independent exponential approach */
export function damp(a, b, smoothing, dt) {
	return lerp(a, b, 1 - Math.pow(smoothing, dt))
}

export function dist(x0, y0, x1, y1) {
	const dx = x1 - x0
	const dy = y1 - y0
	return Math.sqrt(dx * dx + dy * dy)
}

export function distSq(x0, y0, x1, y1) {
	const dx = x1 - x0
	const dy = y1 - y0
	return dx * dx + dy * dy
}

export function angleTo(x0, y0, x1, y1) {
	return Math.atan2(y1 - y0, x1 - x0)
}

/** shortest signed difference between two angles */
export function angleDiff(a, b) {
	let d = (b - a) % TAU
	if (d > Math.PI) d -= TAU
	if (d < -Math.PI) d += TAU
	return d
}

export function normAngle(a) {
	a %= TAU
	if (a < 0) a += TAU
	return a
}
