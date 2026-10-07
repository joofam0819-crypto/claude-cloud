/* Keyboard + mouse + (optional) gamepad with per-frame "just pressed" edges. */
const Input = (() => {
  const down = new Set(), pressed = new Set(), released = new Set();
  const mouse = { x: 0, y: 0, down: false, pressed: false, released: false, inside: true, wheel: 0 };
  let lastDevice = 'keyboard';
  const KEYMAP = {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    confirm: ['Enter', 'Space', 'KeyZ'], back: ['Escape', 'KeyX'], pause: ['Escape', 'KeyP'],
    dash: ['Space', 'ShiftLeft', 'ShiftRight'], action: ['KeyJ', 'KeyK', 'KeyZ', 'KeyX'],
    mute: ['KeyM'], fullscreen: ['KeyF'], restart: ['KeyR'],
    one: ['Digit1'], two: ['Digit2'], three: ['Digit3'], four: ['Digit4'],
  };
  function attach(el) {
    window.addEventListener('keydown', e => {
      if (e.metaKey) return; // let macOS shortcuts through
      lastDevice = 'keyboard';
      if (!down.has(e.code)) pressed.add(e.code);
      down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { down.delete(e.code); released.add(e.code); });
    window.addEventListener('blur', () => { down.clear(); mouse.down = false; });
    const target = el || window;
    target.addEventListener('pointermove', e => { const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 }; mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; lastDevice = 'mouse'; });
    target.addEventListener('pointerdown', e => { if (e.button === 0) { mouse.down = true; mouse.pressed = true; } lastDevice = 'mouse'; });
    window.addEventListener('pointerup', e => { if (e.button === 0) { mouse.down = false; mouse.released = true; } });
    target.addEventListener('wheel', e => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    target.addEventListener('contextmenu', e => e.preventDefault());
  }
  const anyIn = (set, codes) => { for (const c of codes) if (set.has(c)) return true; return false; };
  const api = {
    attach, mouse,
    isDown: name => anyIn(down, KEYMAP[name] || [name]),
    justPressed: name => anyIn(pressed, KEYMAP[name] || [name]),
    justReleased: name => anyIn(released, KEYMAP[name] || [name]),
    anyPressed: () => pressed.size > 0 || mouse.pressed,
    axis() {
      let x = (api.isDown('right') ? 1 : 0) - (api.isDown('left') ? 1 : 0);
      let y = (api.isDown('down') ? 1 : 0) - (api.isDown('up') ? 1 : 0);
      const gp = api.gamepad();
      if (gp) { const dz = v => Math.abs(v) < 0.18 ? 0 : v; const gx = dz(gp.axes[0] || 0), gy = dz(gp.axes[1] || 0); if (gx || gy) { x = gx; y = gy; lastDevice = 'gamepad'; } }
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      return { x, y };
    },
    gamepad() { try { const g = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of g) if (p && p.connected) return p; } catch (_) {} return null; },
    endFrame() { pressed.clear(); released.clear(); mouse.pressed = false; mouse.released = false; mouse.wheel = 0; },
    get device() { return lastDevice; },
  };
  return api;
})();
