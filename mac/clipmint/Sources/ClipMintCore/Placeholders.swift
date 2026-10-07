import Foundation

/// Expands snippet placeholders such as {date}, {date+7:yyyy.MM.dd}, {time}, {clipboard}, {user}, {weekday}, {year}.
public enum Placeholders {
    public struct Context {
        public var now: Date
        public var clipboard: String
        public var userName: String
        public var locale: Locale
        public var calendar: Calendar
        public init(now: Date = Date(), clipboard: String = "", userName: String = NSUserName(), locale: Locale = .autoupdatingCurrent, calendar: Calendar = .autoupdatingCurrent) {
            self.now = now; self.clipboard = clipboard; self.userName = userName; self.locale = locale; self.calendar = calendar
        }
    }

    public static let help: [(String, String)] = [
        ("{date}", "오늘 날짜 (2026-10-07)"), ("{date+7}", "7일 뒤 날짜"), ("{date:yyyy.MM.dd}", "날짜 형식 지정"),
        ("{time}", "현재 시각 (14:05)"), ("{weekday}", "요일"), ("{year}", "연도"), ("{month}", "월"), ("{day}", "일"),
        ("{clipboard}", "현재 클립보드 내용"), ("{user}", "사용자 이름"), ("{uuid}", "고유 ID"),
    ]

    static let pattern = try! NSRegularExpression(pattern: "\\{(date|time|weekday|year|month|day|clipboard|user|uuid)([+-]\\d{1,4})?(?::([^}]{1,40}))?\\}")

    public static func expand(_ template: String, context: Context = Context()) -> String {
        let ns = template as NSString
        var result = ""
        var last = 0
        for m in pattern.matches(in: template, range: NSRange(location: 0, length: ns.length)) {
            result += ns.substring(with: NSRange(location: last, length: m.range.location - last))
            let name = ns.substring(with: m.range(at: 1))
            let offset = m.range(at: 2).location != NSNotFound ? Int(ns.substring(with: m.range(at: 2))) ?? 0 : 0
            let format = m.range(at: 3).location != NSNotFound ? ns.substring(with: m.range(at: 3)) : nil
            result += value(for: name, offset: offset, format: format, context: context)
            last = m.range.location + m.range.length
        }
        result += ns.substring(from: last)
        return result
    }

    public static func containsPlaceholder(_ s: String) -> Bool {
        pattern.firstMatch(in: s, range: NSRange(location: 0, length: (s as NSString).length)) != nil
    }

    static func value(for name: String, offset: Int, format: String?, context: Context) -> String {
        let date = context.calendar.date(byAdding: .day, value: offset, to: context.now) ?? context.now
        let f = DateFormatter()
        f.locale = context.locale
        f.calendar = context.calendar
        f.timeZone = context.calendar.timeZone
        switch name {
        case "date": f.dateFormat = format ?? "yyyy-MM-dd"; return f.string(from: date)
        case "time": f.dateFormat = format ?? "HH:mm"; return f.string(from: date)
        case "weekday": f.dateFormat = format ?? "EEEE"; return f.string(from: date)
        case "year": f.dateFormat = format ?? "yyyy"; return f.string(from: date)
        case "month": f.dateFormat = format ?? "MM"; return f.string(from: date)
        case "day": f.dateFormat = format ?? "dd"; return f.string(from: date)
        case "clipboard": return context.clipboard
        case "user": return context.userName
        case "uuid": return UUID().uuidString
        default: return ""
        }
    }
}
