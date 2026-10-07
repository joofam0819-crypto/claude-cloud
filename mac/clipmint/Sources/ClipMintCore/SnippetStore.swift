import Foundation

public final class SnippetStore {
    public private(set) var snippets: [Snippet]
    public var onChange: (() -> Void)?

    public init(snippets: [Snippet] = []) { self.snippets = snippets }

    public func add(_ s: Snippet) {
        var s = s
        s.sortIndex = (snippets.map { $0.sortIndex }.max() ?? -1) + 1
        snippets.append(s)
        onChange?()
    }

    public func update(_ s: Snippet) {
        guard let i = snippets.firstIndex(where: { $0.id == s.id }) else { return }
        snippets[i] = s
        onChange?()
    }

    @discardableResult
    public func remove(id: UUID) -> Snippet? {
        guard let i = snippets.firstIndex(where: { $0.id == id }) else { return nil }
        let s = snippets.remove(at: i)
        onChange?()
        return s
    }

    public func markUsed(id: UUID) {
        guard let i = snippets.firstIndex(where: { $0.id == id }) else { return }
        snippets[i].useCount += 1
        onChange?()
    }

    /// Reorders like SwiftUI's `onMove`: moves the items at `fromOffsets` so they start at `toOffset` (an index into the original array).
    public func move(fromOffsets: IndexSet, toOffset: Int) {
        let arr = sorted
        let moving = fromOffsets.sorted().compactMap { $0 < arr.count ? arr[$0] : nil }
        var remaining: [Snippet] = []
        var insertAt = min(max(0, toOffset), arr.count)
        for (i, item) in arr.enumerated() {
            if fromOffsets.contains(i) { if i < toOffset { insertAt -= 1 } } else { remaining.append(item) }
        }
        insertAt = min(max(0, insertAt), remaining.count)
        remaining.insert(contentsOf: moving, at: insertAt)
        for (i, item) in remaining.enumerated() { var s = item; s.sortIndex = i; update(s) }
    }

    public var sorted: [Snippet] { snippets.sorted { $0.sortIndex < $1.sortIndex } }

    public func filtered(query: String) -> [Snippet] {
        let tokens = Search.tokens(query)
        if tokens.isEmpty { return sorted }
        var scored: [(Snippet, Int)] = []
        for s in sorted {
            if let sc = Search.score(tokens: tokens, text: s.keyword + " " + s.title + " " + s.body, boost: 0) { scored.append((s, sc)) }
        }
        return scored.sorted { $0.1 > $1.1 }.map { $0.0 }
    }

    /// Starter snippets shown on first launch.
    public static func defaults(korean: Bool) -> [Snippet] {
        if korean {
            return [
                Snippet(title: "메일 인사", body: "안녕하세요, {user}입니다.\n\n", keyword: "인사", sortIndex: 0),
                Snippet(title: "메일 마무리", body: "확인 부탁드립니다.\n감사합니다.\n{user} 드림", keyword: "마무리", sortIndex: 1),
                Snippet(title: "오늘 날짜", body: "{date}", keyword: "날짜", sortIndex: 2),
                Snippet(title: "영문 메일 마무리", body: "Please let me know if you have any questions.\n\nBest regards,\n{user}", keyword: "regards", sortIndex: 3),
                Snippet(title: "회의 메모 템플릿", body: "# 회의 메모 {date}\n- 참석: \n- 안건: \n- 결정: \n- 할 일: ", keyword: "회의", sortIndex: 4),
            ]
        }
        return [
            Snippet(title: "Email greeting", body: "Hi,\n\n", keyword: "hi", sortIndex: 0),
            Snippet(title: "Email sign-off", body: "Please let me know if you have any questions.\n\nBest regards,\n{user}", keyword: "regards", sortIndex: 1),
            Snippet(title: "Today's date", body: "{date}", keyword: "date", sortIndex: 2),
            Snippet(title: "Meeting notes", body: "# Meeting notes {date}\n- Attendees: \n- Agenda: \n- Decisions: \n- Action items: ", keyword: "meeting", sortIndex: 3),
        ]
    }
}
