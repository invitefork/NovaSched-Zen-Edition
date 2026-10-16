//! 信息流视频应用锁帧：前台命中清单内应用时，把屏幕刷新率限制到
//! fps Hz；应用切走或守护停止时恢复原值。
//!
//! 通道优先级：
//! 1. MI mi_display sysfs 节点（HyperOS/MIUI 面板直控，探测候选列表取
//!    第一个可写节点，写入前保存原值）；
//! 2. HyperOS/AOSP 全局刷新率 settings（min + peak 双写，root 下用
//!    `settings` 命令，恢复时对原值为 null 的键执行 delete）。
//! 两个通道都不可用时功能如实失效（只记一条日志），不猜测节点。
use crate::logging::Logger;

const NODE_BASE: &str = "/sys/class/mi_display";
const NODE_CANDIDATES: &[&str] = &[
    "disp-DSI-0/max_fps_clone",
    "dsi-0-mi_display/max_fps_clone",
    "disp-DSI-0/dynamic_fps",
    "dsi-0-mi_display/dynamic_fps",
];
const SETTING_KEYS: &[&str] = &["min_refresh_rate", "peak_refresh_rate"];

#[derive(Default)]
pub struct FeedFpsState {
    pub engaged: bool,
    node: Option<(std::path::PathBuf, String)>,
    settings: Vec<(&'static str, String)>,
}

pub fn engage(fps: u32, logger: &Logger) -> FeedFpsState {
    let value = fps.to_string();
    for candidate in NODE_CANDIDATES {
        let node = std::path::Path::new(NODE_BASE).join(candidate);
        let Ok(original) = crate::util::read_trimmed(&node) else {
            continue;
        };
        if original == value {
            return FeedFpsState {
                engaged: true,
                node: Some((node, original)),
                settings: Vec::new(),
            };
        }
        if std::fs::write(&node, value.as_bytes()).is_err() {
            continue;
        }
        if crate::util::read_trimmed(&node).ok().as_deref() != Some(value.as_str()) {
            continue;
        }
        logger.info(format!(
            "信息流锁帧：屏幕刷新率已限制为 {fps} Hz（{}）",
            node.display()
        ));
        return FeedFpsState {
            engaged: true,
            node: Some((node, original)),
            settings: Vec::new(),
        };
    }
    let mut saved = Vec::new();
    for key in SETTING_KEYS {
        let old = crate::util::run_command("settings", &["get", "system", key])
            .unwrap_or_default()
            .trim()
            .to_string();
        if crate::util::run_command("settings", &["put", "system", key, &value]).is_err() {
            logger.debug(format!("信息流锁帧：settings put {key} 失败，放弃 settings 通道"));
            restore_settings(&saved);
            return FeedFpsState::default();
        }
        saved.push((*key, old));
    }
    if saved.is_empty() {
        return FeedFpsState::default();
    }
    logger.info(format!("信息流锁帧：全局刷新率已限制为 {fps} Hz"));
    FeedFpsState {
        engaged: true,
        node: None,
        settings: saved,
    }
}

pub fn release(state: &mut FeedFpsState, logger: &Logger) {
    if !state.engaged {
        return;
    }
    if let Some((node, original)) = state.node.take() {
        let _ = std::fs::write(&node, original.as_bytes());
    }
    restore_settings(&state.settings);
    state.settings.clear();
    state.engaged = false;
    logger.info("信息流锁帧已解除，刷新率恢复原值");
}

fn restore_settings(saved: &[(&'static str, String)]) {
    for (key, value) in saved {
        if value == "null" || value.is_empty() {
            let _ = crate::util::run_command("settings", &["delete", "system", key]);
        } else {
            let _ = crate::util::run_command("settings", &["put", "system", key, value]);
        }
    }
}
