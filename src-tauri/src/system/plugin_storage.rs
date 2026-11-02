// OpenRevo - Plugin Sandboxed Storage Engine
// Provides isolated, persistent, path-traversal-guarded storage for each plugin.
// Base directory: <get_config_dir()>/plugin_storage/<plugin_id>/

use std::fs;
use std::path::{Path, PathBuf};

/// Validate plugin ID to strictly forbid directory traversal and malicious characters
fn validate_plugin_id(plugin_id: &str) -> Result<&str, String> {
    let trimmed = plugin_id.trim();
    if trimmed.is_empty() {
        return Err("Plugin ID cannot be empty".to_string());
    }
    // Only allow alphanumeric, underscore, dot, and hyphen
    if !trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.') || trimmed.contains("..") {
        return Err(format!("Invalid plugin ID '{}': only alphanumeric characters, underscores and hyphens are allowed, and path separators are strictly forbidden", plugin_id));
    }
    Ok(trimmed)
}

/// Retrieve and ensure the private sandboxed directory for a plugin
pub fn get_plugin_storage_dir(plugin_id: &str) -> Result<PathBuf, String> {
    let valid_id = validate_plugin_id(plugin_id)?;
    let base = crate::system::config::get_config_dir().join("plugin_storage").join(valid_id);
    fs::create_dir_all(&base).map_err(|e| format!("Failed to create the plugin private storage directory: {}", e))?;
    Ok(base)
}

/// Resolve a relative path inside the plugin's sandbox, enforcing strict boundary containment
fn resolve_sandboxed_path(plugin_id: &str, rel_path: &str) -> Result<PathBuf, String> {
    let storage_dir = get_plugin_storage_dir(plugin_id)?;
    let clean_rel = rel_path.trim().replace('\\', "/");
    let clean_rel = clean_rel.trim_start_matches('/');

    if clean_rel.is_empty() {
        return Err("The path cannot be empty".to_string());
    }

    // Strict traversal detection
    if clean_rel.contains("..") || clean_rel.contains(':') {
        return Err("Invalid path: '..' and drive identifiers are strictly forbidden".to_string());
    }

    let target_path = storage_dir.join(clean_rel);

    // Ensure parent dir exists if target has subdirectories
    if let Some(parent) = target_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    Ok(target_path)
}

/// Atomically write bytes to a file using temporary file swap
fn atomic_write_file(path: &Path, content: &[u8]) -> Result<(), String> {
    let tmp_path = path.with_extension(format!("tmp.{}", std::process::id()));
    fs::write(&tmp_path, content).map_err(|e| format!("Failed to write the temporary storage file: {}", e))?;
    fs::rename(&tmp_path, path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to atomically rename the storage file: {}", e)
    })
}

// ==========================================
// Level 1: Declarative Key-Value / JSON Config Storage
// ==========================================

/// Read plugin's primary config.json
pub fn get_plugin_storage(plugin_id: &str) -> Result<serde_json::Value, String> {
    let config_file = resolve_sandboxed_path(plugin_id, "config.json")?;
    if !config_file.exists() {
        return Ok(serde_json::json!({}));
    }

    let text = fs::read_to_string(&config_file).map_err(|e| format!("Failed to read the plugin configuration: {}", e))?;
    let val: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({}));
    Ok(val)
}

/// Save plugin's primary config.json atomically
pub fn set_plugin_storage(plugin_id: &str, data: serde_json::Value) -> Result<(), String> {
    let config_file = resolve_sandboxed_path(plugin_id, "config.json")?;
    let json_bytes = serde_json::to_vec_pretty(&data).map_err(|e| format!("Failed to serialize the plugin configuration: {}", e))?;
    atomic_write_file(&config_file, &json_bytes)
}

// ==========================================
// Level 2: Sandboxed File System Storage (Profiles, Curves, Presets)
// ==========================================

/// Read arbitrary UTF-8 text file within plugin sandbox
pub fn read_plugin_file(plugin_id: &str, path: &str) -> Result<String, String> {
    let target = resolve_sandboxed_path(plugin_id, path)?;
    if !target.exists() || !target.is_file() {
        return Err(format!("The file does not exist: {}", path));
    }
    fs::read_to_string(&target).map_err(|e| format!("Failed to read the file: {}", e))
}

/// Write arbitrary UTF-8 text file within plugin sandbox
pub fn write_plugin_file(plugin_id: &str, path: &str, content: &str) -> Result<(), String> {
    let target = resolve_sandboxed_path(plugin_id, path)?;
    atomic_write_file(&target, content.as_bytes())
}

/// Delete a file within plugin sandbox
pub fn delete_plugin_file(plugin_id: &str, path: &str) -> Result<bool, String> {
    let target = resolve_sandboxed_path(plugin_id, path)?;
    if target.exists() && target.is_file() {
        fs::remove_file(&target).map_err(|e| format!("Failed to delete the file: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// List files inside plugin sandbox or subfolder
pub fn list_plugin_files(plugin_id: &str, sub_dir: Option<String>) -> Result<Vec<String>, String> {
    let base = match sub_dir {
        Some(ref s) if !s.trim().is_empty() => resolve_sandboxed_path(plugin_id, s)?,
        _ => get_plugin_storage_dir(plugin_id)?,
    };

    if !base.exists() || !base.is_dir() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            if let Ok(name) = entry.file_name().into_string() {
                results.push(name);
            }
        }
    }
    results.sort();
    Ok(results)
}

