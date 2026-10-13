//! ZenJooo · NovaFAS 帧感知调度引擎。
//!
//! 读取前台应用的渲染帧信号（SurfaceFlinger timestats），在档位包络内动态
//! 抬升/回落 top-app 利用率下限与各簇最低频率：掉帧快速加压，稳定后缓慢
//! 回落，把功耗压到“刚好够用”。帧信号不可用时退化为 GPU 负载启发式。
//! 检测到 Scene 的 fas-rs 时按配置将其暂停（SIGSTOP），由本引擎接管；
//! 停止或退出时恢复（SIGCONT），其模式节点从不销毁。
//!
//! 引擎只写两类节点：top-app cpu.uclamp.min 与各 policy 的 scaling_min_freq。
//! 频率下限以守护进程下发的档位 floor 为底、以内核当前实际最高频率为顶，
//! 因此天然跟随档位切换与外部调度器的改动，无需感知配置文本。
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use crate::config::{FasConfig, FasMode};
use crate::logging::Logger;
use crate::scheduler::{normalize_frequency, CpuctlLive};
use crate::snapshot::Snapshot;
use crate::util;

const SIGCONT: i32 = 18;
const SIGSTOP: i32 = 19;

/// 一次帧统计：前台图层的平均帧率与丢帧比例。
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FrameSample {
    pub fps: f32,
    /// droppedFrames / totalFrames，0..1。
    pub dropped: f32,
}

/// 引擎运行状态，供 WebUI 与诊断展示。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct EngineStatus {
    /// off（配置关闭）/ idle（待命）/ active（已接管）/ paused（外部调度接管）
    pub state: &'static str,
    /// timestats / heuristic / none
    pub source: &'static str,
    pub fps: f32,
    pub boost: u32,
    pub override_active: bool,
}

/// 主循环每个 tick 发布的共享调度上下文。
#[derive(Clone, Debug, Default)]
pub struct FasShared {
    pub mode: String,
    pub package: String,
    pub allowed: bool,
    pub ready: bool,
    /// 当前档位各簇最低频率（内核适配后的 kHz 字符串），未启用簇为空。
    pub min_floor: Vec<String>,
}

pub struct EngineCtx {
    pub fas: Arc<RwLock<FasConfig>>,
    pub shared: Arc<Mutex<FasShared>>,
    pub live: Arc<CpuctlLive>,
    pub status: Arc<Mutex<EngineStatus>>,
    pub stop: Arc<AtomicBool>,
    pub snapshot: Snapshot,
    pub logger: Logger,
    pub policies: [i32; 4],
}

/// 解析 `dumpsys SurfaceFlinger --timestats -dump` 输出，累加包名命中的
/// 图层帧计数。图层块以 `layerName` 开头；块内 `packageNames`、
/// `totalFrames`、`droppedFrames` 按 key = value 逐行匹配。
/// 返回 (总帧数, 丢帧数)；没有任何图层命中时返回 None。
pub fn parse_timestats(text: &str, package: &str) -> Option<(u64, u64)> {
    let mut acc = Accumulator::default();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with("layerName") {
            acc.settle();
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        match key.trim() {
            "packageNames" => acc.in_package = package_matches(value.trim(), package),
            "totalFrames" => acc.block_total = value.trim().parse().unwrap_or(0),
            "droppedFrames" => acc.block_dropped = value.trim().parse().unwrap_or(0),
            _ => {}
        }
    }
    acc.settle();
    acc.matched.then_some((acc.total, acc.dropped))
}

#[derive(Default)]
struct Accumulator {
    total: u64,
    dropped: u64,
    matched: bool,
    in_package: bool,
    block_total: u64,
    block_dropped: u64,
}

impl Accumulator {
    fn settle(&mut self) {
        if self.in_package {
            self.total += self.block_total;
            self.dropped += self.block_dropped;
            self.matched = true;
        }
        self.in_package = false;
        self.block_total = 0;
        self.block_dropped = 0;
    }
}

/// 图层 packageNames 为逗号分隔列表。
fn package_matches(value: &str, package: &str) -> bool {
    value.split(',').any(|name| name.trim() == package)
}

/// 帧驱动/负载驱动共用控制器。boost 0..=ceiling：
/// 掉帧或帧率跌破稳定基线 → 快速加压；连续稳定 → 缓慢回落。
/// 稳定基线只在 boost==0 时重学，避免“加压→回落→再加压”的极限环。
#[derive(Debug, Default)]
pub struct Controller {
    pub boost: u32,
    stable_fps: f32,
    bad_streak: u32,
    calm: u32,
}

const BOOST_STEP: u32 = 12;
const DECAY_STEP: u32 = 4;
const BAD_STREAK_TRIGGER: u32 = 2;
const CALM_DECAY_TICKS: u32 = 5;

impl Controller {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// 帧信号可用时每次采样调用。
    pub fn on_frame(&mut self, ceiling: u32, sample: FrameSample) -> u32 {
        let ceiling = ceiling.min(100);
        if sample.fps < 1.0 {
            // 应用停止渲染（暂停/静态画面）时按稳定路径缓慢回落。
            self.calm += 1;
            if self.calm >= CALM_DECAY_TICKS {
                self.boost = self.boost.saturating_sub(DECAY_STEP);
                self.calm = 0;
            }
            return self.boost;
        }
        if self.stable_fps < 1.0 {
            self.stable_fps = sample.fps;
        }
        let dropping = sample.dropped >= 0.02;
        let slowed = sample.fps < self.stable_fps * 0.88;
        if dropping || slowed {
            self.bad_streak += 1;
            self.calm = 0;
            if dropping || self.bad_streak >= BAD_STREAK_TRIGGER {
                self.boost = (self.boost + BOOST_STEP).min(ceiling);
                self.bad_streak = 0;
            }
        } else {
            self.bad_streak = 0;
            self.calm += 1;
            if self.boost == 0 {
                // 未加压时的帧率就是真实基线，向新值缓慢收敛。
                self.stable_fps = self.stable_fps * 0.8 + sample.fps * 0.2;
            } else if self.calm >= CALM_DECAY_TICKS {
                self.boost = self.boost.saturating_sub(DECAY_STEP);
                self.calm = 0;
            }
        }
        self.boost
    }

    /// 帧信号不可用时的 GPU 负载启发式（busy 百分比 0..100）。
    pub fn on_load(&mut self, ceiling: u32, gpu_busy: f32) -> u32 {
        let ceiling = ceiling.min(100);
        if gpu_busy >= 70.0 {
            self.bad_streak += 1;
            self.calm = 0;
            if self.bad_streak >= BAD_STREAK_TRIGGER {
                self.boost = (self.boost + BOOST_STEP).min(ceiling);
                self.bad_streak = 0;
            }
        } else if gpu_busy <= 45.0 {
            self.bad_streak = 0;
            self.calm += 1;
            if self.calm >= CALM_DECAY_TICKS * 2 {
                self.boost = self.boost.saturating_sub(DECAY_STEP);
                self.calm = 0;
            }
        } else {
            self.calm = 0;
        }
        self.boost
    }
}

/// GPU 忙碌百分比：Adreno kgsl 优先，其次 MTK GED。
pub fn read_gpu_busy() -> Option<f32> {
    for path in [
        "/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage",
        "/sys/kernel/ged/hw/gpu_meter",
    ] {
        let raw = util::read_trimmed(std::path::Path::new(path)).ok()?;
        let value = raw.split('%').next()?.trim();
        let parsed = value.parse::<f32>().ok()?;
        if (0.0..=100.0).contains(&parsed) {
            return Some(parsed);
        }
    }
    None
}

/// SurfaceFlinger timestats 会话：enable → 周期 dump+clear → 停止时 disable。
/// 帧计数用相邻两次 dump 的差值，即使 clear 在某些版本无效也保持正确。
struct Timestats {
    enabled: bool,
    last_total: u64,
    last_at: Instant,
}

impl Timestats {
    fn new() -> Self {
        Self { enabled: false, last_total: 0, last_at: Instant::now() }
    }

    fn ensure_enabled(&mut self, logger: &Logger) {
        if self.enabled {
            return;
        }
        self.enabled = util::run_command(
            "/system/bin/dumpsys",
            &["SurfaceFlinger", "--timestats", "-enable", "-maxlayers", "128"],
        )
        .is_ok();
        if self.enabled {
            logger.debug("NovaFAS 帧信号源：SurfaceFlinger timestats");
            self.last_total = 0;
            self.last_at = Instant::now();
        }
    }

    /// 返回自上次采样以来的帧样本；窗口异常或输出不可解析返回 None。
    fn sample(&mut self, package: &str) -> Option<FrameSample> {
        if !self.enabled {
            return None;
        }
        let output = util::run_command(
            "/system/bin/dumpsys",
            &["SurfaceFlinger", "--timestats", "-dump", "-maxlayers", "128"],
        )
        .ok()?;
        let _ = util::run_command(
            "/system/bin/dumpsys",
            &["SurfaceFlinger", "--timestats", "-clear"],
        );
        let Some((total, dropped)) = parse_timestats(&output, package) else {
            return None;
        };
        let elapsed = self.last_at.elapsed().as_secs_f32().max(0.1);
        self.last_at = Instant::now();
        let frames = total.saturating_sub(self.last_total);
        self.last_total = total;
        Some(FrameSample {
            fps: frames as f32 / elapsed,
            dropped: if total > 0 { dropped as f32 / total as f32 } else { 0.0 },
        })
    }

    fn disable(&mut self) {
        if self.enabled {
            let _ = util::run_command(
                "/system/bin/dumpsys",
                &["SurfaceFlinger", "--timestats", "-disable"],
            );
            self.enabled = false;
        }
    }
}

/// 暂停/恢复 fas-rs 进程集合。引擎激活时 SIGSTOP，释放时 SIGCONT。
struct SceneOverride {
    suspended: BTreeSet<i32>,
    enabled: bool,
}

impl SceneOverride {
    fn refresh(&mut self, wanted: bool, logger: &Logger) {
        if !self.enabled {
            return;
        }
        if wanted {
            for pid in crate::fas::running_pids() {
                if self.suspended.contains(&pid) {
                    continue;
                }
                if unsafe { crate::ffi::kill(pid, SIGSTOP) } == 0 {
                    self.suspended.insert(pid);
                    logger.info(format!(
                        "NovaFAS 已暂停 fas-rs 进程 {pid}，帧感知调度由本引擎接管"
                    ));
                }
            }
        } else if !self.suspended.is_empty() {
            for pid in &self.suspended {
                unsafe { crate::ffi::kill(*pid, SIGCONT) };
            }
            logger.info("NovaFAS 已恢复 fas-rs 进程运行");
            self.suspended.clear();
        }
    }
}

impl Drop for SceneOverride {
    fn drop(&mut self) {
        for pid in &self.suspended {
            unsafe { crate::ffi::kill(*pid, SIGCONT) };
        }
    }
}

/// 每个策略簇的写入状态：最低频率去重与档位 floor 缓存。
struct ClusterState {
    policy: i32,
    last_min: Option<String>,
    floor: Option<u64>,
    floor_key: String,
}

pub fn spawn(ctx: EngineCtx) -> Option<std::thread::JoinHandle<()>> {
    if !ctx.policies.iter().any(|policy| *policy >= 0) {
        return None;
    }
    std::thread::Builder::new()
        .name("novasched-fas".into())
        .spawn(move || run(ctx))
        .ok()
}

fn run(ctx: EngineCtx) {
    let mut controller = Controller::default();
    let mut stats = Timestats::new();
    let mut scene = SceneOverride {
        suspended: BTreeSet::new(),
        enabled: ctx.fas.read().map(|cfg| cfg.override_scene).unwrap_or(true),
    };
    let mut clusters: Vec<ClusterState> = ctx
        .policies
        .iter()
        .copied()
        .enumerate()
        .filter(|(_, policy)| *policy >= 0)
        .map(|(index, policy)| ClusterState {
            policy,
            last_min: None,
            floor: None,
            floor_key: format!("\0cluster{index}"),
        })
        .collect();
    let mut status = EngineStatus::default();
    let mut last_boost: u32 = 0;
    let mut last_mode = String::new();
    let mut last_sample = Instant::now() - Duration::from_secs(60);
    let mut frame_ok = false;
    loop {
        if ctx.stop.load(Ordering::Relaxed) {
            break;
        }
        let cfg = ctx
            .fas
            .read()
            .map(|cfg| cfg.clone())
            .unwrap_or_else(|_| FasConfig::default());
        scene.enabled = cfg.override_scene;
        let shared = ctx
            .shared
            .lock()
            .map(|state| state.clone())
            .unwrap_or_default();
        if shared.mode != last_mode {
            // 档位切换：丢弃旧 floor 缓存（调度器已写入新档位的最低频率），
            // 控制器归零并在下一拍强制重写目标。
            last_mode = shared.mode.clone();
            for (index, cluster) in clusters.iter_mut().enumerate() {
                cluster.floor = None;
                cluster.floor_key = format!("\0cluster{index}");
                cluster.last_min = None;
            }
            controller.reset();
            last_boost = u32::MAX;
        }
        let mode_cfg = cfg.modes.get(&shared.mode).cloned();
        let want_active = shared.allowed
            && shared.ready
            && !shared.package.is_empty()
            && crate::config::MODES.contains(&shared.mode.as_str())
            && mode_cfg.as_ref().is_some_and(|mode| mode.ceiling > 0);
        if !cfg.enabled || !want_active {
            release(&ctx, &mut controller, &mut clusters, &mut scene, &mut status);
            std::thread::sleep(Duration::from_millis(cfg.step_ms.max(300)));
            continue;
        }
        let mode_cfg = mode_cfg.unwrap_or(FasMode::default());
        scene.refresh(true, &ctx.logger);
        stats.ensure_enabled(&ctx.logger);

        // 采样时钟：帧信号按 sample_ms 周期；无帧信号时每 tick 用 GPU 负载。
        if last_sample.elapsed().as_millis() as u64 >= cfg.sample_ms {
            last_sample = Instant::now();
            match stats.sample(&shared.package) {
                Some(sample) => {
                    frame_ok = true;
                    controller.on_frame(mode_cfg.ceiling, sample);
                    status.fps = sample.fps;
                }
                None if frame_ok => {
                    // 偶发采样失败保留上次状态；连续失败才退回启发式。
                    frame_ok = status.fps > 0.0;
                }
                None => {}
            }
        }
        if !frame_ok {
            if let Some(busy) = read_gpu_busy() {
                controller.on_load(mode_cfg.ceiling, busy);
            }
            status.fps = 0.0;
        }
        status.source = if frame_ok { "timestats" } else { "heuristic" };
        status.state = "active";
        status.boost = controller.boost;
        status.override_active = !scene.suspended.is_empty();
        apply_targets(
            &ctx,
            &shared,
            &mode_cfg,
            controller.boost,
            &mut clusters,
            &mut last_boost,
        );
        publish(&ctx.status, &status);
        std::thread::sleep(Duration::from_millis(cfg.step_ms));
    }
    release(&ctx, &mut controller, &mut clusters, &mut scene, &mut status);
    stats.disable();
}

fn release(
    ctx: &EngineCtx,
    controller: &mut Controller,
    clusters: &mut [ClusterState],
    scene: &mut SceneOverride,
    status: &mut EngineStatus,
) {
    scene.refresh(false, &ctx.logger);
    if status.state == "active" || controller.boost > 0 {
        restore_floors(ctx, clusters);
        restore_uclamp_baseline(ctx);
        controller.reset();
    }
    status.state = if ctx.fas.read().map(|cfg| cfg.enabled).unwrap_or(false) {
        "idle"
    } else {
        "off"
    };
    status.source = "none";
    status.fps = 0.0;
    status.boost = 0;
    status.override_active = false;
    publish(&ctx.status, status);
}

/// 把状态发布到共享槽位：档位、来源、接管标志变化立即生效，
/// 帧率与 boost 用阈值去抖，避免 WebUI 每 200ms 刷新一次。
fn publish(sink: &Arc<Mutex<EngineStatus>>, status: &EngineStatus) {
    let Ok(mut sink) = sink.lock() else { return };
    let settled_boost = status.boost == 0 || status.boost % 24 == 0;
    let fps_changed = (status.fps > 0.0 && (sink.fps - status.fps).abs() > 2.0)
        || (status.fps == 0.0 && sink.fps != 0.0);
    if sink.state != status.state
        || sink.source != status.source
        || sink.override_active != status.override_active
        || (settled_boost && sink.boost != status.boost)
        || fps_changed
    {
        *sink = status.clone();
    }
}

fn restore_floors(ctx: &EngineCtx, clusters: &mut [ClusterState]) {
    for cluster in clusters.iter_mut() {
        cluster.last_min = None;
        let Some(floor) = cluster.floor else { continue };
        let Some(base) = policy_base(cluster.policy) else { continue };
        let value = floor.to_string();
        if util::read_trimmed(&base.join("scaling_min_freq"))
            .ok()
            .as_deref()
            != Some(value.as_str())
        {
            let _ = ctx.snapshot.write(&base.join("scaling_min_freq"), &value);
        }
    }
}

fn restore_uclamp_baseline(ctx: &EngineCtx) {
    let node = crate::scheduler::cpuctl_node("top-app", "min");
    if !node.exists() {
        return;
    }
    let Ok(state) = ctx.live.inner.lock() else { return };
    if state.top_app_min.is_empty() {
        return;
    }
    let _ = ctx.snapshot.write(&node, state.top_app_min.trim());
}

/// 把控制器 boost 映射为节点写入：top-app uclamp.min 与各簇最低频率。
/// 最低频率上限 = 当前实际最高频率 × freq_scale% × boost/100（首簇按小核
/// 处理，×0.6），永低于档位 floor、不高于当前实际最高频率。
fn apply_targets(
    ctx: &EngineCtx,
    shared: &FasShared,
    mode_cfg: &FasMode,
    boost: u32,
    clusters: &mut [ClusterState],
    last_boost: &mut u32,
) {
    if boost == *last_boost {
        return;
    }
    *last_boost = boost;
    let node = crate::scheduler::cpuctl_node("top-app", "min");
    let uclamp_target = mode_cfg.ceiling.min(100) * boost / 100;
    if node.exists() {
        let mut bounded = uclamp_target.to_string();
        if uclamp_target > 0 {
            if let Some(maximum) = util::read_trimmed(node.with_file_name("cpu.uclamp.max"))
                .ok()
                .and_then(|value| parse_percent(&value))
            {
                if uclamp_target > maximum {
                    bounded = maximum.to_string();
                }
            }
        }
        if let Ok(mut state) = ctx.live.inner.lock() {
            state.top_app_min = bounded.clone();
        }
        if util::read_trimmed(&node).ok().as_deref() != Some(bounded.as_str()) {
            if let Err(error) = ctx.snapshot.write(&node, &bounded) {
                ctx.logger.debug(format!("NovaFAS uclamp 写入失败: {error}"));
            }
        }
    }

    for (index, cluster) in clusters.iter_mut().enumerate() {
        let Some(base) = policy_base(cluster.policy) else {
            continue;
        };
        let max_now = match util::read_trimmed(&base.join("scaling_max_freq"))
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0)
        {
            Some(value) => value,
            None => continue,
        };
        let Some(floor_khz) =
            resolve_floor(&mut cluster.floor, &mut cluster.floor_key, index, shared, &base, max_now)
        else {
            continue;
        };
        // 首簇视为小核，权重 0.6 以省电。
        let weight: f32 = if index == 0 { 0.6 } else { 1.0 };
        let target = (max_now as f32
            * mode_cfg.freq_scale.min(100) as f32
            * boost as f32
            / 10000.0
            * weight) as u64;
        let target = target.clamp(floor_khz, max_now);
        let resolved = normalize_frequency(&base, &target.to_string(), true);
        let resolved = resolved
            .parse::<u64>()
            .unwrap_or(target)
            .min(max_now)
            .to_string();
        if cluster.last_min.as_deref() == Some(resolved.as_str()) {
            continue;
        }
        if util::read_trimmed(&base.join("scaling_min_freq"))
            .ok()
            .as_deref()
            != Some(resolved.as_str())
        {
            if let Err(error) =
                ctx.snapshot.write(&base.join("scaling_min_freq"), &resolved)
            {
                ctx.logger.debug(format!(
                    "NovaFAS policy{} 最低频率写入失败: {error}",
                    cluster.policy
                ));
                continue;
            }
        }
        cluster.last_min = Some(resolved);
    }
}

/// 解析并缓存簇最低频率下限。守护进程发布的是内核适配后的 kHz 字符串；
/// 兼容 "0%" / "50%" 等原始写法（按当前实际最高频率换算）。
fn resolve_floor(
    floor: &mut Option<u64>,
    floor_key: &mut String,
    index: usize,
    shared: &FasShared,
    base: &std::path::Path,
    max_now: u64,
) -> Option<u64> {
    let raw = shared.min_floor.get(index)?;
    let raw = raw.trim();
    if floor_key != raw {
        let target = if let Some(percent) = raw.strip_suffix('%') {
            max_now.checked_mul(percent.parse::<u64>().ok()?)? / 100
        } else {
            raw.parse::<u64>().ok()?
        };
        let resolved = normalize_frequency(base, &target.to_string(), true)
            .parse::<u64>()
            .unwrap_or(target)
            .min(max_now);
        *floor_key = raw.to_string();
        *floor = Some(resolved);
    }
    *floor
}

fn policy_base(policy: i32) -> Option<PathBuf> {
    Some(PathBuf::from(format!(
        "/sys/devices/system/cpu/cpufreq/policy{policy}"
    )))
}

/// cgroup 返回的百分比可能是 "30"、"30.00" 或 "max"。
fn parse_percent(raw: &str) -> Option<u32> {
    if raw == "max" {
        return Some(100);
    }
    let (whole, fraction) = raw.split_once('.').unwrap_or((raw, ""));
    let decimal = if fraction.is_empty() {
        0
    } else if fraction.len() <= 2 {
        fraction.parse::<u32>().ok()? * if fraction.len() == 1 { 10 } else { 1 }
    } else {
        return None;
    };
    let value = whole
        .parse::<u32>()
        .ok()?
        .checked_mul(100)?
        .checked_add(decimal)?;
    (value <= 10000).then_some(value / 100)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(fps: f32, dropped: f32) -> FrameSample {
        FrameSample { fps, dropped }
    }

    #[test]
    fn timestats_sums_only_matching_layers() {
        let text = "timeStats: enabled\n\
            layerName = SurfaceView[com.miHoYo.Yuanshen/com.miHoYo.GetMobileInfo.MainActivity](BLAST)#0\n\
            packageNames = com.miHoYo.Yuanshen\n\
            totalFrames = 120\n\
            droppedFrames = 3\n\
            averageFPS = 59.87\n\
            layerName = com.android.systemui.ImageWallpaper#0\n\
            packageNames = com.android.systemui\n\
            totalFrames = 4\n\
            droppedFrames = 0\n";
        assert_eq!(parse_timestats(text, "com.miHoYo.Yuanshen"), Some((120, 3)));
        assert_eq!(parse_timestats(text, "com.other.app"), None);
        assert_eq!(parse_timestats("timeStats: enabled\n", "com.x"), None);
    }

    #[test]
    fn timestats_accumulates_multiple_layers_and_tolerates_missing_fields() {
        let text = "layerName = a\npackageNames = com.game,com.other\ntotalFrames = 10\n\
            layerName = b\npackageNames = com.game\ntotalFrames = 5\ndroppedFrames = 1\n\
            layerName = c\npackageNames = \ntotalFrames = 9\n";
        assert_eq!(parse_timestats(text, "com.game"), Some((15, 1)));
        // packageNames 为空行后的块不属于任何已知包。
        assert_eq!(parse_timestats(text, "com.launcher"), None);
    }

    #[test]
    fn boost_rises_fast_on_drops_and_decays_slowly_when_calm() {
        let mut controller = Controller::default();
        assert_eq!(controller.on_frame(80, sample(60.0, 0.0)), 0);
        assert_eq!(controller.on_frame(80, sample(60.0, 0.0)), 0);
        // 丢帧立即加压，不受连击去抖限制。
        assert_eq!(controller.on_frame(80, sample(58.0, 0.05)), 12);
        // 帧率跌破基线需要连续两拍才加压。
        controller.reset();
        assert_eq!(controller.on_frame(80, sample(60.0, 0.0)), 0);
        assert_eq!(controller.on_frame(80, sample(48.0, 0.0)), 0);
        assert_eq!(controller.on_frame(80, sample(48.0, 0.0)), 12);
    }

    #[test]
    fn calm_decay_returns_boost_to_zero_without_hunting() {
        let mut controller = Controller::default();
        for _ in 0..3 {
            controller.on_frame(80, sample(60.0, 0.0));
        }
        assert_eq!(controller.on_frame(80, sample(58.5, 0.03)), 12);
        // 稳定 5 拍回落一档：12 → 8 → 4 → 0，逐级缓降。
        for _ in 0..4 {
            assert_eq!(controller.on_frame(80, sample(60.0, 0.0)), 12);
        }
        assert_eq!(controller.on_frame(80, sample(60.0, 0.0)), 8);
        for _ in 0..5 {
            controller.on_frame(80, sample(60.0, 0.0));
        }
        assert_eq!(controller.boost, 4);
        for _ in 0..5 {
            controller.on_frame(80, sample(60.0, 0.0));
        }
        assert_eq!(controller.boost, 0);
    }

    #[test]
    fn boost_never_exceeds_mode_ceiling_and_resets_fully() {
        let mut controller = Controller::default();
        for _ in 0..40 {
            controller.on_frame(35, sample(10.0, 0.5));
        }
        assert_eq!(controller.boost, 35);
        controller.reset();
        assert_eq!(controller.boost, 0);
        assert_eq!(controller.stable_fps, 0.0);
        assert_eq!(controller.calm, 0);
    }

    #[test]
    fn heuristic_boosts_only_on_sustained_gpu_load() {
        let mut controller = Controller::default();
        assert_eq!(controller.on_load(80, 90.0), 0);
        assert_eq!(controller.on_load(80, 90.0), 12);
        assert_eq!(controller.on_load(80, 20.0), 12);
        for _ in 0..(CALM_DECAY_TICKS * 2) {
            controller.on_load(80, 20.0);
        }
        assert_eq!(controller.boost, 8);
    }

    #[test]
    fn percent_parsing_matches_cgroup_semantics() {
        assert_eq!(parse_percent("30"), Some(30));
        assert_eq!(parse_percent("30.00"), Some(30));
        assert_eq!(parse_percent("max"), Some(100));
        for invalid in ["101", "1.234", "NaN", "", "-1"] {
            assert_eq!(parse_percent(invalid), None, "{invalid}");
        }
    }

    #[test]
    fn floor_resolution_supports_khz_and_percent_notation() {
        let dir = std::env::temp_dir().join(format!("nova-fas-floor-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("scaling_available_frequencies"), "300000 1000000 2000000\n")
            .unwrap();
        let mut floor = None;
        let mut key = String::new();
        let shared = FasShared {
            min_floor: vec!["0".into()],
            ..Default::default()
        };
        assert_eq!(
            resolve_floor(&mut floor, &mut key, 0, &shared, &dir, 3000000),
            Some(0)
        );
        let shared = FasShared {
            min_floor: vec!["50%".into()],
            ..Default::default()
        };
        assert_eq!(
            resolve_floor(&mut floor, &mut key, 0, &shared, &dir, 3000000),
            Some(2000000)
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
