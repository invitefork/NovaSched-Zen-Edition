package com.zenjooo.novasched.core

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/* ---------------- 协议数据模型 ---------------- */

data class ClusterInfo(
    val policy: String,
    val cur: Long, val min: Long, val max: Long,
)

data class NovaStatus(
    val version: String = "",
    val daemonAlive: Boolean = false,
    val phase: String = "",
    val socName: String = "",
    val profile: String = "",
    val effective: String = "",
    val automatic: Boolean = false,
    val clusters: List<ClusterInfo> = emptyList(),
    val cpuTemp: Float = Float.NaN,
    val batteryTemp: Float = Float.NaN,
    val foreground: String = "",
)

data class RuleItem(val pkg: String, val userId: Int, val mode: String, val label: String = "")

data class AppConfig(
    val freqPct: Map<String, Int> = emptyMap(),   // cluster -> percent
    val uclampMin: Int = 0,
    val uclampMax: Int = 100,
    val inputBoost: Boolean = false,
    val launchBoost: Boolean = false,
)

data class AppEntry(
    val pkg: String,
    val label: String,
    val userId: Int,
    val clone: Boolean,
)

data class LogLine(val time: String, val level: String, val message: String)

enum class Page { OVERVIEW, PROFILES, RULES, LOGS, ABOUT }

/**
 * 唯一状态源。Activity 旋转重建由 viewModelScope 保留；
 * App 被划掉后守护进程独立运行，这里只是客户端。
 */
class NovaViewModel(app: Application) : AndroidViewModel(app) {

    private val _status = MutableStateFlow(NovaStatus())
    val status: StateFlow<NovaStatus> = _status

    private val _page = MutableStateFlow(Page.OVERVIEW)
    val page: StateFlow<Page> = _page

    private val _conn = MutableStateFlow(NovaSocket.ConnState.DISCONNECTED)
    val conn: StateFlow<NovaSocket.ConnState> = _conn

    private val _rootGranted = MutableStateFlow(false)
    val rootGranted: StateFlow<Boolean> = _rootGranted

    private val _rootMissing = MutableStateFlow(false)
    val rootMissing: StateFlow<Boolean> = _rootMissing

    private val _rules = MutableStateFlow<List<RuleItem>>(emptyList())
    val rules: StateFlow<List<RuleItem>> = _rules

    private val _apps = MutableStateFlow<List<AppEntry>>(emptyList())
    val apps: StateFlow<List<AppEntry>> = _apps

    private val _config = MutableStateFlow(AppConfig())
    val config: StateFlow<AppConfig> = _config

    private val _logs = MutableStateFlow<List<LogLine>>(emptyList())
    val logs: StateFlow<List<LogLine>> = _logs

    private val _toast = MutableStateFlow("")
    val toast: StateFlow<String> = _toast

    val socket = NovaSocket(onMessage = ::handle, onState = { _conn.value = it })

    init {
        RootShell.probe { state ->
            when (state) {
                RootShell.SuState.AVAILABLE -> {
                    _rootGranted.value = true
                    checkDaemon()
                }
                RootShell.SuState.MISSING -> _rootMissing.value = true
                else -> _rootMissing.value = true // 拒绝授权同样按不可用处理
            }
        }
        socket.connect()
    }

    fun showToast(msg: String) { _toast.value = msg }
    fun consumeToast() { _toast.value = "" }

    fun setPage(p: Page) { _page.value = p }

    /* ---------------- 协议处理 ---------------- */

    private fun handle(msg: JSONObject) {
        when (msg.optString("type")) {
            "status" -> _status.value = parseStatus(msg)
            "rules" -> _rules.value = parseRules(msg.optJSONArray("rules"))
            "apps" -> _apps.value = parseApps(msg.optJSONArray("apps"))
            "config" -> _config.value = parseConfig(msg.optJSONObject("config") ?: msg)
            "ack" -> if (!msg.optBoolean("ok", true)) {
                showToast(msg.optString("error", "操作未确认"))
            }
            "logs" -> appendLogs(msg.optJSONArray("lines"))
            "error" -> showToast(msg.optString("message", "守护进程返回错误"))
        }
    }

    private fun parseStatus(msg: JSONObject): NovaStatus {
        val clusters = mutableListOf<ClusterInfo>()
        val arr = msg.optJSONArray("clusters") ?: JSONArray()
        for (i in 0 until arr.length()) {
            val c = arr.optJSONObject(i) ?: continue
            clusters.add(
                ClusterInfo(
                    policy = c.optString("policy"),
                    cur = c.optLong("cur"), min = c.optLong("min"), max = c.optLong("max"),
                )
            )
        }
        return NovaStatus(
            version = msg.optString("version"),
            daemonAlive = msg.optBoolean("alive", true),
            phase = msg.optString("phase"),
            socName = msg.optString("soc"),
            profile = msg.optString("profile"),
            effective = msg.optString("effective"),
            automatic = msg.optBoolean("automatic", false),
            clusters = clusters,
            cpuTemp = msg.optDouble("cpu_temp", Double.NaN).toFloat(),
            batteryTemp = msg.optDouble("battery_temp", Double.NaN).toFloat(),
            foreground = msg.optString("foreground"),
        )
    }

    private fun parseRules(arr: JSONArray?): List<RuleItem> {
        val out = mutableListOf<RuleItem>()
        for (i in 0 until (arr?.length() ?: 0)) {
            val r = arr?.optJSONObject(i) ?: continue
            out.add(RuleItem(r.optString("package"), r.optInt("userId", 0), r.optString("mode"), r.optString("label")))
        }
        return out
    }

    private fun parseApps(arr: JSONArray?): List<AppEntry> {
        val out = mutableListOf<AppEntry>()
        for (i in 0 until (arr?.length() ?: 0)) {
            val a = arr?.optJSONObject(i) ?: continue
            out.add(AppEntry(a.optString("package"), a.optString("label"), a.optInt("userId", 0), a.optBoolean("clone", false)))
        }
        return out
    }

    private fun parseConfig(c: JSONObject): AppConfig {
        val freq = mutableMapOf<String, Int>()
        val f = c.optJSONObject("freq_pct") ?: JSONObject()
        for (key in f.keys()) freq[key] = f.optInt(key)
        return AppConfig(
            freqPct = freq,
            uclampMin = c.optInt("uclamp_min", 0),
            uclampMax = c.optInt("uclamp_max", 100),
            inputBoost = c.optBoolean("input_boost", false),
            launchBoost = c.optBoolean("launch_boost", false),
        )
    }

    @Volatile private var lastLogFlush = 0L
    private val logBuffer = ArrayList<LogLine>(64)

    private fun appendLogs(arr: JSONArray?) {
        synchronized(logBuffer) {
            for (i in 0 until (arr?.length() ?: 0)) {
                val l = arr?.optJSONObject(i) ?: continue
                logBuffer.add(LogLine(l.optString("time"), l.optString("level", "info"), l.optString("message")))
            }
        }
    }

    /** 日志页每 180ms 批量冲刷一次，防高频日志卡 UI。 */
    fun flushLogs() {
        val batch: List<LogLine>
        synchronized(logBuffer) {
            if (logBuffer.isEmpty()) return
            batch = ArrayList(logBuffer)
            logBuffer.clear()
        }
        val merged = (_logs.value + batch).let { if (it.size > 1000) it.takeLast(1000) else it }
        _logs.value = merged
    }

    fun clearLogs() {
        synchronized(logBuffer) { logBuffer.clear() }
        _logs.value = emptyList()
        socket.send(JSONObject().put("cmd", "clear_logs"))
    }

    /* ---------------- 指令下发 ---------------- */

    fun setProfile(profile: String) {
        socket.send(JSONObject().put("cmd", "set_profile").put("profile", profile))
    }

    fun setAutomatic(on: Boolean) {
        socket.send(JSONObject().put("cmd", "set_auto").put("enabled", on))
    }

    fun saveConfig(c: AppConfig) {
        val obj = JSONObject()
            .put("cmd", "set_config")
            .put("config", JSONObject()
                .put("freq_pct", JSONObject(c.freqPct))
                .put("uclamp_min", c.uclampMin)
                .put("uclamp_max", c.uclampMax)
                .put("input_boost", c.inputBoost)
                .put("launch_boost", c.launchBoost))
        socket.send(obj)
        showToast("配置已下发，等待守护进程确认")
    }

    fun resetConfig() {
        socket.send(JSONObject().put("cmd", "reset_config"))
        showToast("已请求恢复默认配置")
    }

    fun refreshRules() { socket.send(JSONObject().put("cmd", "get_rules")) }
    fun refreshApps() { socket.send(JSONObject().put("cmd", "get_apps")) }
    fun refreshConfig() { socket.send(JSONObject().put("cmd", "get_config")) }

    fun setRule(pkg: String, userId: Int, mode: String) {
        socket.send(JSONObject().put("cmd", "set_rule")
            .put("package", pkg).put("userId", userId).put("mode", mode))
    }

    fun deleteRule(pkg: String, userId: Int) {
        socket.send(JSONObject().put("cmd", "delete_rule")
            .put("package", pkg).put("userId", userId))
    }

    /* ---------------- root 动作 ---------------- */

    fun checkDaemon() {
        RootShell.daemonAlive { alive ->
            _status.value = _status.value.copy(daemonAlive = alive)
        }
    }

    fun startDaemon() {
        if (!_rootGranted.value) { showToast("需要 root 授权后才能拉起守护进程"); return }
        RootShell.startDaemon { ok ->
            viewModelScope.launch {
                showToast(if (ok) "守护进程拉起指令已执行，等待状态回读" else "拉起失败，请检查模块安装与 root 授权")
                checkDaemon()
            }
        }
    }

    fun exportLogs(): String {
        var text = ""
        RootShell.exportLogs { text = it }
        return text
    }

    override fun onCleared() {
        socket.close()
        super.onCleared()
    }

    companion object { private const val TAG = "NovaViewModel" }
}
