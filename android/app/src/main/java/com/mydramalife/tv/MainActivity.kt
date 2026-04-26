package com.mydramalife.tv

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    private var allowFinish = false

    // BroadcastReceiver per intercettare il back via Amazon Intent
    private val backReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            Log.d("BACK_DEBUG", "BroadcastReceiver: ricevuto intent ${intent?.action}")
            if (intent?.action == "android.intent.action.BACK" ||
                intent?.action == "com.amazon.tv.launcher.intent.action.BACK" ||
                intent?.action == "android.intent.action.MAIN") {
                sendBackToWeb()
            }
        }
    }

    inner class AndroidInterface {
        @JavascriptInterface
        fun exitApp() {
            allowFinish = true
            runOnUiThread { super@MainActivity.finish() }
        }

        @JavascriptInterface
        fun installApk(base64Data: String) {
            runOnUiThread {
                try {
                    val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                    val installer = packageManager.packageInstaller
                    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                    val sessionId = installer.createSession(params)
                    val session = installer.openSession(sessionId)
                    session.openWrite("update.apk", 0, bytes.size.toLong()).use { out ->
                        out.write(bytes); session.fsync(out)
                    }
                    val intent = Intent(this@MainActivity, MainActivity::class.java)
                    val pi = PendingIntent.getActivity(this@MainActivity, 0, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    session.commit(pi.intentSender); session.close()
                } catch (e: Exception) { Log.e("UPDATE", "Install failed: ${e.message}") }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Window.Callback — intercetta prima del FireTVKeyPolicyManager
        window.setCallback(object : android.view.Window.Callback by window.callback {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                Log.d("BACK_DEBUG", "Window.Callback dispatchKeyEvent keyCode=${event.keyCode}")
                if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                    if (event.action == KeyEvent.ACTION_UP) {
                        sendBackToWeb()
                    }
                    return true
                }
                return window.callback.dispatchKeyEvent(event)
            }
        })

        bridge?.webView?.addJavascriptInterface(AndroidInterface(), "AndroidInterface")

        bridge?.webView?.isFocusable = true
        bridge?.webView?.isFocusableInTouchMode = true
        bridge?.webView?.requestFocus()

        // WebViewClient override — forza focus dopo page load
        bridge?.webView?.webViewClient = object : com.getcapacitor.BridgeWebViewClient(bridge) {
            override fun onPageFinished(view: android.webkit.WebView?, url: String?) {
                super.onPageFinished(view, url)
                view?.requestFocus()
                Log.d("BACK_DEBUG", "onPageFinished — focus forzato")
                view?.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_UNKNOWN))
            }
        }

        bridge?.webView?.setOnKeyListener { _, keyCode, event ->
            Log.d("BACK_DEBUG", "WebView.setOnKeyListener keyCode=$keyCode action=${event.action}")
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                sendBackToWeb(); true
            } else false
        }

        window.decorView.setOnKeyListener { _, keyCode, event ->
            Log.d("BACK_DEBUG", "DecorView keyCode=$keyCode action=${event.action}")
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                sendBackToWeb(); true
            } else false
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Log.d("BACK_DEBUG", "OnBackPressedCallback fired")
                sendBackToWeb()
            }
        })

        // Registra BroadcastReceiver per intercettare Back via Amazon Intent
        val filter = IntentFilter().apply {
            addAction("android.intent.action.BACK")
            addAction("com.amazon.tv.launcher.intent.action.BACK")
        }
        registerReceiver(backReceiver, filter)
    }

    override fun onResume() {
        super.onResume()
        bridge?.webView?.postDelayed({
            bridge?.webView?.requestFocus()
            bridge?.webView?.requestFocusFromTouch()
            Log.d("BACK_DEBUG", "Focus requested on resume")
        }, 500)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            bridge?.webView?.requestFocus()
            Log.d("BACK_DEBUG", "onWindowFocusChanged hasFocus=$hasFocus")
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        window.decorView.requestFocus()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        Log.d("BACK_DEBUG", "dispatchKeyEvent keyCode=${event.keyCode} action=${event.action}")
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) sendBackToWeb()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun dispatchKeyShortcutEvent(event: KeyEvent): Boolean {
        Log.d("BACK_DEBUG", "dispatchKeyShortcutEvent keyCode=${event.keyCode}")
        if (event.keyCode == KeyEvent.KEYCODE_BACK) { sendBackToWeb(); return true }
        return super.dispatchKeyShortcutEvent(event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
        Log.d("BACK_DEBUG", "onKeyUp keyCode=$keyCode")
        if (keyCode == KeyEvent.KEYCODE_BACK) { sendBackToWeb(); return true }
        return super.onKeyUp(keyCode, event)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        Log.d("BACK_DEBUG", "onBackPressed fired")
        sendBackToWeb()
    }

    override fun finish() {
        Log.d("BACK_DEBUG", "finish() allowFinish=$allowFinish")
        if (allowFinish) super.finish() else sendBackToWeb()
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(backReceiver) } catch (e: Exception) {}
    }

    private fun sendBackToWeb() {
        bridge?.webView?.post {
            bridge?.webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('firetv-back'));", null
            )
            Log.d("BACK_DEBUG", "firetv-back dispatched to WebView")
        }
    }
}