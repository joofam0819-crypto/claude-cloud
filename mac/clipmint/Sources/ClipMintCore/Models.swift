import Foundation

public enum ClipKind: String, Codable, CaseIterable, Sendable {
    case text, link, image, file, color
}

/// One captured clipboard entry.
public struct Clip: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var kind: ClipKind
    public var text: String            // plain text (for images: OCR text, may be empty)
    public var hasRichText: Bool       // an .rtf sidecar file exists
    public var imageFile: String?      // sidecar PNG file name (images)
    public var filePaths: [String]     // copied file URLs (file clips)
    public var sourceApp: String?      // bundle identifier
    public var sourceAppName: String?
    public var createdAt: Date
    public var lastUsedAt: Date
    public var useCount: Int
    public var pinned: Bool
    public var hash: String
    public var imageWidth: Int?
    public var imageHeight: Int?
    public var ocrDone: Bool

    public init(id: UUID = UUID(), kind: ClipKind, text: String, hasRichText: Bool = false, imageFile: String? = nil,
                filePaths: [String] = [], sourceApp: String? = nil, sourceAppName: String? = nil,
                createdAt: Date = Date(), lastUsedAt: Date = Date(), useCount: Int = 0, pinned: Bool = false,
                hash: String, imageWidth: Int? = nil, imageHeight: Int? = nil, ocrDone: Bool = false) {
        self.id = id; self.kind = kind; self.text = text; self.hasRichText = hasRichText; self.imageFile = imageFile
        self.filePaths = filePaths; self.sourceApp = sourceApp; self.sourceAppName = sourceAppName
        self.createdAt = createdAt; self.lastUsedAt = lastUsedAt; self.useCount = useCount; self.pinned = pinned
        self.hash = hash; self.imageWidth = imageWidth; self.imageHeight = imageHeight; self.ocrDone = ocrDone
    }

    /// Short single-line preview used in list rows.
    public var preview: String {
        switch kind {
        case .image:
            let size = (imageWidth != nil && imageHeight != nil) ? "\(imageWidth!)×\(imageHeight!)" : ""
            let ocr = text.isEmpty ? "" : " · " + TextTools.firstLine(text, max: 60)
            return "이미지 " + size + ocr
        case .file:
            if filePaths.count == 1 { return (filePaths[0] as NSString).lastPathComponent }
            return "파일 \(filePaths.count)개"
        default:
            return TextTools.firstLine(text, max: 140)
        }
    }

    public var charCount: Int { text.count }
    public var lineCount: Int { text.isEmpty ? 0 : text.split(omittingEmptySubsequences: false, whereSeparator: \.isNewline).count }
    public var isLink: Bool { kind == .link }
}

/// A reusable text template.
public struct Snippet: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var title: String
    public var body: String
    public var keyword: String        // short abbreviation for quick search
    public var createdAt: Date
    public var useCount: Int
    public var sortIndex: Int

    public init(id: UUID = UUID(), title: String, body: String, keyword: String = "", createdAt: Date = Date(), useCount: Int = 0, sortIndex: Int = 0) {
        self.id = id; self.title = title; self.body = body; self.keyword = keyword; self.createdAt = createdAt; self.useCount = useCount; self.sortIndex = sortIndex
    }
}

/// Filters available in the panel.
public enum ClipFilter: String, CaseIterable, Codable, Sendable {
    case all, pinned, text, links, images, files, snippets
}
