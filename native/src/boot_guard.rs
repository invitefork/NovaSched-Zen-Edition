//! Delay kernel controls until credential storage is ready, and remember
//! an unconfirmed startup across a kernel reset.
use crate::util::{self, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const STABLE_TIME: Duration = Duration::from_secs(180);

pub fn ensure_ready() -> Result<()> {
    if !cfg!(target_os = "android") {
        return Ok(());
    }
    if util::getprop("sys.boot_completed") != "1" {
        return Err("系统尚未完成启动，调度保持暂停".into());
    }
    let user = util::current_android_user()?;
    let ce = util::getprop(&format!("sys.user.{user}.ce_available"));
    if matches!(ce.as_str(), "1" | "true") {
        return Ok(());
    }
    let user_id = user.to_string();
    let state = util::query_command(
        "/system/bin/cmd",
        &["activity", "get-started-user-state", &user_id],
        Duration::from_secs(2),
    )?;
    if user_unlocked(&state) {
        Ok(())
    } else {
        Err(format!("等待用户 {user} 首次解锁；当前状态: {state}"))
    }
}

fn user_unlocked(state: &str) -> bool {
    // AOSP prints the named state; older vendor implementations print its
    // numeric value (UserState.STATE_RUNNING_UNLOCKED = 3).
    matches!(state.trim(), "RUNNING_UNLOCKED" | "3")
}

pub struct BootGuard {
    path: PathBuf,
    boot: String,
    stable_since: Option<Instant>,
    confirmed: bool,
}

impl BootGuard {
    pub fn begin(module: &Path, state: &Path) -> Result<Self> {
        let boot = util::read_trimmed("/proc/sys/kernel/random/boot_id")?;
        Self::begin_for_boot(module, state, &boot)
    }

    fn begin_for_boot(module: &Path, state: &Path, boot: &str) -> Result<Self> {
        if boot.is_empty() || !boot.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return Err("无法确认启动身份，未写入调度节点".into());
        }
        let path = state.join("boot-guard");
        let previous = match fs::read_to_string(&path) {
            Ok(text) => {
                let (boot, phase) = parse_record(&text)?;
                Some((boot.to_owned(), phase.to_owned()))
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("无法读取启动保护记录: {error}")),
        };
        if let Some((old_boot, phase)) = previous {
            if old_boot != boot && phase == "pending" {
                let reason = "上次调度启动未确认稳定就发生重启，模块已自动停用。请保留 boot-guard、boot-entry.log 和内核崩溃记录，确认后再从管理器启用。";
                util::atomic_write(&module.join("disable"), reason.as_bytes(), 0o644)?;
                write_record(&path, boot, "blocked")?;
                return Err(reason.into());
            }
        }
        write_record(&path, boot, "pending")?;
        Ok(Self { path, boot: boot.into(), stable_since: None, confirmed: false })
    }

    pub fn confirm_if_stable(&mut self, healthy: bool) -> Result<bool> {
        if self.confirmed { return Ok(false); }
        if !healthy {
            self.stable_since = None;
            return Ok(false);
        }
        let since = self.stable_since.get_or_insert_with(Instant::now);
        if since.elapsed() < STABLE_TIME {
            return Ok(false);
        }
        write_record(&self.path, &self.boot, "healthy")?;
        self.confirmed = true;
        Ok(true)
    }

    pub fn finish_cleanly(&self) -> Result<()> {
        write_record(&self.path, &self.boot, "stopped")
    }
}

fn write_record(path: &Path, boot: &str, phase: &str) -> Result<()> {
    util::atomic_write(path, format!("boot={boot}\nstate={phase}\nversion={}\n", env!("CARGO_PKG_VERSION")).as_bytes(), 0o600)
}

fn parse_record(text: &str) -> Result<(&str, &str)> {
    let boot = text.lines().find_map(|line| line.strip_prefix("boot="));
    let phase = text.lines().find_map(|line| line.strip_prefix("state="));
    match (boot, phase) {
        (Some(boot), Some(phase)) if !boot.is_empty() && matches!(phase, "pending" | "healthy" | "stopped" | "blocked") => Ok((boot, phase)),
        _ => Err("启动保护记录损坏，未写入调度节点；请保留 boot-guard 供诊断".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locked_unlocking_and_unknown_users_never_pass_the_gate() {
        for state in ["0", "1", "2", "RUNNING_LOCKED", "RUNNING_UNLOCKING", "", "User is not started: 0", "RUNNING_UNLOCKED extra"] {
            assert!(!user_unlocked(state), "{state}");
        }
        assert!(user_unlocked("RUNNING_UNLOCKED\n"));
        assert!(user_unlocked("3"));
    }

    #[test]
    fn a_kernel_reset_during_trial_disables_before_a_second_dispatch() {
        let root = std::env::temp_dir().join(format!("nova-guard-reset-{}", std::process::id()));
        let module = root.join("module");
        let state = root.join("state");
        fs::create_dir_all(&module).unwrap();
        fs::create_dir_all(&state).unwrap();
        BootGuard::begin_for_boot(&module, &state, "boot-a").unwrap();
        assert!(BootGuard::begin_for_boot(&module, &state, "boot-a").is_ok());
        assert!(!module.join("disable").exists());
        assert!(BootGuard::begin_for_boot(&module, &state, "boot-b").is_err());
        assert!(module.join("disable").exists());
        assert_eq!(parse_record(&fs::read_to_string(state.join("boot-guard")).unwrap()).unwrap().1, "blocked");
        // The manager's explicit re-enable permits one fresh trial.
        fs::remove_file(module.join("disable")).unwrap();
        let mut guard = BootGuard::begin_for_boot(&module, &state, "boot-c").unwrap();
        assert!(!guard.confirm_if_stable(true).unwrap());
        guard.stable_since = Some(Instant::now() - STABLE_TIME);
        assert!(!guard.confirm_if_stable(false).unwrap());
        guard.stable_since = Some(Instant::now() - STABLE_TIME);
        assert!(guard.confirm_if_stable(true).unwrap());
        assert!(!guard.confirm_if_stable(true).unwrap());
        let guard = BootGuard::begin_for_boot(&module, &state, "boot-d").unwrap();
        guard.finish_cleanly().unwrap();
        assert!(BootGuard::begin_for_boot(&module, &state, "boot-e").is_ok());
        fs::remove_dir_all(root).unwrap();
    }
}
