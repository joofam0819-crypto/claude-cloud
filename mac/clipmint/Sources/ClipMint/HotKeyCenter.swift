import AppKit
import Carbon.HIToolbox

/// Global keyboard shortcuts via Carbon's RegisterEventHotKey.
/// Works without the Accessibility permission (unlike CGEvent taps).
final class HotKeyCenter {
    static let shared = HotKeyCenter()

    struct Shortcut: Codable, Equatable {
        var keyCode: UInt32
        var modifiers: UInt32   // Carbon modifier mask (cmdKey | shiftKey | optionKey | controlKey)

        static let cmd = UInt32(cmdKey), shift = UInt32(shiftKey), option = UInt32(optionKey), control = UInt32(controlKey)

        var display: String {
            var s = ""
            if modifiers & Shortcut.control != 0 { s += "⌃" }
            if modifiers & Shortcut.option != 0 { s += "⌥" }
            if modifiers & Shortcut.shift != 0 { s += "⇧" }
            if modifiers & Shortcut.cmd != 0 { s += "⌘" }
            return s + Shortcut.keyName(keyCode)
        }

        static func keyName(_ code: UInt32) -> String {
            let names: [UInt32: String] = [
                0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V", 11: "B", 12: "Q", 13: "W", 14: "E", 15: "R",
                16: "Y", 17: "T", 18: "1", 19: "2", 20: "3", 21: "4", 22: "6", 23: "5", 24: "=", 25: "9", 26: "7", 27: "-", 28: "8", 29: "0",
                30: "]", 31: "O", 32: "U", 33: "[", 34: "I", 35: "P", 37: "L", 38: "J", 39: "'", 40: "K", 41: ";", 42: "\\", 43: ",", 44: "/",
                45: "N", 46: "M", 47: ".", 50: "`", 49: "Space", 36: "↩", 48: "⇥", 51: "⌫", 53: "⎋", 123: "←", 124: "→", 125: "↓", 126: "↑",
                96: "F5", 97: "F6", 98: "F7", 99: "F3", 100: "F8", 101: "F9", 103: "F11", 109: "F10", 111: "F12", 118: "F4", 120: "F2", 122: "F1",
            ]
            return names[code] ?? "key\(code)"
        }

        /// Builds a shortcut from an NSEvent (used by the shortcut recorder).
        static func from(event: NSEvent) -> Shortcut? {
            var mods: UInt32 = 0
            let f = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            if f.contains(.command) { mods |= cmd }
            if f.contains(.shift) { mods |= shift }
            if f.contains(.option) { mods |= option }
            if f.contains(.control) { mods |= control }
            guard mods & (cmd | control | option) != 0 else { return nil } // require at least one "real" modifier
            return Shortcut(keyCode: UInt32(event.keyCode), modifiers: mods)
        }
    }

    private var handlers: [UInt32: () -> Void] = [:]
    private var refs: [UInt32: EventHotKeyRef] = [:]
    private var nextID: UInt32 = 1
    private var eventHandler: EventHandlerRef?

    private init() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let callback: EventHandlerUPP = { _, event, userData -> OSStatus in
            guard let event, let userData else { return OSStatus(eventNotHandledErr) }
            var hotKeyID = EventHotKeyID()
            let err = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                                        nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID)
            guard err == noErr else { return err }
            let center = Unmanaged<HotKeyCenter>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { center.handlers[hotKeyID.id]?() }
            return noErr
        }
        InstallEventHandler(GetApplicationEventTarget(), callback, 1, &spec,
                            Unmanaged.passUnretained(self).toOpaque(), &eventHandler)
    }

    @discardableResult
    func register(_ shortcut: Shortcut, handler: @escaping () -> Void) -> UInt32? {
        let id = nextID
        nextID += 1
        var ref: EventHotKeyRef?
        let hotKeyID = EventHotKeyID(signature: OSType(0x4B4C4950), id: id) // 'KLIP'
        let status = RegisterEventHotKey(shortcut.keyCode, shortcut.modifiers, hotKeyID, GetApplicationEventTarget(), 0, &ref)
        guard status == noErr, let ref else { return nil }
        refs[id] = ref
        handlers[id] = handler
        return id
    }

    func unregister(_ id: UInt32) {
        if let ref = refs[id] { UnregisterEventHotKey(ref) }
        refs[id] = nil
        handlers[id] = nil
    }
}
