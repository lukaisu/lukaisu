package org.lukaisu.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * Drive the hardware Back button off the WebView's own history.
 *
 * The remote LWT pages this app navigates to do not carry the Capacitor JS
 * bridge, so Capacitor's own back handling cannot dispatch to the page and ends
 * up exiting the app even when the WebView has somewhere to go back to (an open
 * menu drawer, or the connect screen one step back).
 *
 * Back must be intercepted via the AndroidX OnBackPressedDispatcher (the
 * platform routes Back through it, not the legacy onBackPressed()). Registering
 * our callback after super.onCreate() gives it priority over Capacitor's. A
 * Back walks the WebView history back — which also fires `popstate`, the signal
 * the web app uses to close an open drawer/popover — and only exits once there
 * is nothing left to pop (i.e. at the connect screen).
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });
    }
}
