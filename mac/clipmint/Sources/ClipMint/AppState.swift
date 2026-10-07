import AppKit
import Observation
import ClipMintCore

/// Central observable model shared by the panel, settings and services. Main-thread only.
@Observable
final class AppState {
    let clips: ClipStore
    let snippets: SnippetStore

    // UI state
    var query: String = ""
    var filter: ClipFilter = .all
    var selectedID: UUID? = nil
    var selectedSnippetID: UUID? = nil
    var editingSnippet: Snippet? = nil      // non-nil => snippet editor is shown
    var toast: String? = nil
    var panelVisible = false
    var accessibilityTrusted = Paster.isTrusted
    /// Bumped on every store change; list/detail views read it so SwiftUI re-renders (the stores themselves are plain classes).
    var revision = 0

    // derived caches
    private var thumbCache: [String: NSImage] = [:]
    private var saveWork: DispatchWorkItem?
    var onRequestHide: (() -> Void)?

    init() {
        let loaded = Storage.loadClips()
        clips = ClipStore(clips: loaded, maxItems: Prefs.maxItems)
        if let s = Storage.loadSnippets() { snippets = SnippetStore(snippets: s) }
        else { snippets = SnippetStore(snippets: SnippetStore.defaults(korean: L10n.isKorean)); Storage.saveSnippets(snippets.snippets) }
        clips.onChange = { [weak self] in self?.revision &+= 1; self?.scheduleSave() }
        snippets.onChange = { [weak self] in self?.revision &+= 1; self?.saveSnippetsNow() }
    }

    // MARK: - Lists

    var visibleClips: [Clip] { _ = revision; return clips.filtered(filter, query: query) }
    var visibleSnippets: [Snippet] { _ = revision; return snippets.filtered(query: query) }
    var clipCount: Int { _ = revision; return clips.count }
    var showingSnippets: Bool { filter == .snippets }

    func ensureSelection() {
        if showingSnippets {
            let list = visibleSnippets
            if selectedSnippetID == nil || !list.contains(where: { $0.id == selectedSnippetID }) { selectedSnippetID = list.first?.id }
        } else {
            let list = visibleClips
            if selectedID == nil || !list.contains(where: { $0.id == selectedID }) { selectedID = list.first?.id }
        }
    }

    func moveSelection(_ delta: Int) {
        if showingSnippets {
            let list = visibleSnippets; guard !list.isEmpty else { return }
            let i = list.firstIndex { $0.id == selectedSnippetID } ?? 0
            selectedSnippetID = list[max(0, min(list.count - 1, i + delta))].id
        } else {
            let list = visibleClips; guard !list.isEmpty else { return }
            let i = list.firstIndex { $0.id == selectedID } ?? 0
            selectedID = list[max(0, min(list.count - 1, i + delta))].id
        }
    }

    func cycleFilter(_ delta: Int) {
        let all = ClipFilter.allCases
        let i = all.firstIndex(of: filter) ?? 0
        filter = all[(i + delta + all.count) % all.count]
        ensureSelection()
    }

    var selectedClip: Clip? { _ = revision; return selectedID.flatMap { clips.clip(id: $0) } }
    var selectedSnippet: Snippet? { _ = revision; return selectedSnippetID.flatMap { id in snippets.snippets.first { $0.id == id } } }

    // MARK: - Ingest (from the monitor)

    func ingest(_ clip: Clip, imageData: Data?, rtf: Data?) {
        var clip = clip
        if let imageData, Prefs.saveImages {
            if let name = Storage.saveImage(imageData, id: clip.id) { clip.imageFile = name }
            if let img = NSImage(data: imageData) { clip.imageWidth = Int(img.size.width); clip.imageHeight = Int(img.size.height) }
        } else if clip.kind == .image { return } // images disabled
        if let rtf, rtf.count < 300_000, Storage.saveRTF(rtf, id: clip.id) { clip.hasRichText = true }
        let result = clips.add(clip)
        switch result.result {
        case .inserted:
            if clip.kind == .image, Prefs.ocrEnabled, let imageData { runOCR(id: clip.id, data: imageData) }
        case .moved, .ignored:
            Storage.removeSidecars(for: clip)   // duplicate: drop the new sidecars
        }
        for c in result.evicted { Storage.removeSidecars(for: c); thumbCache[c.imageFile ?? ""] = nil }
        ensureSelection()
    }

    private func runOCR(id: UUID, data: Data) {
        OCRService.recognize(pngData: data) { [weak self] text in
            DispatchQueue.main.async {
                guard let self else { return }
                self.clips.update(id: id) { c in c.text = text; c.ocrDone = true }
            }
        }
    }

    // MARK: - Actions

    enum PasteStyle { case defaultStyle, plain, rich, copyOnly }

    /// Puts the clip on the pasteboard (optionally pasting into the frontmost app).
    func activate(_ clip: Clip, style: PasteStyle) {
        let pb = NSPasteboard.general
        pb.clearContents()
        let wantRich: Bool = {
            switch style { case .plain: return false; case .rich: return true; default: return !Prefs.pastePlainByDefault }
        }()
        switch clip.kind {
        case .image:
            if let name = clip.imageFile, let data = try? Data(contentsOf: Storage.imageURL(name)) { pb.setData(data, forType: .png) }
            else { pb.setString(clip.text, forType: .string) }
        case .file:
            let urls = clip.filePaths.map { URL(fileURLWithPath: $0) as NSURL }
            pb.writeObjects(urls)
            pb.setString(clip.filePaths.joined(separator: "\n"), forType: .string)
        default:
            if wantRich, clip.hasRichText, let rtf = Storage.loadRTF(clip.id) {
                pb.setData(rtf, forType: .rtf)
                pb.setString(clip.text, forType: .string)
            } else {
                pb.setString(clip.text, forType: .string)
            }
        }
        ClipboardMonitor.shared.ignoreCurrentChange()
        clips.markUsed(id: clip.id)
        finishActivation(copyOnly: style == .copyOnly)
    }

    func insertSnippet(_ s: Snippet, copyOnly: Bool) {
        let clipboardText = NSPasteboard.general.string(forType: .string) ?? ""
        let text = Placeholders.expand(s.body, context: .init(clipboard: clipboardText, userName: NSFullUserName()))
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
        ClipboardMonitor.shared.ignoreCurrentChange()
        snippets.markUsed(id: s.id)
        finishActivation(copyOnly: copyOnly)
    }

    private func finishActivation(copyOnly: Bool) {
        onRequestHide?()
        if copyOnly { showToast(L10n.t("toast.copied")); return }
        if Prefs.autoPaste && Paster.isTrusted {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                Paster.sendCommandV()
                if Prefs.sound { NSSound(named: "Pop")?.play() }
            }
        } else {
            showToast(L10n.t("toast.copiedHint"))
        }
    }

    func applyClean(_ transform: (String) -> String, to clip: Clip) {
        let cleaned = transform(clip.text)
        guard cleaned != clip.text, !cleaned.isEmpty else { return }
        let new = Clip(kind: TextTools.isURL(cleaned) ? .link : .text, text: cleaned, sourceApp: clip.sourceApp, sourceAppName: clip.sourceAppName, hash: TextTools.contentHash(cleaned))
        let r = clips.add(new)
        if case .moved(let id) = r.result { selectedID = id } else { selectedID = new.id }
        for c in r.evicted { Storage.removeSidecars(for: c) }
    }

    func delete(_ clip: Clip) {
        let list = visibleClips
        let idx = list.firstIndex { $0.id == clip.id } ?? 0
        if let removed = clips.remove(id: clip.id) { Storage.removeSidecars(for: removed); thumbCache[removed.imageFile ?? ""] = nil }
        let after = visibleClips
        selectedID = after.isEmpty ? nil : after[min(idx, after.count - 1)].id
    }

    func clearHistory() {
        for c in clips.removeAll(keepPinned: true) { Storage.removeSidecars(for: c) }
        thumbCache.removeAll()
        ensureSelection()
    }

    func togglePin(_ clip: Clip) { clips.togglePin(id: clip.id) }

    func thumbnail(for clip: Clip) -> NSImage? {
        guard let name = clip.imageFile else { return nil }
        if let img = thumbCache[name] { return img }
        guard let img = NSImage(contentsOf: Storage.imageURL(name)) else { return nil }
        if thumbCache.count > 60 { thumbCache.removeAll() }
        thumbCache[name] = img
        return img
    }

    func showToast(_ text: String) {
        toast = text
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in if self?.toast == text { self?.toast = nil } }
    }

    // MARK: - Snippets CRUD

    func newSnippet() { editingSnippet = Snippet(title: "", body: "", keyword: "") }
    func saveSnippet(_ s: Snippet) {
        if snippets.snippets.contains(where: { $0.id == s.id }) { snippets.update(s) } else { snippets.add(s) }
        editingSnippet = nil; selectedSnippetID = s.id
    }
    func deleteSnippet(_ s: Snippet) { snippets.remove(id: s.id); editingSnippet = nil; ensureSelection() }

    // MARK: - Persistence

    private func scheduleSave() {
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in guard let self else { return }; Storage.saveClips(self.clips.clips) }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: work)
    }
    func saveNow() { saveWork?.cancel(); Storage.saveClips(clips.clips); Storage.saveSnippets(snippets.snippets) }
    private func saveSnippetsNow() { Storage.saveSnippets(snippets.snippets) }
    func refreshPrefs() { clips.maxItems = Prefs.maxItems; let e = clips.evict(); for c in e { Storage.removeSidecars(for: c) }; accessibilityTrusted = Paster.isTrusted }
}
