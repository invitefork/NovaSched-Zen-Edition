package com.zenjooo.novasched.core

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.min

/**
 * 本地 WebSocket 客户端：ws://127.0.0.1:31416（接口契约固定）。
 * 指数退避重连：1s、2s、4s、8s…上限 30s，带随机抖动；连接成功清零；
 * 主动关闭不重连。严禁密集循环重连。
 */
class NovaSocket(
    private val host: String = "127.0.0.1",
    private val port: Int = 31416,
    private val onMessage: (JSONObject) -> Unit,
    private val onState: (ConnState) -> Unit,
) : WebSocketListener() {

    enum class ConnState { CONNECTING, CONNECTED, DISCONNECTED }

    private val client = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // 长连接流式读
        .pingInterval(15, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private val backoff = AtomicInteger(0)
    private val stopped = AtomicBoolean(false)
    @Volatile var state: ConnState = ConnState.DISCONNECTED
        private set

    fun connect() {
        if (stopped.get()) return
        synchronized(this) {
            if (state == ConnState.CONNECTING || state == ConnState.CONNECTED) return
            state = ConnState.CONNECTING
        }
        onState(ConnState.CONNECTING)
        val request = Request.Builder().url("ws://$host:$port").build()
        webSocket = client.newWebSocket(request, this)
    }

    fun close() {
        stopped.set(true)
        webSocket?.close(1000, "client close")
        webSocket = null
        state = ConnState.DISCONNECTED
    }

    fun send(json: JSONObject): Boolean =
        webSocket?.send(json.toString()) ?: false

    /* ---------------- WebSocketListener ---------------- */

    override fun onOpen(webSocket: WebSocket, response: Response) {
        backoff.set(0)
        state = ConnState.CONNECTED
        onState(ConnState.CONNECTED)
        // 连接即要一次状态 + 订阅日志流
        send(JSONObject().put("cmd", "get_status"))
        send(JSONObject().put("cmd", "stream_logs").put("enable", true))
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
        try {
            val json = JSONObject(text)
            onMessage(json)
        } catch (e: Exception) {
            Log.w("NovaSocket", "bad frame: ${e.message}")
        }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        state = ConnState.DISCONNECTED
        onState(ConnState.DISCONNECTED)
        scheduleReconnect()
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        state = ConnState.DISCONNECTED
        onState(ConnState.DISCONNECTED)
        if (code != 1000) scheduleReconnect()
    }

    private fun scheduleReconnect() {
        if (stopped.get()) return
        val attempt = backoff.getAndIncrement()
        val delayMs = min(30_000L, (1000L shl min(attempt, 5)) + (0..250).random())
        Log.i("NovaSocket", "reconnect in ${delayMs}ms (attempt $attempt)")
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            if (!stopped.get()) connect()
        }, delayMs)
    }
}
