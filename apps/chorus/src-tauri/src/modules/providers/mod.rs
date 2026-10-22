//! Provider integrations — one module per service over each service's own
//! API. `innertube` is the shared YouTube protocol client used by the YouTube
//! and Music modules; domain wire types live in `crate::shared::domain`.

pub mod innertube;
pub mod music;
pub mod spotify;
pub mod youtube;
