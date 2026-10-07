import SwiftUI
import ClipMintCore

@main
struct ClipMintApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        Settings {
            SettingsView(state: delegate.state)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let state = AppState()
    private var statusItem: NSStatusItem!
    private var panel: PanelController!
    private var hotkeyID: UInt32?

    func applicationDidFinishLaunching(_ notification: Notification) {
        Prefs.registerDefaults()
        NSApp.setActivationPolicy(.accessory)
        panel = PanelController(state: state)
        setupStatusItem()
        registerHotkey()
        ClipboardMonitor.shared.start(state: state)
        NotificationCenter.default.addObserver(forName: .clipMintHotkeyChanged, object: nil, queue: .main) { [weak self] _ in self?.registerHotkey() }
        if !Prefs.firstLaunchDone {
            Prefs.firstLaunchDone = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.panel.show(anchor: self?.statusItem.button) }
        }
    }

    func applicationWillTerminate(_ notification: Notification) { state.saveNow() }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            let image = NSImage(systemSymbolName: "doc.on.clipboard", accessibilityDescription: "ClipMint")
            image?.isTemplate = true
            button.image = image
            button.target = self
            button.action = #selector(statusClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
            button.toolTip = "ClipMint — \(Prefs.hotkey.display)"
        }
    }

    @objc private func statusClicked(_ sender: NSStatusBarButton) {
        if NSApp.currentEvent?.type == .rightMouseUp { showMenu(); return }
        panel.toggle(anchor: sender)
    }

    private func showMenu() {
        let menu = NSMenu()
        menu.addItem(withTitle: L10n.t("menu.settings"), action: #selector(openSettings), keyEquivalent: ",").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: L10n.t("menu.clear"), action: #selector(clearHistory), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: L10n.t("menu.quit"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    @objc private func openSettings() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }

    @objc private func clearHistory() {
        let alert = NSAlert()
        alert.messageText = L10n.t("clear.title"); alert.informativeText = L10n.t("clear.body"); alert.alertStyle = .warning
        alert.addButton(withTitle: L10n.t("clear.confirm")); alert.addButton(withTitle: L10n.t("cancel"))
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn { state.clearHistory() }
    }

    private func registerHotkey() {
        if let id = hotkeyID { HotKeyCenter.shared.unregister(id) }
        hotkeyID = HotKeyCenter.shared.register(Prefs.hotkey) { [weak self] in
            guard let self else { return }
            self.panel.toggle(anchor: nil)
        }
        statusItem?.button?.toolTip = "ClipMint — \(Prefs.hotkey.display)"
    }
}
