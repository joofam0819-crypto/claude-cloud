import XCTest
@testable import ClipMintCore

final class StoreTests: XCTestCase {
    func make(_ text: String, pinned: Bool = false, kind: ClipKind = .text, date: Date = Date()) -> Clip {
        Clip(kind: kind, text: text, createdAt: date, lastUsedAt: date, pinned: pinned, hash: TextTools.contentHash(text))
    }

    func testDedupeMovesExistingToTop() {
        let store = ClipStore(maxItems: 50)
        let a = make("alpha"); let b = make("beta")
        XCTAssertEqual(store.add(a).result, .inserted)
        XCTAssertEqual(store.add(b).result, .inserted)
        let r = store.add(make("alpha"))
        XCTAssertEqual(r.result, .moved(a.id))
        XCTAssertEqual(store.clips.map { $0.text }, ["alpha", "beta"])
        XCTAssertEqual(store.count, 2)
    }

    func testIgnoresEmptyText() {
        let store = ClipStore()
        XCTAssertEqual(store.add(make("   \n")).result, .ignored)
        XCTAssertEqual(store.count, 0)
    }

    func testEvictionKeepsPinned() {
        let store = ClipStore(maxItems: 10)
        for i in 0..<10 { store.add(make("item \(i)", pinned: i == 0)) }
        let evicted = store.add(make("new")).evicted
        XCTAssertEqual(evicted.map { $0.text }, ["item 1"])
        XCTAssertEqual(store.count, 10)
        XCTAssertTrue(store.clips.contains { $0.text == "item 0" && $0.pinned })
    }

    func testFilteredPinnedFirstThenNewest() {
        let store = ClipStore()
        let t0 = Date(timeIntervalSince1970: 1000)
        store.add(make("old", date: t0))
        store.add(make("pinned one", pinned: true, date: t0.addingTimeInterval(1)))
        store.add(make("newest", date: t0.addingTimeInterval(2)))
        XCTAssertEqual(store.filtered(.all, query: "").map { $0.text }, ["pinned one", "newest", "old"])
        XCTAssertEqual(store.filtered(.pinned, query: "").map { $0.text }, ["pinned one"])
    }

    func testSearchRanking() {
        let store = ClipStore()
        store.add(make("The quick brown fox"))
        store.add(make("quick note"))
        store.add(make("nothing here"))
        let r = store.filtered(.all, query: "quick")
        XCTAssertEqual(r.count, 2)
        XCTAssertEqual(r.first?.text, "quick note") // prefix match ranks first
        XCTAssertEqual(store.filtered(.all, query: "QUICK fox").map { $0.text }, ["The quick brown fox"])
        XCTAssertEqual(store.filtered(.all, query: "zzz").count, 0)
    }

    func testKindFilters() {
        let store = ClipStore()
        store.add(make("https://example.com", kind: .link))
        store.add(make("hello"))
        store.add(Clip(kind: .image, text: "", imageFile: "a.png", hash: "img-1"))
        store.add(Clip(kind: .file, text: "", filePaths: ["/tmp/report.pdf"], hash: "file-1"))
        XCTAssertEqual(store.filtered(.links, query: "").count, 1)
        XCTAssertEqual(store.filtered(.images, query: "").count, 1)
        XCTAssertEqual(store.filtered(.files, query: "report").count, 1)
        XCTAssertEqual(store.filtered(.text, query: "").count, 1)
    }

    func testPinUseRemove() {
        let store = ClipStore()
        let c = make("x"); store.add(c)
        store.togglePin(id: c.id); XCTAssertTrue(store.clip(id: c.id)!.pinned)
        store.markUsed(id: c.id); XCTAssertEqual(store.clip(id: c.id)!.useCount, 1)
        XCTAssertNotNil(store.remove(id: c.id)); XCTAssertEqual(store.count, 0)
    }

    func testRemoveAllKeepPinned() {
        let store = ClipStore()
        store.add(make("a", pinned: true)); store.add(make("b"))
        let removed = store.removeAll(keepPinned: true)
        XCTAssertEqual(removed.map { $0.text }, ["b"])
        XCTAssertEqual(store.clips.map { $0.text }, ["a"])
    }

    func testPersistenceRoundTrip() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("clipmint-tests-\(UUID().uuidString)")
        let url = dir.appendingPathComponent("store.json")
        let snapshot = StoreSnapshot(clips: [make("안녕하세요"), make("hello", pinned: true)])
        try JSONFile.save(snapshot, to: url)
        let loaded = try JSONFile.load(StoreSnapshot.self, from: url)
        XCTAssertEqual(loaded.clips.count, 2)
        XCTAssertEqual(loaded.clips[0].text, "안녕하세요")
        XCTAssertTrue(loaded.clips[1].pinned)
        try? FileManager.default.removeItem(at: dir)
    }

    func testSnippetStore() {
        let s = SnippetStore(snippets: SnippetStore.defaults(korean: true))
        XCTAssertFalse(s.snippets.isEmpty)
        let n = Snippet(title: "Test", body: "body {date}", keyword: "tst")
        s.add(n)
        XCTAssertEqual(s.filtered(query: "tst").first?.id, n.id)
        XCTAssertEqual(s.sorted.last?.id, n.id)
        s.remove(id: n.id)
        XCTAssertNil(s.snippets.first { $0.id == n.id })
    }
}
