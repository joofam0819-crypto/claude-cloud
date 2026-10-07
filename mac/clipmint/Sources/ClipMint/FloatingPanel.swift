import AppKit
import SwiftUI

/// A non-activating floating panel: it can become key (so you can type in the search field)
/// without activating ClipMint, so the previously active app keeps focus and receives the paste.
final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class PanelController: NSObject, NSWindowDelegate {
    let state: AppState
    private(set) var panel: FloatingPanel!
    private var keyMonitor: Any?
    private let size = NSSize(width: 470, height: 580)

    init(state: AppState) {
        self.state = state
        super.init()
        buildPanel()
        state.onRequestHide = { [weak self] in self?.hide() }
    }

    private func buildPanel() {
        let p = FloatingPanel(contentRect: NSRect(origin: .zero, size: size),
                              styleMask: [.nonactivatingPanel, .borderless, .fullSizeContentView],
                              backing: .buffered, defer: false)
        p.isFloatingPanel = true
        p.level = .popUpMenu
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = true
        p.hidesOnDeactivate = false
        p.isMovableByWindowBackground = true
        p.isReleasedWhenClosed = false
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
        p.animationBehavior = .utilityWindow
        p.delegate = self

        let host = NSHostingView(rootView: PanelRoot(state: state))
        host.frame = NSRect(origin: .zero, size: size)
        host.autoresizingMask = [.width, .height]
        host.wantsLayer = true
        host.layer?.cornerRadius = 16
        host.layer?.cornerCurve = .continuous
        host.layer?.masksToBounds = true
        p.contentView = host
        panel = p
    }

    var isVisible: Bool { panel.isVisible }

    func toggle(anchor: NSView?) { if panel.isVisible { hide() } else { show(anchor: anchor) } }

    func show(anchor: NSView?) {
        L10n.override = UserDefaults.standard.string(forKey: "language").flatMap { $0 == "auto" ? nil : $0 }
        state.refreshPrefs()
        state.query = ""
        state.ensureSelection()
        position(anchor: anchor)
        state.panelVisible = true
        panel.makeKeyAndOrderFront(nil)
        installKeyMonitor()
    }

    func hide() {
        guard panel.isVisible else { return }
        removeKeyMonitor()
        state.panelVisible = false
        state.editingSnippet = nil
        panel.orderOut(nil)
    }

    private func position(anchor: NSView?) {
        var origin: NSPoint
        var screen: NSScreen? = NSScreen.main
        if let anchor, let w = anchor.window {
            let f = w.convertToScreen(anchor.convert(anchor.bounds, to: nil))
            screen = w.screen ?? screen
            origin = NSPoint(x: f.midX - size.width / 2, y: f.minY - size.height - 6)
        } else {
            let m = NSEvent.mouseLocation
            screen = NSScreen.screens.first { NSMouseInRect(m, $0.frame, false) } ?? screen
            origin = NSPoint(x: m.x - size.width / 2, y: m.y - size.height + 24)
        }
        if let vf = screen?.visibleFrame {
            origin.x = max(vf.minX + 8, min(origin.x, vf.maxX - size.width - 8))
            origin.y = max(vf.minY + 8, min(origin.y, vf.maxY - size.height - 8))
        }
        panel.setFrameOrigin(origin)
    }

    // MARK: - Keyboard

    private func installKeyMonitor() {
        removeKeyMonitor()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.panel.isKeyWindow else { return event }
            return self.handle(event) ? nil : event
        }
    }
    private func removeKeyMonitor() { if let m = keyMonitor { NSEvent.removeMonitor(m); keyMonitor = nil } }

    /// Returns true when the event was consumed.
    private func handle(_ e: NSEvent) -> Bool {
        let flags = e.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let cmd = flags.contains(.command), shift = flags.contains(.shift), opt = flags.contains(.option)
        if state.editingSnippet != nil {
            if e.keyCode == 53 { state.editingSnippet = nil; return true }      // esc closes editor
            return false
        }
        switch e.keyCode {
        case 53: // esc
            if !state.query.isEmpty { state.query = ""; state.ensureSelection() } else { hide() }
            return true
        case 125: state.moveSelection(1); return true            // down
        case 126: state.moveSelection(-1); return true           // up
        case 48: state.cycleFilter(shift ? -1 : 1); return true  // tab
        case 36, 76: // return / enter
            if state.showingSnippets, let s = state.selectedSnippet { state.insertSnippet(s, copyOnly: opt) }
            else if let c = state.selectedClip {
                var style: AppState.PasteStyle = .defaultStyle
                if opt { style = .copyOnly } else if shift { style = Prefs.pastePlainByDefault ? .rich : .plain }
                state.activate(c, style: style)
            }
            return true
        case 51: // backspace
            if cmd, let c = state.selectedClip, !state.showingSnippets { state.delete(c); return true }
            return false
        default: break
        }
        if cmd {
            let ch = e.charactersIgnoringModifiers?.lowercased() ?? ""
            switch ch {
            case "p": if let c = state.selectedClip, !state.showingSnippets { state.togglePin(c) }; return true
            case "n": if state.showingSnippets { state.newSnippet(); return true }; return false
            case "f", "l": return false // let the text field keep focus
            case "1", "2", "3", "4", "5", "6", "7", "8", "9":
                let n = (Int(ch) ?? 1) - 1
                if state.showingSnippets { let l = state.visibleSnippets; if n < l.count { state.insertSnippet(l[n], copyOnly: opt) } }
                else { let l = state.visibleClips; if n < l.count { state.activate(l[n], style: .defaultStyle) } }
                return true
            default: return false
            }
        }
        return false
    }

    // MARK: - NSWindowDelegate

    func windowDidResignKey(_ notification: Notification) {
        // clicking anywhere else closes the panel (unless a sheet/alert of ours took the key status)
        DispatchQueue.main.async { [weak self] in
            guard let self, self.panel.isVisible, !self.panel.isKeyWindow else { return }
            if NSApp.keyWindow == nil || NSApp.keyWindow?.isSheet == false { self.hide() }
        }
    }
}

/// Frosted background behind the panel content.
struct VisualEffectBackground: NSViewRepresentable {
    var material: NSVisualEffectView.Material = .popover
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.material = material
        v.blendingMode = .behindWindow
        v.state = .active
        return v
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) { nsView.material = material }
}
