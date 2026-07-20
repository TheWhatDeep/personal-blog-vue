/** Thin WebGL shader program wrapper. */
export class Shader {
	constructor(gl, vertSrc, fragSrc) {
		this.gl = gl
		const vs = this._compile(gl.VERTEX_SHADER, vertSrc)
		const fs = this._compile(gl.FRAGMENT_SHADER, fragSrc)
		const prog = gl.createProgram()
		gl.attachShader(prog, vs)
		gl.attachShader(prog, fs)
		gl.linkProgram(prog)
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			throw new Error('Shader link failed: ' + gl.getProgramInfoLog(prog))
		}
		gl.deleteShader(vs)
		gl.deleteShader(fs)
		this.program = prog
		this.uniforms = {}
		const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
		for (let i = 0; i < count; i++) {
			const info = gl.getActiveUniform(prog, i)
			this.uniforms[info.name] = gl.getUniformLocation(prog, info.name)
		}
	}

	_compile(type, src) {
		const gl = this.gl
		const shader = gl.createShader(type)
		gl.shaderSource(shader, src)
		gl.compileShader(shader)
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(shader))
		}
		return shader
	}

	use() {
		this.gl.useProgram(this.program)
	}
}
