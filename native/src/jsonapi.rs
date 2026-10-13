//! NovaSched JSON API（v2.4.0 原生客户端契约层）。
//!
//! 固定监听 127.0.0.1:31416，纯 JSON 指令：
//! `{"cmd":"get_status"}`、`{"cmd":"set_profile","profile":"performance"}`、
//! `{"cmd":"set_auto","enabled":true}`、规则增删查、日志流订阅与清空。
//! 仅回环监听、只暴露调度控制面（无 shell、无文件写入面）；内核操作仍全部
//! 由调度主循环执行，这里只是与旧 WebUI 并列的第二个状态/指令入口。
//! 注意：按接口契约本端点不做来源认证；回环外无法访问，但同机应用皆可连接，
//! 因此指令面收敛为调度控制，不提供任何越权能力。

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::os::fd::AsRawFd;
use std::os::unix::fs::MetadataExt;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::logging::Logger;
use crate::util::Result;
use crate::websocket::{self, WebState};

const PORT: u16 = 31416;

pub fn start(
    state: WebState,
    logger: Logger,
    stop: Arc<AtomicBool>,
) -> Result<(JoinHandle<()>, u16)> {
    let listener = TcpListener::bind(("127.0.0.1", PORT))
        .map_err(|e| format!("JSON API 无法绑定 127.0.0.1:{PORT}: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("JSON API 设置非阻塞失败: {e}"))?;
    let handle = thread::Builder::new()
        .name("cts-jsonapi".to_string())
        .spawn(move || {
            logger.info(format!("JSON API 已监听 127.0.0.1:{PORT}"));
            while !stop.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let client_state = state.clone();
                        let client_logger = logger.clone();
                        let client_stop = stop.clone();
                        if let Err(error) = thread::Builder::new()
                            .name("novasched-json-client".to_string())
                            .spawn(move || {
                                if let Err(error) =
                                    handle_connection(stream, client_state, &client_logger, client_stop)
                                {
                                    client_logger.debug(format!("JSON API 客户端断开: {error}"));
                                }
                            })
                        {
                            logger.error(format!("创建 JSON API 客户线程失败: {error}"));
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        let mut fd = crate::ffi::PollFd {
                            fd: listener.as_raw_fd(),
                            events: crate::ffi::POLLIN,
                            revents: 0,
                        };
                        if unsafe { crate::ffi::poll(&mut fd, 1, 1000) } < 0
                            && std::io::Error::last_os_error().kind()
                                != std::io::ErrorKind::Interrupted
                        {
                            thread::sleep(Duration::from_secs(1));
                        }
                    }
                    Err(error) => {
                        logger.error(format!("JSON API accept 失败: {error}"));
                        thread::sleep(Duration::from_millis(500));
                    }
                }
            }
        })
        .map_err(|e| format!("创建 JSON API 线程失败: {e}"))?;
    Ok((handle, PORT))
}

fn handle_connection(
    mut stream: TcpStream,
    state: WebState,
    logger: &Logger,
    stop: Arc<AtomicBool>,
) -> Result<()> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    websocket_handshake(&mut stream)?;
    stream
        .set_read_timeout(Some(Duration::from_millis(300)))
        .map_err(|e| e.to_string())?;
    websocket::send_text(&mut stream, &status_json(&state))?;

    let mut streaming = false;
    let mut position = 0u64;
    let mut inode = 0u64;
    let mut last_seen = Instant::now();
    let mut heartbeat = Instant::now();

    while !stop.load(Ordering::Relaxed) {
        if streaming {
            let chunk = read_log_chunk(logger, &mut position, &mut inode)?;
            if !chunk.is_empty() {
                let lines: Vec<String> = chunk
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .map(log_line_json)
                    .collect();
                if !lines.is_empty() {
                    websocket::send_text(
                        &mut stream,
                        &format!("{{\"type\":\"logs\",\"lines\":[{}]}}", lines.join(",")),
                    )?;
                }
            }
        }

        match websocket::read_frame(&mut stream)? {
            websocket::Frame::Text(message) => {
                last_seen = Instant::now();
                let reply = handle_command(&state, logger, &message, &mut streaming, &mut position, &mut inode);
                websocket::send_text(&mut stream, &reply)?;
                if streaming && message.contains("stream_logs") {
                    // 开启订阅即补发最近一段日志，界面不必等下一条新日志。
                    if let Some(history) = recent_logs(logger, 8192) {
                        let lines: Vec<String> = history
                            .lines()
                            .filter(|l| !l.trim().is_empty())
                            .map(log_line_json)
                            .collect();
                        if !lines.is_empty() {
                            websocket::send_text(
                                &mut stream,
                                &format!("{{\"type\":\"logs\",\"lines\":[{}]}}", lines.join(",")),
                            )?;
                        }
                    }
                }
            }
            websocket::Frame::Ping(data) => websocket::send_control(&mut stream, 0xA, &data)?,
            websocket::Frame::Close => return Ok(()),
            websocket::Frame::Timeout | websocket::Frame::Ignore => {}
        }
        if last_seen.elapsed() > Duration::from_secs(60) {
            return Err("JSON API 客户端心跳超时".into());
        }
        if heartbeat.elapsed() >= Duration::from_secs(15) {
            websocket::send_control(&mut stream, 0x9, b"nova")?;
            heartbeat = Instant::now();
        }
    }
    Ok(())
}

/// 最小 WebSocket 握手：按接口契约不校验 Origin / 子协议 / 会话令牌。
fn websocket_handshake(stream: &mut TcpStream) -> Result<()> {
    let mut buffer = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match stream.read(&mut byte) {
            Ok(0) => return Err("握手连接提前关闭".into()),
            Ok(_) => {
                buffer.push(byte[0]);
                if buffer.ends_with(b"\r\n\r\n") || buffer.len() > 8192 {
                    break;
                }
            }
            Err(error) => return Err(format!("读取握手失败: {error}")),
        }
    }
    let text = String::from_utf8_lossy(&buffer);
    let key = text
        .split("\r\n")
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("sec-websocket-key")
                .then(|| value.trim().to_string())
        })
        .ok_or("握手缺少 Sec-WebSocket-Key")?;
    let accept = websocket::websocket_accept(&key);
    stream
        .write_all_const(
            format!("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"),
        )
        .map_err(|e| format!("写入握手响应失败: {e}"))?;
    Ok(())
}

trait WriteAllConst {
    fn write_all_const(&mut self, data: String) -> std::io::Result<()>;
}
impl WriteAllConst for TcpStream {
    fn write_all_const(&mut self, data: String) -> std::io::Result<()> {
        use std::io::Write;
        self.write_all(data.as_bytes())
    }
}

fn handle_command(
    state: &WebState,
    logger: &Logger,
    message: &str,
    streaming: &mut bool,
    position: &mut u64,
    inode: &mut u64,
) -> String {
    let parsed = match crate::json::parse(message) {
        Ok(value) => value,
        Err(_) => return error_json("指令不是有效 JSON"),
    };
    let cmd = match parsed.get("cmd").ok().and_then(|v| v.as_str().ok()) {
        Some(cmd) => cmd.to_string(),
        None => return error_json("缺少 cmd 字段"),
    };
    match cmd.as_str() {
        "get_status" => status_json(state),
        "set_profile" => {
            let Some(profile) = parsed.get("profile").ok().and_then(|v| v.as_str().ok()) else {
                return error_json("缺少 profile 字段");
            };
            if !crate::app_modes::supported(profile) {
                return format!(
                    "{{\"type\":\"ack\",\"ok\":false,\"error\":\"未知档位 {profile}\"}}"
                );
            }
            match state.app_modes.set_rule("*", profile).and_then(|_| state.automatic.set_enabled(false)) {
                Ok(()) => {
                    state.changed();
                    logger.info(format!("JSON API 切换默认档位: {profile}"));
                    "{\"type\":\"ack\",\"ok\":true}".to_string()
                }
                Err(e) => format!("{{\"type\":\"ack\",\"ok\":false,\"error\":\"{}\"}}", websocket::json_escape(&e)),
            }
        }
        "set_auto" => {
            let Some(enabled) = parsed.get("enabled").ok().and_then(|v| v.as_bool().ok()) else {
                return error_json("缺少 enabled 字段");
            };
            match state.automatic.set_enabled(enabled) {
                Ok(()) => {
                    state.changed();
                    logger.info(format!("JSON API 自动调度: {enabled}"));
                    "{\"type\":\"ack\",\"ok\":true}".to_string()
                }
                Err(e) => format!("{{\"type\":\"ack\",\"ok\":false,\"error\":\"{}\"}}", websocket::json_escape(&e)),
            }
        }
        "get_rules" => {
            let mut rules = Vec::new();
            for (package, mode) in state.app_modes.rules() {
                if package == "*" {
                    continue;
                }
                rules.push(format!(
                    "{{\"package\":\"{}\",\"mode\":\"{}\",\"userId\":0}}",
                    websocket::json_escape(&package),
                    websocket::json_escape(&mode)
                ));
            }
            format!("{{\"type\":\"rules\",\"rules\":[{}]}}", rules.join(","))
        }
        "set_rule" => {
            let (Some(package), Some(mode)) = (
                parsed.get("package").ok().and_then(|v| v.as_str().ok()),
                parsed.get("mode").ok().and_then(|v| v.as_str().ok()),
            ) else {
                return error_json("缺少 package/mode 字段");
            };
            match state.app_modes.set_rule(package, mode) {
                Ok(()) => {
                    state.changed();
                    logger.info(format!("JSON API 保存规则: {package} -> {mode}"));
                    "{\"type\":\"ack\",\"ok\":true}".to_string()
                }
                Err(e) => format!("{{\"type\":\"ack\",\"ok\":false,\"error\":\"{}\"}}", websocket::json_escape(&e)),
            }
        }
        "delete_rule" => {
            let Some(package) = parsed.get("package").ok().and_then(|v| v.as_str().ok()) else {
                return error_json("缺少 package 字段");
            };
            match state.app_modes.remove_rule(package) {
                Ok(()) => {
                    state.changed();
                    logger.info(format!("JSON API 删除规则: {package}"));
                    "{\"type\":\"ack\",\"ok\":true}".to_string()
                }
                Err(e) => format!("{{\"type\":\"ack\",\"ok\":false,\"error\":\"{}\"}}", websocket::json_escape(&e)),
            }
        }
        // 配置面 v1：返回当前运行态的各簇上限百分比（真实生效值）。
        // 写入（set_config/reset_config）留待配置管线接入后开放，明确拒绝而非假成功。
        "get_config" => config_json(),
        "set_config" | "reset_config" => {
            "{\"type\":\"ack\",\"ok\":false,\"error\":\"配置写入将在下一版守护进程开放\"}".to_string()
        }
        "stream_logs" => {
            *streaming = parsed
                .get("enable")
                .ok()
                .and_then(|v| v.as_bool().ok())
                .unwrap_or(true);
            if *streaming {
                *position = 0;
                *inode = 0;
            }
            "{\"type\":\"ack\",\"ok\":true}".to_string()
        }
        "clear_logs" => {
            let path = logger.persistent_path();
            match fs::write(path, b"") {
                Ok(()) => {
                    *position = 0;
                    *inode = 0;
                    "{\"type\":\"ack\",\"ok\":true}".to_string()
                }
                Err(e) => format!("{{\"type\":\"ack\",\"ok\":false,\"error\":\"{}\"}}", websocket::json_escape(&e.to_string())),
            }
        }
        other => format!("{{\"type\":\"error\",\"message\":\"未知指令 {}\"}}", websocket::json_escape(other)),
    }
}

/// 组装状态 JSON：基础字段取自旧状态载荷（同一数据源，口径一致），
/// 频率/温度由守护进程侧实时读取节点（守护进程自身允许读 sysfs）。
fn status_json(state: &WebState) -> String {
    let base = websocket::payload(state, false);
    let parsed = crate::json::parse(&base).ok();
    let field = |name: &str| -> String {
        parsed
            .as_ref()
            .and_then(|v| v.get(name).ok())
            .and_then(|v| v.as_str().ok())
            .unwrap_or("")
            .to_string()
    };
    let bool_field = |name: &str| -> bool {
        parsed
            .as_ref()
            .and_then(|v| v.get(name).ok())
            .and_then(|v| v.as_str().ok())
            .map(|v| v == "true")
            .unwrap_or(false)
    };
    let automatic = bool_field("automaticEnabled");
    let mut clusters = Vec::new();
    for (policy, cur, min, max) in cluster_frequencies() {
        clusters.push(format!(
            "{{\"policy\":\"{}\",\"cur\":{},\"min\":{},\"max\":{}}}",
            websocket::json_escape(&policy), cur, min, max
        ));
    }
    let (cpu_temp, battery_temp) = temperatures();
    let temp_field = |value: f64| {
        if value.is_nan() {
            "null".to_string()
        } else {
            format!("{value:.1}")
        }
    };
    format!(
        "{{\"type\":\"status\",\"version\":\"{}\",\"alive\":true,\"phase\":\"{}\",\"soc\":\"{}\",\"profile\":\"{}\",\"effective\":\"{}\",\"automatic\":{},\"foreground\":\"{}\",\"clusters\":[{}],\"cpu_temp\":{},\"battery_temp\":{}}}",
        websocket::json_escape(&field("version")),
        websocket::json_escape(&field("phase")),
        websocket::json_escape(&field("socName")),
        websocket::json_escape(&field("defaultMode")),
        websocket::json_escape(&field("effectiveMode")),
        automatic,
        websocket::json_escape(&field("currentPackage")),
        clusters.join(","),
        temp_field(cpu_temp),
        temp_field(battery_temp),
    )
}

fn config_json() -> String {
    let mut freq = Vec::new();
    for (policy, _cur, _min, max) in cluster_frequencies() {
        let physical = physical_max(&policy).unwrap_or(max);
        if physical > 0 && max > 0 {
            let pct = ((max as f64 / physical as f64) * 100.0).round().clamp(0.0, 100.0) as i64;
            freq.push(format!("\"{}\":{}", websocket::json_escape(&policy), pct));
        }
    }
    format!(
        "{{\"type\":\"config\",\"config\":{{\"freq_pct\":{{{}}},\"uclamp_min\":0,\"uclamp_max\":100,\"input_boost\":false,\"launch_boost\":false}}}}",
        freq.join(",")
    )
}

fn cluster_frequencies() -> Vec<(String, i64, i64, i64)> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir("/sys/devices/system/cpu/cpufreq") else {
        return out;
    };
    let mut policies: Vec<String> = entries
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.starts_with("policy") && n[6..].chars().all(|c| c.is_ascii_digit()))
        .collect();
    policies.sort_by_key(|name| name[6..].parse::<u32>().unwrap_or(0));
    for policy in policies {
        let read = |file: &str| -> i64 {
            fs::read_to_string(format!("/sys/devices/system/cpu/cpufreq/{policy}/{file}"))
                .ok()
                .and_then(|t| t.trim().parse::<i64>().ok())
                .unwrap_or(0)
        };
        let cur = read("scaling_cur_freq");
        let min = read("scaling_min_freq");
        let max = read("scaling_max_freq");
        if max > 0 {
            out.push((policy, cur, min, max));
        }
    }
    out
}

fn physical_max(policy: &str) -> Option<i64> {
    for name in ["cpuinfo_max_freq", "scaling_boost_frequencies"] {
        if let Ok(text) = fs::read_to_string(format!("/sys/devices/system/cpu/cpufreq/{policy}/{name}")) {
            let best = text
                .split_whitespace()
                .filter_map(|t| t.parse::<i64>().ok())
                .max();
            if let Some(value) = best {
                return Some(value);
            }
        }
    }
    None
}

fn temperatures() -> (f64, f64) {
    let mut cpu = f64::NAN;
    let mut battery = f64::NAN;
    let Ok(entries) = fs::read_dir("/sys/class/thermal") else {
        return (cpu, battery);
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("thermal_zone") {
            continue;
        }
        let Ok(kind) = fs::read_to_string(entry.path().join("type")) else {
            continue;
        };
        let kind = kind.trim().to_ascii_lowercase();
        let Ok(temp) = fs::read_to_string(entry.path().join("temp")) else {
            continue;
        };
        let Ok(milli) = temp.trim().parse::<f64>() else {
            continue;
        };
        let celsius = milli / 1000.0;
        if kind.contains("cpu") && (cpu.is_nan() || celsius > cpu) {
            cpu = celsius;
        } else if kind == "battery" && battery.is_nan() {
            battery = celsius;
        }
    }
    (cpu, battery)
}

/// 增量读取权威日志；跨轮转（inode 变化）时回退到文件尾部 32KiB。
fn read_log_chunk(logger: &Logger, position: &mut u64, inode: &mut u64) -> Result<String> {
    let mut file = File::open(logger.persistent_path()).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if *inode != meta.ino() || meta.len() < *position {
        *position = meta.len().saturating_sub(32768);
        *inode = meta.ino();
    }
    file.seek(SeekFrom::Start(*position)).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(16384).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    let consumed = match std::str::from_utf8(&bytes) {
        Ok(_) => bytes.len(),
        Err(e) if e.error_len().is_none() => e.valid_up_to(),
        Err(_) => bytes.len(),
    };
    *position += consumed as u64;
    Ok(String::from_utf8_lossy(&bytes[..consumed]).into_owned())
}

fn recent_logs(logger: &Logger, limit: u64) -> Option<String> {
    let mut file = File::open(logger.persistent_path()).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(limit))).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    // 掐掉可能被截断的首行
    let start = text.find('\n').map(|i| i + 1).unwrap_or(0);
    Some(text[start..].to_string())
}

/// 把守护日志行转成客户端协议对象：`2026-10-13 07:00:00 信息 -> 文本`。
fn log_line_json(line: &str) -> String {
    let raw = websocket::json_escape(line);
    let bytes = line.as_bytes();
    if bytes.len() > 21 && bytes[19] == b' ' {
        let timestamp = &line[..19];
        let rest = &line[20..];
        let (level, message) = if let Some(rest) = rest.strip_prefix("信息 -> ") {
            ("info", rest)
        } else if let Some(rest) = rest.strip_prefix("警告 -> ") {
            ("warn", rest)
        } else if let Some(rest) = rest.strip_prefix("错误 -> ") {
            ("error", rest)
        } else if let Some(rest) = rest.strip_prefix("调试 -> ") {
            ("debug", rest)
        } else {
            ("info", rest)
        };
        return format!(
            "{{\"time\":\"{}\",\"level\":\"{}\",\"message\":\"{}\"}}",
            websocket::json_escape(timestamp),
            level,
            websocket::json_escape(message)
        );
    }
    format!("{{\"time\":\"\",\"level\":\"info\",\"message\":\"{raw}\"}}")
}

fn error_json(message: &str) -> String {
    format!(
        "{{\"type\":\"error\",\"message\":\"{}\"}}",
        websocket::json_escape(message)
    )
}
