//! Application modules — one bounded capability per directory. Depends
//! downward only: on `shared/` and the standalone crates; never on sibling
//! modules' internals.

pub mod blocker;
pub mod browser;
pub mod providers;
pub mod services;
