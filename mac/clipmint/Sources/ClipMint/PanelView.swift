import SwiftUI
import ClipMintCore

/// Root view of the floating panel.
struct PanelRoot: View {
    @Bindable var state: AppState

    var body: some View {
        ZStack {
            VisualEffectBackground(material: .popover)
            VStack(spacing: 0) {
                SearchBar(state: state)
                FilterChips(state: state)
                Divider().opacity(0.4)
                if state.showingSnippets { SnippetList(state: state) } else { ClipList(state: state) }
                Divider().opacity(0.4)
                FooterBar(state: state)
            }
            if let editing = state.editingSnippet {
                SnippetEditor(state: state, snippet: editing)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if let toast = state.toast {
                VStack { Spacer(); Text(toast).font(.callout.weight(.semibold)).padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.thinMaterial, in: Capsule()).overlay(Capsule().strokeBorder(.white.opacity(0.15))).padding(.bottom, 54) }
                    .transition(.opacity).allowsHitTesting(false)
            }
        }
        .animation(.easeOut(duration: 0.18), value: state.toast)
        .animation(.spring(duration: 0.3), value: state.editingSnippet != nil)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.white.opacity(0.18), lineWidth: 1))
        .onChange(of: state.filter) { _, _ in state.ensureSelection() }
        .onChange(of: state.query) { _, _ in state.ensureSelection() }
    }
}

struct SearchBar: View {
    @Bindable var state: AppState
    @FocusState private var focused: Bool
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(L10n.t("search.placeholder"), text: $state.query)
                .textFieldStyle(.plain)
                .font(.system(size: 16))
                .focused($focused)
            if !state.query.isEmpty {
                Button { state.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.buttonStyle(.plain)
            }
            PanelMenu(state: state)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .onChange(of: state.panelVisible) { _, visible in if visible { DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { focused = true } } }
        .onAppear { focused = true }
    }
}

struct PanelMenu: View {
    @Bindable var state: AppState
    @Environment(\.openSettings) private var openSettings
    var body: some View {
        Menu {
            Button(L10n.t("menu.settings")) { NSApp.activate(ignoringOtherApps: true); openSettings(); state.onRequestHide?() }
            Divider()
            Button(L10n.t("menu.clear")) { confirmClear() }
            Divider()
            Button(L10n.t("menu.quit")) { NSApp.terminate(nil) }
        } label: {
            Image(systemName: "ellipsis.circle").foregroundStyle(.secondary).font(.system(size: 15))
        }
        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
    }
    private func confirmClear() {
        let alert = NSAlert()
        alert.messageText = L10n.t("clear.title"); alert.informativeText = L10n.t("clear.body"); alert.alertStyle = .warning
        alert.addButton(withTitle: L10n.t("clear.confirm")); alert.addButton(withTitle: L10n.t("cancel"))
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn { state.clearHistory() }
    }
}

struct FilterChips: View {
    @Bindable var state: AppState
    private let items: [(ClipFilter, String, String)] = [
        (.all, "filter.all", "tray.full"), (.pinned, "filter.pinned", "pin"), (.text, "filter.text", "text.alignleft"),
        (.links, "filter.links", "link"), (.images, "filter.images", "photo"), (.files, "filter.files", "doc"), (.snippets, "filter.snippets", "text.badge.plus"),
    ]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items, id: \.0) { item in
                    let on = state.filter == item.0
                    Button { state.filter = item.0 } label: {
                        HStack(spacing: 3) { Image(systemName: item.2).font(.system(size: 10, weight: .semibold)); Text(L10n.t(item.1)).font(.system(size: 11.5, weight: .semibold)) }
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(on ? Color.accentColor.opacity(0.9) : Color.primary.opacity(0.07), in: Capsule())
                            .foregroundStyle(on ? Color.white : Color.primary)
                    }.buttonStyle(.plain)
                }
            }.padding(.horizontal, 10).padding(.bottom, 9)
        }
    }
}

struct ClipList: View {
    @Bindable var state: AppState
    var body: some View {
        let list = state.visibleClips
        if list.isEmpty {
            EmptyState(icon: state.query.isEmpty ? "doc.on.clipboard" : "magnifyingglass", title: state.query.isEmpty ? L10n.t("empty.title") : L10n.t("empty.search"), message: state.query.isEmpty ? L10n.t("empty.body") : "")
        } else {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 2) {
                            ForEach(Array(list.enumerated()), id: \.element.id) { i, clip in
                                ClipRow(state: state, clip: clip, index: i, selected: clip.id == state.selectedID)
                                    .id(clip.id)
                                    .onTapGesture(count: 2) { state.activate(clip, style: .defaultStyle) }
                                    .onTapGesture { state.selectedID = clip.id }
                                    .contextMenu { ClipActions(state: state, clip: clip, asMenu: true) }
                            }
                        }.padding(.horizontal, 8).padding(.vertical, 6)
                    }
                    .onChange(of: state.selectedID) { _, id in if let id { withAnimation(.easeOut(duration: 0.12)) { proxy.scrollTo(id, anchor: nil) } } }
                }
                if let sel = state.selectedClip { Divider().opacity(0.4); DetailPane(state: state, clip: sel) }
            }
        }
    }
}

struct ClipRow: View {
    @Bindable var state: AppState
    let clip: Clip
    let index: Int
    let selected: Bool
    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 7, style: .continuous).fill(iconColor.opacity(0.18)).frame(width: 30, height: 30)
                if clip.kind == .image, let img = state.thumbnail(for: clip) {
                    Image(nsImage: img).resizable().aspectRatio(contentMode: .fill).frame(width: 30, height: 30).clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                } else if clip.kind == .color, let hex = TextTools.hexColor(in: clip.text) {
                    RoundedRectangle(cornerRadius: 6).fill(Color(hex: hex)).frame(width: 20, height: 20)
                } else {
                    Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(iconColor)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(clip.kind == .image && clip.text.isEmpty ? (clip.ocrDone || !Prefs.ocrEnabled ? L10n.t("meta.image") : L10n.t("meta.ocrPending")) : clip.preview)
                    .font(.system(size: 13)).lineLimit(2).truncationMode(.tail)
                HStack(spacing: 6) {
                    if let app = clip.sourceAppName { Text(app) }
                    Text(relative(clip.createdAt))
                    if clip.kind == .text || clip.kind == .link { Text("\(clip.charCount)\(L10n.t("meta.chars"))") }
                    if clip.kind == .image && !clip.text.isEmpty { Text(L10n.t("meta.ocr")) }
                }.font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            if clip.pinned { Image(systemName: "pin.fill").font(.system(size: 10)).foregroundStyle(.orange) }
            if index < 9 { Text("⌘\(index + 1)").font(.system(size: 10, weight: .medium, design: .rounded)).foregroundStyle(.tertiary) }
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(selected ? Color.accentColor.opacity(0.22) : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .contentShape(Rectangle())
    }
    var icon: String {
        switch clip.kind { case .link: return "link"; case .image: return "photo"; case .file: return "doc"; case .color: return "paintpalette"; case .text: return "text.alignleft" }
    }
    var iconColor: Color {
        switch clip.kind { case .link: return .blue; case .image: return .purple; case .file: return .gray; case .color: return .pink; case .text: return .mint }
    }
}

func relative(_ d: Date) -> String {
    let s = Int(-d.timeIntervalSinceNow)
    if s < 60 { return L10n.t("meta.now") }
    if s < 3600 { return "\(s / 60)\(L10n.t("meta.min"))" }
    if s < 86400 { return "\(s / 3600)\(L10n.t("meta.hour"))" }
    return "\(s / 86400)\(L10n.t("meta.day"))"
}

struct DetailPane: View {
    @Bindable var state: AppState
    let clip: Clip
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Group {
                if clip.kind == .image, let img = state.thumbnail(for: clip) {
                    HStack(alignment: .top, spacing: 10) {
                        Image(nsImage: img).resizable().aspectRatio(contentMode: .fit).frame(maxWidth: 160, maxHeight: 96).clipShape(RoundedRectangle(cornerRadius: 8))
                        ScrollView { Text(clip.text.isEmpty ? (clip.ocrDone ? "—" : L10n.t("meta.ocrPending")) : clip.text).font(.system(size: 12)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                    }.frame(height: 96)
                } else {
                    ScrollView { Text(clip.kind == .file ? clip.filePaths.joined(separator: "\n") : clip.text).font(.system(size: 12, design: clip.kind == .file ? .monospaced : .default)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }.frame(height: 84)
                }
            }
            HStack(spacing: 6) {
                ClipActions(state: state, clip: clip, asMenu: false)
                Spacer()
                if clip.kind == .text || clip.kind == .link {
                    Text("\(clip.charCount)\(L10n.t("meta.chars")) · \(TextTools.wordCount(clip.text))\(L10n.t("meta.words")) · \(clip.lineCount)\(L10n.t("meta.lines"))").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
        }.padding(.horizontal, 14).padding(.vertical, 10)
    }
}

struct ClipActions: View {
    @Bindable var state: AppState
    let clip: Clip
    let asMenu: Bool
    var body: some View {
        if asMenu {
            Button(L10n.t("action.paste")) { state.activate(clip, style: .defaultStyle) }
            Button(Prefs.pastePlainByDefault ? L10n.t("action.pasteRich") : L10n.t("action.pastePlain")) { state.activate(clip, style: Prefs.pastePlainByDefault ? .rich : .plain) }
            Button(L10n.t("action.copy")) { state.activate(clip, style: .copyOnly) }
            Divider()
            if clip.kind == .text || clip.kind == .link { CleanMenu(state: state, clip: clip) }
            if clip.kind == .link { Button(L10n.t("action.open")) { if let u = URL(string: clip.text.trimmingCharacters(in: .whitespacesAndNewlines)) { NSWorkspace.shared.open(u) } } }
            if clip.kind == .file { Button(L10n.t("action.reveal")) { NSWorkspace.shared.activateFileViewerSelecting(clip.filePaths.map { URL(fileURLWithPath: $0) }) } }
            Button(clip.pinned ? L10n.t("action.unpin") : L10n.t("action.pin")) { state.togglePin(clip) }
            Divider()
            Button(L10n.t("action.delete"), role: .destructive) { state.delete(clip) }
        } else {
            ActionButton(icon: "arrow.right.doc.on.clipboard", label: L10n.t("action.paste"), prominent: true) { state.activate(clip, style: .defaultStyle) }
            if clip.kind == .text || clip.kind == .link {
                Menu { CleanMenu(state: state, clip: clip) } label: { Label(L10n.t("action.clean"), systemImage: "sparkles").font(.system(size: 12, weight: .semibold)) }
                    .menuStyle(.borderlessButton).fixedSize()
                    .padding(.horizontal, 8).padding(.vertical, 5).background(Color.primary.opacity(0.07), in: Capsule())
            }
            if clip.kind == .link { ActionButton(icon: "safari", label: L10n.t("action.open"), prominent: false) { if let u = URL(string: clip.text.trimmingCharacters(in: .whitespacesAndNewlines)) { NSWorkspace.shared.open(u); state.onRequestHide?() } } }
            ActionButton(icon: clip.pinned ? "pin.slash" : "pin", label: clip.pinned ? L10n.t("action.unpin") : L10n.t("action.pin"), prominent: false) { state.togglePin(clip) }
            ActionButton(icon: "trash", label: L10n.t("action.delete"), prominent: false) { state.delete(clip) }
        }
    }
}

struct CleanMenu: View {
    @Bindable var state: AppState
    let clip: Clip
    var body: some View {
        Button(L10n.t("clean.joinLines")) { state.applyClean(TextTools.joinWrappedLines, to: clip) }
        Button(L10n.t("clean.collapse")) { state.applyClean(TextTools.collapseWhitespace, to: clip) }
        Button(L10n.t("clean.oneLine")) { state.applyClean(TextTools.removeAllLineBreaks, to: clip) }
        Button(L10n.t("clean.quotes")) { state.applyClean(TextTools.stripQuoteMarkers, to: clip) }
        Divider()
        Button(L10n.t("clean.upper")) { state.applyClean(TextTools.upper, to: clip) }
        Button(L10n.t("clean.lower")) { state.applyClean(TextTools.lower, to: clip) }
        Button(L10n.t("clean.title")) { state.applyClean(TextTools.titleCase, to: clip) }
        Button(L10n.t("clean.sentence")) { state.applyClean(TextTools.sentenceCase, to: clip) }
        Divider()
        Button(L10n.t("clean.dedupe")) { state.applyClean(TextTools.dedupeLines, to: clip) }
        Button(L10n.t("clean.sort")) { state.applyClean(TextTools.sortLines, to: clip) }
        Button(L10n.t("clean.json")) { state.applyClean({ TextTools.prettyJSON($0) ?? $0 }, to: clip) }
        Button(L10n.t("clean.urlDecode")) { state.applyClean(TextTools.urlDecoded, to: clip) }
        Button(L10n.t("clean.urlEncode")) { state.applyClean(TextTools.urlEncoded, to: clip) }
    }
}

struct ActionButton: View {
    let icon: String; let label: String; let prominent: Bool; let action: () -> Void
    var body: some View {
        Button(action: action) {
            Group {
                if prominent { Label(label, systemImage: icon).labelStyle(.titleAndIcon) } else { Image(systemName: icon) }
            }
                .font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, prominent ? 10 : 7).padding(.vertical, 5)
                .background(prominent ? Color.accentColor : Color.primary.opacity(0.07), in: Capsule())
                .foregroundStyle(prominent ? Color.white : Color.primary)
        }.buttonStyle(.plain).help(label)
    }
}

struct SnippetList: View {
    @Bindable var state: AppState
    var body: some View {
        let list = state.visibleSnippets
        VStack(spacing: 0) {
            if list.isEmpty {
                EmptyState(icon: "text.badge.plus", title: L10n.t("filter.snippets"), message: L10n.t("empty.snippets"))
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 2) {
                            ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                                let selected = s.id == state.selectedSnippetID
                                HStack(spacing: 10) {
                                    ZStack { RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Color.teal.opacity(0.18)).frame(width: 30, height: 30); Image(systemName: "text.badge.plus").font(.system(size: 13, weight: .semibold)).foregroundStyle(.teal) }
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) { Text(s.title.isEmpty ? TextTools.firstLine(s.body, max: 40) : s.title).font(.system(size: 13, weight: .semibold)); if !s.keyword.isEmpty { Text(s.keyword).font(.system(size: 10, weight: .semibold)).padding(.horizontal, 5).padding(.vertical, 1).background(Color.primary.opacity(0.08), in: Capsule()) } }
                                        Text(TextTools.firstLine(s.body, max: 90)).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                    Spacer()
                                    Button { state.editingSnippet = s } label: { Image(systemName: "pencil").font(.system(size: 11)) }.buttonStyle(.plain).foregroundStyle(.secondary).help(L10n.t("action.edit"))
                                    if i < 9 { Text("⌘\(i + 1)").font(.system(size: 10, weight: .medium, design: .rounded)).foregroundStyle(.tertiary) }
                                }
                                .padding(.horizontal, 10).padding(.vertical, 7)
                                .background(selected ? Color.accentColor.opacity(0.22) : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .contentShape(Rectangle()).id(s.id)
                                .onTapGesture(count: 2) { state.insertSnippet(s, copyOnly: false) }
                                .onTapGesture { state.selectedSnippetID = s.id }
                                .contextMenu {
                                    Button(L10n.t("action.insert")) { state.insertSnippet(s, copyOnly: false) }
                                    Button(L10n.t("action.copy")) { state.insertSnippet(s, copyOnly: true) }
                                    Button(L10n.t("action.edit")) { state.editingSnippet = s }
                                    Divider(); Button(L10n.t("action.delete"), role: .destructive) { state.deleteSnippet(s) }
                                }
                            }
                        }.padding(.horizontal, 8).padding(.vertical, 6)
                    }
                    .onChange(of: state.selectedSnippetID) { _, id in if let id { proxy.scrollTo(id) } }
                }
            }
            Divider().opacity(0.4)
            HStack {
                Button { state.newSnippet() } label: { Label(L10n.t("action.newSnippet"), systemImage: "plus").font(.system(size: 12, weight: .semibold)) }.buttonStyle(.plain)
                    .padding(.horizontal, 10).padding(.vertical, 5).background(Color.accentColor, in: Capsule()).foregroundStyle(.white)
                Spacer()
                if let s = state.selectedSnippet, Placeholders.containsPlaceholder(s.body) {
                    Text(TextTools.firstLine(Placeholders.expand(s.body, context: .init(userName: NSFullUserName())), max: 48)).font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }.padding(.horizontal, 14).padding(.vertical, 10)
        }
    }
}

struct EmptyState: View {
    let icon: String; let title: String; let message: String
    var body: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: icon).font(.system(size: 34, weight: .light)).foregroundStyle(.secondary)
            Text(title).font(.system(size: 15, weight: .semibold))
            if !message.isEmpty { Text(message).font(.system(size: 12)).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 30) }
            Spacer()
        }.frame(maxWidth: .infinity)
    }
}

struct FooterBar: View {
    @Bindable var state: AppState
    var body: some View {
        HStack(spacing: 10) {
            Text(L10n.t("footer.paste")); Text(L10n.t("footer.plain")); Text(L10n.t("footer.copy"))
            if !state.showingSnippets { Text(L10n.t("footer.pin")); Text(L10n.t("footer.delete")) }
            Spacer()
            Text("\(state.clipCount)").monospacedDigit()
        }
        .font(.system(size: 10.5, weight: .medium)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
        .padding(.horizontal, 14).padding(.vertical, 8)
    }
}

extension Color {
    init(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespaces); if h.hasPrefix("#") { h.removeFirst() }
        var v: UInt64 = 0; Scanner(string: h).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}
