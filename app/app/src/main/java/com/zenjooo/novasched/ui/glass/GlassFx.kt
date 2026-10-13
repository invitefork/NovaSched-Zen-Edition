package com.zenjooo.novasched.ui.glass

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.LayerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.highlight.Highlight
import androidx.compose.runtime.Composable

/*
 * 液态玻璃：直接使用参考应用同款开源库 Kyant0/AndroidLiquidGlass（Apache-2.0）
 * 的 Backdrop + lens 折射管线，替代此前手写的 AGSL 移植版；折射/色散/高光
 * 参数沿用已验收的材质规格（边缘折射带 26u、折射量 30u、色散开启、高光弧）。
 * GPU 不支持 RuntimeShader 时自动降级为半透明玻璃色 + 高光描边。
 */

@Composable
fun rememberNovaBackdrop(): LayerBackdrop = rememberLayerBackdrop()

/** 背景内容宿主：该子树绘制的内容将作为所有玻璃表面的折射源。 */
fun Modifier.novaBackdropSource(backdrop: LayerBackdrop): Modifier =
    this.then(Modifier.layerBackdrop(backdrop))

/**
 * 玻璃表面：背景模糊 + SDF 边缘折射 + 色散 + 库自带边缘高光，表面叠加
 * 玻璃 tint 与 1.2px 高光描边。降级路径为纯半透明玻璃色。
 */
fun Modifier.novaGlass(
    backdrop: Backdrop,
    shape: Shape,
    tint: Color,
    dark: Boolean,
): Modifier = composed {
    if (!com.kyant.backdrop.isRuntimeShaderSupported()) {
        this
            .clip(shape)
            .background(tint)
            .border(
                1.2.dp,
                if (dark) Color.White.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.55f),
                shape
            )
    } else {
        this.drawBackdrop(
            backdrop = backdrop,
            shape = { shape },
            effects = {
                blur(10.dp.toPx())
                lens(
                    refractionHeight = 26.dp.toPx(),
                    refractionAmount = 30.dp.toPx(),
                    depthEffect = false,
                    chromaticAberration = true
                )
            },
            highlight = { Highlight(width = 0.5f.dp, alpha = if (dark) 0.5f else 0.65f) },
            onDrawSurface = {
                drawRect(tint)
                drawRect(
                    color = if (dark) Color.White.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.42f),
                    style = Stroke(width = 1.2f)
                )
            }
        )
    }
}
