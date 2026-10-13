package com.zenjooo.novasched.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * SleepDown 实机 UI 复刻设计令牌（来源：参考 APK 1.2.7_beta5 解析 + SleepDownDesignTokens 生产几何）。
 * 数值是复刻目标，不允许在此调整视觉效果。
 */
object SD {
    object SecondaryPage {
        val CompactTopBarHeight = 58.dp
        val TopOverlayExtra = 74.dp
        val ContentTopGap = 44.dp
        val HorizontalPadding = 16.dp
        val SettingsSectionSpacing = 14.dp
        val ContentSectionSpacing = 12.dp
        val BackButtonSize = 42.dp
    }

    object CenteredDialog {
        val Width = 286.dp
        val AlertWidth = 260.dp
        val ContentPadding = 14.dp
        val AlertVerticalPadding = 14.dp
        val AlertTopInset = 32.dp
        val AlertTextHorizontalInset = 8.dp
        val Corner = 39.dp
        val MaxBlur = 16.dp
        val ActionHeight = 50.dp
        val ActionSpacing = 10.dp
        val MessageActionSpacing = 28.dp
        val TitleContentSpacing = 13.dp
        val BackgroundBlur = 10.dp
        val DarkSurfaceAlpha = 0.74f
    }

    object CourseCard {
        val Corner = 22.dp
        val TitleLineSpacing = 3.dp
    }

    object AssistantCard {
        val Corner = 30.dp
    }

    object Dock {
        val ContainerHeight = 64.dp
        val IndicatorSize = 56.dp
        val PressScale = 1.14f
    }

    object TopBar {
        val CapsuleSize = 42.dp
    }

    object Divider {
        val LineAlpha = 0.18f
        val Spacing = 10.dp
        val TopPad = 4.dp
        val BottomPad = 2.dp
    }

    object Field {
        val SingleLineCorner = 50.dp
        val MultiLineCorner = 24.dp
        val HorizontalPadding = 16.dp
        val SingleLineVerticalPadding = 12.dp
        val MultiLineVerticalPadding = 14.dp
    }

    const val ACCENT = 0xFF0A84FF
    const val ACCENT_LIGHT = 0xFF0088FF
    const val ACCENT_PRESSED = 0xFF006FD6
    const val DANGER = 0xFFFF453A

    const val DARK_GLASS_ARGB = 0xFF121212
    const val DARK_GLASS_ALPHA = 0.45f
    const val LIGHT_GLASS_RGB = 0xFFF2F4F8
    const val LIGHT_GLASS_ALPHA = 0.54f

    const val DARK_BG_TOP = 0xFF0E1120
    const val DARK_BG_MID = 0xFF251A38
    const val DARK_BG_BOT = 0xFF1C2233

    // 深浅玻璃 tint：强调色在玻璃上的叠加强度（参考 APK 材质常量 0.24/0.32）。
    const val ACCENT_TINT_IDLE = 0.24f
    const val ACCENT_TINT_ACTIVE = 0.32f
}

data class SleepColors(
    val accent: Color,
    val accentPressed: Color,
    val onGlass: Color,
    val onGlassDim: Color,
    val glass: Color,
    val background: List<Color>,
    val danger: Color,
    val divider: Color,
    val isDark: Boolean,
)

@Composable
fun rememberSleepColors(): SleepColors {
    val dark = isSystemInDarkTheme()
    return if (dark) SleepColors(
        accent = Color(SD.ACCENT),
        accentPressed = Color(SD.ACCENT_PRESSED),
        onGlass = Color.White,
        onGlassDim = Color.White.copy(alpha = 0.68f),
        glass = Color(SD.DARK_GLASS_ARGB).copy(alpha = SD.DARK_GLASS_ALPHA),
        background = listOf(
            Color(SD.DARK_BG_TOP),
            Color(SD.DARK_BG_MID),
            Color(SD.DARK_BG_BOT),
        ),
        danger = Color(SD.DANGER),
        divider = Color.White.copy(alpha = SD.Divider.LineAlpha),
        isDark = true,
    ) else SleepColors(
        accent = Color(SD.ACCENT_LIGHT),
        accentPressed = Color(SD.ACCENT_PRESSED),
        onGlass = Color(0xFF111111),
        onGlassDim = Color(0xFF111111).copy(alpha = 0.62f),
        glass = Color(SD.LIGHT_GLASS_RGB).copy(alpha = SD.LIGHT_GLASS_ALPHA),
        background = listOf(
            Color(0xFFE8ECF8),
            Color(0xFFF3E9F6),
            Color(0xFFE9F0F6),
        ),
        danger = Color(SD.DANGER),
        divider = Color(0xFF111111).copy(alpha = SD.Divider.LineAlpha),
        isDark = false,
    )
}
