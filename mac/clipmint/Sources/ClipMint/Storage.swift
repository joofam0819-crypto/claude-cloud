import AppKit
import ClipMintCore

/// Files under ~/Library/Application Support/ClipMint
enum Storage {
    static let root: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("ClipMint", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for sub in ["images", "rtf"] { try? FileManager.default.createDirectory(at: dir.appendingPathComponent(sub), withIntermediateDirectories: true) }
        return dir
    }()
    static var clipsURL: URL { root.appendingPathComponent("clips.json") }
    static var snippetsURL: URL { root.appendingPathComponent("snippets.json") }
    static func imageURL(_ name: String) -> URL { root.appendingPathComponent("images").appendingPathComponent(name) }
    static func rtfURL(_ id: UUID) -> URL { root.appendingPathComponent("rtf").appendingPathComponent(id.uuidString + ".rtf") }

    static func loadClips() -> [Clip] {
        (try? JSONFile.load(StoreSnapshot.self, from: clipsURL))?.clips ?? []
    }
    static func saveClips(_ clips: [Clip]) {
        try? JSONFile.save(StoreSnapshot(clips: clips), to: clipsURL)
    }
    static func loadSnippets() -> [Snippet]? {
        try? JSONFile.load([Snippet].self, from: snippetsURL)
    }
    static func saveSnippets(_ s: [Snippet]) {
        try? JSONFile.save(s, to: snippetsURL)
    }

    @discardableResult
    static func saveImage(_ data: Data, id: UUID) -> String? {
        let name = id.uuidString + ".png"
        do { try data.write(to: imageURL(name), options: .atomic); return name } catch { return nil }
    }
    static func saveRTF(_ data: Data, id: UUID) -> Bool {
        (try? data.write(to: rtfURL(id), options: .atomic)) != nil
    }
    static func loadRTF(_ id: UUID) -> Data? { try? Data(contentsOf: rtfURL(id)) }

    static func removeSidecars(for clip: Clip) {
        if let img = clip.imageFile { try? FileManager.default.removeItem(at: imageURL(img)) }
        if clip.hasRichText { try? FileManager.default.removeItem(at: rtfURL(clip.id)) }
    }

    /// Converts arbitrary pasteboard image data to PNG.
    static func pngData(from image: NSImage) -> Data? {
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }
}

/// User preferences (UserDefaults-backed).
struct Prefs {
    /// Registering defaults lazily guarantees they exist before any reader (AppState is created before the app delegate runs).
    static let defaults: UserDefaults = {
        let d = UserDefaults.standard
        d.register(defaults: [
            "maxItems": 500, "pasteMode": "plain", "autoPaste": true, "saveImages": true, "ocrEnabled": true, "sound": true,
            "language": "auto", "ignoredApps": "com.apple.keychainaccess\ncom.agilebits.onepassword7\ncom.1password.1password\ncom.bitwarden.desktop",
            "hotkeyKeyCode": 9, "hotkeyModifiers": Int(HotKeyCenter.Shortcut.cmd | HotKeyCenter.Shortcut.shift), "firstLaunchDone": false,
        ])
        return d
    }()
    static func registerDefaults() { _ = defaults }
    static var maxItems: Int { get { defaults.integer(forKey: "maxItems") } set { defaults.set(newValue, forKey: "maxItems") } }
    static var pastePlainByDefault: Bool { defaults.string(forKey: "pasteMode") != "rich" }
    static var autoPaste: Bool { defaults.bool(forKey: "autoPaste") }
    static var saveImages: Bool { defaults.bool(forKey: "saveImages") }
    static var ocrEnabled: Bool { defaults.bool(forKey: "ocrEnabled") }
    static var sound: Bool { defaults.bool(forKey: "sound") }
    static var ignoredApps: Set<String> {
        Set((defaults.string(forKey: "ignoredApps") ?? "").split(whereSeparator: { $0.isNewline }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
    }
    static var hotkey: HotKeyCenter.Shortcut {
        get { HotKeyCenter.Shortcut(keyCode: UInt32(defaults.integer(forKey: "hotkeyKeyCode")), modifiers: UInt32(defaults.integer(forKey: "hotkeyModifiers"))) }
        set { defaults.set(Int(newValue.keyCode), forKey: "hotkeyKeyCode"); defaults.set(Int(newValue.modifiers), forKey: "hotkeyModifiers") }
    }
    static var firstLaunchDone: Bool { get { defaults.bool(forKey: "firstLaunchDone") } set { defaults.set(newValue, forKey: "firstLaunchDone") } }
}
