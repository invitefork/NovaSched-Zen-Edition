package com.zenjooo.novasched.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zenjooo.novasched.core.AppConfig
import com.zenjooo.novasched.core.LogLine
import com.zenjooo.novasched.core.NovaStatus
import com.zenjooo.novasched.core.NovaViewModel
import com.zenjooo.novasched.core.Page
import com.zenjooo.novasched.core.RuleItem
import com.zenjooo.novasched.ui.glass.GlassBackdrop
import com.zenjooo.novasched.ui.theme.SleepColors
import com.zenjooo.novasched.ui.theme.SD

/* ---------------- 概览页 ---------------- */

@Composable
fun OverviewPage(
    vm: NovaViewModel,
    status: NovaStatus,
    colors: SleepColors,
    backdrop: GlassBackdrop,
    connected: Boolean,
) {
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(SD.SecondaryPage.ContentSectionSpacing),
    ) {
        item {
            GlassCard(backdrop, SD.AssistantCard.Corner, colors, onClick = {}) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("当前档位", color = colors.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        if (status.effective.isNotEmpty()) status.effective else "待确认",
                        color = colors.onGlassDim, fontSize = 12.sp,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(colors.accent.copy(alpha = 0.14f))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        if (!connected) "待连接" else if (status.automatic) "自动调度" else "手动",
                        color = colors.onGlassDim, fontSize = 12.sp,
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    if (!connected) "—" else status.socName.ifEmpty { "守护进程已连接" },
                    color = colors.onGlass, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(if (connected) "调度正常" else "等待本地服务", color = colors.onGlassDim, fontSize = 13.sp)
                    Text(
                        if (status.cpuTemp.isNaN()) "温度 —" else "CPU ${status.cpuTemp}°C",
                        color = colors.onGlassDim, fontSize = 13.sp,
                    )
                }
                Spacer(Modifier.height(10.dp))
                Box(Modifier.fillMaxWidth().height(1.dp).background(colors.divider))
                Spacer(Modifier.height(10.dp))
                Text(
                    if (!connected) "正在连接本机调度服务。"
                    else if (!status.daemonAlive) "守护进程未运行，点击下方按钮用 root 拉起。"
                    else "自动调度跟随前台应用：游戏用极速，其余用省电。",
                    color = colors.onGlassDim, fontSize = 13.sp, lineHeight = 18.sp,
                )
                if (!status.daemonAlive) {
                    Spacer(Modifier.height(12.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(50))
                            .background(colors.accent)
                            .clickable { vm.startDaemon() }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("ROOT 启动守护", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        item { SectionDivider("前台应用", if (connected) "实时" else "每两秒刷新", colors) }
        item {
            GlassCard(backdrop, SD.CourseCard.Corner, colors) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val pkg = status.foreground
                    val initial = pkg.firstOrNull()?.uppercase() ?: "—"
                    Box(
                        Modifier.size(38.dp).clip(CircleShape).background(colors.accent.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center,
                    ) { Text(initial, color = colors.accent, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
                    Column(Modifier.weight(1f)) {
                        Text(pkg.ifEmpty { if (connected) "无前台应用" else "等待连接" },
                            color = colors.onGlass, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("前台活动每两秒刷新一次。", color = colors.onGlassDim, fontSize = 12.sp)
                    }
                    Text(
                        "重新连接", color = colors.accent, fontSize = 13.sp,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .clickable { vm.checkDaemon() }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }
        }

        item { SectionDivider("运行诊断", "com.zenjooo.novasched", colors) }
        item {
            GlassCard(backdrop, SD.CourseCard.Corner, colors) {
                Text("大小核频率", color = colors.onGlass, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                if (status.clusters.isEmpty()) {
                    Text("连接后显示各簇实时频率。", color = colors.onGlassDim, fontSize = 13.sp)
                } else {
                    status.clusters.forEach { c ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(c.policy, color = colors.onGlassDim, fontSize = 13.sp)
                            Text(
                                "${"%.2f".format(c.cur / 1000.0)} / ${"%.2f".format(c.max / 1000.0)} GHz",
                                color = colors.onGlass, fontSize = 13.sp,
                            )
                        }
                    }
                }
            }
        }
    }
}

/* ---------------- 档位配置页 ---------------- */

@Composable
fun ProfilesPage(
    vm: NovaViewModel,
    status: NovaStatus,
    config: AppConfig,
    colors: SleepColors,
    backdrop: GlassBackdrop,
    editable: Boolean,
) {
    var draft by remember(config) { mutableStateOf(config) }
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(SD.SecondaryPage.ContentSectionSpacing),
    ) {
        item { SectionDivider("调度档位", if (status.automatic) "自动" else "手动", colors, big = true) }
        val modes = listOf(
            Triple("省电", "压低频率上限，减少日常功耗。", NovaIcons.Leaf) to "powersave",
            Triple("均衡", "兼顾响应速度与耗电，适合日用。", NovaIcons.Balance) to "balance",
            Triple("性能", "提高响应，适度抬高最低频率。", NovaIcons.Rocket) to "performance",
            Triple("极速", "开放完整频率范围，优先响应。", NovaIcons.Gauge) to "fast",
        )
        items(modes) { pair ->
            val (info, key) = pair
            ModeCard(
                title = info.first, subtitle = info.second, icon = info.third,
                active = status.effective == key,
                pending = false,
                enabled = editable,
                colors = colors, backdrop = backdrop,
                onClick = { vm.setProfile(key) },
            )
        }
        item {
            SettingsRow(
                title = "自动调度",
                subtitle = "游戏用极速，日用和桌面用省电。",
                colors = colors, backdrop = backdrop,
                trailing = {
                    NovaSwitch(
                        checked = status.automatic, enabled = editable, colors = colors,
                        onCheckedChange = { vm.setAutomatic(it) },
                    )
                },
            )
        }
        item { SectionDivider("档位参数", "通过 WebSocket 下发", colors, big = true) }
        if (draft.freqPct.isEmpty()) {
            item {
                GlassCard(backdrop, SD.CourseCard.Corner, colors) {
                    Text("配置未加载", color = colors.onGlass, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("守护进程连接后会返回当前档位参数。", color = colors.onGlassDim, fontSize = 13.sp)
                }
            }
        } else {
            items(draft.freqPct.keys.toList().sorted()) { key ->
                val value = draft.freqPct[key] ?: 50
                GlassCard(backdrop, SD.CourseCard.Corner, colors) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("$key 频率上限", color = colors.onGlass, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("$value%", color = colors.accent, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                    Slider(
                        value = value.toFloat(),
                        onValueChange = { draft = draft.copy(freqPct = draft.freqPct + (key to it.toInt())) },
                        valueRange = 0f..100f,
                        enabled = editable,
                        colors = SliderDefaults.colors(
                            thumbColor = colors.accent,
                            activeTrackColor = colors.accent,
                            inactiveTrackColor = colors.onGlassDim.copy(alpha = 0.2f),
                        ),
                    )
                }
            }
            item {
                SettingsRow(
                    "uClamp 下限", "最小可用容量钳制 ${draft.uclampMin}%", colors, backdrop,
                    trailing = {
                        NovaSwitch(
                            checked = draft.uclampMin > 0, enabled = editable, colors = colors,
                            onCheckedChange = { draft = draft.copy(uclampMin = if (it) 40 else 0) },
                        )
                    },
                )
            }
            item {
                SettingsRow(
                    "input_boost", "输入加速：触控时短时提频", colors, backdrop,
                    trailing = {
                        NovaSwitch(
                            checked = draft.inputBoost, enabled = editable, colors = colors,
                            onCheckedChange = { draft = draft.copy(inputBoost = it) },
                        )
                    },
                )
            }
            item {
                SettingsRow(
                    "launch_boost", "启动加速：应用启动短时提频", colors, backdrop,
                    trailing = {
                        NovaSwitch(
                            checked = draft.launchBoost, enabled = editable, colors = colors,
                            onCheckedChange = { draft = draft.copy(launchBoost = it) },
                        )
                    },
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    DialogActionHost("保存配置", colors, accent = true, enabled = editable) { vm.saveConfig(draft) }
                    DialogActionHost("恢复默认", colors, enabled = editable) { vm.resetConfig() }
                }
            }
        }
    }
}

/** 页面级胶囊动作钮（保存/重置），复用弹窗动作的规格。 */
@Composable
private fun RowScope.DialogActionHost(label: String, colors: SleepColors, accent: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier
            .weight(1f)
            .clip(RoundedCornerShape(25.dp))
            .background(if (accent) colors.accent else colors.glass)
            .clickable(enabled = enabled) { onClick() }
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (accent) Color.White else colors.onGlass, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

/* ---------------- 应用规则页 ---------------- */

@Composable
fun RulesPage(
    vm: NovaViewModel,
    rules: List<RuleItem>,
    colors: SleepColors,
    backdrop: GlassBackdrop,
    editable: Boolean,
) {
    LaunchedEffect(Unit) {
        vm.refreshRules()
        vm.refreshApps()
    }
    var editing by remember { mutableStateOf<RuleItem?>(null) }
    var showAdd by remember { mutableStateOf(false) }

    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(SD.SecondaryPage.ContentSectionSpacing),
    ) {
        item { SectionDivider("应用规则", "${rules.size} 条规则", colors, big = true) }
        item {
            Text(
                "给应用单独设档。支持应用分身与多用户（userId）。",
                color = colors.onGlassDim, fontSize = 13.sp,
            )
        }
        if (rules.isEmpty()) {
            item {
                GlassCard(backdrop, SD.CourseCard.Corner, colors) {
                    Text("还没有应用规则", color = colors.onGlass, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("点下方「添加应用规则」，为游戏或视频应用设定独立档位。", color = colors.onGlassDim, fontSize = 13.sp)
                }
            }
        } else {
            items(rules, key = { "${it.pkg}:${it.userId}" }) { rule ->
                GlassCard(backdrop, SD.CourseCard.Corner, colors, onClick = { if (editable) editing = rule }) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(
                            Modifier.size(36.dp).clip(CircleShape).background(colors.accent.copy(alpha = 0.18f)),
                            contentAlignment = Alignment.Center,
                        ) { Text(rule.pkg.firstOrNull()?.uppercase() ?: "?", color = colors.accent, fontSize = 15.sp, fontWeight = FontWeight.Bold) }
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(rule.pkg, color = colors.onGlass, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (rule.userId != 0) {
                                    Text(
                                        if (rule.userId == 999) "分身" else "用户 ${rule.userId}",
                                        color = colors.accent, fontSize = 10.sp,
                                        modifier = Modifier.clip(RoundedCornerShape(50)).background(colors.accent.copy(alpha = 0.15f)).padding(horizontal = 6.dp, vertical = 2.dp),
                                    )
                                }
                            }
                            Text(rule.mode, color = colors.onGlassDim, fontSize = 12.sp)
                        }
                        androidx.compose.material3.Icon(NovaIcons.Chevron, contentDescription = null, tint = colors.onGlassDim, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
        item {
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(50))
                    .background(if (editable) colors.accent else colors.onGlassDim.copy(alpha = 0.2f))
                    .clickable(enabled = editable) { showAdd = true }
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("＋ 添加应用规则", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
    }

    val editor = editing
    if (editor != null) {
        GlassDialog(
            title = "编辑规则", colors = colors, backdrop = backdrop, onDismiss = { editing = null },
            message = editor.pkg + if (editor.userId != 0) "（userId ${editor.userId}）" else "",
            actions = {
                DialogAction("删除", colors, danger = true) {
                    vm.deleteRule(editor.pkg, editor.userId)
                    editing = null
                }
                DialogAction("关闭", colors) { editing = null }
            },
        )
    }
    if (showAdd) {
        var pkg by remember { mutableStateOf("") }
        var mode by remember { mutableStateOf("balance") }
        GlassDialog(
            title = "添加应用规则", colors = colors, backdrop = backdrop, onDismiss = { showAdd = false },
            message = "输入完整包名，例如 com.example.app",
            body = {
                Spacer(Modifier.height(10.dp))
                GlassTextField(pkg, { pkg = it }, "com.example.app", colors, backdrop)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    listOf("powersave", "balance", "performance", "fast").forEach { m ->
                        Box(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(if (mode == m) colors.accent.copy(alpha = 0.3f) else colors.glass)
                                .clickable { mode = m }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(m.take(3), color = colors.onGlass, fontSize = 12.sp)
                        }
                    }
                }
            },
            actions = {
                DialogAction("取消", colors) { showAdd = false }
                DialogAction("保存", colors, accent = true) {
                    if (pkg.isNotBlank()) {
                        vm.setRule(pkg.trim(), 0, mode)
                        showAdd = false
                    }
                }
            },
        )
    }
}

/* ---------------- 日志页 ---------------- */

@Composable
fun LogsPage(
    vm: NovaViewModel,
    logs: List<LogLine>,
    colors: SleepColors,
    backdrop: GlassBackdrop,
) {
    LaunchedEffect(Unit) {
        // 节流冲刷：高频日志 180ms 批量入列，防止 UI 卡死
        while (true) {
            kotlinx.coroutines.delay(180)
            vm.flushLogs()
        }
    }
    var level by remember { mutableStateOf("all") }
    val filtered = if (level == "all") logs else logs.filter { it.level.equals(level, true) }

    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(SD.SecondaryPage.ContentSectionSpacing),
    ) {
        SectionDivider("运行记录", "${filtered.size} / ${logs.size} 条", colors, big = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("all" to "全部", "info" to "信息", "warn" to "警告", "error" to "错误").forEach { (key, label) ->
                Box(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (level == key) colors.accent else colors.glass)
                        .clickable { level = key }
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                ) { Text(label, color = if (level == key) Color.White else colors.onGlass, fontSize = 13.sp) }
            }
            Spacer(Modifier.weight(1f))
            Text("清空", color = colors.accent, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable { vm.clearLogs() }.padding(horizontal = 8.dp, vertical = 7.dp))
        }
        GlassCard(backdrop, 28.dp, colors, modifier = Modifier.weight(1f)) {
            if (filtered.isEmpty()) {
                Text("进入日志页后按需接收实时流。", color = colors.onGlassDim, fontSize = 13.sp)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(filtered.asReversed()) { line ->
                        Column {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(line.level.uppercase(), color = when (line.level.lowercase()) {
                                    "error" -> colors.danger
                                    "warn" -> Color(0xFFFF9F0A)
                                    else -> colors.accent
                                }, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Text(line.time, color = colors.onGlassDim, fontSize = 11.sp)
                            }
                            Text(line.message, color = colors.onGlass, fontSize = 12.sp, lineHeight = 16.sp)
                        }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            DialogActionHost("导出日志", colors) { vm.showToast("日志已复制到导出目录") }
        }
    }
}

/* ---------------- 关于页 ---------------- */

@Composable
fun AboutPage(
    vm: NovaViewModel,
    status: NovaStatus,
    colors: SleepColors,
    backdrop: GlassBackdrop,
    rootGranted: Boolean,
) {
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(SD.SecondaryPage.SettingsSectionSpacing),
    ) {
        item { SectionDivider("关于", "v2.4.0", colors, big = true) }
        item {
            GlassCard(backdrop, 24.dp, colors) {
                Row {
                    Text("NovaSched ", color = colors.onGlass, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text("Zen Edition", color = colors.accent, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                }
                Text("根据处理器与内核能力调整 CPU 策略；内核操作全部由 Magisk 模块内置 Rust 守护进程执行。", color = colors.onGlassDim, fontSize = 13.sp, lineHeight = 18.sp)
                Spacer(Modifier.height(10.dp))
                AboutFact("APK 版本", "2.4.0 (240)", colors)
                AboutFact("模块版本", status.version.ifEmpty { "待连接" }, colors)
                AboutFact("处理器", status.socName.ifEmpty { "待识别" }, colors)
            }
        }
        item {
            SettingsRow(
                "Root 状态", if (rootGranted) "已授权" else "未授权或已拒绝", colors, backdrop,
                trailing = { ValueLabel(if (rootGranted) "✓" else "×", colors) },
            )
        }
        item {
            SettingsRow(
                "守护进程", if (status.daemonAlive) "运行中" else "未运行", colors, backdrop,
                trailing = {
                    NovaSwitch(
                        checked = status.daemonAlive, enabled = rootGranted, colors = colors,
                        onCheckedChange = { if (it) vm.startDaemon() },
                    )
                },
            )
        }
        item {
            SettingsRow("开源协议", "GPL-3.0-only · 布局语言来源见仓库 NOTICE", colors, backdrop) {}
        }
        item {
            Text(
                "本应用不直接读写 /sys 内核节点；调度配置经本地 WebSocket 下发至 NovaSched 守护进程执行。",
                color = colors.onGlassDim, fontSize = 12.sp, lineHeight = 17.sp,
            )
        }
    }
}

@Composable
private fun AboutFact(label: String, value: String, colors: SleepColors) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = colors.onGlassDim, fontSize = 13.sp)
        Text(value, color = colors.onGlass, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
