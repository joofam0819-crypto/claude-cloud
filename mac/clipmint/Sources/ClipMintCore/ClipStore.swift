import Foundation

public enum AddResult: Equatable, Sendable {
    case inserted
    case moved(UUID)      // duplicate content existed; it was moved to the top (returns its id)
    case ignored
}

/// In-memory clipboard history with de-duplication, pinning, eviction and filtering.
/// Not thread-safe by design: the app confines it to the main actor.
public final class ClipStore {
    public private(set) var clips: [Clip]      // newest first (pinned items are NOT moved; sorting happens in `filtered`)
    public var maxItems: Int
    public var onChange: (() -> Void)?

    public init(clips: [Clip] = [], maxItems: Int = 500) {
        self.clips = clips
        self.maxItems = max(10, maxItems)
    }

    public var count: Int { clips.count }
    public func clip(id: UUID) -> Clip? { clips.first { $0.id == id } }
    public func index(of id: UUID) -> Int? { clips.firstIndex { $0.id == id } }

    /// Adds a clip; a clip with identical content hash is moved to the top instead. Returns evicted clips so callers can delete sidecar files.
    @discardableResult
    public func add(_ clip: Clip) -> (result: AddResult, evicted: [Clip]) {
        if clip.kind != .image, clip.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, clip.filePaths.isEmpty {
            return (.ignored, [])
        }
        if let i = clips.firstIndex(where: { $0.hash == clip.hash }) {
            var existing = clips.remove(at: i)
            existing.createdAt = clip.createdAt
            existing.lastUsedAt = clip.createdAt
            if existing.sourceApp == nil { existing.sourceApp = clip.sourceApp; existing.sourceAppName = clip.sourceAppName }
            clips.insert(existing, at: 0)
            onChange?()
            return (.moved(existing.id), [])
        }
        clips.insert(clip, at: 0)
        let evicted = evict()
        onChange?()
        return (.inserted, evicted)
    }

    @discardableResult
    public func remove(id: UUID) -> Clip? {
        guard let i = index(of: id) else { return nil }
        let c = clips.remove(at: i)
        onChange?()
        return c
    }

    /// Removes everything (optionally keeping pinned). Returns removed clips.
    @discardableResult
    public func removeAll(keepPinned: Bool) -> [Clip] {
        let removed = keepPinned ? clips.filter { !$0.pinned } : clips
        clips = keepPinned ? clips.filter { $0.pinned } : []
        onChange?()
        return removed
    }

    public func togglePin(id: UUID) {
        guard let i = index(of: id) else { return }
        clips[i].pinned.toggle()
        onChange?()
    }

    public func markUsed(id: UUID, at date: Date = Date()) {
        guard let i = index(of: id) else { return }
        clips[i].useCount += 1
        clips[i].lastUsedAt = date
        onChange?()
    }

    public func update(id: UUID, _ change: (inout Clip) -> Void) {
        guard let i = index(of: id) else { return }
        change(&clips[i])
        onChange?()
    }

    /// Drops the oldest unpinned clips beyond `maxItems`.
    @discardableResult
    public func evict() -> [Clip] {
        guard clips.count > maxItems else { return [] }
        var removed: [Clip] = []
        var kept: [Clip] = []
        var unpinnedBudget = maxItems - clips.filter { $0.pinned }.count
        for c in clips {
            if c.pinned { kept.append(c); continue }
            if unpinnedBudget > 0 { kept.append(c); unpinnedBudget -= 1 } else { removed.append(c) }
        }
        clips = kept
        return removed
    }

    /// Filter + search. Pinned items first (when no query), then newest first. With a query, best score first.
    public func filtered(_ filter: ClipFilter, query: String) -> [Clip] {
        let base: [Clip]
        switch filter {
        case .all, .snippets: base = clips
        case .pinned: base = clips.filter { $0.pinned }
        case .text: base = clips.filter { $0.kind == .text || $0.kind == .color }
        case .links: base = clips.filter { $0.kind == .link }
        case .images: base = clips.filter { $0.kind == .image }
        case .files: base = clips.filter { $0.kind == .file }
        }
        let tokens = Search.tokens(query)
        if tokens.isEmpty {
            if filter == .pinned { return base }
            let pinned = base.filter { $0.pinned }
            let rest = base.filter { !$0.pinned }
            return pinned + rest
        }
        var scored: [(Clip, Int)] = []
        for c in base {
            let hay = c.kind == .file ? c.filePaths.joined(separator: " ") : c.text
            let extra = (c.sourceAppName ?? "")
            if let s = Search.score(tokens: tokens, text: hay + " " + extra, boost: c.pinned ? 15 : 0) { scored.append((c, s)) }
        }
        scored.sort { a, b in a.1 != b.1 ? a.1 > b.1 : a.0.createdAt > b.0.createdAt }
        return scored.map { $0.0 }
    }
}

// MARK: - Persistence

public struct StoreSnapshot: Codable, Sendable {
    public var version: Int
    public var clips: [Clip]
    public init(version: Int = 1, clips: [Clip]) { self.version = version; self.clips = clips }
}

public enum JSONFile {
    public static func load<T: Decodable>(_ type: T.Type, from url: URL) throws -> T {
        let data = try Data(contentsOf: url)
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return try dec.decode(T.self, from: data)
    }

    public static func save<T: Encodable>(_ value: T, to url: URL) throws {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.sortedKeys]
        let data = try enc.encode(value)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }
}
