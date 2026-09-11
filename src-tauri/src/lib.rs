use serde::{Deserialize, Serialize};
use std::{env, fs, path::Path, process::Command, thread, time::Duration};
use tauri::Manager;

const GNOME_EXTENSION_UUID: &str = "openlbg-live@app.openlbg.wallpapers";
const LEGACY_GNOME_EXTENSION_UUID: &str = "lumina-live@app.lumina.wallpapers";
const GNOME_EXTENSION_BUNDLE: &[u8] =
    include_bytes!("../extension-bundle/openlbg-live@app.openlbg.wallpapers.shell-extension.zip");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyResult {
    desktop_environment: String,
    path: String,
    message: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WallpaperState {
    installed_ids: Vec<u32>,
    current_wallpaper_id: Option<u32>,
    desktop_environment: Option<String>,
}

struct WallpaperAsset {
    filename: &'static str,
    bytes: &'static [u8],
}

fn wallpaper_asset(id: u32) -> Option<WallpaperAsset> {
    match id {
        1 => Some(WallpaperAsset {
            filename: "arctic-solitude.webp",
            bytes: include_bytes!("../../src/assets/arctic-retreat.webp"),
        }),
        2 => Some(WallpaperAsset {
            filename: "particle-current.webp",
            bytes: include_bytes!("../../src/assets/particle-orbit.webp"),
        }),
        3 => Some(WallpaperAsset {
            filename: "midnight-transit.webp",
            bytes: include_bytes!("../../src/assets/night-transit.webp"),
        }),
        4 => Some(WallpaperAsset {
            filename: "silent-aurora.webp",
            bytes: include_bytes!("../../src/assets/arctic-retreat.webp"),
        }),
        5 => Some(WallpaperAsset {
            filename: "violet-gravity.webp",
            bytes: include_bytes!("../../src/assets/particle-orbit.webp"),
        }),
        6 => Some(WallpaperAsset {
            filename: "after-the-rain.webp",
            bytes: include_bytes!("../../src/assets/night-transit.webp"),
        }),
        7 => Some(WallpaperAsset {
            filename: "neon-tides.webp",
            bytes: include_bytes!("../../src/assets/neon-tides.webp"),
        }),
        8 => Some(WallpaperAsset {
            filename: "rain-glass.webp",
            bytes: include_bytes!("../../src/assets/rain-glass.webp"),
        }),
        9 => Some(WallpaperAsset {
            filename: "bioluminescent-garden.webp",
            bytes: include_bytes!("../../src/assets/bioluminescent-garden.webp"),
        }),
        10 => Some(WallpaperAsset {
            filename: "star-map.webp",
            bytes: include_bytes!("../../src/assets/star-map.webp"),
        }),
        11 => Some(WallpaperAsset {
            filename: "liquid-chrome.webp",
            bytes: include_bytes!("../../src/assets/liquid-chrome.webp"),
        }),
        12 => Some(WallpaperAsset {
            filename: "digital-sand.webp",
            bytes: include_bytes!("../../src/assets/digital-sand.webp"),
        }),
        13 => Some(WallpaperAsset {
            filename: "deep-sea-pulse.webp",
            bytes: include_bytes!("../../src/assets/deep-sea-pulse.webp"),
        }),
        14 => Some(WallpaperAsset {
            filename: "stillwater-dawn.webp",
            bytes: include_bytes!("../../src/assets/stillwater-dawn.webp"),
        }),
        15 => Some(WallpaperAsset {
            filename: "chromatic-flow.webp",
            bytes: include_bytes!("../../src/assets/chromatic-flow.webp"),
        }),
        16 => Some(WallpaperAsset {
            filename: "magnetic-grid.webp",
            bytes: include_bytes!("../../src/assets/magnetic-grid.webp"),
        }),
        17 => Some(WallpaperAsset {
            filename: "diamond-ignition.webp",
            bytes: include_bytes!("../../src/assets/diamond-ignition.webp"),
        }),
        18 => Some(WallpaperAsset {
            filename: "radial-constellation.webp",
            bytes: include_bytes!("../../src/assets/radial-constellation.webp"),
        }),
        19 => Some(WallpaperAsset {
            filename: "organic-vector-field.webp",
            bytes: include_bytes!("../../src/assets/organic-vector-field.webp"),
        }),
        20 => Some(WallpaperAsset {
            filename: "granular-signal.webp",
            bytes: include_bytes!("../../src/assets/granular-signal.webp"),
        }),
        _ => None,
    }
}

fn state_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join("wallpaper-state.json")
}

fn read_wallpaper_state(app_data_dir: &Path) -> Result<WallpaperState, String> {
    let path = state_path(app_data_dir);
    if !path.exists() {
        return Ok(WallpaperState::default());
    }
    let bytes = fs::read(&path).map_err(|error| format!("Nelze načíst stav instalací: {error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("Uložený stav instalací je poškozený: {error}"))
}

fn write_wallpaper_state(app_data_dir: &Path, state: &WallpaperState) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("Nelze vytvořit datový adresář aplikace: {error}"))?;
    let path = state_path(app_data_dir);
    let temporary = app_data_dir.join("wallpaper-state.json.tmp");
    let bytes = serde_json::to_vec_pretty(state)
        .map_err(|error| format!("Nelze připravit stav instalací: {error}"))?;
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Nelze uložit stav instalací: {error}"))?;
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Nelze dokončit uložení stavu instalací: {error}"))
}

fn migrate_legacy_data(app_data_dir: &Path) -> Result<(), String> {
    let Some(parent) = app_data_dir.parent() else {
        return Ok(());
    };
    let legacy_dir = parent.join("app.lumina.wallpapers");
    if !legacy_dir.is_dir() || legacy_dir == app_data_dir {
        return Ok(());
    }
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("Nelze připravit datový adresář OpenLBG: {error}"))?;

    for filename in ["wallpaper-state.json", "live-wallpaper.json"] {
        let source = legacy_dir.join(filename);
        let destination = app_data_dir.join(filename);
        if source.is_file() && !destination.exists() {
            fs::copy(&source, &destination)
                .map_err(|error| format!("Nelze převést starší data OpenLBG: {error}"))?;
        }
    }

    let legacy_wallpapers = legacy_dir.join("wallpapers");
    if legacy_wallpapers.is_dir() {
        let wallpaper_dir = app_data_dir.join("wallpapers");
        fs::create_dir_all(&wallpaper_dir)
            .map_err(|error| format!("Nelze připravit adresář tapet OpenLBG: {error}"))?;
        for entry in fs::read_dir(&legacy_wallpapers)
            .map_err(|error| format!("Nelze načíst starší tapety: {error}"))?
        {
            let entry = entry.map_err(|error| format!("Nelze načíst starší tapetu: {error}"))?;
            let source = entry.path();
            let destination = wallpaper_dir.join(entry.file_name());
            if source.is_file() && !destination.exists() {
                fs::copy(&source, &destination)
                    .map_err(|error| format!("Nelze převést starší tapetu: {error}"))?;
            }
        }
    }
    Ok(())
}

fn command_error(program: &str, output: std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        format!(
            "Příkaz {program} skončil s kódem {:?}.",
            output.status.code()
        )
    } else {
        format!("{program}: {stderr}")
    }
}

fn run_command(program: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("Nelze spustit {program}: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(program, output))
    }
}

fn command_exists(program: &str) -> bool {
    env::var_os("PATH")
        .map(|paths| env::split_paths(&paths).any(|path| path.join(program).is_file()))
        .unwrap_or(false)
}

fn desktop_name() -> String {
    env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| env::var("DESKTOP_SESSION"))
        .unwrap_or_else(|_| "unknown".into())
}

fn apply_gsettings(schema: &str, keys: &[&str], value: &str) -> Result<(), String> {
    if !command_exists("gsettings") {
        return Err("V systému chybí nástroj gsettings.".into());
    }
    for key in keys {
        run_command("gsettings", &["set", schema, key, value])?;
    }
    Ok(())
}

fn enable_gnome_live_wallpaper(app_data_dir: &Path, preset: &str) -> Result<(), String> {
    if !command_exists("gnome-extensions") {
        return Err(
            "Pro živé pozadí na GNOME chybí nástroj gnome-extensions (balíček gnome-shell).".into(),
        );
    }
    let config = serde_json::json!({ "preset": preset });
    fs::write(
        app_data_dir.join("live-wallpaper.json"),
        serde_json::to_vec_pretty(&config).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Nelze uložit konfiguraci živé tapety: {error}"))?;

    let bundle_path = app_data_dir.join("openlbg-live-wallpaper.shell-extension.zip");
    fs::write(&bundle_path, GNOME_EXTENSION_BUNDLE)
        .map_err(|error| format!("Nelze připravit GNOME extension: {error}"))?;

    let _ = run_command(
        "gnome-extensions",
        &["disable", LEGACY_GNOME_EXTENSION_UUID],
    );
    let _ = run_command("gnome-extensions", &["disable", GNOME_EXTENSION_UUID]);
    run_command(
        "gnome-extensions",
        &["install", "--force", bundle_path.to_string_lossy().as_ref()],
    )?;
    let mut last_error = String::new();
    for _ in 0..4 {
        match run_command("gnome-extensions", &["enable", GNOME_EXTENSION_UUID]) {
            Ok(()) => return Ok(()),
            Err(error) => last_error = error,
        }
        thread::sleep(Duration::from_millis(300));
    }
    Err(format!(
        "GNOME extension byla nainstalována, ale běžící Shell ji ještě nenačetl. Odhlaste se a znovu přihlaste, potom tapetu aktivujte znovu. Detail: {last_error}"
    ))
}

fn disable_gnome_live_wallpaper() {
    if command_exists("gnome-extensions") {
        let _ = run_command("gnome-extensions", &["disable", GNOME_EXTENSION_UUID]);
        let _ = run_command(
            "gnome-extensions",
            &["disable", LEGACY_GNOME_EXTENSION_UUID],
        );
    }
}

fn apply_kde(path: &Path, uri: &str) -> Result<(), String> {
    let path_string = path.to_string_lossy();
    if command_exists("plasma-apply-wallpaperimage") {
        return run_command("plasma-apply-wallpaperimage", &[path_string.as_ref()]);
    }

    let qdbus = ["qdbus6", "qdbus", "qdbus-qt5"]
        .into_iter()
        .find(|candidate| command_exists(candidate))
        .ok_or_else(|| "KDE vyžaduje plasma-apply-wallpaperimage nebo qdbus6.".to_string())?;
    let quoted_uri = serde_json::to_string(uri).map_err(|error| error.to_string())?;
    let script = format!(
        "var ds=desktops(); for(var i=0;i<ds.length;i++){{var d=ds[i];d.wallpaperPlugin='org.kde.image';d.currentConfigGroup=['Wallpaper','org.kde.image','General'];d.writeConfig('Image',{});}}",
        quoted_uri
    );
    run_command(
        qdbus,
        &[
            "org.kde.plasmashell",
            "/PlasmaShell",
            "org.kde.PlasmaShell.evaluateScript",
            &script,
        ],
    )
}

fn apply_xfce(path: &Path) -> Result<(), String> {
    if !command_exists("xfconf-query") {
        return Err("V systému chybí xfconf-query.".into());
    }
    let output = Command::new("xfconf-query")
        .args(["-c", "xfce4-desktop", "-l"])
        .output()
        .map_err(|error| format!("Nelze načíst nastavení XFCE: {error}"))?;
    if !output.status.success() {
        return Err(command_error("xfconf-query", output));
    }

    let path_string = path.to_string_lossy();
    let properties: Vec<_> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|property| property.ends_with("/last-image"))
        .map(str::to_owned)
        .collect();
    if properties.is_empty() {
        return Err("XFCE nevrátilo žádnou plochu, na kterou lze tapetu nastavit.".into());
    }
    for property in properties {
        run_command(
            "xfconf-query",
            &[
                "-c",
                "xfce4-desktop",
                "-p",
                &property,
                "-s",
                path_string.as_ref(),
            ],
        )?;
    }
    Ok(())
}

fn apply_hyprland(path: &Path) -> Result<(), String> {
    if !command_exists("hyprctl") {
        return Err("V systému chybí hyprctl/hyprpaper.".into());
    }
    let path_string = path.to_string_lossy();
    let wallpaper = format!(",{}", path_string);
    if run_command("hyprctl", &["hyprpaper", "reload", &wallpaper]).is_ok() {
        return Ok(());
    }
    run_command("hyprctl", &["hyprpaper", "preload", path_string.as_ref()])?;
    run_command("hyprctl", &["hyprpaper", "wallpaper", &wallpaper])
}

fn apply_to_desktop(path: &Path) -> Result<String, String> {
    let desktop = desktop_name();
    let normalized = desktop.to_lowercase();
    let uri = format!("file://{}", path.to_string_lossy());

    if normalized.contains("kde") || normalized.contains("plasma") {
        apply_kde(path, &uri)?;
    } else if normalized.contains("ubuntu") || normalized.contains("gnome") {
        apply_gsettings(
            "org.gnome.desktop.background",
            &["picture-uri", "picture-uri-dark"],
            &uri,
        )?;
    } else if normalized.contains("cinnamon") {
        apply_gsettings("org.cinnamon.desktop.background", &["picture-uri"], &uri)?;
    } else if normalized.contains("mate") {
        apply_gsettings(
            "org.mate.background",
            &["picture-filename"],
            path.to_string_lossy().as_ref(),
        )?;
    } else if normalized.contains("xfce") {
        apply_xfce(path)?;
    } else if normalized.contains("hyprland") {
        apply_hyprland(path)?;
    } else if normalized.contains("sway") {
        run_command(
            "swaymsg",
            &["output", "*", "bg", path.to_string_lossy().as_ref(), "fill"],
        )?;
    } else {
        return Err(format!(
            "Desktopové prostředí „{desktop}“ zatím není podporováno. Podporujeme GNOME, KDE Plasma, Cinnamon, MATE, XFCE, Hyprland a Sway."
        ));
    }
    Ok(desktop)
}

#[tauri::command]
fn apply_wallpaper(app: tauri::AppHandle, wallpaper_id: u32) -> Result<ApplyResult, String> {
    let asset = wallpaper_asset(wallpaper_id)
        .ok_or_else(|| "Neznámá tapeta. Obnovte prosím marketplace.".to_string())?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Nelze zjistit datový adresář aplikace: {error}"))?;
    migrate_legacy_data(&app_data_dir)?;
    let wallpaper_dir = app_data_dir.join("wallpapers");
    fs::create_dir_all(&wallpaper_dir)
        .map_err(|error| format!("Nelze vytvořit adresář pro tapety: {error}"))?;
    let destination = wallpaper_dir.join(asset.filename);
    fs::write(&destination, asset.bytes)
        .map_err(|error| format!("Nelze uložit tapetu: {error}"))?;
    let desktop = apply_to_desktop(&destination)?;
    let is_gnome = {
        let normalized = desktop.to_lowercase();
        normalized.contains("gnome") || normalized.contains("ubuntu")
    };
    let is_interactive = matches!(wallpaper_id, 2 | 5 | 7..=13 | 15..=20);
    let live_enabled = is_gnome && is_interactive;

    if live_enabled {
        let preset = match wallpaper_id {
            5 => "gravity",
            7 => "tides",
            8 => "rain",
            9 => "garden",
            10 => "stars",
            11 => "chrome",
            12 => "sand",
            13 => "sea",
            15 => "fluid",
            16 => "magnetic",
            17 => "diamond",
            18 => "constellation",
            19 => "vector",
            20 => "granular",
            _ => "current",
        };
        enable_gnome_live_wallpaper(&app_data_dir, preset)?;
    } else if is_gnome {
        disable_gnome_live_wallpaper();
    }

    let mut state = read_wallpaper_state(&app_data_dir)?;
    if !state.installed_ids.contains(&wallpaper_id) {
        state.installed_ids.push(wallpaper_id);
        state.installed_ids.sort_unstable();
    }
    state.current_wallpaper_id = Some(wallpaper_id);
    state.desktop_environment = Some(desktop.clone());
    write_wallpaper_state(&app_data_dir, &state)?;

    Ok(ApplyResult {
        desktop_environment: desktop.clone(),
        path: destination.to_string_lossy().into_owned(),
        message: if live_enabled {
            format!("Živý efekt byl aktivován v prostředí {desktop}.")
        } else if is_interactive {
            format!("Prostředí {desktop} zatím nepodporuje živý renderer; byl použit poster frame.")
        } else {
            format!("Tapeta byla nastavena v prostředí {desktop}.")
        },
    })
}

#[tauri::command]
fn get_wallpaper_state(app: tauri::AppHandle) -> Result<WallpaperState, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Nelze zjistit datový adresář aplikace: {error}"))?;
    migrate_legacy_data(&app_data_dir)?;
    read_wallpaper_state(&app_data_dir)
}

#[tauri::command]
fn remove_wallpaper(app: tauri::AppHandle, wallpaper_id: u32) -> Result<WallpaperState, String> {
    let asset = wallpaper_asset(wallpaper_id)
        .ok_or_else(|| "Neznámá tapeta. Obnovte prosím marketplace.".to_string())?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Nelze zjistit datový adresář aplikace: {error}"))?;
    migrate_legacy_data(&app_data_dir)?;
    let mut state = read_wallpaper_state(&app_data_dir)?;
    if state.current_wallpaper_id == Some(wallpaper_id) {
        return Err("Aktivní tapetu nelze odinstalovat. Nejprve použijte jinou tapetu.".into());
    }

    let destination = app_data_dir.join("wallpapers").join(asset.filename);
    if destination.exists() {
        fs::remove_file(&destination)
            .map_err(|error| format!("Nelze odstranit soubor tapety: {error}"))?;
    }
    state.installed_ids.retain(|id| *id != wallpaper_id);
    write_wallpaper_state(&app_data_dir, &state)?;
    Ok(state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            apply_wallpaper,
            get_wallpaper_state,
            remove_wallpaper
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenLBG");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_are_allowlisted() {
        assert_eq!(wallpaper_asset(1).unwrap().filename, "arctic-solitude.webp");
        assert_eq!(wallpaper_asset(5).unwrap().filename, "violet-gravity.webp");
        assert_eq!(wallpaper_asset(7).unwrap().filename, "neon-tides.webp");
        assert_eq!(wallpaper_asset(13).unwrap().filename, "deep-sea-pulse.webp");
        assert_eq!(wallpaper_asset(14).unwrap().filename, "stillwater-dawn.webp");
        assert_eq!(wallpaper_asset(15).unwrap().filename, "chromatic-flow.webp");
        assert_eq!(wallpaper_asset(16).unwrap().filename, "magnetic-grid.webp");
        assert_eq!(
            wallpaper_asset(17).unwrap().filename,
            "diamond-ignition.webp"
        );
        assert_eq!(
            wallpaper_asset(18).unwrap().filename,
            "radial-constellation.webp"
        );
        assert_eq!(
            wallpaper_asset(19).unwrap().filename,
            "organic-vector-field.webp"
        );
        assert_eq!(wallpaper_asset(20).unwrap().filename, "granular-signal.webp");
        assert!(wallpaper_asset(99).is_none());
    }

    #[test]
    fn wallpaper_filenames_are_unique() {
        let filenames: std::collections::HashSet<_> = (1..=20)
            .map(|id| wallpaper_asset(id).unwrap().filename)
            .collect();
        assert_eq!(filenames.len(), 20);
    }
}
