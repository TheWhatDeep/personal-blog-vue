<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGame } from '@/game/index.js'

const canvasEl = ref(null)
const error = ref(null)
let game = null

onMounted(() => {
	try {
		game = createGame(canvasEl.value)
		if (import.meta.env.DEV) window.__game = game // for automated testing
	} catch (e) {
		error.value = e.message || String(e)
		console.error(e)
	}
})

onBeforeUnmount(() => {
	if (game) {
		game.destroy()
		game = null
	}
})
</script>

<template>
	<div class="game-shell">
		<canvas ref="canvasEl" class="game-canvas" tabindex="0"></canvas>
		<div v-if="error" class="game-error">
			<p>Could not start the game: {{ error }}</p>
			<p>A WebGL-capable browser is required.</p>
		</div>
	</div>
</template>

<style scoped>
.game-shell {
	position: fixed;
	inset: 0;
	background: #000;
	z-index: 50;
}

.game-canvas {
	width: 100%;
	height: 100%;
	display: block;
	image-rendering: pixelated;
	image-rendering: crisp-edges;
	outline: none;
}

.game-error {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	color: #e88;
	font-family: monospace;
}
</style>
