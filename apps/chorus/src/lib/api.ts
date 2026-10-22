import { invoke } from "@tauri-apps/api/core";
import type { BrowserHomeState, Shortcut } from "./browser.types";
import type { MediaItem, MusicTrack, Shelf, SpotifyStatus, WatchData } from "./types";

async function rpc<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export const youtube = {
  home: () => rpc<Shelf[]>("youtube_home"),
  search: (query: string) => rpc<MediaItem[]>("youtube_search", { query }),
  watch: (videoId: string) => rpc<WatchData>("youtube_watch", { videoId }),
};

export const music = {
  home: () => rpc<Shelf[]>("music_home"),
  search: (query: string) => rpc<MediaItem[]>("music_search", { query }),
  play: (videoId: string) => rpc<MusicTrack>("music_play", { videoId }),
};

export const spotify = {
  status: () => rpc<SpotifyStatus>("spotify_status"),
  connect: () => rpc<string>("spotify_connect"),
  saveClientId: (clientId: string) => rpc<void>("spotify_save_client_id", { clientId }),
  search: (query: string) => rpc<MediaItem[]>("spotify_search", { query }),
  newReleases: () => rpc<Shelf[]>("spotify_new_releases"),
  albumTracks: (albumId: string) => rpc<MediaItem[]>("spotify_album_tracks", { albumId }),
};

/** Chorus Browser: open the official web app with our own chrome + blocker. */
export const openBrowser = (id: string) => rpc<string>("open_browser", { id });

/** Native browser persistence + session (SQLite, managed in Rust). */
export const browser = {
  state: () => rpc<BrowserHomeState>("browser_state"),
  clearHistory: () => rpc<void>("browser_history_clear"),
  loadUrl: (url: string) => rpc<void>("browser_load_url", { url }),
  shortcutAdd: (label: string, url: string, service: string, icon: string | null) =>
    rpc<Shortcut>("shortcut_add", { label, url, service, icon }),
  shortcutRemove: (id: number) => rpc<void>("shortcut_remove", { id }),
  favicon: (url: string) => rpc<string | null>("browser_favicon", { url }),
};
