import { Shader } from './Shader.js'

/**
 * WebGL renderer built around a single dynamic sprite batch.
 *
 * Design goals:
 *  - One texture atlas + one shader → the entire frame renders in a handful
 *    of draw calls (usually 2: world pass + UI pass).
 *  - Interleaved vertex data written into a preallocated buffer; zero
 *    allocations per frame.
 *  - Virtual pixel resolution: world/UI code works in low-res "virtual"
 *    pixels which are integer-scaled to the real canvas for a crisp
 *    pixel-art look at any window size.
 */

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform vec4 u_xform; // clip = pos * xform.xy + xform.zw
varying vec2 v_uv;
varying vec4 v_color;
void main() {
	gl_Position = vec4(a_pos * u_xform.xy + u_xform.zw, 0.0, 1.0);
	v_uv = a_uv;
	v_color = a_color;
}`

const FRAG_SRC = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
	vec4 tex = texture2D(u_tex, v_uv);
	gl_FragColor = tex * v_color;
	if (gl_FragColor.a < 0.004) discard;
}`

const MAX_QUADS = 8192
const FLOATS_PER_VERT = 5 // x, y, u, v, packed color
const BYTES_PER_VERT = FLOATS_PER_VERT * 4

/** Pack rgba (0-255) into a little-endian ABGR uint32 for the color attribute. */
export function rgba(r, g, b, a = 255) {
	return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
}

export const WHITE = rgba(255, 255, 255, 255)

/** Multiply the alpha channel of a packed color. */
export function withAlpha(color, alpha01) {
	const a = ((color >>> 24) & 0xff) * alpha01
	return ((a << 24) | (color & 0xffffff)) >>> 0
}

export class Renderer {
	constructor(canvas) {
		this.canvas = canvas
		const opts = { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false }
		const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts)
		if (!gl) throw new Error('WebGL is not supported by this browser')
		this.gl = gl

		this.shader = new Shader(gl, VERT_SRC, FRAG_SRC)
		this.shader.use()

		// Interleaved dynamic vertex buffer + static index buffer
		this.vertexData = new ArrayBuffer(MAX_QUADS * 4 * BYTES_PER_VERT)
		this.f32 = new Float32Array(this.vertexData)
		this.u32 = new Uint32Array(this.vertexData)
		this.vbo = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
		gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW)

		const indices = new Uint16Array(MAX_QUADS * 6)
		for (let i = 0; i < MAX_QUADS; i++) {
			const v = i * 4
			const o = i * 6
			indices[o] = v
			indices[o + 1] = v + 1
			indices[o + 2] = v + 2
			indices[o + 3] = v
			indices[o + 4] = v + 2
			indices[o + 5] = v + 3
		}
		this.ibo = gl.createBuffer()
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo)
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

		const stride = BYTES_PER_VERT
		const posLoc = gl.getAttribLocation(this.shader.program, 'a_pos')
		const uvLoc = gl.getAttribLocation(this.shader.program, 'a_uv')
		const colLoc = gl.getAttribLocation(this.shader.program, 'a_color')
		gl.enableVertexAttribArray(posLoc)
		gl.enableVertexAttribArray(uvLoc)
		gl.enableVertexAttribArray(colLoc)
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0)
		gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, stride, 8)
		gl.vertexAttribPointer(colLoc, 4, gl.UNSIGNED_BYTE, true, stride, 16)

		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
		gl.disable(gl.DEPTH_TEST)
		gl.disable(gl.CULL_FACE)

		this.quadCount = 0
		this.drawCalls = 0
		this.texture = null
		this.atlas = null
		this.whiteRegion = null

		// Virtual resolution (updated in resize)
		this.pixelScale = 2
		this.viewW = 480
		this.viewH = 270
		this._xform = new Float32Array(4)

		this.resize()
	}

	setAtlas(atlas) {
		this.atlas = atlas
		this.whiteRegion = atlas.regions.white
		const gl = this.gl
		if (this.texture) gl.deleteTexture(this.texture) // hot-swap (asset pack load)
		this.texture = gl.createTexture()
		gl.bindTexture(gl.TEXTURE_2D, this.texture)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.uniform1i(this.shader.uniforms.u_tex, 0)
	}

	/** Fit the drawing buffer to the canvas element and pick an integer pixel scale. */
	resize() {
		const w = this.canvas.clientWidth || window.innerWidth
		const h = this.canvas.clientHeight || window.innerHeight
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w
			this.canvas.height = h
		}
		this.pixelScale = Math.max(1, Math.floor(h / 270)) || 1
		this.viewW = Math.ceil(w / this.pixelScale)
		this.viewH = Math.ceil(h / this.pixelScale)
		this.gl.viewport(0, 0, w, h)
	}

	clear(r, g, b) {
		const gl = this.gl
		gl.clearColor(r, g, b, 1)
		gl.clear(gl.COLOR_BUFFER_BIT)
		this.drawCalls = 0
	}

	/** Begin drawing in world space: coordinates are world pixels, camera applied. */
	beginWorld(camera) {
		this.flush()
		const sx = (2 * camera.zoom) / this.viewW
		const sy = (-2 * camera.zoom) / this.viewH
		// renderX/renderY is the top-left of the view in world space → clip -1,+1
		this._setXform(sx, sy, -camera.renderX * sx - 1, -camera.renderY * sy + 1)
	}

	/** Begin drawing in UI space: (0,0) top-left, virtual pixel units. */
	beginUI() {
		this.flush()
		const sx = 2 / this.viewW
		const sy = -2 / this.viewH
		this._setXform(sx, sy, -1, 1)
	}

	_setXform(sx, sy, tx, ty) {
		const x = this._xform
		x[0] = sx
		x[1] = sy
		x[2] = tx
		x[3] = ty
		this.gl.uniform4fv(this.shader.uniforms.u_xform, x)
	}

	/**
	 * Push one textured quad into the batch.
	 * @param {object} region atlas region {u0,v0,u1,v1,w,h}
	 * @param {number} x,y top-left position (or center if rot is used with origin)
	 */
	draw(region, x, y, w, h, color = WHITE, rot = 0, flipX = false) {
		if (this.quadCount >= MAX_QUADS) this.flush()
		const i = this.quadCount * 4 * FLOATS_PER_VERT
		const f = this.f32
		const u = this.u32
		let u0 = region.u0
		let u1 = region.u1
		if (flipX) {
			u0 = region.u1
			u1 = region.u0
		}
		const v0 = region.v0
		const v1 = region.v1

		if (rot === 0) {
			const x1 = x + w
			const y1 = y + h
			f[i] = x; f[i + 1] = y; f[i + 2] = u0; f[i + 3] = v0; u[i + 4] = color
			f[i + 5] = x1; f[i + 6] = y; f[i + 7] = u1; f[i + 8] = v0; u[i + 9] = color
			f[i + 10] = x1; f[i + 11] = y1; f[i + 12] = u1; f[i + 13] = v1; u[i + 14] = color
			f[i + 15] = x; f[i + 16] = y1; f[i + 17] = u0; f[i + 18] = v1; u[i + 19] = color
		} else {
			// rotate around quad center
			const cx = x + w / 2
			const cy = y + h / 2
			const cos = Math.cos(rot)
			const sin = Math.sin(rot)
			const hw = w / 2
			const hh = h / 2
			// corner offsets rotated
			const ax = -hw * cos - -hh * sin, ay = -hw * sin + -hh * cos
			const bx = hw * cos - -hh * sin, by = hw * sin + -hh * cos
			const cx2 = hw * cos - hh * sin, cy2 = hw * sin + hh * cos
			const dx = -hw * cos - hh * sin, dy = -hw * sin + hh * cos
			f[i] = cx + ax; f[i + 1] = cy + ay; f[i + 2] = u0; f[i + 3] = v0; u[i + 4] = color
			f[i + 5] = cx + bx; f[i + 6] = cy + by; f[i + 7] = u1; f[i + 8] = v0; u[i + 9] = color
			f[i + 10] = cx + cx2; f[i + 11] = cy + cy2; f[i + 12] = u1; f[i + 13] = v1; u[i + 14] = color
			f[i + 15] = cx + dx; f[i + 16] = cy + dy; f[i + 17] = u0; f[i + 18] = v1; u[i + 19] = color
		}
		this.quadCount++
	}

	/** Draw a sprite by atlas name, centered on (cx, cy). */
	sprite(name, cx, cy, color = WHITE, rot = 0, flipX = false, scale = 1) {
		const r = this.atlas.regions[name]
		if (!r) return
		const w = r.w * scale
		const h = r.h * scale
		this.draw(r, cx - w / 2, cy - h / 2, w, h, color, rot, flipX)
	}

	/**
	 * Draw a sprite cycling its animation frames with time t (seconds).
	 * Falls back to the static region when the sprite has no frames.
	 */
	animSprite(name, t, cx, cy, color = WHITE, rot = 0, flipX = false, scale = 1, fps = 6) {
		const frames = this.atlas.anims[name]
		if (!frames || frames.length === 0) {
			this.sprite(name, cx, cy, color, rot, flipX, scale)
			return
		}
		const r = frames[Math.floor(Math.abs(t) * fps) % frames.length]
		const w = r.w * scale
		const h = r.h * scale
		this.draw(r, cx - w / 2, cy - h / 2, w, h, color, rot, flipX)
	}

	/** Solid rectangle using the atlas' white pixel. */
	rect(x, y, w, h, color) {
		this.draw(this.whiteRegion, x, y, w, h, color)
	}

	/** 1px-thick rectangle outline. */
	rectOutline(x, y, w, h, color, t = 1) {
		this.rect(x, y, w, t, color)
		this.rect(x, y + h - t, w, t, color)
		this.rect(x, y + t, t, h - 2 * t, color)
		this.rect(x + w - t, y + t, t, h - 2 * t, color)
	}

	/** Line segment rendered as a rotated quad. */
	line(x0, y0, x1, y1, color, thickness = 1) {
		const dx = x1 - x0
		const dy = y1 - y0
		const len = Math.sqrt(dx * dx + dy * dy)
		if (len < 0.001) return
		const rot = Math.atan2(dy, dx)
		this.draw(this.whiteRegion, (x0 + x1) / 2 - len / 2, (y0 + y1) / 2 - thickness / 2, len, thickness, color, rot)
	}

	/** Circle outline from short segments — used for attack telegraphs. */
	circleOutline(cx, cy, radius, color, thickness = 1, segments = 24) {
		let px = cx + radius
		let py = cy
		for (let i = 1; i <= segments; i++) {
			const a = (i / segments) * Math.PI * 2
			const nx = cx + Math.cos(a) * radius
			const ny = cy + Math.sin(a) * radius
			this.line(px, py, nx, ny, color, thickness)
			px = nx
			py = ny
		}
	}

	/** Filled circle approximation (triangle-fan of quads is overkill; use rings). */
	circleFill(cx, cy, radius, color) {
		// draw as horizontal slices, 4px per slice in virtual pixels
		const step = Math.max(2, radius / 6)
		for (let y = -radius; y < radius; y += step) {
			const half = Math.sqrt(Math.max(0, radius * radius - y * y))
			this.rect(cx - half, cy + y, half * 2, step, color)
		}
	}

	/** Draw body text using the micro pixel font. Returns pixel width. */
	text(str, x, y, color = WHITE, scale = 1, align = 'left') {
		return this._text(this.atlas.font, str, x, y, color, scale, align)
	}

	/** Draw display/heading text using the big font (falls back to body). */
	textBig(str, x, y, color = WHITE, scale = 1, align = 'left') {
		return this._text(this.atlas.fontBig ?? this.atlas.font, str, x, y, color, scale, align)
	}

	_text(font, str, x, y, color, scale, align) {
		if (align !== 'left') {
			const w = this._measure(font, str, scale)
			if (align === 'center') x -= w / 2
			else if (align === 'right') x -= w
		}
		let cx = x
		for (let i = 0; i < str.length; i++) {
			const code = str.charCodeAt(i)
			if (code === 10) {
				cx = x
				y += font.lineHeight * scale
				continue
			}
			const g = font.glyphs[code]
			if (!g) {
				cx += font.spaceWidth * scale
				continue
			}
			this.draw(g.region, cx, y, g.region.w * scale, g.region.h * scale, color)
			cx += (g.advance) * scale
		}
		return cx - x
	}

	measureText(str, scale = 1, big = false) {
		return this._measure(big ? this.atlas.fontBig ?? this.atlas.font : this.atlas.font, str, scale)
	}

	_measure(font, str, scale) {
		let w = 0
		let max = 0
		for (let i = 0; i < str.length; i++) {
			const code = str.charCodeAt(i)
			if (code === 10) {
				max = Math.max(max, w)
				w = 0
				continue
			}
			const g = font.glyphs[code]
			w += g ? g.advance * scale : font.spaceWidth * scale
		}
		return Math.max(max, w)
	}

	flush() {
		if (this.quadCount === 0) return
		const gl = this.gl
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.f32.subarray(0, this.quadCount * 4 * FLOATS_PER_VERT))
		gl.drawElements(gl.TRIANGLES, this.quadCount * 6, gl.UNSIGNED_SHORT, 0)
		this.drawCalls++
		this.quadCount = 0
	}

	destroy() {
		const gl = this.gl
		gl.deleteBuffer(this.vbo)
		gl.deleteBuffer(this.ibo)
		gl.deleteProgram(this.shader.program)
		if (this.texture) gl.deleteTexture(this.texture)
	}
}
