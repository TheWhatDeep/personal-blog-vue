# Dungeon Depths

A 2D pixel-art roguelite dungeon crawler rendered entirely with WebGL.
Playable at `/game`.

Art comes from Pixel Poem's *2D Pixel Dungeon Asset Pack* and *Enemy
Animations Set* (see `assets/CREDITS.md`), composed into the runtime
texture atlas with per-biome tints, hue-shift variants and idle animation
frames (`gfx/AssetPack.js`). Everything the packs don't cover — spell
orbs, skill/item icons, particles, the bitmap font, and all audio — is
generated procedurally at load (`gfx/PixelArt.js`), and the procedural
versions of every sprite remain as an automatic fallback if the pack
fails to load. Assets are bundled by Vite, so the game stays fully
playable offline once loaded.

## Playing

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | WASD / arrows | Left stick / d-pad |
| Attack | Space / J | A / RT |
| Dodge roll | Shift / K | B / LT |
| Skills 1–4 | 1 2 3 4 | X Y LB RB |
| Health / mana potion | Q / R | L3 / R3 |
| Interact | E | A |
| Inventory / character | Tab / I | Select |
| Pause | Esc / P | Start |
| Fullscreen | F | — |

Descend 15 floors across 5 biomes, defeat each biome's boss, and slay the
Void Sovereign to unlock **Endless Mode**. Classes unlock through
achievements; all meta-progression (unlocks, achievements, statistics,
high scores, settings) persists in localStorage.

## Architecture

The engine is framework-agnostic ES modules under `src/game/`; the Vue view
(`src/views/GameView.vue`) only provides a canvas and calls `destroy()`.

```
core/      GameLoop (fixed 60Hz timestep, render decoupled), EventBus,
           seeded Rng, ObjectPool, SpatialGrid (uniform hash broad-phase)
gfx/       Renderer (WebGL sprite batcher, ~2 draw calls/frame), Shader,
           Atlas (procedural texture atlas + bitmap font), PixelArt
           (fallback sprites as palette-mapped pixel strings), AssetPack
           (maps the downloaded Pixel Poem art onto atlas regions with
           tints/hue-shifts/animation frames), Camera (smooth-follow +
           trauma shake), Particles (pooled)
input/     Keyboard + gamepad mapped onto named actions
audio/     WebAudio synth SFX (SoundDefs) + procedural chiptune sequencer
           (MusicDefs) with master/music/sfx channels
data/      ALL game content: biomes, classes, skills, enemies, bosses,
           items/affixes/rarities — adding content means adding data here
world/     TileMap (collision, LOS, exploration), DungeonGenerator
           (rooms + corridors, guaranteed connectivity, special rooms,
           boss arenas), World (floor runtime state, pooled projectiles/
           damage numbers, hazards, telegraphs)
systems/   Physics, Combat (single damage pipeline: crits, i-frames,
           knockback, combos, lifesteal/thorns), StatusEffects, AISystem
           (FSM: idle/patrol/chase/attack/recover), SkillSystem (generic
           executors interpret skill data), LootSystem, BossManager
           (phased data-driven patterns with telegraphs), EndlessMode,
           SaveSystem (meta-progression + achievements)
ui/        HUD (bars, cooldowns, boss bar, minimap), menus, inventory,
           settings — drawn through the same sprite batch
Game.js    orchestrator + state machine + render pipeline
```

### Design principles

- **Data-driven**: classes, skills, enemies, bosses, biomes, items and
  affixes are data entries interpreted by generic executors. A new skill,
  enemy archetype variant, boss or biome requires no engine changes.
- **Composition over inheritance**: entities are plain objects with data +
  behavior profiles; there is no class hierarchy.
- **Performance**: single texture atlas + single shader (whole frame in
  ~2 draw calls), object pooling for projectiles/particles/damage numbers,
  spatial-hash broad phase, camera culling, no per-frame allocations in hot
  paths. Holds 60 FPS with ~100 active enemies under software rendering.
- **Determinism**: fixed timestep simulation; dungeon generation is seeded
  and verified navigable (flood-fill start → stairs).
