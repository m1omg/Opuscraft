import type { Settings } from '../settings';

/** Options panel shared by the main menu and the in-game menu. */
export function optionsPanel(s: Settings, onChange: (s: Settings) => void, onBack: () => void): HTMLElement {
  const p = document.createElement('div');
  p.className = 'panel';
  p.style.width = '470px';
  p.innerHTML = '<h2>Options</h2>';
  const section = (t: string) => {
    const h = document.createElement('h3');
    h.textContent = t;
    p.appendChild(h);
  };
  const slider = (label: string, key: keyof Settings, min: number, max: number, step: number, fmt: (v: number) => string = (v) => Math.round(v * 100) + '%') => {
    const row = document.createElement('div');
    row.className = 'opt-row';
    const l = document.createElement('label');
    l.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(s[key]);
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = fmt(Number(s[key]));
    inp.oninput = () => {
      (s[key] as number) = Number(inp.value);
      val.textContent = fmt(Number(inp.value));
      onChange(s);
    };
    row.append(l, inp, val);
    p.appendChild(row);
  };
  const check = (label: string, key: keyof Settings) => {
    const row = document.createElement('label');
    row.className = 'check';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = !!s[key];
    inp.onchange = () => {
      (s[key] as boolean) = inp.checked;
      onChange(s);
    };
    row.append(inp, document.createTextNode(label));
    p.appendChild(row);
  };
  section('Sound');
  slider('Master volume', 'master', 0, 1, 0.05);
  slider('Music', 'music', 0, 1, 0.05);
  slider('Sound effects', 'sfx', 0, 1, 0.05);
  slider('Unit voices', 'voice', 0, 1, 0.05);
  check('Spoken unit acknowledgements', 'voices');
  section('Graphics');
  check('Shadows', 'shadows');
  slider('Effects detail', 'quality', 0.3, 1, 0.1);
  slider('Resolution scale', 'pixelRatio', 0.75, 2, 0.25, (v) => v.toFixed(2) + 'x');
  check('Always show health bars', 'alwaysBars');
  section('Controls');
  check('Edge scrolling', 'edgeScroll');
  slider('Scroll speed', 'scrollSpeed', 0.4, 2, 0.1, (v) => v.toFixed(1) + 'x');
  const back = document.createElement('button');
  back.className = 'btn primary';
  back.textContent = 'Back';
  back.onclick = onBack;
  p.appendChild(back);
  return p;
}
