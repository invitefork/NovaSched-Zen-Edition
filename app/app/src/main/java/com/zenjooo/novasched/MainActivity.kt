package com.zenjooo.novasched

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zenjooo.novasched.core.NovaSocket
import com.zenjooo.novasched.core.NovaStatus
import com.zenjooo.novasched.core.NovaViewModel
import com.zenjooo.novasched.core.Page
import com.zenjooo.novasched.ui.AboutPage
import com.zenjooo.novasched.ui.CapsuleButton
import com.zenjooo.novasched.ui.LogsPage
import com.zenjooo.novasched.ui.NovaIcons
import com.zenjooo.novasched.ui.OverviewPage
import com.zenjooo.novasched.ui.ProfilesPage
import com.zenjooo.novasched.ui.RulesPage
import com.zenjooo.novasched.ui.SnackbarHost
import com.zenjooo.novasched.ui.glass.novaBackdropSource
import com.zenjooo.novasched.ui.glass.novaGlass
import com.zenjooo.novasched.ui.glass.rememberNovaBackdrop
import com.zenjooo.novasched.ui.theme.SleepColors
import com.kyant.backdrop.Backdrop
import com.zenjooo.novasched.ui.theme.rememberSleepColors
import java.util.Calendar

class MainActivity : ComponentActivity() {

    private val vm: NovaViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 页面深度转场规格来自参考 APK 的 anim/schedule_depth_*（260ms alpha+scale）。
        setContent { NovaSchedApp(vm) }
    }
}

@Composable
fun NovaSchedApp(vm: NovaViewModel) {
    val colors = rememberSleepColors()
    val backdrop = rememberNovaBackdrop()
    val status by vm.status.collectAsState()
    val page by vm.page.collectAsState()
    val conn by vm.conn.collectAsState()
    val rules by vm.rules.collectAsState()
    val config by vm.config.collectAsState()
    val logs by vm.logs.collectAsState()
    val toast by vm.toast.collectAsState()
    val rootGranted by vm.rootGranted.collectAsState()

    LaunchedEffect(conn) {
        if (conn == NovaSocket.ConnState.DISCONNECTED) vm.showToast("本地连接已断开，正在自动重连")
    }

    Box(Modifier.fillMaxSize()) {
        // 折射源背景：渐变底色 + 强调色光斑（AndroidLiquidGlass 的 backdrop 采样源）
        Box(
            Modifier
                .fillMaxSize()
                .novaBackdropSource(backdrop)
                .background(
                    Brush.verticalGradient(
                        0f to colors.background[0],
                        0.55f to colors.background[1],
                        1f to colors.background[2],
                    )
                )
                .drawBehind {
                    val accent = colors.accent
                    val blobA = if (colors.isDark) 0.26f else 0.30f
                    drawCircle(
                        Brush.radialGradient(
                            listOf(accent.copy(alpha = blobA), Color.Transparent),
                            center = Offset(size.width * 0.22f, size.height * 0.20f),
                            radius = size.width * 0.75f,
                        ),
                        radius = size.width * 0.75f,
                        center = Offset(size.width * 0.22f, size.height * 0.20f),
                    )
                    val blobB = if (colors.isDark) 0xFF7C5CFF.toInt() else 0xFFC9B7FF.toInt()
                    drawCircle(
                        Brush.radialGradient(
                            listOf(Color(blobB).copy(alpha = if (colors.isDark) 0.20f else 0.34f), Color.Transparent),
                            center = Offset(size.width * 0.92f, size.height * 0.08f),
                            radius = size.width * 0.55f,
                        ),
                        radius = size.width * 0.55f,
                        center = Offset(size.width * 0.92f, size.height * 0.08f),
                    )
                }
        )
        val statusBar = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()

        Column(Modifier.fillMaxSize()) {
            TopBar(status, colors, backdrop, conn, statusBar)
            AnimatedContent(
                targetState = page,
                transitionSpec = {
                    (fadeIn(tween(260)) + scaleIn(tween(260), initialScale = 0.94f)) togetherWith
                        (fadeOut(tween(260)) + scaleOut(tween(260), targetScale = 0.96f))
                },
                label = "pages",
                modifier = Modifier.weight(1f),
            ) { current ->
                val connected = conn == NovaSocket.ConnState.CONNECTED
                Box(Modifier.fillMaxSize()) {
                    when (current) {
                        Page.OVERVIEW -> OverviewPage(vm, status, colors, backdrop, connected)
                        Page.PROFILES -> ProfilesPage(vm, status, config, colors, backdrop, connected && rootGranted)
                        Page.RULES -> RulesPage(vm, rules, colors, backdrop, connected && rootGranted)
                        Page.LOGS -> LogsPage(vm, logs, colors, backdrop)
                        Page.ABOUT -> AboutPage(vm, status, colors, backdrop, rootGranted)
                    }
                }
            }
        }

        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (toast.isNotEmpty()) {
                SnackbarHost(toast, colors, backdrop)
                Spacer(Modifier.height(8.dp))
            }
            LiquidDock(page, colors, backdrop) { vm.setPage(it) }
        }
    }
}

/** 日期块顶栏 + 42dp 胶囊按钮簇（复刻参考 APK 规格：19sp 粗体日期 + 16sp 周数 68%）。 */
@Composable
private fun TopBar(
    status: NovaStatus,
    colors: SleepColors,
    backdrop: Backdrop,
    conn: NovaSocket.ConnState,
    statusBarPad: Dp,
) {
    val now = remember { Calendar.getInstance() }
    val week = remember { now.get(Calendar.WEEK_OF_YEAR) }
    val weekdays = arrayOf("一", "二", "三", "四", "五", "六", "日")
    val weekday = weekdays[(now.get(Calendar.DAY_OF_WEEK) + 5) % 7]

    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = statusBarPad + 6.dp, start = 20.dp, end = 20.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                "${now.get(Calendar.MONTH) + 1}月${now.get(Calendar.DAY_OF_MONTH)}日 周$weekday",
                color = colors.onGlass, fontSize = 19.sp, fontWeight = FontWeight.Bold,
            )
            Text("第$week 周", color = colors.onGlass.copy(alpha = 0.68f), fontSize = 16.sp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            CapsuleButton(onClick = { /* 诊断：读守护状态 */ }, colors = colors, backdrop = backdrop) {
                Icon(NovaIcons.Search, contentDescription = "诊断", tint = colors.onGlass, modifier = Modifier.size(20.dp))
            }
            CapsuleButton(
                onClick = { },
                colors = colors, backdrop = backdrop, accent = status.automatic,
            ) {
                Icon(NovaIcons.Bolt, contentDescription = "自动调度", tint = Color.White, modifier = Modifier.size(20.dp))
            }
            CapsuleButton(
                onClick = { },
                colors = colors, backdrop = backdrop,
                modifier = Modifier.size(width = 86.dp, height = 42.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(
                                when (conn) {
                                    NovaSocket.ConnState.CONNECTED -> Color(0xFF30D158)
                                    NovaSocket.ConnState.CONNECTING -> Color(0xFFFF9F0A)
                                    else -> Color(0xFFFF453A)
                                }
                            )
                    )
                    Text(
                        when (conn) {
                            NovaSocket.ConnState.CONNECTED -> "已连接"
                            NovaSocket.ConnState.CONNECTING -> "连接中"
                            else -> "离线"
                        },
                        color = colors.onGlass, fontSize = 13.sp,
                    )
                }
            }
        }
    }
}

/** 底部胶囊 dock：容器 64dp / 激活项强调色 / 图标+文字 2dp 间距（复刻规格）。 */
@Composable
private fun LiquidDock(
    page: Page,
    colors: SleepColors,
    backdrop: Backdrop,
    onSwitch: (Page) -> Unit,
) {
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(
        Modifier
            .padding(horizontal = 16.dp)
            .padding(bottom = navBottom)
            .fillMaxWidth()
            .height(64.dp)
            .novaGlass(backdrop, com.kyant.shapes.Capsule(), colors.glass, colors.isDark)
            .padding(4.dp),
    ) {
        Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            val tabs = listOf(
                Triple(Page.OVERVIEW, "概览", NovaIcons.Grid),
                Triple(Page.PROFILES, "档位", NovaIcons.Sliders),
                Triple(Page.RULES, "规则", NovaIcons.Rules),
                Triple(Page.LOGS, "日志", NovaIcons.Doc),
                Triple(Page.ABOUT, "关于", NovaIcons.Info),
            )
            tabs.forEach { (target, label, icon) ->
                val active = page == target
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxSize()
                        .clip(RoundedCornerShape(50))
                        .background(if (active) colors.accent.copy(alpha = 0.22f) else Color.Transparent)
                        .clickable(
                            onClick = { onSwitch(target) },
                            indication = null,
                            interactionSource = remember { MutableInteractionSource() },
                        )
                        .padding(vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(icon, contentDescription = label, tint = if (active) colors.accent else colors.onGlassDim, modifier = Modifier.size(20.dp))
                    Text(label, color = if (active) colors.accent else colors.onGlassDim, fontSize = 11.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
    }
}
