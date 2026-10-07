import Foundation

/// Pure text utilities shared by the app and the tests.
public enum TextTools {

    // MARK: - Previews & hashing

    public static func firstLine(_ s: String, max: Int = 120) -> String {
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let nl = trimmed.firstIndex(where: { $0.isNewline }) else { return truncate(trimmed, max) }
        return truncate(String(trimmed[..<nl]), max) + " …"
    }

    public static func truncate(_ s: String, _ max: Int) -> String {
        guard s.count > max, max > 1 else { return s }
        return String(s.prefix(max - 1)) + "…"
    }

    /// FNV-1a 64-bit over UTF-8, plus the byte length. Good enough for de-duplication.
    public static func contentHash(_ s: String) -> String {
        var h: UInt64 = 0xcbf29ce484222325
        var n = 0
        for b in s.utf8 { h ^= UInt64(b); h = h &* 0x100000001b3; n += 1 }
        return String(h, radix: 16) + "-" + String(n)
    }

    public static func contentHash(bytes: Data) -> String {
        var h: UInt64 = 0xcbf29ce484222325
        for b in bytes { h ^= UInt64(b); h = h &* 0x100000001b3 }
        return String(h, radix: 16) + "-img" + String(bytes.count)
    }

    // MARK: - Clean-ups

    public static func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Collapses runs of spaces/tabs, trims each line, and limits blank lines to one.
    public static func collapseWhitespace(_ s: String) -> String {
        let lines = s.replacingOccurrences(of: "\r\n", with: "\n").split(separator: "\n", omittingEmptySubsequences: false)
        var out: [String] = []
        var lastBlank = false
        for raw in lines {
            let line = raw.replacingOccurrences(of: "[ \\t\\u{00A0}]+", with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            if line.isEmpty {
                if !lastBlank && !out.isEmpty { out.append("") }
                lastBlank = true
            } else { out.append(line); lastBlank = false }
        }
        while out.last == "" { out.removeLast() }
        return out.joined(separator: "\n")
    }

    /// Repairs text copied from PDFs: joins hard-wrapped lines into paragraphs,
    /// keeps blank-line paragraph breaks and list items, and heals end-of-line hyphenation
    /// ("regula-\ntory" -> "regulatory").
    public static func joinWrappedLines(_ s: String) -> String {
        var text = s.replacingOccurrences(of: "\r\n", with: "\n")
        // hyphenation: letter + "-" + newline + lowercase letter  => join without hyphen
        text = text.replacingOccurrences(of: "(\\p{L})-\\n[ \\t]*(\\p{Ll})", with: "$1$2", options: .regularExpression)
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map { String($0) }
        var paragraphs: [String] = []
        var current: [String] = []
        func flush() { if !current.isEmpty { paragraphs.append(current.joined(separator: " ")); current.removeAll() } }
        for rawLine in lines {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { flush(); continue }
            if isListItem(line) || isHeadingLike(line) { flush(); paragraphs.append(line); continue }
            current.append(line)
        }
        flush()
        return paragraphs.joined(separator: "\n").replacingOccurrences(of: " {2,}", with: " ", options: .regularExpression)
    }

    static func isListItem(_ line: String) -> Bool {
        line.range(of: "^([-•·▪◦*]|\\d{1,3}[.)]|\\(?[a-zA-Z]\\)|[①-⑳]|[가-힣][.)])\\s", options: .regularExpression) != nil
    }

    static func isHeadingLike(_ line: String) -> Bool {
        // "Article 12", "제12조", "Annex I", "1.2.3 Title"
        line.range(of: "^(Article|Annex|Chapter|Section|제\\s?\\d+\\s?(조|장|절|항)|\\d+(\\.\\d+)+)\\b", options: .regularExpression) != nil
    }

    public static func removeAllLineBreaks(_ s: String) -> String {
        s.replacingOccurrences(of: "\\s*\\n+\\s*", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }

    public static func removeEmptyLines(_ s: String) -> String {
        s.split(separator: "\n").map { String($0) }.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.joined(separator: "\n")
    }

    public static func dedupeLines(_ s: String) -> String {
        var seen = Set<String>(); var out: [String] = []
        for line in s.split(separator: "\n", omittingEmptySubsequences: false).map(String.init) {
            if seen.insert(line).inserted { out.append(line) }
        }
        return out.joined(separator: "\n")
    }

    public static func sortLines(_ s: String) -> String {
        s.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }.joined(separator: "\n")
    }

    /// Strips email quote markers ("> ") at line starts.
    public static func stripQuoteMarkers(_ s: String) -> String {
        s.replacingOccurrences(of: "(?m)^(\\s*>\\s?)+", with: "", options: .regularExpression)
    }

    // MARK: - Case

    public static func upper(_ s: String) -> String { s.uppercased() }
    public static func lower(_ s: String) -> String { s.lowercased() }
    public static func titleCase(_ s: String) -> String { s.capitalized }
    public static func sentenceCase(_ s: String) -> String {
        guard let first = s.firstIndex(where: { !$0.isWhitespace }) else { return s }
        return String(s[..<first]) + s[first...].prefix(1).uppercased() + s[first...].dropFirst().lowercased()
    }

    // MARK: - Detection & extraction

    public static func isURL(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.contains(" "), !t.contains("\n"), t.count < 2048 else { return false }
        guard let url = URL(string: t), let scheme = url.scheme?.lowercased(), let host = url.host, !host.isEmpty else { return false }
        return ["http", "https", "ftp", "mailto", "file"].contains(scheme) || scheme.count > 1
    }

    public static func extractURLs(_ s: String) -> [String] {
        var seen = Set<String>()
        return matches("https?://[^\\s<>\"'()\\[\\]]+", in: s).compactMap { raw in
            let url = String(raw.reversed().drop(while: { ".,;:!?".contains($0) }).reversed())
            return seen.insert(url).inserted ? url : nil
        }
    }

    public static func extractEmails(_ s: String) -> [String] {
        matches("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}", in: s)
    }

    public static func extractNumbers(_ s: String) -> [String] {
        matches("[-+]?\\d[\\d,]*(\\.\\d+)?", in: s).map { String($0.reversed().drop(while: { $0 == "," }).reversed()) }
    }

    /// "#1a2b3c" / "#abc" / "rgb(1,2,3)" -> normalized hex or nil
    public static func hexColor(in s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if let m = t.range(of: "^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$", options: .regularExpression) {
            var hex = String(t[m].dropFirst())
            if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
            return "#" + hex.lowercased()
        }
        if let m = t.range(of: "^rgba?\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})", options: .regularExpression) {
            let nums = matches("\\d{1,3}", in: String(t[m])).compactMap { Int($0) }
            guard nums.count >= 3, nums.allSatisfy({ (0...255).contains($0) }) else { return nil }
            return String(format: "#%02x%02x%02x", nums[0], nums[1], nums[2])
        }
        return nil
    }

    static func matches(_ pattern: String, in s: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns = s as NSString
        var out: [String] = []
        var seen = Set<String>()
        for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
            let str = ns.substring(with: m.range)
            if seen.insert(str).inserted { out.append(str) }
        }
        return out
    }

    // MARK: - Counting

    public static func wordCount(_ s: String) -> Int {
        var count = 0
        s.enumerateSubstrings(in: s.startIndex..., options: [.byWords, .substringNotRequired]) { _, _, _, _ in count += 1 }
        return count
    }

    public static func charCountWithoutSpaces(_ s: String) -> Int { s.filter { !$0.isWhitespace }.count }

    // MARK: - Encoding

    public static func prettyJSON(_ s: String) -> String? {
        guard let data = s.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: data),
              let out = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]) else { return nil }
        return String(data: out, encoding: .utf8)
    }

    public static func urlEncoded(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    public static func urlDecoded(_ s: String) -> String { s.removingPercentEncoding ?? s }

    // MARK: - Search normalization

    public static func normalizedForSearch(_ s: String) -> String {
        s.precomposedStringWithCanonicalMapping.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
    }
}
