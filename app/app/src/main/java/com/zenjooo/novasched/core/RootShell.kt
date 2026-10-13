package com.zenjooo.novasched.core

import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * root 使用面收敛到三件事（与产品约定一致）：
 * 1. 检测 su 与申请授权；
 * 2. 检测 NovaSched Rust 守护进程存活并在死亡时拉起；
 * 3. 日志导出相关 shell 操作。
 * 严禁任何 /sys 节点读写与调度逻辑——内核操作全部归属守护进程。
 */
object RootShell {

    enum class SuState { UNKNOWN, AVAILABLE, DENIED, MISSING }

    @Volatile
    var suState: SuState = SuState.UNKNOWN
        private set

    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "nova-root").apply { isDaemon = true }
    }

    sealed class Result {
        data class Ok(val stdout: String) : Result()
        data class Err(val message: String, val exitCode: Int = -1) : Result()
    }

    private fun suBinary(): String? {
        for (path in listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su", "/data/adb/ksu/bin/su", "/data/adb/ap/bin/su", "/data/adb/magisk/su")) {
            if (File(path).exists()) return path
        }
        return if (File("/system/bin/su").exists() || whichSu()) "/system/bin/su" else null
    }

    private fun whichSu(): Boolean = try {
        val p = ProcessBuilder("which", "su").start()
        p.waitFor(3, TimeUnit.SECONDS) && p.exitValue() == 0
    } catch (_: Throwable) {
        false
    }

    /** 探测 su 并触发一次授权请求（whoami）。 */
    fun probe(onState: (SuState) -> Unit) {
        executor.execute {
            val binary = suBinary()
            if (binary == null) {
                suState = SuState.MISSING
                onState(suState)
                return@execute
            }
            val r = exec("id -u")
            suState = when (r) {
                is Result.Ok -> if (r.stdout.trim() == "0") SuState.AVAILABLE else SuState.DENIED
                is Result.Err -> SuState.DENIED
            }
            onState(suState)
        }
    }

    /** su -c 执行；stderr 带回 SELinux 拒绝等细节，异常全部捕获不外抛。 */
    fun exec(command: String, timeoutSec: Long = 15): Result {
        return try {
            val process = ProcessBuilder("su", "-c", command).start()
            val finished = process.waitFor(timeoutSec, TimeUnit.SECONDS)
            if (!finished) {
                process.destroyForcibly()
                return Result.Err("命令超时：$command")
            }
            val stdout = process.inputStream.bufferedReader().use { it.readText() }
            val stderr = process.errorStream.bufferedReader().use { it.readText() }
            when (val code = process.exitValue()) {
                0 -> Result.Ok(stdout)
                else -> Result.Err(stderr.ifBlank { stdout }.ifBlank { "退出码 $code" }, code)
            }
        } catch (e: Exception) {
            Result.Err("shell 执行失败：${e.message ?: e.javaClass.simpleName}")
        }
    }

    fun async(command: String, timeoutSec: Long = 15, onDone: (Result) -> Unit = {}) {
        executor.execute { onDone(exec(command, timeoutSec)) }
    }

    /* ---------------- 守护进程管理（root 用途 ②） ---------------- */

    private const val MODULE_DIR = "/data/adb/modules/NovaSched_Zen_Edition"
    private const val STATE_DIR = "/data/adb/novasched"

    /** 守护进程存活 = nova_sched 进程存在。用 pidof 而非读文件，避免误判残留 pid。 */
    fun daemonAlive(cb: (Boolean) -> Unit) {
        async("pidof novasched || pgrep -f 'bin/novasched' | head -n1") { r ->
            cb(r is Result.Ok && r.stdout.trim().isNotEmpty())
        }
    }

    /** 通过 su 拉起守护进程（模块 service.sh 是主入口，此为死亡兜底）。 */
    fun startDaemon(cb: (Boolean) -> Unit) {
        val cmd = "sh $MODULE_DIR/service.sh >/dev/null 2>&1 &"
        async(cmd, 20) { r -> cb(r is Result.Ok) }
    }

    /* ---------------- 日志导出（root 用途 ③） ---------------- */

    /** 读权威日志尾部（仅日志导出用途）。 */
    fun tailLogs(lines: Int, cb: (String) -> Unit) {
        async("tail -n $lines $STATE_DIR/novasched.log 2>/dev/null") { r ->
            cb((r as? Result.Ok)?.stdout ?: "")
        }
    }

    /** 导出到应用沙盒 Downloads（MediaStore 由调用方处理），返回日志文本。 */
    fun exportLogs(cb: (String) -> Unit) {
        async("cat $STATE_DIR/novasched.log 2>/dev/null") { r ->
            cb((r as? Result.Ok)?.stdout ?: "")
        }
    }
}
