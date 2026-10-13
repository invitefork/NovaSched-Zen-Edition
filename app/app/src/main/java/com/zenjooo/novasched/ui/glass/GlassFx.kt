package com.zenjooo.novasched.ui.glass

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.RadialGradient
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.graphics.SweepGradient
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp

/*
 * 液态玻璃渲染（AGSL 移植）：
 * 与已验收的 WebUI 单画布核心同一套折射算法——圆角矩形 SDF 边缘法线折射、
 * RGB 色散、边缘高光、内阴影。背景（渐变 + 光斑 + 壁纸）完全静态，先栅格化
 * 成软件 Bitmap 再经 BitmapShader 供给 RuntimeShader，快照仅在主题/强调色/
 * 壁纸/尺寸变化时重建一次，滚动与折射零逐帧背景开销。
 * GPU 或 RuntimeShader 不可用时自动降级为半透明玻璃色 + 高光描边。
 */

const val GLASS_AGL = """
uniform shader uContent;
uniform float2 uSize;
uniform float2 uOrigin;
uniform float uRadius;
uniform float uEdge;
uniform float uAmount;
uniform float uChroma;
uniform float uDark;
layout(color) uniform vec4 uTint;
layout(color) uniform vec4 uHl;

float sdRRect(float2 p, float2 b, float r) {
    float2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float2 sdfNormal(float2 p, float2 b, float r) {
    float h = 1.0;
    float2 dx = float2(h, 0.0);
    float2 dy = float2(0.0, h);
    float2 g = float2(
        sdRRect(p + dx, b, r) - sdRRect(p - dx, b, r),
        sdRRect(p + dy, b, r) - sdRRect(p - dy, b, r));
    return normalize(g + float2(1e-6, 1e-6));
}

half4 main(float2 frag) {
    float2 c = uSize * 0.5;
    float2 p = frag - c;
    float sd = sdRRect(p, c, uRadius);
    float cover = clamp(0.5 - sd, 0.0, 1.0);
    if (cover <= 0.0) return half4(0.0);

    float2 n = sdfNormal(p, c, uRadius);
    float edgeDist = max(0.0, -sd);
    float t = clamp(1.0 - edgeDist / uEdge, 0.0, 1.0);
    float fall = t * t * (3.0 - 2.0 * t);

    float2 br = uOrigin + frag;
    float2 off = -n * uAmount * fall;
    half4 col;
    col.r = uContent.eval(br + off * (1.0 + 0.07 * uChroma)).r;
    col.g = uContent.eval(br + off).g;
    col.b = uContent.eval(br + off * (1.0 - 0.07 * uChroma)).b;
    col.a = 1.0;

    col.rgb = mix(col.rgb, uTint.rgb, uTint.a);

    float hl = pow(clamp(dot(n, normalize(float2(-0.62, -0.78))), 0.0, 1.0), 2.2);
    float band = smoothstep(uEdge * 0.55, 0.0, edgeDist);
    col.rgb = mix(col.rgb, uHl.rgb, hl * band * uHl.a);

    float shadow = smoothstep(uEdge, 0.0, edgeDist) * 0.10;
    col.rgb *= (1.0 - shadow);

    return half4(col.rgb, 1.0) * cover;
}
"""

class GlassBackdrop {
    var bitmapShader: BitmapShader? = null
        private set
    var bitmapSize = IntSize.Zero
        private set
    var fallback = false
        private set

    fun render(
        widthPx: Int,
        heightPx: Int,
        dark: Boolean,
        accentArgb: Int,
        wallpaper: Bitmap?,
        wallpaperBlurPct: Int,
        wallpaperBrightPct: Int,
    ) {
        val budget = 2_300_000
        var w = widthPx.coerceAtLeast(1)
        var h = heightPx.coerceAtLeast(1)
        val pixels = w.toDouble() * h
        val scale = if (pixels > budget) kotlin.math.sqrt(budget / pixels) else 1.0
        w = (w * scale).toInt().coerceAtLeast(1)
        h = (h * scale).toInt().coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val sx = w.toFloat() / widthPx.coerceAtLeast(1)
        val sy = h.toFloat() / heightPx.coerceAtLeast(1)
        canvas.scale(sx, sy)

        val colors = if (dark) {
            intArrayOf(0xFF0E1120.toInt(), 0xFF251A38.toInt(), 0xFF1C2233.toInt())
        } else {
            intArrayOf(0xFFE8ECF8.toInt(), 0xFFF3E9F6.toInt(), 0xFFE9F0F6.toInt())
        }
        val g = LinearGradient(
            0f, 0f, w * 0.55f, h.toFloat(),
            colors[0], colors[2], Shader.TileMode.CLAMP
        )
        // 三段渐变通过中间点近似：叠一层中间色 radial，保证与 WebUI 底色同源。
        canvas.drawRect(0f, 0f, widthPx.toFloat(), heightPx.toFloat(), android.graphics.Paint().apply {
            shader = g
        })
        val midPaint = android.graphics.Paint().apply {
            shader = RadialGradient(
                w * 0.30f, h * 0.34f, h * 0.55f,
                colors[1], colors[1] and 0x00FFFFFF, Shader.TileMode.CLAMP
            )
            alpha = 235
        }
        canvas.drawRect(0f, 0f, widthPx.toFloat(), heightPx.toFloat(), midPaint)

        // 程序化光斑：强调色两枚 + 对侧冷光一枚，与 WebUI 背景同源。
        fun blob(cx: Float, cy: Float, radius: Float, argb: Int, alpha: Int) {
            val paint = android.graphics.Paint().apply {
                shader = RadialGradient(
                    cx, cy, radius,
                    argb, argb and 0x00FFFFFF, Shader.TileMode.CLAMP
                )
                this.alpha = alpha
            }
            canvas.drawRect(0f, 0f, widthPx.toFloat(), heightPx.toFloat(), paint)
        }
        val accent = accentArgb
        if (dark) {
            blob(widthPx * 0.18f, heightPx * 0.22f, widthPx * 0.75f, accent, 66)
            blob(widthPx * 0.88f, heightPx * 0.12f, widthPx * 0.55f, 0xFF7C5CFF.toInt(), 44)
            blob(widthPx * 0.70f, heightPx * 0.92f, widthPx * 0.70f, 0xFF2E63E8.toInt(), 40)
        } else {
            blob(widthPx * 0.20f, heightPx * 0.18f, widthPx * 0.70f, accent, 46)
            blob(widthPx * 0.90f, heightPx * 0.08f, widthPx * 0.50f, 0xFFC9B7FF.toInt(), 52)
            blob(widthPx * 0.66f, heightPx * 0.95f, widthPx * 0.66f, 0xFFBFE0FF.toInt(), 56)
        }

        if (wallpaper != null && !wallpaper.isRecycled) {
            val blurPx = wallpaperBlurPct / 100f * 24f * scale.toFloat()
            val paint = android.graphics.Paint().apply {
                if (blurPx > 0.5f) {
                    maskFilter = android.graphics.BlurMaskFilter(
                        blurPx,
                        android.graphics.BlurMaskFilter.Blur.NORMAL
                    )
                }
                val bright = wallpaperBrightPct / 100f
                colorFilter = android.graphics.ColorMatrixColorFilter(
                    android.graphics.ColorMatrix().apply {
                        setScale(bright, bright, bright, 1f)
                    }
                )
                isFilterBitmap = true
            }
            // 壁纸 cover 铺满
            val wr = widthPx.toFloat() / wallpaper.width
            val hr = heightPx.toFloat() / wallpaper.height
            val r = maxOf(wr, hr)
            val dw = wallpaper.width * r
            val dh = wallpaper.height * r
            canvas.drawBitmap(
                wallpaper,
                (widthPx - dw) / 2f, (heightPx - dh) / 2f,
                paint
            )
        }

        bitmapShader = BitmapShader(bmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        bitmapSize = IntSize(w, h)
    }

    fun isSupported(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            fallback = true
            return false
        }
        return try {
            RuntimeShader(GLASS_AGL)
            true
        } catch (_: Throwable) {
            fallback = true
            false
        }
    }
}

@Composable
fun rememberGlassBackdrop(): GlassBackdrop = remember { GlassBackdrop() }

private class GlassVars {
    var originX = 0f
    var originY = 0f
    var width = 0f
    var height = 0f
    var shader: RuntimeShader? = null
    var broken = false
}

/**
 * 玻璃表面：按 [cornerRadius] 对背景快照做 SDF 边缘折射 + 色散 + 高光。
 * fallback 环境下为半透明玻璃色 + 高光描边。
 */
fun Modifier.glassSurface(
    backdrop: GlassBackdrop,
    cornerRadius: Dp,
    tint: Color,
    dark: Boolean,
): Modifier = composed {
    val density = LocalDensity.current
    val vars = remember { GlassVars() }
    if (vars.shader == null && !vars.broken && backdrop.isSupported()) {
        vars.shader = try {
            RuntimeShader(GLASS_AGL).apply {
                setColorUniform("uTint", tint.toArgb())
                setColorUniform("uHl", (if (dark) Color(0x80FFFFFF) else Color(0xA6FFFFFF)).toArgb())
                setFloatUniform("uDark", if (dark) 1f else 0f)
            }
        } catch (_: Throwable) {
            vars.broken = true
            null
        }
    }
    val radiusPx = with(density) { cornerRadius.toPx() }
    val edgePx = with(density) { 26.dp.toPx() }
    val amountPx = with(density) { 30.dp.toPx() }
    this
        .onGloballyPositioned { coords ->
            vars.originX = coords.positionInRoot().x
            vars.originY = coords.positionInRoot().y
            vars.width = coords.size.width.toFloat()
            vars.height = coords.size.height.toFloat()
        }
        .drawBehind {
            val shader = vars.shader
            val content = backdrop.bitmapShader
            if (shader == null || vars.broken || content == null) {
                drawRoundRect(
                    color = tint,
                    cornerRadius = CornerRadius(radiusPx),
                )
                drawRoundRect(
                    color = if (dark) Color.White.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.55f),
                    topLeft = Offset(0.75f, 0.75f),
                    size = Size(size.width - 1.5f, size.height - 1.5f),
                    cornerRadius = CornerRadius(radiusPx),
                    style = Stroke(width = 1.2f),
                )
                return@drawBehind
            }
            try {
                shader.setInputShader("uContent", content)
                shader.setFloatUniform("uSize", floatArrayOf(vars.width, vars.height))
                shader.setFloatUniform("uOrigin", floatArrayOf(vars.originX, vars.originY))
                shader.setFloatUniform("uRadius", radiusPx)
                shader.setFloatUniform("uEdge", edgePx)
                shader.setFloatUniform("uAmount", amountPx)
                shader.setFloatUniform("uChroma", 0.9f)
                drawRect(ShaderBrush(shader))
            } catch (_: Throwable) {
                vars.broken = true
                drawRoundRect(color = tint, cornerRadius = CornerRadius(radiusPx))
            }
        }
}
