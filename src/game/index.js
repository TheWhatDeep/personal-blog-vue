import { Game } from './Game.js'

/**
 * Public entry point for the game engine.
 * The engine is framework-agnostic — any host (Vue view, plain HTML page)
 * just provides a canvas and calls destroy() on teardown.
 */
export function createGame(canvas) {
	const game = new Game(canvas)
	game.start()
	return game
}
