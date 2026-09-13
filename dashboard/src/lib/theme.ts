/**
 * Palette for the GBot.EXE dashboard.
 *
 * Mega Man Battle Network net-navi styling: deep navy plate, neon blue primary,
 * hot pink accent. Data colours are NOT the neon UI colours — the neons sit
 * outside the readable lightness band on a dark surface, so chart marks use
 * snapped versions validated against surface #0f1626.
 *
 * `good` is teal rather than green on purpose. Green vs red measures ΔE 2.2
 * under deuteranopia — indistinguishable — and complete-vs-failed sit side by
 * side throughout the Subject Log. Teal vs red measures 9.3. Status is also
 * always rendered with an icon AND a word, never colour alone.
 */

export const DATA = {
  series: '#0094d1',
  good: '#00a89b',
  warning: '#be7300',
  critical: '#e9365c',
  accent: '#d84592'
} as const;

/** Bright neons — UI chrome, glow and text only. Never chart marks. */
export const NEON = {
  blue: '#00bfff',
  pink: '#ff69b4',
  cyan: '#7df9ff'
} as const;

export const SURFACE = {
  base: '#070b14',
  plate: '#0f1626',
  raised: '#16203a',
  line: 'rgba(0, 148, 209, 0.28)'
} as const;

export type JobState = 'running' | 'completed' | 'error' | 'idle';

/** Status token: colour is the last signal, never the only one. */
export const STATUS: Record<JobState, { label: string; color: string; glyph: string }> = {
  completed: { label: 'COMPLETE', color: DATA.good, glyph: '✔' },
  error: { label: 'FAILED', color: DATA.critical, glyph: '✕' },
  running: { label: 'ACTIVE', color: DATA.series, glyph: '▸' },
  idle: { label: 'IDLE', color: '#64748b', glyph: '·' }
};

/**
 * Pipeline phases, keyed to what the backend emits on its @@EVENT channel.
 * These keys must match utils/progress.js — the previous dashboard was still
 * matching an older vocabulary (filmography_scan, ai_validation, ...) that the
 * pipeline had stopped sending, so no phase ever lit up.
 */
export const PHASES = [
  { key: 'role_discovery', label: 'Filmography Scan', pct: 5 },
  { key: 'roles_found', label: 'Role Verification', pct: 25 },
  { key: 'image_search', label: 'Image Acquisition', pct: 40 },
  { key: 'validation', label: 'Quality Validation', pct: 70 },
  { key: 'resize', label: 'Print Formatting', pct: 82 },
  { key: 'manifest', label: 'Manifest Compile', pct: 90 },
  { key: 'upload', label: 'Drive Transfer', pct: 95 },
  { key: 'complete', label: 'Mission Complete', pct: 100 }
] as const;

export type PhaseKey = (typeof PHASES)[number]['key'];
