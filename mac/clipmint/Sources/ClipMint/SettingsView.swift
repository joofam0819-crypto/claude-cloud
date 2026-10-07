import SwiftUI
import Combine
import ServiceManagement

struct SettingsView: View {
    var state: AppState
    var body: some View {
        TabView {
            GeneralSettings(state: state).tabItem { Label(L10n.t("settings.general"), systemImage: "gearshape") }
            PrivacySettings().tabItem { Label(L10n.t("settings.privacy"), systemImage: "hand.raised") }
            AboutSettings().tabItem { Label(L10n.t("settings.about"), systemImage: "info.circle") }
        }
        .frame(width: 480)
        .padding(.bottom, 8)
    }
}

struct GeneralSettings: View {
    var state: AppState
    @AppStorage("maxItems") private var maxItems = 500
    @AppStorage("pasteMode") private var pasteMode = "plain"
    @AppStorage("autoPaste") private var autoPaste = true
    @AppStorage("sound") private var sound = true
    @AppStorage("language") private var language = "auto"
    @State private var launchAtLogin = LoginItem.isEnabled
    @State private var trusted = Paster.isTrusted
    @State private var hotkey = Prefs.hotkey
    let timer = Timer.publish(every: 1.5, on: .main, in: .common).autoconnect()

    var body: some View {
        Form {
            Section {
                LabeledContent(L10n.t("settings.hotkey")) {
                    HotkeyRecorder(shortcut: $hotkey).frame(width: 170)
                }
                Text(L10n.t("settings.hotkey.hint")).font(.caption).foregroundStyle(.secondary)
                Toggle(L10n.t("settings.launch"), isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { _, v in if !LoginItem.set(v) { launchAtLogin = LoginItem.isEnabled } }
                Picker(L10n.t("settings.language"), selection: $language) {
                    Text(L10n.t("settings.language.auto")).tag("auto"); Text("한국어").tag("ko"); Text("English").tag("en")
                }
                Text(L10n.t("settings.language.hint")).font(.caption).foregroundStyle(.secondary)
            }
            Section {
                Picker(L10n.t("settings.pasteMode"), selection: $pasteMode) {
                    Text(L10n.t("settings.pasteMode.plain")).tag("plain"); Text(L10n.t("settings.pasteMode.rich")).tag("rich")
                }.pickerStyle(.radioGroup)
                Toggle(L10n.t("settings.autoPaste"), isOn: $autoPaste)
                HStack(spacing: 8) {
                    if trusted { Label(L10n.t("settings.granted"), systemImage: "checkmark.seal.fill").foregroundStyle(.green).font(.caption) }
                    else { Button(L10n.t("settings.grant")) { Paster.requestAccess(); Paster.openAccessibilitySettings() }.controlSize(.small) }
                }
                Text(L10n.t("settings.autoPaste.hint")).font(.caption).foregroundStyle(.secondary)
                Toggle(L10n.t("settings.sound"), isOn: $sound)
            }
            Section {
                HStack {
                    Text(L10n.t("settings.maxItems"))
                    Spacer()
                    Stepper(value: $maxItems, in: 50...5000, step: 50) { Text("\(maxItems) \(L10n.t("settings.items"))").monospacedDigit() }
                }
            }
        }
        .formStyle(.grouped)
        .onChange(of: hotkey) { _, v in Prefs.hotkey = v; NotificationCenter.default.post(name: .clipMintHotkeyChanged, object: nil) }
        .onChange(of: maxItems) { _, _ in state.refreshPrefs() }
        .onReceive(timer) { _ in trusted = Paster.isTrusted; state.accessibilityTrusted = trusted }
    }
}

struct PrivacySettings: View {
    @AppStorage("saveImages") private var saveImages = true
    @AppStorage("ocrEnabled") private var ocrEnabled = true
    @AppStorage("ignoredApps") private var ignoredApps = ""
    var body: some View {
        Form {
            Section {
                Toggle(L10n.t("settings.saveImages"), isOn: $saveImages)
                Toggle(L10n.t("settings.ocr"), isOn: $ocrEnabled).disabled(!saveImages)
                Text(L10n.t("settings.ocr.hint")).font(.caption).foregroundStyle(.secondary)
            }
            Section(L10n.t("settings.ignored")) {
                TextEditor(text: $ignoredApps).font(.system(size: 12, design: .monospaced)).frame(height: 110)
                Text(L10n.t("settings.ignored.hint")).font(.caption).foregroundStyle(.secondary)
            }
        }.formStyle(.grouped)
    }
}

struct AboutSettings: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 72, height: 72)
            Text("ClipMint").font(.title2.weight(.bold))
            Text("\(L10n.t("about.version")) \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")").font(.caption).foregroundStyle(.secondary)
            Text(L10n.t("about.body")).multilineTextAlignment(.center).font(.callout).padding(.horizontal, 20)
            Button(L10n.t("about.data")) { NSWorkspace.shared.activateFileViewerSelecting([Storage.root]) }.controlSize(.small)
            Link("github.com/joofam0819-crypto/claude-cloud", destination: URL(string: "https://github.com/joofam0819-crypto/claude-cloud")!).font(.caption)
        }.padding(24).frame(maxWidth: .infinity)
    }
}

extension Notification.Name { static let clipMintHotkeyChanged = Notification.Name("clipMintHotkeyChanged") }

/// Click, then press a key combination.
struct HotkeyRecorder: NSViewRepresentable {
    @Binding var shortcut: HotKeyCenter.Shortcut
    func makeNSView(context: Context) -> RecorderButton { let b = RecorderButton(); b.onChange = { shortcut = $0 }; b.shortcut = shortcut; return b }
    func updateNSView(_ nsView: RecorderButton, context: Context) { nsView.shortcut = shortcut }

    final class RecorderButton: NSButton {
        var onChange: ((HotKeyCenter.Shortcut) -> Void)?
        var recording = false { didSet { refresh() } }
        var shortcut = HotKeyCenter.Shortcut(keyCode: 9, modifiers: HotKeyCenter.Shortcut.cmd | HotKeyCenter.Shortcut.shift) { didSet { refresh() } }
        private var monitor: Any?
        init() { super.init(frame: .zero); bezelStyle = .rounded; target = self; action = #selector(toggle); refresh() }
        required init?(coder: NSCoder) { fatalError() }
        private func refresh() { title = recording ? L10n.t("settings.hotkey.recording") : shortcut.display }
        @objc private func toggle() {
            recording.toggle()
            if recording {
                monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
                    guard let self else { return e }
                    if e.keyCode == 53 { self.stop(); return nil }
                    if let s = HotKeyCenter.Shortcut.from(event: e) { self.shortcut = s; self.onChange?(s); self.stop() }
                    return nil
                }
            } else { stop() }
        }
        private func stop() { recording = false; if let m = monitor { NSEvent.removeMonitor(m); monitor = nil } }
    }
}
