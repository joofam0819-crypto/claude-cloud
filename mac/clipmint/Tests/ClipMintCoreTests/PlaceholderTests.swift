import XCTest
@testable import ClipMintCore

final class PlaceholderTests: XCTestCase {
    func fixedContext() -> Placeholders.Context {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let comps = DateComponents(year: 2026, month: 10, day: 7, hour: 14, minute: 5)
        let now = cal.date(from: comps)!
        return Placeholders.Context(now: now, clipboard: "CLIP", userName: "장수", locale: Locale(identifier: "en_US_POSIX"), calendar: cal)
    }

    func testBasicPlaceholders() {
        let ctx = fixedContext()
        XCTAssertEqual(Placeholders.expand("{date}", context: ctx), "2026-10-07")
        XCTAssertEqual(Placeholders.expand("{date+7}", context: ctx), "2026-10-14")
        XCTAssertEqual(Placeholders.expand("{date-7:yyyy.MM.dd}", context: ctx), "2026.09.30")
        XCTAssertEqual(Placeholders.expand("{time}", context: ctx), "14:05")
        XCTAssertEqual(Placeholders.expand("{year}/{month}/{day}", context: ctx), "2026/10/07")
        XCTAssertEqual(Placeholders.expand("Hi {user}, {clipboard}!", context: ctx), "Hi 장수, CLIP!")
        XCTAssertEqual(Placeholders.expand("no placeholders {unknown}", context: ctx), "no placeholders {unknown}")
        XCTAssertEqual(Placeholders.expand("{uuid}", context: ctx).count, 36)
        XCTAssertTrue(Placeholders.containsPlaceholder("a {date} b"))
        XCTAssertFalse(Placeholders.containsPlaceholder("a {nope} b"))
    }
}
