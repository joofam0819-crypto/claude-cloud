import XCTest
@testable import ClipMintCore

final class TextToolsTests: XCTestCase {
    func testJoinWrappedLinesHealsHyphenationAndKeepsParagraphs() {
        let pdf = "The manufacturer shall ensure regula-\ntory compliance for all de-\nvices placed on the market.\n\nArticle 10\nGeneral obligations apply.\n- item one\n- item two"
        let out = TextTools.joinWrappedLines(pdf)
        XCTAssertEqual(out, "The manufacturer shall ensure regulatory compliance for all devices placed on the market.\nArticle 10\nGeneral obligations apply.\n- item one\n- item two")
    }

    func testJoinWrappedLinesKeepsRealHyphenBeforeUppercase() {
        // "Niti-\nS" should keep its hyphen because the continuation starts with an uppercase letter
        XCTAssertEqual(TextTools.joinWrappedLines("Niti-\nS stent"), "Niti-\nS stent".replacingOccurrences(of: "\n", with: " "))
    }

    func testCollapseWhitespace() {
        XCTAssertEqual(TextTools.collapseWhitespace("  a   b \t c  \n\n\n d  \n\n"), "a b c\n\nd")
    }

    func testRemoveAllLineBreaks() {
        XCTAssertEqual(TextTools.removeAllLineBreaks("a\n b\n\nc "), "a b c")
    }

    func testCaseTransforms() {
        XCTAssertEqual(TextTools.sentenceCase("  hELLO wORLD"), "  Hello world")
        XCTAssertEqual(TextTools.titleCase("hello world"), "Hello World")
    }

    func testURLDetection() {
        XCTAssertTrue(TextTools.isURL("https://eur-lex.europa.eu/eli/reg/2017/745"))
        XCTAssertTrue(TextTools.isURL("  https://example.com/a?b=c  "))
        XCTAssertFalse(TextTools.isURL("see https://example.com for details"))
        XCTAssertFalse(TextTools.isURL("hello"))
        XCTAssertEqual(TextTools.extractURLs("x https://a.com/1 y http://b.org, https://a.com/1"), ["https://a.com/1", "http://b.org"])
        XCTAssertEqual(TextTools.extractNumbers("1,234 and 5, then 6.5"), ["1,234", "5", "6.5"])
        XCTAssertEqual(TextTools.extractEmails("mail a.b@c.com and D@E.io"), ["a.b@c.com", "D@E.io"])
    }

    func testHexColor() {
        XCTAssertEqual(TextTools.hexColor(in: "#ABC"), "#aabbcc")
        XCTAssertEqual(TextTools.hexColor(in: "#1a2B3c"), "#1a2b3c")
        XCTAssertEqual(TextTools.hexColor(in: "rgb(255, 0, 16)"), "#ff0010")
        XCTAssertNil(TextTools.hexColor(in: "#12345"))
        XCTAssertNil(TextTools.hexColor(in: "rgb(300,0,0)"))
    }

    func testCounts() {
        XCTAssertEqual(TextTools.wordCount("안녕 hello world"), 3)
        XCTAssertEqual(TextTools.charCountWithoutSpaces("a b  c"), 3)
    }

    func testPrettyJSONAndURLEncoding() {
        XCTAssertEqual(TextTools.prettyJSON("{\"b\":1,\"a\":[1,2]}"), "{\n  \"a\" : [\n    1,\n    2\n  ],\n  \"b\" : 1\n}")
        XCTAssertNil(TextTools.prettyJSON("not json"))
        XCTAssertEqual(TextTools.urlEncoded("한글 a&b"), "%ED%95%9C%EA%B8%80%20a%26b")
        XCTAssertEqual(TextTools.urlDecoded("%ED%95%9C%EA%B8%80%20a%26b"), "한글 a&b")
    }

    func testHashIsStableAndDistinct() {
        XCTAssertEqual(TextTools.contentHash("abc"), TextTools.contentHash("abc"))
        XCTAssertNotEqual(TextTools.contentHash("abc"), TextTools.contentHash("abd"))
        XCTAssertNotEqual(TextTools.contentHash("abc"), TextTools.contentHash("abc "))
    }

    func testFirstLine() {
        XCTAssertEqual(TextTools.firstLine("hello\nworld"), "hello …")
        XCTAssertEqual(TextTools.firstLine(String(repeating: "x", count: 200), max: 10), "xxxxxxxxx…")
    }
}
