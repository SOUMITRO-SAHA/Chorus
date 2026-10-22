// ! Mirrors of the Rust data models (src-tauri/src/models.rs) — camelCase on
// ! the wire. Keep in sync when extending the Rust side.

export interface MediaItem {
  id: string;
  title: string;
  subtitle: string;
  duration?: string;
  thumbnail?: string;
  kind: "video" | "song" | "album" | "spotify-track" | string;
  previewUrl?: string;
}

export interface Shelf {
  title: string;
  items: MediaItem[];
}

export interface WatchData {
  video: MediaItem;
  streamUrl?: string;
  related: MediaItem[];
}

export interface MusicTrack {
  video: MediaItem;
  audioUrl?: string;
  videoUrl?: string;
}

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  displayName?: string;
}
