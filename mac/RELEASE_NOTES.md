## ClipMint 1.0

macOS 메뉴 막대 클립보드 관리자 (유니버설, macOS 14 이상).

- ⇧⌘V로 여는 복사 기록 패널, 즉시 검색, 키보드만으로 붙여넣기 (Enter = 서식 없이)
- 스니펫(자리표시자 `{date}` `{date+7}` `{time}` `{clipboard}` `{user}`)
- 텍스트 정리: PDF 줄바꿈·하이픈 복원, 공백 정리, 한 줄 만들기, 대소문자, 중복 줄 제거, JSON 정렬, URL 인코딩
- 복사한 이미지의 글자 인식(OCR, 한·영·일, 기기 내 처리), 링크·색상·파일 인식
- 오프라인·분석 없음, 숨김 복사(비밀번호 관리자) 무시, 무시할 앱 설정, 로그인 시 자동 실행, 한국어/영어

### 설치
터미널에 한 줄: `curl -fsSL https://raw.githubusercontent.com/joofam0819-crypto/claude-cloud/main/scripts/install-mac-apps.sh | bash`
또는 `.dmg`를 열어 앱을 응용 프로그램 폴더로 끌어 넣고, 처음 실행할 때 **시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기**를 한 번 누르세요. 자세한 순서와 사용법은 `mac/README.md`에 있습니다.
