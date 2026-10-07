/* APPROACH — static content: aircraft types, upgrades, shift tuning, strings. Pure data (also loaded by Node tests). */
const CONTENT = (() => {
  // World units: the airspace is a circle of radius R around (0,0); the renderer scales to the window.
  const WORLD = { R: 460, spawnR: 500, holdR: 520 };

  const AIRCRAFT = {
    jet:   { name: { ko: '제트기', en: 'Jet' },      speed: 44, turn: 1.7, radius: 12, dest: 'A', color: '#4f8dff', fuel: [110, 150], score: 100, weight: 1.0 },
    prop:  { name: { ko: '터보프롭', en: 'Turboprop' }, speed: 33, turn: 2.4, radius: 10, dest: 'B', color: '#ff9f43', fuel: [120, 170], score: 100, weight: 1.0 },
    heavy: { name: { ko: '대형 화물기', en: 'Heavy cargo' }, speed: 27, turn: 1.3, radius: 16, dest: 'A', color: '#5b7fff', fuel: [130, 180], score: 150, weight: 0.8 },
    heli:  { name: { ko: '헬리콥터', en: 'Helicopter' }, speed: 21, turn: 3.6, radius: 9,  dest: 'H', color: '#3ddc84', fuel: [90, 130],  score: 120, weight: 1.0 },
  };

  // Destinations: runways have a landing heading (radians, set per shift by wind) and a length; heliports are pads.
  const DEST_COLORS = { A: '#4f8dff', B: '#ff9f43', H: '#3ddc84' };

  const UPGRADES = [
    { id: 'ils',     icon: '◎', name: { ko: 'ILS 계기착륙', en: 'ILS approach' },      desc: { ko: '착륙 허용 각도가 크게 넓어집니다.', en: 'Much wider landing alignment tolerance.' }, max: 2 },
    { id: 'taxi',    icon: '⇢', name: { ko: '고속 유도로', en: 'Rapid-exit taxiways' }, desc: { ko: '착륙 후 활주로가 2배 빨리 비워집니다.', en: 'Runways clear twice as fast after a landing.' }, max: 1 },
    { id: 'tcas',    icon: '✚', name: { ko: 'TCAS 충돌 회피', en: 'TCAS' },            desc: { ko: '교대당 1회, 충돌 직전 자동 회피합니다.', en: 'Once per shift, an imminent collision is auto-avoided.' }, max: 2 },
    { id: 'fuel',    icon: '⛽', name: { ko: '연료 보급 협약', en: 'Fuel agreement' },  desc: { ko: '모든 항공기가 30% 더 많은 연료로 진입합니다.', en: 'Aircraft arrive with 30% more fuel.' }, max: 2 },
    { id: 'slow',    icon: '◷', name: { ko: '관제 집중', en: 'Tower focus' },           desc: { ko: 'Space를 누르는 동안 시간이 느려집니다 (교대당 12초).', en: 'Hold Space to slow time (12 s per shift).' }, max: 2 },
    { id: 'radar',   icon: '⌖', name: { ko: '광역 레이더', en: 'Extended radar' },      desc: { ko: '진입 5초 전에 항공기 방향을 미리 표시합니다.', en: 'Shows incoming aircraft 5 s before they enter.' }, max: 1 },
    { id: 'sep',     icon: '◌', name: { ko: '정밀 분리 관제', en: 'Precision separation' }, desc: { ko: '근접 경고 거리가 25% 줄어듭니다.', en: 'Near-miss distance shrinks by 25%.' }, max: 1 },
    { id: 'pay',     icon: '★', name: { ko: '성과급', en: 'Hazard pay' },               desc: { ko: '모든 점수가 25% 증가합니다.', en: 'All scoring +25%.' }, max: 3 },
    { id: 'weather', icon: '☂', name: { ko: '기상 레이더', en: 'Weather radar' },       desc: { ko: '폭풍 구름이 더 작고 느리게 움직입니다.', en: 'Storm cells are smaller and drift slower.' }, max: 1 },
  ];

  /* Difficulty curve per shift (1-based). Tuned with the headless balance sim. */
  function shiftConfig(n, daily) {
    const k = Math.max(1, n);
    const interval0 = Math.max(2.6, 9.5 * Math.pow(0.86, k - 1));   // seconds between spawns at shift start
    const interval1 = Math.max(2.0, interval0 * 0.62);               // ... at shift end
    return {
      index: k,
      duration: daily ? 180 : Math.min(240, 120 + 20 * k),
      interval0, interval1,
      maxAirborne: Math.min(12, 4 + k),
      weights: { prop: 1.0, jet: 0.8 + 0.05 * k, heli: k >= 1 ? 0.5 : 0, heavy: k >= 2 ? 0.25 + 0.05 * k : 0 },
      emergencyChance: k >= 3 ? Math.min(0.18, 0.05 + 0.03 * (k - 3)) : 0,
      storms: k >= 2 ? Math.min(3, Math.floor((k) / 2)) : 0,
      runwayC: k >= 4,
      secondPad: k >= 5,
      fuelScale: Math.max(0.75, 1 - 0.04 * (k - 1)),
    };
  }

  const STRINGS = {
    ko: {
      title: 'APPROACH', tagline: '하늘길을 그려 비행기를 착륙시키세요',
      start: '근무 시작', daily: '오늘의 교대', howto: '조작법', stats: '기록', settings: '설정',
      resume: '계속', restart: '다시 시작', quit: '메인으로', shift: '교대', score: '점수', landings: '착륙', best: '최고',
      pickUpgrade: '업그레이드 선택', pickHint: '숫자키 1·2·3 또는 클릭', continue: '다음 교대로',
      gameOver: '근무 종료', crash: '공중 충돌', fuelout: '연료 고갈', incidents: '사고 3건', shiftClear: '교대 완료!',
      nearMiss: '근접 경고', goAround: '복행', perfect: '정밀 접근', emergency: '비상', lowFuel: '연료 부족', storm: '폭풍 진입',
      hint1: '비행기를 누른 채 드래그해 길을 그리세요', hint2: '같은 색 활주로에 방향을 맞춰 착륙', hint3: '헬리콥터는 녹색 패드로',
      pause: '일시 정지', paused: '일시 정지됨', share: '결과 복사', copied: '복사됨!', newBest: '신기록!',
      daySeed: '일일 시드', time: '남은 시간', mult: '배수', total: '합계',
      music: '음악', sfx: '효과음', shake: '화면 흔들림', lang: '언어', reduceFlash: '번쩍임 줄이기',
      howtoBody: ['트랙패드나 마우스로 비행기를 누른 채 끌어 경로를 그립니다.', '비행기 색과 같은 활주로에, 활주로 방향(화살표)과 맞춰 들어가면 착륙합니다.', '서로 가까워지면 경고가 울리고, 부딪히면 근무가 끝납니다.', '연료가 바닥나기 전에 착륙시키세요. 비상(붉은 깜빡임) 항공기가 우선입니다.', '교대를 마치면 업그레이드 하나를 고릅니다. Space: 일시 정지(관제 집중 업그레이드 시 슬로모션), M: 음소거, F: 전체 화면.'],
      statsTotalLandings: '누적 착륙', statsRuns: '총 근무 횟수', statsBestShift: '최고 교대', statsDaily: '오늘의 교대 최고', statsTime: '누적 관제 시간',
    },
    en: {
      title: 'APPROACH', tagline: 'Draw flight paths. Land everyone.',
      start: 'Start shift', daily: "Today's shift", howto: 'How to play', stats: 'Records', settings: 'Settings',
      resume: 'Resume', restart: 'Restart', quit: 'Main menu', shift: 'Shift', score: 'Score', landings: 'Landings', best: 'Best',
      pickUpgrade: 'Choose an upgrade', pickHint: 'Press 1 · 2 · 3 or click', continue: 'Next shift',
      gameOver: 'Shift over', crash: 'Mid-air collision', fuelout: 'Fuel exhausted', incidents: '3 incidents', shiftClear: 'Shift complete!',
      nearMiss: 'Near miss', goAround: 'Go around', perfect: 'Perfect approach', emergency: 'Emergency', lowFuel: 'Low fuel', storm: 'Storm',
      hint1: 'Press and drag from an aircraft to draw its path', hint2: 'Land on the matching runway, aligned with its arrow', hint3: 'Helicopters go to the green pad',
      pause: 'Pause', paused: 'Paused', share: 'Copy result', copied: 'Copied!', newBest: 'New best!',
      daySeed: 'Daily seed', time: 'Time left', mult: 'Multiplier', total: 'Total',
      music: 'Music', sfx: 'Sound effects', shake: 'Screen shake', lang: 'Language', reduceFlash: 'Reduce flashing',
      howtoBody: ['Press on an aircraft with the trackpad or mouse and drag to draw its route.', 'An aircraft lands when it reaches a runway of its colour, aligned with the runway arrow.', 'Aircraft that get too close trigger a warning; a collision ends the shift.', 'Land everyone before their fuel runs out. Emergency aircraft (red blink) come first.', 'After each shift, pick one upgrade. Space: pause (slow-motion with Tower focus), M: mute, F: fullscreen.'],
      statsTotalLandings: 'Total landings', statsRuns: 'Shifts worked', statsBestShift: 'Best shift', statsDaily: "Today's best", statsTime: 'Time on duty',
    },
  };

  const CALLSIGNS = ['KAL', 'AAR', 'JJA', 'TWB', 'JNA', 'ABL', 'ESR', 'ANA', 'JAL', 'CPA', 'SIA', 'UAL', 'DAL', 'BAW', 'DLH', 'AFR', 'KLM', 'QFA', 'UAE', 'THA'];

  return { WORLD, AIRCRAFT, DEST_COLORS, UPGRADES, shiftConfig, STRINGS, CALLSIGNS };
})();
if (typeof module !== 'undefined') module.exports = CONTENT;
