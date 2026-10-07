import SwiftUI
import WebKit

// MARK: - App

@main
struct GameApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            GameWebView()
                .frame(minWidth: 900, minHeight: 560)
                .ignoresSafeArea()
                .background(Color.black)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .defaultSize(width: 1280, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("게임") {
                Button("전체 화면 전환") {
                    NSApp.keyWindow?.toggleFullScreen(nil)
                }
                .keyboardShortcut("f", modifiers: [.command, .control])
                Divider()
                Button("진행 기록 초기화…") {
                    GameBridge.shared.confirmReset()
                }
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.activate(ignoringOtherApps: true)
    }
}

// MARK: - Bridge (native <-> JS)

final class GameBridge: NSObject, WKScriptMessageHandler {
    static let shared = GameBridge()
    weak var webView: WKWebView?

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "fullscreen":
            webView?.window?.toggleFullScreen(nil)
        case "quit":
            NSApp.terminate(nil)
        case "title":
            if let t = body["value"] as? String { webView?.window?.title = t }
        default:
            break
        }
    }

    func confirmReset() {
        let alert = NSAlert()
        alert.messageText = "진행 기록을 모두 지울까요?"
        alert.informativeText = "최고 기록, 해금 요소, 설정이 초기화됩니다. 되돌릴 수 없습니다."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "초기화")
        alert.addButton(withTitle: "취소")
        if alert.runModal() == .alertFirstButtonReturn {
            webView?.evaluateJavaScript("window.__game && window.__game.resetProgress && window.__game.resetProgress();", completionHandler: nil)
        }
    }
}

// MARK: - Local bundle served over a custom scheme (stable origin => localStorage persists)

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "game"
    private let root: URL

    init(root: URL) { self.root = root }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let fileURL = root.appendingPathComponent(path)
        guard let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let response = URLResponse(url: url, mimeType: Self.mimeType(for: fileURL.pathExtension),
                                   expectedContentLength: data.count, textEncodingName: "utf-8")
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html"
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "mp3": return "audio/mpeg"
        case "ogg": return "audio/ogg"
        case "wav": return "audio/wav"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - WKWebView host

struct GameWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.isElementFullscreenEnabled = true
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.userContentController.add(GameBridge.shared, name: "native")

        let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        config.setURLSchemeHandler(BundleSchemeHandler(root: webRoot), forURLScheme: BundleSchemeHandler.scheme)

        let webView = KeyWebView(frame: .zero, configuration: config)
        webView.underPageBackgroundColor = .black
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        webView.allowsMagnification = false
        GameBridge.shared.webView = webView

        webView.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://local/index.html")!))
        DispatchQueue.main.async { webView.window?.makeFirstResponder(webView) }
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

/// Keeps keyboard focus and swallows the "funk" beep for unhandled key presses.
final class KeyWebView: WKWebView {
    override var acceptsFirstResponder: Bool { true }
    override func keyDown(with event: NSEvent) {
        super.keyDown(with: event)
    }
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        // Let Cmd-shortcuts reach the menu bar; everything else goes to the page.
        if event.modifierFlags.contains(.command) { return super.performKeyEquivalent(with: event) }
        return false
    }
}
