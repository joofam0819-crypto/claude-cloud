import SwiftUI
import ClipMintCore

struct SnippetEditor: View {
    @Bindable var state: AppState
    @State var snippet: Snippet
    @FocusState private var bodyFocused: Bool

    init(state: AppState, snippet: Snippet) { self.state = state; _snippet = State(initialValue: snippet) }

    var body: some View {
        ZStack {
            VisualEffectBackground(material: .popover)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(snippet.title.isEmpty ? L10n.t("action.newSnippet") : L10n.t("action.edit")).font(.headline)
                    Spacer()
                    Button { state.editingSnippet = nil } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.buttonStyle(.plain).keyboardShortcut(.cancelAction)
                }
                TextField(L10n.t("snippet.title"), text: $snippet.title).textFieldStyle(.roundedBorder)
                TextField(L10n.t("snippet.keyword"), text: $snippet.keyword).textFieldStyle(.roundedBorder)
                Text(L10n.t("snippet.body")).font(.caption).foregroundStyle(.secondary)
                TextEditor(text: $snippet.body)
                    .font(.system(size: 13))
                    .scrollContentBackground(.hidden)
                    .padding(6)
                    .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
                    .focused($bodyFocused)
                    .frame(minHeight: 140)
                DisclosureGroup(L10n.t("snippet.placeholders")) {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(Placeholders.help, id: \.0) { item in
                            HStack(spacing: 8) {
                                Button(item.0) { snippet.body += item.0 }.buttonStyle(.plain).font(.system(size: 11, design: .monospaced)).foregroundStyle(Color.accentColor)
                                Text(L10n.isKorean ? item.1 : englishHelp(item.0)).font(.system(size: 11)).foregroundStyle(.secondary)
                            }
                        }
                    }.padding(.top, 4)
                }.font(.caption)
                HStack {
                    if state.snippets.snippets.contains(where: { $0.id == snippet.id }) {
                        Button(L10n.t("snippet.delete"), role: .destructive) { state.deleteSnippet(snippet) }
                    }
                    Spacer()
                    Button(L10n.t("cancel")) { state.editingSnippet = nil }
                    Button(L10n.t("snippet.save")) { state.saveSnippet(snippet) }.keyboardShortcut(.defaultAction).buttonStyle(.borderedProminent).disabled(snippet.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }.padding(16)
        }
        .onAppear { DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { bodyFocused = true } }
    }

    private func englishHelp(_ key: String) -> String {
        switch key {
        case "{date}": return "today (2026-10-07)"; case "{date+7}": return "7 days from now"; case "{date:yyyy.MM.dd}": return "custom date format"
        case "{time}": return "current time (14:05)"; case "{weekday}": return "weekday"; case "{year}": return "year"; case "{month}": return "month"; case "{day}": return "day"
        case "{clipboard}": return "current clipboard text"; case "{user}": return "your name"; case "{uuid}": return "unique id"; default: return ""
        }
    }
}
