//! Process reader for Scene diagnostics. A live or exiting process cannot
//! establish that Scene is installed for the current Android user.
use crate::util::Result;
use std::fs;
use std::io::Read;
use std::path::Path;

pub fn process_running_at(root: &Path, package: &str) -> Result<bool> {
    let entries = fs::read_dir(root).map_err(|e| format!("读取进程目录失败: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取进程记录失败: {e}"))?;
        if !entry
            .file_name()
            .to_str()
            .is_some_and(|pid| !pid.is_empty() && pid.bytes().all(|b| b.is_ascii_digit()))
        {
            continue;
        }
        let mut bytes = Vec::new();
        match fs::File::open(entry.path().join("cmdline"))
            .and_then(|f| f.take(4096).read_to_end(&mut bytes))
        {
            Ok(_) => {}
            Err(_) => continue, // kernel tasks/exiting tasks/denied processes are not evidence.
        }
        let first = bytes.split(|b| *b == 0).next().unwrap_or(&[]);
        if first == package.as_bytes()
            || first
                .strip_prefix(package.as_bytes())
                .is_some_and(|rest| rest.first() == Some(&b':'))
        {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    const PACKAGE: &str = "com.omarea.vtools";
    #[test]
    fn process_names_are_exact_and_stale_app_directories_are_not_installation_evidence() {
        let root = std::env::temp_dir().join(format!("nova-proc-{}", std::process::id()));
        fs::create_dir_all(root.join("42")).unwrap();
        fs::write(
            root.join("42/cmdline"),
            b"com.omarea.vtools.fake\0com.omarea.vtools\0",
        )
        .unwrap();
        assert!(!process_running_at(&root, PACKAGE).unwrap());
        fs::write(root.join("42/cmdline"), b"com.omarea.vtools:worker\0").unwrap();
        assert!(process_running_at(&root, PACKAGE).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
