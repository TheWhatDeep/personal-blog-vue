import { SFX } from './SoundDefs.js'
import { MUSIC } from './MusicDefs.js'

/**
 * WebAudio-based audio system.
 *
 * - SFX are synthesized from data definitions (SoundDefs.js).
 * - Music is a lookahead-scheduled step sequencer playing procedural
 *   chiptune tracks (MusicDefs.js).
 * - Independent master / music / sfx volume channels.
 *
 * The AudioContext is created lazily on the first user gesture
 * (browser autoplay policy).
 */
export class AudioSystem {
	constructor() {
		this.ctx = null
		this.masterGain = null
		this.musicGain = null
		this.sfxGain = null
		this.volumes = { master: 0.8, music: 0.7, sfx: 0.8 }

		// sequencer state
		this.track = null
		this.trackName = null
		this.step = 0
		this.nextStepTime = 0
		this._timer = 0
		this._noiseBuffer = null
		this._sfxTimestamps = new Map() // throttle identical sfx
	}

	/** Create/resume the context. Safe to call repeatedly. */
	unlock() {
		if (!this.ctx) {
			const AC = window.AudioContext || window.webkitAudioContext
			if (!AC) return
			this.ctx = new AC()
			this.masterGain = this.ctx.createGain()
			this.masterGain.connect(this.ctx.destination)
			this.musicGain = this.ctx.createGain()
			this.musicGain.connect(this.masterGain)
			this.sfxGain = this.ctx.createGain()
			this.sfxGain.connect(this.masterGain)
			this._applyVolumes()
			this._noiseBuffer = this._makeNoise()
			this._timer = setInterval(() => this._schedule(), 30)
		}
		if (this.ctx.state === 'suspended') this.ctx.resume()
	}

	setVolume(channel, v) {
		this.volumes[channel] = Math.max(0, Math.min(1, v))
		this._applyVolumes()
	}

	_applyVolumes() {
		if (!this.ctx) return
		this.masterGain.gain.value = this.volumes.master
		this.musicGain.gain.value = this.volumes.music
		this.sfxGain.gain.value = this.volumes.sfx
	}

	_makeNoise() {
		const len = this.ctx.sampleRate * 1
		const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
		const data = buf.getChannelData(0)
		for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
		return buf
	}

	// ---- SFX ----------------------------------------------------------------

	/** Play a named sound effect. Identical sounds are throttled to 30ms apart. */
	play(name, volumeScale = 1) {
		if (!this.ctx || this.ctx.state !== 'running') return
		const def = SFX[name]
		if (!def) return
		const now = this.ctx.currentTime
		const last = this._sfxTimestamps.get(name) || 0
		if (now - last < 0.03) return
		this._sfxTimestamps.set(name, now)

		for (const layer of def) {
			this._playLayer(layer, now + (layer.delay || 0), volumeScale)
		}
	}

	_playLayer(layer, when, volumeScale) {
		const ctx = this.ctx
		const gain = ctx.createGain()
		const vol = (layer.vol || 0.2) * volumeScale
		gain.gain.setValueAtTime(vol, when)
		gain.gain.exponentialRampToValueAtTime(0.001, when + layer.dur)

		let src
		if (layer.wave === 'noise') {
			src = ctx.createBufferSource()
			src.buffer = this._noiseBuffer
			src.loop = true
		} else {
			src = ctx.createOscillator()
			src.type = layer.wave
			src.frequency.setValueAtTime(layer.from || 440, when)
			if (layer.to && layer.to !== layer.from) {
				src.frequency.exponentialRampToValueAtTime(Math.max(1, layer.to), when + layer.dur)
			}
		}

		let node = src
		if (layer.lp || layer.hp) {
			const filter = ctx.createBiquadFilter()
			filter.type = layer.lp ? 'lowpass' : 'highpass'
			filter.frequency.value = layer.lp || layer.hp
			node.connect(filter)
			node = filter
		}
		node.connect(gain)
		gain.connect(this.sfxGain)
		src.start(when)
		src.stop(when + layer.dur + 0.05)
	}

	// ---- music sequencer ------------------------------------------------------

	/** Crossfade to a named track from MusicDefs (null stops music). */
	setTrack(name) {
		if (name === this.trackName) return
		this.trackName = name
		this.track = name ? MUSIC[name] : null
		this.step = 0
		if (this.ctx) this.nextStepTime = this.ctx.currentTime + 0.1
	}

	_schedule() {
		if (!this.track || !this.ctx || this.ctx.state !== 'running') return
		const stepDur = 60 / this.track.tempo / 4
		const ahead = this.ctx.currentTime + 0.12
		while (this.nextStepTime < ahead) {
			this._playStep(this.step % this.track.steps, this.nextStepTime, stepDur)
			this.step++
			this.nextStepTime += stepDur
		}
	}

	_playStep(i, when, stepDur) {
		const t = this.track
		if (t.bass[i] !== null) this._note('triangle', t.root + t.bass[i], when, stepDur * 0.9, t.bassVol)
		if (t.lead[i] !== null) this._note(t.leadWave, t.root + t.lead[i] + 12, when, stepDur * 0.8, t.leadVol)
		if (t.pad[i] !== null) {
			this._note('sine', t.root + t.pad[i] + 12, when, stepDur * 7, t.padVol)
			this._note('sine', t.root + t.pad[i] + 19, when, stepDur * 7, t.padVol * 0.7)
		}
		if (t.kick[i]) this._kick(when)
		if (t.hat[i]) this._hat(when)
		if (t.snare[i]) this._snare(when)
	}

	_note(wave, semis, when, dur, vol) {
		const ctx = this.ctx
		const freq = 440 * Math.pow(2, (semis - 69) / 12)
		const osc = ctx.createOscillator()
		osc.type = wave
		osc.frequency.value = freq
		const gain = ctx.createGain()
		gain.gain.setValueAtTime(vol, when)
		gain.gain.exponentialRampToValueAtTime(0.001, when + dur)
		osc.connect(gain)
		gain.connect(this.musicGain)
		osc.start(when)
		osc.stop(when + dur + 0.05)
	}

	_kick(when) {
		const ctx = this.ctx
		const osc = ctx.createOscillator()
		osc.type = 'sine'
		osc.frequency.setValueAtTime(140, when)
		osc.frequency.exponentialRampToValueAtTime(35, when + 0.12)
		const gain = ctx.createGain()
		gain.gain.setValueAtTime(0.3, when)
		gain.gain.exponentialRampToValueAtTime(0.001, when + 0.14)
		osc.connect(gain)
		gain.connect(this.musicGain)
		osc.start(when)
		osc.stop(when + 0.16)
	}

	_hat(when) {
		this._noiseHit(when, 0.03, 0.05, 6000)
	}

	_snare(when) {
		this._noiseHit(when, 0.09, 0.12, 1800)
	}

	_noiseHit(when, dur, vol, hpFreq) {
		const ctx = this.ctx
		const src = ctx.createBufferSource()
		src.buffer = this._noiseBuffer
		src.loop = true
		const filter = ctx.createBiquadFilter()
		filter.type = 'highpass'
		filter.frequency.value = hpFreq
		const gain = ctx.createGain()
		gain.gain.setValueAtTime(vol, when)
		gain.gain.exponentialRampToValueAtTime(0.001, when + dur)
		src.connect(filter)
		filter.connect(gain)
		gain.connect(this.musicGain)
		src.start(when)
		src.stop(when + dur + 0.02)
	}

	destroy() {
		clearInterval(this._timer)
		if (this.ctx) this.ctx.close()
		this.ctx = null
	}
}
