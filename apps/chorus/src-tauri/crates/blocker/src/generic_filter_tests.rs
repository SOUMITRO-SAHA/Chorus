//! Contract tests for generic ad-network filters across custom and service pages.

use crate::{home_window_scripts, initialization_script, rule_list_json};

const AD_NETWORK_HOSTS: &[&str] = &[
    "adnxs\\.com",
    "criteo\\.com",
    "criteo\\.net",
    "taboola\\.com",
    "outbrain\\.com",
    "adform\\.net",
    "advertising\\.com",
];

#[test]
fn mobile_home_scripts_filter_common_ad_network_hosts() {
    let scripts = home_window_scripts("http://tauri.localhost").join("\n");

    for host in AD_NETWORK_HOSTS {
        assert!(scripts.contains(host), "missing generic filter for {host}");
    }
    assert!(scripts.contains("window.fetch"));
    assert!(scripts.contains("XMLHttpRequest"));
    assert!(scripts.contains("new Response(null, { status: 204 })"));
}

#[test]
fn service_scripts_filter_common_ad_network_hosts() {
    for slug in ["youtube", "youtube-music", "spotify"] {
        let script =
            initialization_script(slug, "http://tauri.localhost").expect("known service script");
        for host in AD_NETWORK_HOSTS {
            assert!(
                script.contains(host),
                "{slug} missing generic filter for {host}"
            );
        }
    }
}

#[test]
fn macos_rule_lists_filter_common_ad_network_hosts() {
    for slug in ["youtube", "youtube-music", "spotify"] {
        let json = rule_list_json(slug).expect("known service rules");
        let rules: serde_json::Value = serde_json::from_str(json).expect("valid rule JSON");
        let filters = rules
            .as_array()
            .expect("rule list array")
            .iter()
            .filter_map(|rule| rule.pointer("/trigger/url-filter")?.as_str())
            .collect::<Vec<_>>()
            .join("\n");

        for host in AD_NETWORK_HOSTS {
            assert!(
                filters.contains(host),
                "{slug} missing native filter for {host}"
            );
        }
    }
}
