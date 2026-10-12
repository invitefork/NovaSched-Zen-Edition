//! Stop writers and restore their changes before removing module-owned files.
use crate::{
    ffi, lifecycle,
    logging::Logger,
    process_identity, scene,
    snapshot::Snapshot,
    util::{self, Result, STATE_DIR},
};
use std::collections::BTreeSet;
use std::fs;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub fn run(module: &Path) -> Result<()> {
    if unsafe { ffi::geteuid() } != 0 {
        return Err("卸载需要 root".into());
    }
    let prop = util::read_text(&module.join("module.prop"))?;
    if !prop.lines().any(|line| line == "id=NovaSched_Zen_Edition") {
        return Err("模块身份不匹配，取消清理".into());
    }
    util::atomic_write(&module.join(".uninstalling"), b"uninstall=1\n", 0o600)?;
    let state = Path::new(STATE_DIR);
    if fs::symlink_metadata(state).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("运行目录被替换为符号链接，拒绝访问链接目标".into());
    }
    println!("[1/4] 请调度下班：停止守护和启动监督。");
    let deadline = Instant::now() + Duration::from_secs(10);
    let _control = loop {
        match util::acquire_flock(&state.join("control.lock")) {
            Ok(lock) => break lock,
            Err(error) if Instant::now() >= deadline => {
                return Err(format!("等待控制锁失败：{error}"))
            }
            Err(_) => util::sleep(Duration::from_millis(100)),
        }
    };
    let stopped = lifecycle::stop_inner(module);
    if !idle(state)? {
        // Only an identity-verified pidfd may force a hung daemon to exit.
        // Keep stop.requested in place so the supervisor will not restart it.
        println!("  正常停止未完成，正在核验进程身份后结束卡住的守护。");
        process_identity::verify(state, module)?.signal(ffi::SIGKILL)?;
        let deadline = Instant::now() + Duration::from_secs(5);
        while !idle(state)? && Instant::now() < deadline {
            util::sleep(Duration::from_millis(100));
        }
    }
    require_idle(state)?;
    if let Err(error) = stopped {
        println!("  停止记录：{error}；已确认所有运行锁释放，继续恢复。");
    }
    let _daemon = util::acquire_flock(&state.join("daemon.lock"))?;
    let _supervisor = util::acquire_flock(&state.join("supervisor.lock"))?;

    println!("[2/4] 把系统交还原厂：恢复节点值、权限、属性和服务。");
    let mut warnings = Vec::new();
    if state.join("stock_snapshot.tsv").exists() {
        match Snapshot::load(state, Logger::new(state)).and_then(|snapshot| snapshot.restore()) {
            Ok(count) => println!("  已恢复 {count} 项原厂设置。"),
            Err(error) => warnings.push(format!("部分原厂设置未恢复：{error}；卸载后请重启手机")),
        }
    } else {
        println!("  没有原厂快照，本次无需恢复节点。");
    }

    println!("[3/4] Scene 收尾：恢复原回调，移除 NovaSched 自己的回调。");
    let mut errors = Vec::new();
    match scene::uninstall_provider() {
        Ok(notes) => warnings.extend(notes),
        Err(error) => errors.push(format!("Scene 清理未完成：{error}")),
    }

    println!("[4/4] 行李带走：清理配置、规则、凭据、备份、缓存和日志。");
    let storage_roots = [
        PathBuf::from("/storage/emulated"),
        PathBuf::from("/data/media"),
    ];
    let mirrors = mirror_paths(&storage_roots);
    let pending_users = pending_storage_users(&storage_roots);
    let pending = [
        PathBuf::from("/data/adb/modules_update/NovaSched_Zen_Edition"),
        PathBuf::from("/data/adb/ap/modules_update/NovaSched_Zen_Edition"),
    ];
    errors.extend(cleanup(module, state, &mirrors, &pending));
    if !pending_users.is_empty() {
        match defer_storage_cleanup(&pending_users) {
            Ok(()) => println!("  加密存储尚未就绪：解锁后清理日志，一次性清理脚本随后自删。"),
            Err(error) => errors.push(format!("安排解锁后的日志清理失败：{error}")),
        }
    }
    for warning in warnings {
        println!("  ! {warning}");
    }
    if !errors.is_empty() {
        return Err(format!("卸载清理未完成：{}", errors.join("；")));
    }
    println!("  ✓ 模块运行目录、可访问的日志镜像和待更新副本已清理。");
    println!("NovaSched 已下班。模块本体由 root 管理器移除，感谢使用 · ZenJooo");
    Ok(())
}

fn idle(state: &Path) -> Result<bool> {
    Ok(!process_identity::lock_held(&state.join("daemon.lock"))?
        && !process_identity::lock_held(&state.join("supervisor.lock"))?)
}
fn require_idle(state: &Path) -> Result<()> {
    if idle(state)? {
        Ok(())
    } else {
        Err("仍有调度进程持锁，未删除恢复备份或运行锁；重启后再卸载".into())
    }
}

fn mirror_paths(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut result = vec![PathBuf::from("/sdcard/Android/NovaSched")];
    for root in roots {
        let Ok(users) = fs::read_dir(root) else {
            continue;
        };
        for user in users.flatten() {
            let name = user.file_name();
            let Some(name) = name.to_str() else { continue };
            if !name.is_empty()
                && name.bytes().all(|b| b.is_ascii_digit())
                && user.file_type().is_ok_and(|kind| kind.is_dir())
            {
                result.push(user.path().join("Android/NovaSched"));
            }
        }
    }
    result
}

fn pending_storage_users(roots: &[PathBuf]) -> BTreeSet<u32> {
    let mut users = BTreeSet::new();
    let mut seen = false;
    for root in roots {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                continue;
            }
            let Ok(id) = entry.file_name().to_string_lossy().parse::<u32>() else {
                continue;
            };
            seen = true;
            let accessible = roots.iter().any(|base| {
                fs::symlink_metadata(base.join(id.to_string()).join("Android"))
                    .is_ok_and(|meta| meta.is_dir())
            });
            if !accessible {
                users.insert(id);
            }
        }
    }
    if !seen && !Path::new("/sdcard/Android").is_dir() {
        users.insert(0);
    }
    users
}

fn defer_storage_cleanup(users: &BTreeSet<u32>) -> Result<()> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let script = PathBuf::from(format!(
        "/data/adb/service.d/novasched-uninstall-cleanup-{}-{stamp}.sh",
        util::current_pid()
    ));
    util::atomic_write(&script, storage_cleanup_script(users).as_bytes(), 0o700)?;
    // Root managers also run this one-time service.d script on subsequent
    // boots if storage stays locked or the phone reboots before cleanup.
    let mut command = Command::new("/system/bin/sh");
    command
        .arg(&script)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    unsafe {
        command.pre_exec(|| {
            if ffi::setsid() < 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    if let Err(error) = command.spawn() {
        println!("  清理脚本已保存，将在下次开机解锁后执行：{error}");
    }
    Ok(())
}

fn storage_cleanup_script(users: &BTreeSet<u32>) -> String {
    let ids = users
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "#!/system/bin/sh\nNOVA_USERS='{ids}'\n{}",
        include_str!("storage_cleanup.sh")
    )
}

fn remove_owned_tree(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() => fs::remove_dir_all(path),
        Ok(_) => fs::remove_file(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("读取 {} 失败：{error}", path.display())),
    }
    .map_err(|e| format!("清理 {} 失败：{e}", path.display()))
}

fn cleanup(module: &Path, state: &Path, mirrors: &[PathBuf], pending: &[PathBuf]) -> Vec<String> {
    let mut errors = Vec::new();
    // All supplied paths belong to this module. Never recurse into a symlink.
    for mirror in mirrors {
        if let Err(error) = remove_owned_tree(mirror) {
            errors.push(error);
        }
    }
    for path in pending {
        if path == module {
            continue;
        }
        let missing_owned = path
            .file_name()
            .is_some_and(|name| name == "NovaSched_Zen_Edition")
            && !path.join("module.prop").exists();
        match util::read_text(&path.join("module.prop")) {
            Ok(prop) if prop.lines().any(|line| line == "id=NovaSched_Zen_Edition") => {
                if let Err(error) = remove_owned_tree(path) {
                    errors.push(error);
                }
            }
            Err(_) if missing_owned => {
                if let Err(error) = remove_owned_tree(path) {
                    errors.push(error);
                }
            }
            _ => {}
        }
    }
    if let Ok(entries) = fs::read_dir(module) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name == "boot-entry.log"
                || (name.starts_with("install-")
                    && (name.ends_with(".log") || name.ends_with(".exit")))
            {
                if let Err(error) = remove_owned_tree(&entry.path()) {
                    errors.push(error);
                }
            }
        }
    }
    if let Err(error) = remove_owned_tree(state) {
        errors.push(error);
    }
    errors
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    fn fixture(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("nova-uninstall-{}-{name}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn removes_nested_state_logs_and_pending_upgrade_but_keeps_other_modules() {
        let root = fixture("all");
        let module = root.join("module");
        let state = root.join("state");
        let mirror = root.join("Android/NovaSched");
        let pending = root.join("update/NovaSched_Zen_Edition");
        let foreign = root.join("update/foreign");
        let incomplete = root.join("incomplete/NovaSched_Zen_Edition");
        for dir in [
            &module,
            &state.join("scene-provider"),
            &mirror,
            &pending,
            &foreign,
            &incomplete,
        ] {
            fs::create_dir_all(dir).unwrap();
        }
        for file in [
            "config.json",
            "automatic.json",
            "webui.session",
            "stock_snapshot.tsv",
            "daemon.identity",
            "novasched.log",
            "scene-provider/powercfg.json.backup",
        ] {
            fs::write(state.join(file), b"saved").unwrap();
        }
        fs::write(module.join("install-check.log"), b"log").unwrap();
        fs::write(module.join("install-scene-status.exit"), b"124").unwrap();
        fs::write(module.join("module.prop"), b"id=NovaSched_Zen_Edition\n").unwrap();
        fs::write(mirror.join("log.txt"), b"mirror").unwrap();
        fs::write(mirror.join("log.log.1"), b"old").unwrap();
        fs::write(pending.join("module.prop"), b"id=NovaSched_Zen_Edition\n").unwrap();
        fs::write(foreign.join("module.prop"), b"id=another_module\n").unwrap();
        assert!(cleanup(
            &module,
            &state,
            &[mirror.clone()],
            &[pending.clone(), foreign.clone(), incomplete.clone()]
        )
        .is_empty());
        assert!(!state.exists() && !mirror.exists() && !pending.exists());
        assert!(!incomplete.exists());
        assert!(foreign.join("module.prop").exists() && module.join("module.prop").exists());
        assert!(
            !module.join("install-check.log").exists()
                && !module.join("install-scene-status.exit").exists()
        );
        assert!(
            cleanup(&module, &state, &[mirror], &[pending]).is_empty(),
            "repeat uninstall must be harmless"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn removing_a_log_link_preserves_its_foreign_target() {
        let root = fixture("link");
        let other = root.join("other");
        fs::create_dir(&other).unwrap();
        fs::write(other.join("keep"), b"user data").unwrap();
        let owned = root.join("NovaSched");
        symlink(&other, &owned).unwrap();
        remove_owned_tree(&owned).unwrap();
        assert_eq!(fs::read(other.join("keep")).unwrap(), b"user data");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn running_daemon_or_supervisor_blocks_deletion() {
        let state = fixture("locks");
        fs::write(state.join("stock_snapshot.tsv"), b"backup").unwrap();
        for file in ["daemon.lock", "supervisor.lock"] {
            let lock = util::acquire_flock(&state.join(file)).unwrap();
            assert!(require_idle(&state).is_err());
            assert!(state.join("stock_snapshot.tsv").exists());
            drop(lock);
        }
        require_idle(&state).unwrap();
        fs::remove_dir_all(state).unwrap();
    }
    #[test]
    fn finds_all_numeric_users_without_traversing_user_symlinks() {
        let root = fixture("users");
        let storage = root.join("emulated");
        for user in ["0", "10", "legacy", "self"] {
            fs::create_dir_all(storage.join(user)).unwrap();
        }
        symlink(storage.join("0"), storage.join("11")).unwrap();
        let paths = mirror_paths(&[storage.clone()]);
        assert!(paths.contains(&storage.join("0/Android/NovaSched")));
        assert!(paths.contains(&storage.join("10/Android/NovaSched")));
        assert!(!paths.iter().any(|p| p.starts_with(storage.join("11"))
            || p.starts_with(storage.join("self"))
            || p.starts_with(storage.join("legacy"))));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn queues_locked_users_but_accessible_storage_is_cleaned_immediately() {
        let root = fixture("locked");
        let raw = root.join("media");
        let mounted = root.join("emulated");
        fs::create_dir_all(raw.join("0")).unwrap();
        fs::create_dir_all(raw.join("10")).unwrap();
        fs::create_dir_all(mounted.join("0/Android")).unwrap();
        assert_eq!(
            pending_storage_users(&[raw.clone(), mounted.clone()]),
            BTreeSet::from([10])
        );
        fs::create_dir(raw.join("10/Android")).unwrap();
        assert!(pending_storage_users(&[raw, mounted]).is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
