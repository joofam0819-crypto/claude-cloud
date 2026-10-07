import Foundation

/// Lightweight multi-token search scoring. All tokens must match (AND); higher score = better.
public enum Search {
    public static func tokens(_ query: String) -> [String] {
        TextTools.normalizedForSearch(query).split(whereSeparator: { $0.isWhitespace }).map(String.init).filter { !$0.isEmpty }
    }

    /// Returns nil when the text does not match every token.
    public static func score(tokens: [String], text: String, boost: Int = 0) -> Int? {
        if tokens.isEmpty { return boost }
        let hay = TextTools.normalizedForSearch(text)
        var total = boost
        for token in tokens {
            guard let r = hay.range(of: token) else { return nil }
            var s = 10
            if r.lowerBound == hay.startIndex { s += 40 }
            else if hay[hay.index(before: r.lowerBound)].isWhitespace || hay[hay.index(before: r.lowerBound)].isPunctuation { s += 20 }
            // shorter haystacks rank higher for the same match
            s += max(0, 20 - hay.count / 40)
            total += s
        }
        return total
    }

    public static func score(_ query: String, text: String, boost: Int = 0) -> Int? {
        score(tokens: tokens(query), text: text, boost: boost)
    }
}
