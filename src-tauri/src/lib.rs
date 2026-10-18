
use once_cell::sync::Lazy;
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
};
use tauri::{Emitter, Manager, State};

struct ServerProcess {
    child: Mutex<Option<Child>>,
}

static SERVER: Lazy<ServerProcess> = Lazy::new(|| ServerProcess {
    child: Mutex::new(None),
});

#[tauri::command]
fn get_minecraft_status() -> String {
    match Command::new("pgrep")
        .args(["-af", "paper.*\\.jar"])
        .output()
    {
        Ok(result) if result.status.success() => {
            String::from_utf8_lossy(&result.stdout).to_string()
        }
        Ok(_) => String::new(),
        Err(error) => format!("ERROR: {error}"),
    }
}

#[tauri::command]
fn start_minecraft_server(
    app: tauri::AppHandle,
    state: State<'_, ServerProcess>,
) -> Result<String, String> {
    let mut slot = state
        .child
        .lock()
        .map_err(|_| "Server state lock failed".to_string())?;

    if let Some(child) = slot.as_mut() {
        if child
            .try_wait()
            .map_err(|e| format!("Could not check server process: {e}"))?
            .is_none()
        {
            return Err("The server is already running.".into());
        }
    }

    let mut child = Command::new("java")
        .args([
            "-Xms1G",
            "-Xmx3G",
            "-jar",
            "paper-26.3-205.jar",
            "--nogui",
        ])
        .current_dir("/home/chaitanya/minecraft-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start Paper: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not capture server output".to_string())?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not capture server errors".to_string())?;

    let pid = child.id();
    *slot = Some(child);
    drop(slot);

    let stdout_app = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(line) => {
                    let _ = stdout_app.emit("server-console", line);
                }
                Err(_) => break,
            }
        }
    });

    thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            match line {
                Ok(line) => {
                    let _ = app.emit("server-console", format!("[stderr] {line}"));
                }
                Err(_) => break,
            }
        }
    });

    Ok(format!("Paper process started (PID {pid})."))
}

#[tauri::command]
fn send_minecraft_command(
    command: String,
    state: State<'_, ServerProcess>,
) -> Result<(), String> {
    let command = command.trim();

    if command.is_empty() {
        return Err("Enter a command first.".into());
    }

    let mut slot = state
        .child
        .lock()
        .map_err(|_| "Server state lock failed".to_string())?;

    let child = slot
        .as_mut()
        .ok_or_else(|| "Start the server from BlockPanel first.".to_string())?;

    if child
        .try_wait()
        .map_err(|e| format!("Could not check server process: {e}"))?
        .is_some()
    {
        *slot = None;
        return Err("The server is no longer running.".into());
    }

    let stdin = child
        .stdin
        .as_mut()
        .ok_or_else(|| "Server console input is unavailable.".to_string())?;

    writeln!(stdin, "{command}")
        .map_err(|e| format!("Could not send command: {e}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ServerProcess {
            child: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_minecraft_status,
            start_minecraft_server,
            send_minecraft_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
