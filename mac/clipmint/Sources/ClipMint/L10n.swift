import Foundation

/// Tiny in-code localization (Korean + English). Keys are English-ish identifiers.
enum L10n {
    static var override: String? = UserDefaults.standard.string(forKey: "language").flatMap { $0 == "auto" ? nil : $0 }

    static var isKorean: Bool {
        if let o = override { return o == "ko" }
        return (Locale.preferredLanguages.first ?? "en").lowercased().hasPrefix("ko")
    }

    static func t(_ key: String) -> String {
        let table = isKorean ? ko : en
        return table[key] ?? en[key] ?? key
    }

    static let en: [String: String] = [
        "app.name": "ClipMint",
        "search.placeholder": "Search clips…  (⇧⌘V)",
        "filter.all": "All", "filter.pinned": "Pinned", "filter.text": "Text", "filter.links": "Links", "filter.images": "Images", "filter.files": "Files", "filter.snippets": "Snippets",
        "empty.title": "Nothing copied yet", "empty.body": "Copy something — it will show up here. Pin what you reuse, and keep snippets for the things you type every day.",
        "empty.search": "No matches",
        "empty.snippets": "No snippets yet. Press + to add one.",
        "action.paste": "Paste", "action.pastePlain": "Paste as plain text", "action.pasteRich": "Paste with formatting", "action.copy": "Copy", "action.pin": "Pin", "action.unpin": "Unpin", "action.delete": "Delete",
        "action.clean": "Clean up", "action.open": "Open link", "action.reveal": "Show in Finder", "action.copyOCR": "Copy recognized text", "action.edit": "Edit", "action.newSnippet": "New snippet", "action.insert": "Insert",
        "clean.joinLines": "Fix PDF line breaks", "clean.collapse": "Tidy whitespace", "clean.oneLine": "Make one line", "clean.quotes": "Strip quote marks", "clean.upper": "UPPERCASE", "clean.lower": "lowercase", "clean.title": "Title Case", "clean.sentence": "Sentence case", "clean.dedupe": "Remove duplicate lines", "clean.sort": "Sort lines", "clean.json": "Pretty-print JSON", "clean.urlDecode": "Decode URL", "clean.urlEncode": "Encode URL",
        "footer.paste": "↩ paste", "footer.plain": "⇧↩ formatted", "footer.copy": "⌥↩ copy only", "footer.pin": "⌘P pin", "footer.delete": "⌘⌫ delete", "footer.quick": "⌘1-9 quick paste",
        "menu.settings": "Settings…", "menu.clear": "Clear history…", "menu.quit": "Quit ClipMint", "menu.about": "About ClipMint",
        "clear.title": "Clear clipboard history?", "clear.body": "Pinned clips are kept. This cannot be undone.", "clear.confirm": "Clear", "cancel": "Cancel",
        "toast.copied": "Copied", "toast.pasted": "Pasted", "toast.copiedHint": "Copied — press ⌘V to paste", "toast.needAccess": "Auto-paste needs the Accessibility permission (Settings)",
        "settings.general": "General", "settings.privacy": "Privacy", "settings.about": "About",
        "settings.hotkey": "Open ClipMint", "settings.hotkey.hint": "Click, then press a key combination", "settings.hotkey.recording": "Press keys…",
        "settings.launch": "Launch at login", "settings.maxItems": "Keep up to", "settings.items": "clips",
        "settings.pasteMode": "Enter pastes", "settings.pasteMode.plain": "Plain text (recommended)", "settings.pasteMode.rich": "Original formatting",
        "settings.autoPaste": "Paste directly into the active app", "settings.autoPaste.hint": "Requires the Accessibility permission. Without it, ClipMint copies the clip and you press ⌘V.", "settings.grant": "Open Accessibility settings", "settings.granted": "Permission granted",
        "settings.sound": "Sound on paste",
        "settings.saveImages": "Save copied images", "settings.ocr": "Recognize text in copied images (OCR, on-device)", "settings.ocr.hint": "Korean, English and Japanese. Copy any screenshot (⌃⇧⌘4) and its text becomes searchable.",
        "settings.ignored": "Ignore these apps", "settings.ignored.hint": "Bundle identifiers, one per line. Password managers that mark clips as concealed are always ignored.",
        "settings.language": "Language", "settings.language.auto": "System", "settings.language.ko": "한국어", "settings.language.en": "English", "settings.language.hint": "Takes effect the next time the panel opens.",
        "about.body": "Clipboard history, snippets and text clean-up for the Mac.\nEverything stays on this Mac — no network, no analytics.",
        "about.data": "Data folder", "about.version": "Version",
        "snippet.title": "Title", "snippet.keyword": "Keyword (for quick search)", "snippet.body": "Text", "snippet.placeholders": "Placeholders", "snippet.save": "Save", "snippet.delete": "Delete snippet",
        "meta.chars": "chars", "meta.lines": "lines", "meta.words": "words", "meta.now": "just now", "meta.min": "m ago", "meta.hour": "h ago", "meta.day": "d ago", "meta.ocr": "OCR", "meta.ocrPending": "reading text…", "meta.image": "Image", "meta.files": "files",
    ]

    static let ko: [String: String] = [
        "app.name": "ClipMint",
        "search.placeholder": "복사한 것 검색…  (⇧⌘V)",
        "filter.all": "전체", "filter.pinned": "고정", "filter.text": "텍스트", "filter.links": "링크", "filter.images": "이미지", "filter.files": "파일", "filter.snippets": "스니펫",
        "empty.title": "아직 복사한 것이 없어요", "empty.body": "무엇이든 복사하면 여기에 쌓입니다. 자주 쓰는 건 고정하고, 매일 치는 문장은 스니펫으로 저장하세요.",
        "empty.search": "검색 결과 없음",
        "empty.snippets": "스니펫이 없습니다. + 를 눌러 추가하세요.",
        "action.paste": "붙여넣기", "action.pastePlain": "서식 없이 붙여넣기", "action.pasteRich": "서식 유지해 붙여넣기", "action.copy": "복사", "action.pin": "고정", "action.unpin": "고정 해제", "action.delete": "삭제",
        "action.clean": "정리", "action.open": "링크 열기", "action.reveal": "Finder에서 보기", "action.copyOCR": "인식된 글자 복사", "action.edit": "편집", "action.newSnippet": "새 스니펫", "action.insert": "삽입",
        "clean.joinLines": "PDF 줄바꿈 고치기", "clean.collapse": "공백 정리", "clean.oneLine": "한 줄로 합치기", "clean.quotes": "인용 기호(>) 제거", "clean.upper": "대문자로", "clean.lower": "소문자로", "clean.title": "단어 첫 글자 대문자", "clean.sentence": "문장 첫 글자만 대문자", "clean.dedupe": "중복 줄 제거", "clean.sort": "줄 정렬", "clean.json": "JSON 보기 좋게", "clean.urlDecode": "URL 디코딩", "clean.urlEncode": "URL 인코딩",
        "footer.paste": "↩ 붙여넣기", "footer.plain": "⇧↩ 서식 유지", "footer.copy": "⌥↩ 복사만", "footer.pin": "⌘P 고정", "footer.delete": "⌘⌫ 삭제", "footer.quick": "⌘1-9 바로 붙여넣기",
        "menu.settings": "설정…", "menu.clear": "기록 지우기…", "menu.quit": "ClipMint 종료", "menu.about": "ClipMint 정보",
        "clear.title": "복사 기록을 모두 지울까요?", "clear.body": "고정한 항목은 남습니다. 되돌릴 수 없습니다.", "clear.confirm": "지우기", "cancel": "취소",
        "toast.copied": "복사됨", "toast.pasted": "붙여넣음", "toast.copiedHint": "복사됨 — ⌘V로 붙여넣으세요", "toast.needAccess": "자동 붙여넣기는 손쉬운 사용 권한이 필요합니다 (설정)",
        "settings.general": "일반", "settings.privacy": "개인정보", "settings.about": "정보",
        "settings.hotkey": "ClipMint 열기 단축키", "settings.hotkey.hint": "클릭한 뒤 원하는 키 조합을 누르세요", "settings.hotkey.recording": "키를 누르세요…",
        "settings.launch": "로그인 시 자동 실행", "settings.maxItems": "보관 개수", "settings.items": "개",
        "settings.pasteMode": "Enter 키 동작", "settings.pasteMode.plain": "서식 없이 붙여넣기 (추천)", "settings.pasteMode.rich": "원래 서식 유지",
        "settings.autoPaste": "현재 앱에 바로 붙여넣기", "settings.autoPaste.hint": "손쉬운 사용 권한이 필요합니다. 권한이 없으면 복사만 하고, ⌘V를 눌러 붙여넣습니다.", "settings.grant": "손쉬운 사용 설정 열기", "settings.granted": "권한 허용됨",
        "settings.sound": "붙여넣을 때 소리",
        "settings.saveImages": "복사한 이미지 저장", "settings.ocr": "복사한 이미지의 글자 인식 (OCR, 기기 내 처리)", "settings.ocr.hint": "한국어·영어·일본어. 스크린샷을 클립보드로 복사하면(⌃⇧⌘4) 글자가 검색되고 복사됩니다.",
        "settings.ignored": "무시할 앱", "settings.ignored.hint": "번들 ID를 한 줄에 하나씩. 비밀번호 관리자처럼 '숨김' 표시된 복사는 항상 무시합니다.",
        "settings.language": "언어", "settings.language.auto": "시스템 설정", "settings.language.ko": "한국어", "settings.language.en": "English", "settings.language.hint": "패널을 다시 열 때 적용됩니다.",
        "about.body": "맥을 위한 복사 기록·스니펫·텍스트 정리 도구.\n모든 데이터는 이 Mac 안에만 있습니다 — 네트워크 전송·분석 없음.",
        "about.data": "데이터 폴더", "about.version": "버전",
        "snippet.title": "제목", "snippet.keyword": "키워드 (빠른 검색용)", "snippet.body": "내용", "snippet.placeholders": "자리표시자", "snippet.save": "저장", "snippet.delete": "스니펫 삭제",
        "meta.chars": "자", "meta.lines": "줄", "meta.words": "단어", "meta.now": "방금", "meta.min": "분 전", "meta.hour": "시간 전", "meta.day": "일 전", "meta.ocr": "OCR", "meta.ocrPending": "글자 인식 중…", "meta.image": "이미지", "meta.files": "개 파일",
    ]
}
