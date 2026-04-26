package com.mydramalife.tv

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // OnBackPressedCallback intercetta il Back sia con tasti classici
        // che con gesture navigation (swipe dal bordo) — funziona su tutti i Android
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView: WebView? = bridge?.webView
                if (webView != null) {
                    // Manda l'evento al JavaScript — App.tsx gestisce
                    // il toast "premi ancora per uscire" e la doppia pressione
                    webView.evaluateJavascript(
                        """
                        (function() {
                            var event = new KeyboardEvent('keydown', {
                                key: 'GoBack',
                                keyCode: 10009,
                                bubbles: true,
                                cancelable: true
                            });
                            document.dispatchEvent(event);
                        })();
                        """.trimIndent(),
                        null
                    )
                }
                // NON chiamare super — blocca il comportamento default di uscita
            }
        })
    }
}
