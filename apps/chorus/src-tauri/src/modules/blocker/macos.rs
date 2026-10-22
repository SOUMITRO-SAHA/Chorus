//! macOS: install a `WKContentRuleList` (the Safari content-blocker engine)
//! on each service webview. This cancels ad/tracker requests at the network
//! layer — the same mechanism Safari content blockers use — and also applies
//! cosmetic (CSS) rules continuously as the page mutates.

use super::rule_list_json;
use crate::modules::services::Kind;
use tauri::WebviewWindow;

pub fn attach(window: &WebviewWindow, kind: Kind) {
    let Some(json) = rule_list_json(kind) else {
        return;
    };
    let json = json.to_string();
    let ident = format!("chorus-{}", kind.slug());
    let _ = window.with_webview(move |platform_webview| {
        let wk = platform_webview.inner().cast::<objc2_web_kit::WKWebView>();
        unsafe { install(wk, &ident, &json) };
    });
}

unsafe fn install(wk: *mut objc2_web_kit::WKWebView, ident: &str, json: &str) {
    use objc2::MainThreadMarker;
    use objc2::rc::Retained;
    use objc2_foundation::{NSError, NSString};
    use objc2_web_kit::{WKContentRuleList, WKContentRuleListStore};

    unsafe {
        // `with_webview` runs on the main thread; bail out gracefully otherwise.
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(webview) = Retained::retain(wk) else {
            return;
        };
        let Some(store) = WKContentRuleListStore::defaultStore(mtm) else {
            return;
        };

        let identifier = NSString::from_str(ident);
        let encoded = NSString::from_str(json);
        let controller = webview.configuration().userContentController();

        let ident = ident.to_string();
        let handler =
            block2::RcBlock::new(move |list: *mut WKContentRuleList, _error: *mut NSError| {
                if list.is_null() {
                    eprintln!("chorus: failed to compile content rule list '{ident}'");
                    return;
                }
                let list: &WKContentRuleList = &*list;
                controller.addContentRuleList(list);
                println!("chorus: content rule list '{ident}' active");
            });

        store.compileContentRuleListForIdentifier_encodedContentRuleList_completionHandler(
            Some(&identifier),
            Some(&encoded),
            Some(&handler),
        );
    }
}
