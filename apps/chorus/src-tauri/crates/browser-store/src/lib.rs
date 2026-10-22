//! Chorus Browser persistence: shortcuts and history in SQLite. Chorus is a
//! single-site browser — one website at a time, no tabs — so this store keeps
//! exactly the home screen's data and nothing else.
//!
//! Standalone crate — no Tauri dependencies. The app wraps `Store` in
//! managed state and exposes Tauri commands around it.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;

/// A home-screen shortcut tile.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shortcut {
    pub id: i64,
    pub label: String,
    pub url: String,
    /// Official service glyph: "youtube" | "youtube-music" | "spotify" | ""
    /// for custom URLs.
    pub service: String,
    /// Website favicon as a `data:` URL; `None` renders Chorus's default mark.
    pub icon: Option<String>,
}

/// A visited URL.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub url: String,
    pub title: String,
    /// Epoch milliseconds.
    pub visited_at: i64,
}

/// Everything the browser home screen renders.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSnapshot {
    pub shortcuts: Vec<Shortcut>,
    pub history: Vec<HistoryEntry>,
}

const HISTORY_LIMIT: i64 = 200;

/// SQLite-backed browser store. Cheap to clone behind an `Arc`.
pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    /// Open (creating if needed) the store at `path` and run migrations.
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        Self::with_connection(conn)
    }

    /// In-memory store — for tests and ephemeral sessions.
    pub fn open_in_memory() -> Result<Self, String> {
        Self::with_connection(Connection::open_in_memory().map_err(|e| e.to_string())?)
    }

    fn with_connection(conn: Connection) -> Result<Self, String> {
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        migrate_shortcuts_icon(&conn)?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.seed_default_shortcuts()?;
        Ok(store)
    }

    fn seed_default_shortcuts(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM shortcuts", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count == 0 {
            conn.execute_batch(DEFAULT_SHORTCUTS_SQL)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Shortcuts, recent history, and tabs in one snapshot.
    pub fn snapshot(&self) -> Result<BrowserSnapshot, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let shortcuts = || -> Result<Vec<Shortcut>, String> {
            let mut stmt = conn
                .prepare("SELECT id, label, url, service, icon FROM shortcuts ORDER BY sort, id")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(Shortcut {
                        id: r.get(0)?,
                        label: r.get(1)?,
                        url: r.get(2)?,
                        service: r.get(3)?,
                        icon: r.get(4)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())
        };

        let history = || -> Result<Vec<HistoryEntry>, String> {
            let mut stmt = conn
                .prepare(
                    "SELECT id, url, title, visited_at FROM history
                     ORDER BY visited_at DESC, id DESC LIMIT ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([HISTORY_LIMIT], |r| {
                    Ok(HistoryEntry {
                        id: r.get(0)?,
                        url: r.get(1)?,
                        title: r.get(2)?,
                        visited_at: r.get(3)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())
        };

        Ok(BrowserSnapshot {
            shortcuts: shortcuts()?,
            history: history()?,
        })
    }

    /// Add a shortcut tile; returns the created row.
    pub fn shortcut_add(
        &self,
        label: &str,
        url: &str,
        service: &str,
        icon: Option<&str>,
    ) -> Result<Shortcut, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO shortcuts (label, url, service, icon, sort) VALUES (?1, ?2, ?3, ?4,
                COALESCE((SELECT MAX(sort) + 1 FROM shortcuts), 0))",
            rusqlite::params![label, url, service, icon],
        )
        .map_err(|e| e.to_string())?;
        Ok(Shortcut {
            id: conn.last_insert_rowid(),
            label: label.to_string(),
            url: url.to_string(),
            service: service.to_string(),
            icon: icon.map(str::to_string),
        })
    }

    pub fn shortcut_remove(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM shortcuts WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Record a visited URL. One row per URL — revisiting refreshes its
    /// timestamp and bubbles it to the top, so the table stays lean and the
    /// list never shows repeats. Failures are non-fatal by design: history
    /// must never break browsing.
    pub fn history_record(&self, url: &str, title: &str, visited_at: i64) {
        if let Ok(conn) = self.conn.lock() {
            let _ = conn.execute("DELETE FROM history WHERE url = ?1", [url]);
            let _ = conn.execute(
                "INSERT INTO history (url, title, visited_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![url, title, visited_at],
            );
        }
    }

    /// Erase all visited-URL history. Shortcuts are untouched.
    pub fn history_clear(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM history", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn migrate_shortcuts_icon(conn: &Connection) -> Result<(), String> {
    let has_icon = {
        let mut stmt = conn
            .prepare("PRAGMA table_info(shortcuts)")
            .map_err(|e| e.to_string())?;
        let names = stmt
            .query_map([], |r| r.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        names
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
            .iter()
            .any(|name| name == "icon")
    };
    if !has_icon {
        conn.execute("ALTER TABLE shortcuts ADD COLUMN icon TEXT", [])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS shortcuts (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    label   TEXT NOT NULL,
    url     TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT '',
    icon    TEXT,
    sort    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    url        TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    visited_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS history_time ON history(visited_at DESC);
DROP TABLE IF EXISTS tabs;
"#;

const DEFAULT_SHORTCUTS_SQL: &str = r#"
INSERT INTO shortcuts (label, url, service, sort) VALUES
    ('YouTube',       'https://www.youtube.com/',   'youtube',       0),
    ('YouTube Music', 'https://music.youtube.com/', 'youtube-music', 1),
    ('Spotify',       'https://open.spotify.com/',  'spotify',       2);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn now_millis() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }

    #[test]
    fn seeds_three_official_shortcuts_on_first_open() {
        let store = Store::open_in_memory().expect("in-memory store");
        let snapshot = store.snapshot().expect("snapshot");
        assert_eq!(snapshot.shortcuts.len(), 3);
        assert_eq!(snapshot.shortcuts[0].service, "youtube");
        assert_eq!(snapshot.shortcuts[2].service, "spotify");
    }

    #[test]
    fn seeding_is_idempotent() {
        let store = Store::open_in_memory().expect("in-memory store");
        let reopened = Store::open_in_memory().expect("in-memory store");
        let _ = reopened;
        assert_eq!(store.snapshot().expect("snapshot").shortcuts.len(), 3);
    }

    #[test]
    fn shortcut_add_and_remove() {
        let store = Store::open_in_memory().expect("in-memory store");
        let created = store
            .shortcut_add("Example", "https://example.com", "", None)
            .expect("shortcut_add");
        assert_eq!(created.label, "Example");
        assert_eq!(created.service, "");
        assert!(created.icon.is_none());

        store.shortcut_remove(created.id).expect("shortcut_remove");
        let snapshot = store.snapshot().expect("snapshot");
        assert!(snapshot.shortcuts.iter().all(|s| s.id != created.id));
    }

    #[test]
    fn shortcut_icon_round_trips() {
        let store = Store::open_in_memory().expect("in-memory store");
        let icon = "data:image/png;base64,AA==";
        let created = store
            .shortcut_add("Example", "https://example.com", "", Some(icon))
            .expect("shortcut_add");
        assert_eq!(created.icon.as_deref(), Some(icon));

        let snapshot = store.snapshot().expect("snapshot");
        let stored = snapshot
            .shortcuts
            .iter()
            .find(|s| s.id == created.id)
            .expect("stored shortcut");
        assert_eq!(stored.icon.as_deref(), Some(icon));
    }

    #[test]
    fn migrates_a_shortcuts_table_without_icon() {
        let conn = Connection::open_in_memory().expect("connection");
        conn.execute_batch(
            "CREATE TABLE shortcuts (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                label   TEXT NOT NULL,
                url     TEXT NOT NULL,
                service TEXT NOT NULL DEFAULT '',
                sort    INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO shortcuts (label, url, service, sort)
                VALUES ('Legacy', 'https://legacy.example', '', 0);",
        )
        .expect("legacy schema");

        let store = Store::with_connection(conn).expect("migrated store");
        let snapshot = store.snapshot().expect("snapshot");
        assert_eq!(snapshot.shortcuts.len(), 1);
        assert_eq!(snapshot.shortcuts[0].label, "Legacy");
        assert!(snapshot.shortcuts[0].icon.is_none());
    }

    #[test]
    fn history_records_and_lists_newest_first() {
        let store = Store::open_in_memory().expect("in-memory store");
        store.history_record("https://a.example", "A", now_millis());
        store.history_record("https://b.example", "B", now_millis() + 1);

        let snapshot = store.snapshot().expect("snapshot");
        assert_eq!(snapshot.history.len(), 2);
        assert_eq!(snapshot.history[0].url, "https://b.example");
    }

    #[test]
    fn history_record_dedupes_by_url() {
        let store = Store::open_in_memory().expect("in-memory store");
        store.history_record("https://a.example", "A", 1);
        store.history_record("https://b.example", "B", 2);
        store.history_record("https://a.example", "A-again", 3);

        let snapshot = store.snapshot().expect("snapshot");
        assert_eq!(snapshot.history.len(), 2);
        assert_eq!(snapshot.history[0].url, "https://a.example");
        assert_eq!(snapshot.history[0].title, "A-again");
        assert_eq!(snapshot.history[1].url, "https://b.example");
    }

    #[test]
    fn history_snapshot_is_capped_at_the_display_limit() {
        let store = Store::open_in_memory().expect("in-memory store");
        for offset in 0..HISTORY_LIMIT + 5 {
            store.history_record(&format!("https://site{offset}.example"), "Site", offset);
        }

        let snapshot = store.snapshot().expect("snapshot");
        assert_eq!(snapshot.history.len(), HISTORY_LIMIT as usize);
        assert_eq!(snapshot.history[0].visited_at, HISTORY_LIMIT + 4);
        assert_eq!(snapshot.history[HISTORY_LIMIT as usize - 1].visited_at, 5);
    }

    #[test]
    fn history_clear_erases_everything_but_keeps_other_tables() {
        let store = Store::open_in_memory().expect("open");
        store.history_record("https://a.example", "A", 1);
        store.history_record("https://b.example", "B", 2);

        store.history_clear().expect("clear");

        let snap = store.snapshot().expect("snapshot");
        assert!(snap.history.is_empty());
        assert!(!snap.shortcuts.is_empty());
    }
}
