package com.zenjooo.novasched.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * 与 WebUI/参考设计同源的线性图标（24x24，2dp 描边圆帽）。
 */
object NovaIcons {

    private fun build(name: String, block: PathBuilder.() -> Unit): ImageVector =
        ImageVector.Builder(
            name = name, defaultWidth = 24.dp, defaultHeight = 24.dp,
            viewportWidth = 24f, viewportHeight = 24f,
        ).apply {
            path(
                stroke = SolidColor(Color.White),
                strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
                fill = null,
            ) { block() }
        }.build()

    val CheckRounded: ImageVector = build("check") {
        moveTo(5f, 12.5f)
        lineTo(10f, 17.5f)
        lineTo(19.5f, 7f)
    }

    val Search: ImageVector = build("search") {
        moveTo(11f, 4f)
        curveTo(15.4f, 4f, 19f, 7.6f, 19f, 12f)
        curveTo(19f, 16.4f, 15.4f, 20f, 11f, 20f)
        curveTo(6.6f, 20f, 3f, 16.4f, 3f, 12f)
        curveTo(3f, 7.6f, 6.6f, 4f, 11f, 4f)
        close()
        moveTo(20f, 20f)
        lineTo(16.5f, 16.5f)
        moveTo(8.5f, 11f)
        lineTo(13.5f, 11f)
        moveTo(11f, 8.5f)
        lineTo(11f, 13.5f)
    }

    val Bolt: ImageVector = build("bolt") {
        moveTo(13f, 2f)
        lineTo(4f, 14f)
        lineTo(10f, 14f)
        lineTo(9f, 22f)
        lineTo(19f, 9f)
        lineTo(12f, 9f)
        lineTo(13f, 2f)
        close()
    }

    val Sliders: ImageVector = build("sliders") {
        moveTo(4f, 6f); lineTo(10f, 6f)
        moveTo(18f, 6f); lineTo(20f, 6f)
        moveTo(4f, 12f); lineTo(6f, 12f)
        moveTo(10f, 12f); lineTo(20f, 12f)
        moveTo(4f, 18f); lineTo(7f, 18f)
        moveTo(15f, 18f); lineTo(20f, 18f)
        moveTo(16f, 6f); circleTo(16f, 6f, 2f)
        moveTo(8f, 12f); circleTo(8f, 12f, 2f)
        moveTo(13f, 18f); circleTo(13f, 18f, 2f)
    }

    val Rules: ImageVector = build("rules") {
        moveTo(4f, 4f); lineTo(10f, 4f); lineTo(10f, 10f); lineTo(4f, 10f); close()
        moveTo(14f, 4f); lineTo(20f, 4f); lineTo(20f, 10f); lineTo(14f, 10f); close()
        moveTo(4f, 14f); lineTo(10f, 14f); lineTo(10f, 20f); lineTo(4f, 20f); close()
        moveTo(17f, 14f); lineTo(17f, 20f)
        moveTo(14f, 17f); lineTo(20f, 17f)
    }

    val Doc: ImageVector = build("doc") {
        moveTo(6f, 3f); lineTo(15f, 3f); lineTo(20f, 8f); lineTo(20f, 21f); lineTo(6f, 21f); close()
        moveTo(14f, 3f); lineTo(14f, 8f); lineTo(20f, 8f)
        moveTo(9f, 13f); lineTo(15f, 13f)
        moveTo(9f, 17f); lineTo(15f, 17f)
    }

    val Info: ImageVector = build("info") {
        moveTo(12f, 3f)
        curveTo(16.97f, 3f, 21f, 7.03f, 21f, 12f)
        curveTo(21f, 16.97f, 16.97f, 21f, 12f, 21f)
        curveTo(7.03f, 21f, 3f, 16.97f, 3f, 12f)
        curveTo(3f, 7.03f, 7.03f, 3f, 12f, 3f)
        close()
        moveTo(12f, 11f); lineTo(12f, 16f)
        moveTo(12f, 8f); lineTo(12f, 8.5f)
    }

    val Leaf: ImageVector = build("leaf") {
        moveTo(20f, 4f)
        curveTo(8f, 3f, 3f, 9f, 7f, 16f)
        curveTo(13f, 22f, 20f, 16f, 20f, 4f)
        close()
        moveTo(4f, 21f); lineTo(16f, 9f)
    }

    val Balance: ImageVector = build("balance") {
        moveTo(12f, 3f); lineTo(12f, 21f)
        moveTo(5f, 7f); lineTo(19f, 7f)
        moveTo(3f, 14f); lineTo(6f, 7f); lineTo(9f, 14f)
        moveTo(15f, 14f); lineTo(18f, 7f); lineTo(21f, 14f)
        moveTo(8f, 21f); lineTo(16f, 21f)
        moveTo(3f, 14f); lineTo(9f, 14f)
        moveTo(15f, 14f); lineTo(21f, 14f)
    }

    val Rocket: ImageVector = build("rocket") {
        moveTo(13f, 2f); lineTo(4f, 14f); lineTo(11f, 14f); lineTo(10f, 22f); lineTo(20f, 9f); lineTo(12f, 9f); close()
    }

    val Gauge: ImageVector = build("gauge") {
        moveTo(4f, 17f)
        curveTo(4f, 10.9f, 8.9f, 8f, 12f, 8f)
        curveTo(15.1f, 8f, 20f, 10.9f, 20f, 17f)
        moveTo(12f, 12f); lineTo(17f, 7f)
        moveTo(5f, 19f); lineTo(19f, 19f)
        moveTo(12f, 12f); circleTo(12f, 12f, 2f)
    }

    val Chevron: ImageVector = build("chevron") {
        moveTo(9f, 5f); lineTo(16f, 12f); lineTo(9f, 19f)
    }

    val Refresh: ImageVector = build("refresh") {
        moveTo(20f, 11f)
        curveTo(19.3f, 6.9f, 16f, 4f, 12f, 4f)
        curveTo(7.6f, 4f, 4f, 7.6f, 4f, 12f)
        moveTo(4f, 13f)
        curveTo(4.7f, 17.1f, 8f, 20f, 12f, 20f)
        curveTo(16.4f, 20f, 20f, 16.4f, 20f, 12f)
        moveTo(20f, 11f); lineTo(20f, 6f)
        moveTo(4f, 13f); lineTo(4f, 18f)
    }

    val Grid: ImageVector = build("grid") {
        moveTo(3.5f, 3.5f); lineTo(10.5f, 3.5f); lineTo(10.5f, 10.5f); lineTo(3.5f, 10.5f); close()
        moveTo(13.5f, 3.5f); lineTo(20.5f, 3.5f); lineTo(20.5f, 10.5f); lineTo(13.5f, 10.5f); close()
        moveTo(3.5f, 13.5f); lineTo(10.5f, 13.5f); lineTo(10.5f, 20.5f); lineTo(3.5f, 20.5f); close()
        moveTo(13.5f, 13.5f); lineTo(20.5f, 13.5f); lineTo(20.5f, 20.5f); lineTo(13.5f, 20.5f); close()
    }

    val Chip: ImageVector = build("chip") {
        moveTo(7f, 7f); lineTo(17f, 7f); lineTo(17f, 17f); lineTo(7f, 17f); close()
        moveTo(10f, 3f); lineTo(10f, 5f)
        moveTo(14f, 3f); lineTo(14f, 5f)
        moveTo(10f, 19f); lineTo(10f, 21f)
        moveTo(14f, 19f); lineTo(14f, 21f)
        moveTo(3f, 10f); lineTo(5f, 10f)
        moveTo(3f, 14f); lineTo(5f, 14f)
        moveTo(19f, 10f); lineTo(21f, 10f)
        moveTo(19f, 14f); lineTo(21f, 14f)
    }

    private fun PathBuilder.circleTo(cx: Float, cy: Float, r: Float) {
        // 以两段三次贝塞尔近似整圆
        val k = 0.5523f * r
        moveTo(cx + r, cy)
        curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
        curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
        curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r)
        curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
    }
}
