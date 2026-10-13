package com.zenjooo.novasched.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop
import com.kyant.shapes.Capsule
import com.kyant.shapes.RoundedRectangle
import com.zenjooo.novasched.ui.glass.novaGlass
import com.zenjooo.novasched.ui.theme.SleepColors
import com.zenjooo.novasched.ui.theme.SD

/** 分区线：标签 + 1dp 18% 线 + 右侧文字，上下 4/2dp、间距 10dp（参考 APK 规格）。 */
@Composable
fun SectionDivider(
    label: String,
    trailing: String,
    colors: SleepColors,
    modifier: Modifier = Modifier,
    big: Boolean = false,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = SD.Divider.TopPad, bottom = SD.Divider.BottomPad),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SD.Divider.Spacing),
    ) {
        Text(
            label,
            color = colors.onGlass,
            fontSize = if (big) 20.sp else 14.sp,
            fontWeight = if (big) FontWeight.Bold else FontWeight.SemiBold,
        )
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(colors.divider)
        )
        if (trailing.isNotEmpty()) {
            Text(trailing, color = colors.onGlassDim, fontSize = 13.sp, maxLines = 1)
        }
    }
}

/** 玻璃卡片容器（课程卡 22dp / 助手卡 30dp 圆角），按压缩放反馈。 */
@Composable
fun GlassCard(
    backdrop: Backdrop,
    corner: Dp,
    colors: SleepColors,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.982f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = 900f),
        label = "cardPress",
    )
    Column(
        modifier = modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .fillMaxWidth()
            .novaGlass(backdrop, RoundedRectangle(corner), colors.glass, colors.isDark)
            .then(
                if (onClick != null) Modifier.clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClick = onClick
                ) else Modifier
            )
            .padding(16.dp),
    ) { content() }
}

/** 胶囊按钮（42dp 顶栏钮 / 圆形强调钮），按压缩放 + 变色。 */
@Composable
fun CapsuleButton(
    onClick: () -> Unit,
    colors: SleepColors,
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    size: Dp = SD.TopBar.CapsuleSize,
    accent: Boolean = false,
    enabled: Boolean = true,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.94f else 1f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 1200f),
        label = "capsulePress",
    )
    Box(
        modifier = modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .size(size)
            .novaGlass(
                backdrop,
                Capsule(),
                when {
                    !enabled -> colors.glass.copy(alpha = 0.4f)
                    accent && pressed -> colors.accentPressed
                    accent -> colors.accent
                    else -> colors.glass
                },
                colors.isDark
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center,
    ) { content() }
}

/** 档位选择卡：图标 + 文案 + 状态徽标。 */
@Composable
fun ModeCard(
    title: String,
    subtitle: String,
    active: Boolean,
    pending: Boolean,
    enabled: Boolean,
    colors: SleepColors,
    backdrop: Backdrop,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    val tint = when {
        active -> colors.accent.copy(alpha = SD.ACCENT_TINT_ACTIVE)
        pending -> colors.accent.copy(alpha = 0.16f)
        else -> colors.glass
    }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.975f else 1f,
        animationSpec = spring(stiffness = 1200f), label = "modePress",
    )
    Row(
        modifier = Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .fillMaxWidth()
            .novaGlass(backdrop, RoundedRectangle(SD.CourseCard.Corner), tint, colors.isDark)
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(38.dp)
                .clip(CircleShape)
                .background(colors.accent.copy(alpha = if (active) 0.9f else 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = if (active) Color.White else colors.accent, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(title, color = colors.onGlass, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                if (active) {
                    Text(
                        "当前生效", color = colors.accent, fontSize = 10.sp,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(colors.accent.copy(alpha = 0.18f))
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    )
                }
            }
            Text(subtitle, color = colors.onGlassDim, fontSize = 13.sp, lineHeight = 17.sp)
        }
        when {
            pending -> Box(
                Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(colors.accent.copy(alpha = 0.35f))
            )
            active -> Icon(NovaIcons.CheckRounded, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
        }
    }
}

/** iOS 风格开关：miuix（HyperOS 组件库）Switch 承载交互与动效。 */
@Composable
fun NovaSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    colors: SleepColors,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    top.yukonga.miuix.kmp.basic.Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        enabled = enabled,
    )
}

/** 居中玻璃弹窗壳：39dp 圆角 / 286dp 宽 / 14dp 内距 / 50dp 动作（参考 APK 规格）。 */
@Composable
fun GlassDialog(
    title: String,
    colors: SleepColors,
    backdrop: Backdrop,
    onDismiss: () -> Unit,
    message: String? = null,
    body: (@Composable ColumnScope.() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.42f))
            .clickable(
                onClick = onDismiss,
                indication = null,
                interactionSource = remember { MutableInteractionSource() }
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .width(SD.CenteredDialog.Width)
                .novaGlass(
                    backdrop,
                    RoundedRectangle(SD.CenteredDialog.Corner),
                    colors.glass.copy(alpha = if (colors.isDark) 0.62f else 0.72f),
                    colors.isDark
                )
                .clickable(
                    enabled = false,
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() }
                ) {}
                .padding(SD.CenteredDialog.ContentPadding),
        ) {
            Text(
                title,
                color = colors.onGlass,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            if (!message.isNullOrBlank()) {
                Spacer(Modifier.height(SD.CenteredDialog.TitleContentSpacing))
                Text(
                    message, color = colors.onGlassDim, fontSize = 13.sp, lineHeight = 18.sp,
                    textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()
                )
            }
            body?.invoke(this)
            Spacer(Modifier.height(SD.CenteredDialog.MessageActionSpacing))
            Row(
                horizontalArrangement = Arrangement.spacedBy(SD.CenteredDialog.ActionSpacing),
                modifier = Modifier.fillMaxWidth()
            ) { actions() }
        }
    }
}

/** 50dp 弹窗动作按钮。 */
@Composable
fun RowScope.DialogAction(
    label: String,
    colors: SleepColors,
    backdrop: Backdrop,
    accent: Boolean = false,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    val bg = when {
        danger -> colors.danger.copy(alpha = 0.18f)
        accent -> colors.accent
        else -> colors.glass
    }
    val fg = when {
        danger -> colors.danger
        accent -> Color.White
        else -> colors.onGlass
    }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, label = "actScale")
    Box(
        Modifier
            .weight(1f)
            .height(SD.CenteredDialog.ActionHeight)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .novaGlass(backdrop, RoundedRectangle(25.dp), bg, colors.isDark)
            .clickable(onClick = onClick, indication = null, interactionSource = interaction, role = Role.Button),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = fg, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** 底部 Snackbar。 */
@Composable
fun SnackbarHost(text: String, colors: SleepColors, backdrop: Backdrop) {
    if (text.isEmpty()) return
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .novaGlass(backdrop, RoundedRectangle(18.dp), colors.glass, colors.isDark)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(text, color = colors.onGlass, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** 设置分组行：标题 + 说明 + 尾部控件（开关/值）。 */
@Composable
fun SettingsRow(
    title: String,
    subtitle: String,
    colors: SleepColors,
    backdrop: Backdrop,
    trailing: @Composable () -> Unit = {},
    onClick: (() -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        Modifier
            .fillMaxWidth()
            .novaGlass(backdrop, RoundedRectangle(SD.CourseCard.Corner), colors.glass, colors.isDark)
            .then(
                if (onClick != null) Modifier.clickable(
                    interactionSource = interaction, indication = null, onClick = onClick
                ) else Modifier
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = colors.onGlass, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = colors.onGlassDim, fontSize = 12.sp, lineHeight = 16.sp)
        }
        Spacer(Modifier.width(12.dp))
        trailing()
    }
}

/** 值标签（设置行右侧文字值）。 */
@Composable
fun ValueLabel(text: String, colors: SleepColors) {
    Text(text, color = colors.onGlassDim, fontSize = 13.sp)
}

/** 单行文本输入（规则包名），50dp 胶囊样式。 */
@Composable
fun GlassTextField(
    value: String,
    onValueChange: (String) -> Unit,
    hint: String,
    colors: SleepColors,
    backdrop: Backdrop,
    readOnly: Boolean = false,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        readOnly = readOnly,
        singleLine = true,
        textStyle = TextStyle(color = colors.onGlass, fontSize = 15.sp),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 46.dp)
            .novaGlass(backdrop, Capsule(), colors.glass, colors.isDark),
        decorationBox = { inner ->
            Box(
                Modifier
                    .padding(
                        horizontal = SD.Field.HorizontalPadding,
                        vertical = SD.Field.SingleLineVerticalPadding
                    ),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isEmpty()) {
                    Text(hint, color = colors.onGlassDim.copy(alpha = 0.6f), fontSize = 15.sp)
                }
                inner()
            }
        },
    )
}
