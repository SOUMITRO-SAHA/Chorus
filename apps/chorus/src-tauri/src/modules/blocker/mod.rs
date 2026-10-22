//! Ad/track blocking — the app-side surface.
//!
//! The rule data and injected-script assembly live in the standalone
//! `blocker` crate (Tauri-free, separately tested); this module adapts
//! `services::Kind` to that crate's slug-keyed API and owns the one
//! platform-specific piece: the macOS `WKContentRuleList` installer
//! (`macos`). It owns no blocking rules itself.

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
pub use macos::attach;

use crate::modules::services::Kind;

/// Network rule list (WKContentRuleList JSON) for a service.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn rule_list_json(kind: Kind) -> Option<&'static str> {
    blocker::rule_list_json(kind.slug())
}

/// Script injected into every service webview (document start).
pub fn initialization_script(kind: Kind) -> Option<String> {
    blocker::initialization_script(kind.slug(), crate::modules::services::home_origin())
}

/// Chorus Browser chrome + home-window scripts for mobile (the main webview
/// navigates to services in place, so the chrome self-gates on home origin).
#[cfg(mobile)]
pub fn home_window_scripts() -> Vec<String> {
    blocker::home_window_scripts(crate::modules::services::home_origin())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_service_kind_has_a_blocker_profile() {
        for id in ["youtube", "youtube-music", "spotify"] {
            let kind = crate::modules::services::find(id)
                .expect("seeded service")
                .kind;
            assert!(
                initialization_script(kind).is_some(),
                "{id} missing profile"
            );
            assert!(rule_list_json(kind).is_some(), "{id} missing rules");
        }
    }
}
