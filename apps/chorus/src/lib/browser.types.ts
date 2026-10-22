/**
 * Chorus Browser domain types — mirrors of the `browser-store` crate
 * (crates/browser-store/src/lib.rs), camelCase on the wire.
 */

export interface Shortcut {
  readonly id: number;
  readonly label: string;
  readonly url: string;
  /** Official service glyph: "youtube" | "youtube-music" | "spotify" | "" */
  readonly service: string;
  /** Website favicon as a data URL; null renders Chorus's default mark. */
  readonly icon: string | null;
}

export interface HistoryEntry {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  /** Epoch milliseconds */
  readonly visitedAt: number;
}

export interface BrowserHomeState {
  readonly shortcuts: Shortcut[];
  readonly history: HistoryEntry[];
}
