/* Roomify — эмуляция воспроизведения трека через колонку в помещении / в машине.
   Вся обработка — офлайн-рендер в Web Audio, экспорт в 16-бит WAV. */

// ---------------------------------------------------------------- параметры
const GROUPS = [
  {
    title: 'Колонка / динамик',
    params: [
      { key:'highpass', label:'Срез низов', unit:'Гц', def:105, min:20, max:600, step:1,
        hint:'Маленький динамик не воспроизводит глубокий бас. Выше значение — «мельче» и «дешевле» колонка. 60–90 — авто/крупная колонка, 150–300 — телефон/ноутбук.' },
      { key:'bassFreq', label:'Центр подъёма низа', unit:'Гц', def:140, min:50, max:400, step:5,
        hint:'Где поднимается бас. Ставится чуть выше «среза низов»: у реальных колонок там сидит резонанс порта/корпуса. 80–110 — авто и крупная акустика, 150–250 — маленький динамик.' },
      { key:'bassGain', label:'Подъём низа (bass boost)', unit:'дБ', def:2, min:0, max:12, step:0.1,
        hint:'Крошечная добавка веса, чтобы после среза низов трек не звучал пустым. 1.5–3 дБ — незаметно на слух, но «мясистее»; 5 дБ+ — явно подкачанный бас. Громкость от этого не растёт: результат выравнивается по оригиналу.' },
      { key:'lowpass', label:'Срез верхов', unit:'Гц', def:11500, min:2000, max:20000, step:100,
        hint:'Приглушение высоких частот: корпус колонки и воздух комнаты съедают «воздух». 12–15 кГц — почти прозрачно, 6–8 кГц — глухо и далеко.' },
      { key:'boxFreq', label:'Частота «бубнёжа»', unit:'Гц', def:420, min:80, max:1200, step:5,
        hint:'Резонанс корпуса колонки / салона. 150–250 Гц — гул машины, 350–600 Гц — картонная «коробочность».' },
      { key:'boxGain', label:'Подъём «бубнёжа»', unit:'дБ', def:3.2, min:0, max:12, step:0.1,
        hint:'Насколько сильно выпирает этот резонанс. 2–3 дБ — деликатно, больше 6 дБ — явный дешёвый динамик.' },
      { key:'boxQ', label:'Добротность резонанса', unit:'Q', def:1.1, min:0.3, max:8, step:0.1,
        hint:'Узость резонанса. Низкое Q (0.7–1.5) — широкая окраска, высокое (4+) — звенящий «трубный» призвук.' },
      { key:'scoopFreq', label:'Частота провала', unit:'Гц', def:2600, min:800, max:8000, step:10,
        hint:'Где подрезается верхняя середина — это убирает «прямоту» и отодвигает источник вглубь комнаты.' },
      { key:'scoopGain', label:'Глубина провала', unit:'дБ', def:-2, min:-12, max:0, step:0.1,
        hint:'0 — без провала. −2…−3 дБ — звук мягче и дальше. Ниже −6 дБ — заметно глухо.' },
      { key:'scoopQ', label:'Добротность провала', unit:'Q', def:1.4, min:0.3, max:8, step:0.1,
        hint:'Ширина провала. Для естественности держите 1–2.' },
      { key:'drive', label:'Насыщение динамика', unit:'%', def:11, min:0, max:100, step:1,
        hint:'Мягкое нелинейное искажение (перегруз дешёвого усилителя). Кривая с единичным усилением на тихом сигнале, поэтому громкость от неё не растёт. 5–15 % — «живее» и плотнее, 40 %+ — слышимая грязь.' },
    ]
  },
  {
    title: 'Помещение',
    params: [
      { key:'roomSize', label:'Размер помещения', unit:'м', def:4.5, min:1, max:20, step:0.1,
        hint:'Расстояние до стен: задаёт задержки ранних отражений (t = 2d/343). 1.5–2 — салон машины, 3–6 — комната, 10+ — зал.' },
      { key:'decay', label:'Время затухания (RT60)', unit:'с', def:0.45, min:0.03, max:4, step:0.01,
        hint:'Длина хвоста эха. 0.05–0.1 — салон машины (очень заглушенный), 0.3–0.6 — жилая комната, 1.5+ — гулкий зал. Уровень хвоста от этого НЕ меняется: импульсная характеристика нормируется по энергии.' },
      { key:'predelay', label:'Предзадержка', unit:'мс', def:12, min:0, max:120, step:0.5,
        hint:'Пауза между прямым звуком и первым отражением. Малые значения (2–10 мс) — источник близко, большие — далеко/в большом помещении.' },
      { key:'wet', label:'Доля комнаты (wet)', unit:'%', def:22, min:0, max:100, step:1,
        hint:'Сколько «воздуха» подмешано. 12–20 % — слушатель рядом с колонкой, 35–55 % — в другом конце комнаты. Выше 60 % хвост начинает звучать как шумовая пелена.' },
      { key:'earlyLevel', label:'Уровень ранних отражений', unit:'%', def:42, min:0, max:100, step:1,
        hint:'Отдельные отскоки от стен и потолка. Они дают ощущение «в помещении» сильнее, чем длинный хвост, и не шумят — поднимайте их, а не wet.' },
      { key:'damping', label:'Поглощение (демпфирование)', unit:'Гц', def:3200, min:500, max:16000, step:100,
        hint:'Стартовая частота среза хвоста; по ходу затухания она автоматически падает до 25 % от неё — ВЧ гаснут быстрее НЧ, как в реальной комнате. Ниже значение — глуше, теплее и заметно меньше «шипения».' },
      { key:'diffusion', label:'Диффузия', unit:'%', def:92, min:5, max:100, step:1,
        hint:'Плотность отражений. 90–100 % — гладкий рассеянный хвост. Ниже 50 % отражения становятся редкими и при нормировке по энергии — громкими поодиночке, звук «трещит». Понижать только осознанно.' },
    ]
  },
  {
    title: '«Неидеальность» и панорама',
    params: [
      { key:'wowDepth', label:'Глубина дрожания (wow)', unit:'мс', def:0.16, min:0, max:3, step:0.01,
        hint:'Микроплавание высоты тона — живая, не стерильная подача. 0.1–0.3 мс почти незаметно на слух, но снимает «цифровую» ровность. 0 — выключено.' },
      { key:'wowRate', label:'Скорость дрожания', unit:'Гц', def:0.7, min:0.05, max:6, step:0.05,
        hint:'Как быстро плывёт высота. 0.3–1 Гц — медленное естественное дыхание, 4+ Гц — эффект вибрато.' },
      { key:'roadNoise', label:'Дорожный шум', unit:'%', def:0, min:0, max:20, step:0.1,
        hint:'Фоновый гул дороги и покрышек — уровень в процентах от громкости трека. 1 % (−40 дБ) в паузах едва слышно, в музыке не мешает; 3–5 % — заметная езда; 0 — выключено. Шум не проходит ни через динамик, ни через реверберацию: он не из колонки, он вокруг вас.' },
      { key:'roadTone', label:'Тон дорожного шума', unit:'Гц', def:700, min:120, max:4000, step:10,
        hint:'Верхняя граница гула. 300–500 — глухой рокот подвески на асфальте, 700–1200 — шорох покрышек, 2000+ — шум набегающего воздуха на скорости.' },
      { key:'stereoWidth', label:'Ширина стерео', unit:'%', def:52, min:0, max:150, step:1,
        hint:'Одна колонка = моно. 0 % — полное моно, 50–70 % — сужено как у компактной акустики, 100 % — исходная панорама.' },
    ]
  },
  {
    title: 'Выход',
    params: [
      { key:'outputGain', label:'Громкость относительно оригинала', unit:'дБ', def:0, min:-24, max:12, step:0.1,
        hint:'0 дБ = результат автоматически выравнивается по громкости (RMS) с исходным треком, поэтому он никогда не выходит громче. Это смещение от него: −3 дБ — тише оригинала, +2 дБ — чуть громче. Пик всё равно удерживается ниже −0.3 dBFS.' },
      { key:'tail', label:'Запас хвоста', unit:'с', def:1.2, min:0, max:6, step:0.1,
        hint:'Сколько тишины добавить в конец файла, чтобы эхо успело догаснуть и не обрывалось.' },
    ]
  },
];

const ALL = GROUPS.flatMap(g => g.params);
const DEFAULTS = Object.fromEntries(ALL.map(p => [p.key, p.def]));

/* Нейтральный набор: все эффекты выключены. Не просто «слабые значения» —
   render() распознаёт такую комбинацию и отдаёт исходный буфер как есть,
   без единого фильтра, так что «Оригинал» звучит бит-в-бит как загруженный
   файл (при скачивании меняется только контейнер/кодек). */
const NEUTRAL = {
  ...DEFAULTS,
  highpass: 20, lowpass: 20000,
  bassGain: 0, boxGain: 0, scoopGain: 0, drive: 0,
  wet: 0, earlyLevel: 0, wowDepth: 0,
  stereoWidth: 100, outputGain: 0, tail: 0,
};

const BUILTIN = {
  'Оригинал': NEUTRAL,
  'Полочная колонка в комнате': { ...DEFAULTS },
  'Мощная колонка в комнате': { ...DEFAULTS, highpass:45, bassFreq:70, bassGain:2.5,
      lowpass:16000, boxFreq:200, boxGain:1.5, boxQ:0.9, scoopFreq:2600, scoopGain:-1,
      scoopQ:1.2, drive:4, roomSize:5.5, decay:0.5, predelay:10, wet:24, earlyLevel:50,
      damping:3800, diffusion:95, wowDepth:0.08, wowRate:0.6, stereoWidth:85, tail:1.5 },
  /* На улице нет усиления от стен и пола, которое в комнате добавляет низу
     6–10 дБ: бас уходит в пространство. Поэтому срез выше, а подъём низа
     выключен совсем — иначе получается «комната под открытым небом».
     Диффузия поднята с 45 до 80 %: редкие отражения при нормировке по энергии
     становятся поодиночке громкими и на басу дают зернистый призвук. */
  'Колонка на улице': { ...DEFAULTS, highpass:105, bassFreq:110, bassGain:0, lowpass:10000,
      boxFreq:320, boxGain:1.5, boxQ:0.8, scoopFreq:2800, scoopGain:-1, scoopQ:1.2, drive:6,
      roomSize:18, decay:0.22, predelay:38, wet:11, earlyLevel:45, damping:2000, diffusion:80,
      wowDepth:0.1, wowRate:0.5, roadNoise:2, roadTone:1800, stereoWidth:60, tail:1.2 },
  'Машина (салон)': { ...DEFAULTS, bassFreq:90, bassGain:3.5, highpass:60, lowpass:12000, boxFreq:180, boxGain:4, boxQ:1.3,
      scoopFreq:3000, scoopGain:-1.2, drive:8, roomSize:1.6, decay:0.08, predelay:2,
      wet:14, earlyLevel:70, damping:4500, diffusion:95, wowDepth:0.08, stereoWidth:70,
      roadNoise:1, roadTone:700, tail:0.5 },
  'Маленькая колонка на кухне': { ...DEFAULTS, bassFreq:240, bassGain:1.2, highpass:210, lowpass:9000, boxFreq:560, boxGain:4.5,
      boxQ:1.8, scoopGain:-2.5, drive:16, roomSize:3.5, decay:0.42, predelay:8, wet:22,
      earlyLevel:45, damping:3000, diffusion:92, wowDepth:0.18, stereoWidth:35 },
  'Из соседней комнаты': { ...DEFAULTS, bassFreq:115, bassGain:2.5, highpass:80, lowpass:3200, boxFreq:300, boxGain:4, boxQ:1.6,
      scoopGain:-4, drive:5, roomSize:7, decay:0.8, predelay:22, wet:45, earlyLevel:30,
      damping:1800, diffusion:100, wowDepth:0.12, stereoWidth:20, tail:1.6 },
  'Клуб / большой зал': { ...DEFAULTS, bassFreq:80, bassGain:1.5, highpass:50, lowpass:14000, boxFreq:250, boxGain:2, boxQ:1,
      scoopGain:-1.5, drive:3, roomSize:14, decay:1.5, predelay:28, wet:32, earlyLevel:28,
      damping:3200, diffusion:100, wowDepth:0.08, stereoWidth:90, tail:3 },
};

// ---------------------------------------------------------------- состояние
const LS_KEY = 'roomify.presets.v1';
const LS_LAST = 'roomify.last.v3';
let sourceBuffer = null;      // декодированный оригинал
let sourceName = 'track';

const $ = s => document.querySelector(s);
const statusEl = $('#status');

function setStatus(text, isErr = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('err', !!isErr);
}

// ---------------------------------------------------------------- форма
function buildForm() {
  const root = $('#params');
  root.innerHTML = '';
  for (const g of GROUPS) {
    const sec = document.createElement('div');
    sec.className = 'group';
    sec.innerHTML = `<h3>${g.title}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const p of g.params) {
      const f = document.createElement('div');
      f.className = 'field';
      f.innerHTML = `
        <label for="p_${p.key}">${p.label}${p.unit ? ` <span class="unit">(${p.unit})</span>` : ''}
          <span class="info" tabindex="0" role="button" aria-label="Подсказка: ${p.label}">i<span
            class="tip">${p.hint}<span class="def">По умолчанию: ${p.def}${p.unit ? ' ' + p.unit : ''}</span></span></span>
        </label>
        <div class="ctl">
          <input type="number" id="p_${p.key}" value="${p.def}" min="${p.min}" max="${p.max}" step="${p.step}">
          <input type="range" id="r_${p.key}" value="${p.def}" min="${p.min}" max="${p.max}" step="${p.step}">
        </div>`;
      grid.appendChild(f);
    }
    sec.appendChild(grid);
    root.appendChild(sec);
  }
  // подсказка у правого края экрана раскрывается влево
  root.addEventListener('pointerover', e => {
    const info = e.target.closest('.info');
    if (!info) return;
    const tip = info.querySelector('.tip');
    tip.classList.remove('left');
    const r = info.getBoundingClientRect();
    if (r.left + 290 > window.innerWidth - 12) tip.classList.add('left');
  });
  for (const p of ALL) {
    const num = $(`#p_${p.key}`), rng = $(`#r_${p.key}`);
    num.addEventListener('input', () => { rng.value = num.value; rememberLast(); });
    rng.addEventListener('input', () => { num.value = rng.value; rememberLast(); });
  }
}

function getParams() {
  const out = {};
  for (const p of ALL) {
    let v = parseFloat($(`#p_${p.key}`).value);
    if (!isFinite(v)) v = p.def;
    out[p.key] = Math.min(p.max, Math.max(p.min, v));
  }
  return out;
}

function setParams(vals) {
  for (const p of ALL) {
    const v = (vals && isFinite(vals[p.key])) ? vals[p.key] : p.def;
    $(`#p_${p.key}`).value = v;
    $(`#r_${p.key}`).value = v;
  }
  rememberLast();
}

function rememberLast() {
  try { localStorage.setItem(LS_LAST, JSON.stringify(getParams())); } catch (e) {}
}

// ---------------------------------------------------------------- пресеты
function userPresets() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}
function saveUserPresets(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}
function refreshPresetList(select) {
  const sel = $('#presetSelect');
  const keep = select ?? sel.value;
  sel.innerHTML = '';
  const g1 = document.createElement('optgroup'); g1.label = 'Встроенные';
  for (const name of Object.keys(BUILTIN)) g1.appendChild(new Option(name, 'b:' + name));
  sel.appendChild(g1);
  const mine = userPresets();
  if (Object.keys(mine).length) {
    const g2 = document.createElement('optgroup'); g2.label = 'Мои наборы';
    for (const name of Object.keys(mine)) g2.appendChild(new Option(name, 'u:' + name));
    sel.appendChild(g2);
  }
  if (keep) sel.value = keep;
}

// ---------------------------------------------------------------- DSP
/* Насыщение с ЕДИНИЧНЫМ усилением на малом сигнале: tanh(k*x)/k.
   Старый вариант tanh(k*x)/tanh(k) имел усиление k/tanh(k) > 1 и на
   дефолтных 12 % поднимал весь трек на +4.7 дБ. */
function makeSaturationCurve(amount) {
  const n = 4096, curve = new Float32Array(n);
  const k = amount * 5;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = k < 1e-4 ? x : Math.tanh(k * x) / k;
  }
  return curve;
}

/* Импульсная характеристика помещения.

   Три вещи, без которых затухающий шум звучит именно как шум, а не как комната
   (см. Traer & McDermott, reverbGen):
     1) частотно-зависимое затухание — ВЧ гаснут заметно быстрее НЧ, поэтому
        срез однополюсного фильтра едет вниз по ходу хвоста;
     2) фейд-ин — диффузное поле нарастает, а не начинается «шлепком»;
     3) нормировка ПО ЭНЕРГИИ: sqrt(sum(ir^2)) = 1. Это ключевое. Усиление
        свёртки с шумовой IR равно именно sqrt(sum(ir^2)), а не её RMS, так что
        нормировка по RMS давала хвост в ~18 раз громче сухого сигнала. */
function buildImpulse(ctx, p) {
  const sr = ctx.sampleRate;
  const rt60 = Math.max(0.03, p.decay);
  const c = 343; // скорость звука, м/с
  const early = [];
  const dims = [p.roomSize, p.roomSize * 0.72 + 0.6, p.roomSize * 0.45 + 0.8];
  for (const d of dims) {
    for (let order = 1; order <= 3; order++) {
      const t = (2 * d * order) / c;
      if (t < rt60 * 2 + 0.05) early.push({ t, g: Math.pow(0.62, order) / (1 + t * 3) });
    }
  }
  const maxEarly = early.reduce((m, e) => Math.max(m, e.t), 0);
  const len = Math.max(256, Math.ceil(sr * (rt60 * 1.2 + maxEarly + 0.03)));
  const ir = ctx.createBuffer(2, len, sr);

  const density = Math.min(1, Math.max(0.05, p.diffusion / 100));
  const densComp = 1 / Math.sqrt(density);      // редкие отражения — выше каждое
  const earlyGain = p.earlyLevel / 100;
  const fadeIn = Math.max(1, Math.round(sr * Math.min(0.025, rt60 * 0.2)));
  const fadeOut = Math.max(1, Math.round(sr * 0.012));
  const dampHz = Math.min(sr / 2.4, p.damping);

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0, coef = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // срез хвоста едет с dampHz вниз до 25 % от него по мере затухания
      if ((i & 63) === 0) {
        const fc = dampHz * (0.25 + 0.75 * Math.exp((-3 * t) / rt60));
        coef = Math.exp((-2 * Math.PI * fc) / sr);
      }
      const hit = Math.random() < density ? (Math.random() * 2 - 1) * densComp : 0;
      lp = hit * (1 - coef) + lp * coef;        // однополюсный ФНЧ, усиление по DC = 1
      data[i] = lp * Math.pow(10, (-3 * t) / rt60);
    }
    // ранние отражения: не голые дельты (они звенят), а короткий сглаженный всплеск
    for (const e of early) {
      const jitter = 1 + (ch === 0 ? -1 : 1) * 0.035 * (0.5 + Math.random());
      const idx = Math.round(e.t * jitter * sr);
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let k = -2; k <= 2; k++) {
        const j = idx + k;
        if (j > 0 && j < len) data[j] += e.g * earlyGain * sign * (0.25 * (1 + Math.cos(Math.PI * k / 3)));
      }
    }
    // убираем инфранизы из хвоста, иначе комната «гудит» и ест запас по уровню
    const hpCoef = Math.exp((-2 * Math.PI * 110) / sr);
    let yPrev = 0, xPrev = 0;
    for (let i = 0; i < len; i++) {
      const x = data[i];
      yPrev = hpCoef * (yPrev + x - xPrev);
      xPrev = x;
      data[i] = yPrev;
    }
    for (let i = 0; i < fadeIn; i++) data[i] *= i / fadeIn;                       // нарастание
    for (let i = 0; i < fadeOut; i++) data[len - 1 - i] *= i / fadeOut;           // без щелчка в конце
  }

  // нормировка по энергии: усиление свёртки ≈ 1, wet сопоставим с dry
  let energy = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) energy += d[i] * d[i];
  }
  const k = 1 / Math.sqrt(Math.max(1e-12, energy / 2));
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] *= k;
  }
  return ir;
}

const rmsOf = buf => {
  let sum = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    n += d.length;
  }
  return Math.sqrt(sum / Math.max(1, n));
};

/* Дорожный шум: низкий рокот подвески (проинтегрированный белый шум) плюс
   шорох покрышек (полосовой), всё под фильтром — салон закрыт, выше пары
   килогерц слышать нечего. Генерим короткий отрезок и зацикливаем: шум
   стационарный, повтор на слух не читается, а полный буфер на длинном треке
   стоил бы сотен мегабайт. Шов склеиваем кроссфейдом, иначе в стыке щелчок. */
function buildRoadNoise(ctx, p, seconds = 15) {
  const sr = ctx.sampleRate;
  const len = Math.ceil(seconds * sr);
  const fade = Math.ceil(0.5 * sr);
  const tone = Math.min(sr / 3, p.roadTone);
  const cLow = Math.exp((-2 * Math.PI * 45) / sr);      // рокот: всё ниже ~45 Гц
  const cTire = Math.exp((-2 * Math.PI * tone) / sr);   // покрышки
  const cAir = Math.exp((-2 * Math.PI * (tone * 2.2)) / sr);
  const cMod = Math.exp((-2 * Math.PI * 0.25) / sr);    // медленная смена покрытия

  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const tmp = new Float32Array(len + fade);
    let low = 0, tire = 0, air = 0, mod = 0;
    for (let i = 0; i < tmp.length; i++) {
      const w = Math.random() * 2 - 1;
      low  = w * (1 - cLow)  + low  * cLow;
      tire = w * (1 - cTire) + tire * cTire;
      mod  = (Math.random() * 2 - 1) * (1 - cMod) + mod * cMod;
      let s = low * 12 + (tire - low) * 1.4;            // рокот + полоса покрышек
      air = s * (1 - cAir) + air * cAir;                // срез «фитиля» сверху
      tmp[i] = air * (1 + 6 * mod);                     // ±дыхание покрытия
    }
    // бесшовная склейка: конец подмешиваем в начало
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      tmp[i] = tmp[i] * k + tmp[len + i] * (1 - k);
    }
    // нормируем к RMS = 1, чтобы уровень задавался одним множителем
    let sum = 0;
    for (let i = 0; i < len; i++) sum += tmp[i] * tmp[i];
    const g = 1 / Math.sqrt(Math.max(1e-12, sum / len));
    const out = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] = tmp[i] * g;
  }
  return buf;
}

function widthStage(ctx, widthPct) {
  // Mid/Side: L = M + S*w, R = M - S*w
  const w = widthPct / 100;
  const input = ctx.createGain();
  input.channelCount = 2; input.channelCountMode = 'explicit'; input.channelInterpretation = 'speakers';
  const output = ctx.createGain();
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };

  const mid = g(1), side = g(1);
  const lM = g(0.5), rM = g(0.5), lS = g(0.5), rS = g(-0.5);
  input.connect(splitter);
  splitter.connect(lM, 0); splitter.connect(rM, 1);
  splitter.connect(lS, 0); splitter.connect(rS, 1);
  lM.connect(mid); rM.connect(mid);
  lS.connect(side); rS.connect(side);

  const sw = g(w); side.connect(sw);
  const mL = g(1), mR = g(1), sL = g(1), sR = g(-1);
  mid.connect(mL); mid.connect(mR);
  sw.connect(sL); sw.connect(sR);
  mL.connect(merger, 0, 0); sL.connect(merger, 0, 0);
  mR.connect(merger, 0, 1); sR.connect(merger, 0, 1);
  merger.connect(output);
  return { input, output };
}

// набор эффектов выключен целиком — трогать сигнал незачем
function isBypass(p) {
  return p.highpass <= 20 && p.lowpass >= 20000 && p.bassGain === 0 && p.boxGain === 0
      && p.scoopGain === 0 && p.drive === 0 && p.wet === 0 && p.wowDepth === 0
      && p.stereoWidth === 100 && p.outputGain === 0 && p.roadNoise === 0;
}

async function render(buffer, p) {
  if (isBypass(p)) return buffer;   // исходный буфер, без копирования и без изменений
  const sr = buffer.sampleRate;
  const length = Math.ceil((buffer.duration + p.tail) * sr) + sr * 0.05;
  const ctx = new OfflineAudioContext(2, Math.ceil(length), sr);

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  // приведение к стерео (моно-источник корректно разложится)
  const inGain = ctx.createGain();
  inGain.channelCount = 2; inGain.channelCountMode = 'explicit'; inGain.channelInterpretation = 'speakers';

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = p.highpass; hp.Q.value = 0.8;
  // второй порядок — резче, как физический предел динамика
  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'highpass'; hp2.frequency.value = p.highpass; hp2.Q.value = 0.6;

  /* Подъём низа стоит ПОСЛЕ насыщения. Так и физически вернее (усилитель
     искажает сигнал, резонанс порта/корпуса — уже акустика за ним), и чище:
     когда бас-буст качал сатуратор, низ давал интермодуляцию по всему спектру
     — на слух это и есть «хрип». Замер на двухтоне 60 Гц + 1 кГц: перенос
     убирает 4 дБ IMD. */
  const bass = ctx.createBiquadFilter();
  bass.type = 'peaking';
  bass.frequency.value = Math.max(p.bassFreq, p.highpass * 1.05);
  bass.gain.value = p.bassGain;
  bass.Q.value = 0.9;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = p.lowpass; lp.Q.value = 0.7;

  const box = ctx.createBiquadFilter();
  box.type = 'peaking'; box.frequency.value = p.boxFreq; box.gain.value = p.boxGain; box.Q.value = p.boxQ;

  const scoop = ctx.createBiquadFilter();
  scoop.type = 'peaking'; scoop.frequency.value = p.scoopFreq; scoop.gain.value = p.scoopGain; scoop.Q.value = p.scoopQ;

  const sat = ctx.createWaveShaper();
  sat.curve = makeSaturationCurve(p.drive / 100);
  sat.oversample = '4x';
  const satTrim = ctx.createGain();
  satTrim.gain.value = 1; // кривая уже с единичным усилением на малом сигнале

  // микродрожание высоты тона (wow) — «неидеальность» без шума
  const wow = ctx.createDelay(0.2);
  wow.delayTime.value = 0.01;
  if (p.wowDepth > 0) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = p.wowRate;
    const depth = ctx.createGain();
    depth.gain.value = p.wowDepth / 1000;
    lfo.connect(depth); depth.connect(wow.delayTime);
    lfo.start(0);
    // вторая, более медленная составляющая — движение менее периодичное
    const lfo2 = ctx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.value = Math.max(0.03, p.wowRate * 0.37);
    const depth2 = ctx.createGain();
    depth2.gain.value = (p.wowDepth / 1000) * 0.55;
    lfo2.connect(depth2); depth2.connect(wow.delayTime);
    lfo2.start(0);
  }

  // комната
  const preDelay = ctx.createDelay(1);
  preDelay.delayTime.value = p.predelay / 1000;
  const conv = ctx.createConvolver();
  conv.normalize = false;
  conv.buffer = buildImpulse(ctx, p);

  const wetMix = Math.min(1, Math.max(0, p.wet / 100));
  const wetGain = ctx.createGain(); wetGain.gain.value = Math.sin(wetMix * Math.PI / 2) * 1.0;
  const dryGain = ctx.createGain(); dryGain.gain.value = Math.cos(wetMix * Math.PI / 2);

  const width = widthStage(ctx, p.stereoWidth);
  const out = ctx.createGain();
  out.gain.value = 1; // уровень выставляется после рендера, выравниванием по оригиналу
  // коммутация
  src.connect(inGain);
  inGain.connect(hp); hp.connect(hp2); hp2.connect(lp);
  lp.connect(box); box.connect(scoop);
  scoop.connect(sat); sat.connect(satTrim);
  satTrim.connect(bass); bass.connect(wow);

  wow.connect(dryGain);
  wow.connect(preDelay); preDelay.connect(conv); conv.connect(wetGain);

  dryGain.connect(width.input);
  wetGain.connect(width.input);
  width.output.connect(out);

  /* Шум подмешивается ПОСЛЕ всей цепочки: он не из колонки и не отражается
     от стен — он просто вокруг слушателя. Уровень считаем от RMS оригинала,
     поэтому «1 %» означает −40 дБ относительно трека независимо от материала. */
  if (p.roadNoise > 0) {
    const noise = ctx.createBufferSource();
    noise.buffer = buildRoadNoise(ctx, p);
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = (p.roadNoise / 100) * rmsOf(buffer);
    noise.connect(noiseGain);
    noiseGain.connect(out);
    noise.start(0);
  }

  out.connect(ctx.destination);

  src.start(0);
  const rendered = await ctx.startRendering();

  // --- выравнивание громкости по оригиналу + защита от клиппинга.
  // Раньше здесь была нормализация пика к 0 dBFS, из-за которой результат
  // всегда выходил громче исходника. Теперь целимся в RMS оригинала:
  // фильтрация съедает энергию, и без этого трек звучал бы тише или,
  // после нормализации пика, заметно громче.
  const srcRms = rmsOf(buffer), outRms = rmsOf(rendered);
  let g = outRms > 1e-7 && srcRms > 1e-7 ? srcRms / outRms : 1;
  g = Math.min(8, Math.max(0.05, g)) * Math.pow(10, p.outputGain / 20);

  let peak = 0;
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    const d = rendered.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  const ceiling = 0.966; // −0.3 dBFS

  /* Ограничение делаем здесь, а не вейвшейпером в графе. Раньше лимитер стоял
     ДО выравнивания уровня и с порогом 0.6: при заметном бас-бусте внутренние
     пики уходили далеко за порог, и tanh давил не отдельные всплески, а почти
     весь сигнал — на басовитом материале это слышно как хрип динамика.
     Теперь сначала уровень, потом мягкое колено с порогом 0.85: под ним
     сигнал не трогается вовсе. */
  const KNEE = 0.85;
  let post = 0;
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    const d = rendered.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      let s = d[i] * g;
      const abs = Math.abs(s);
      if (abs > KNEE) {
        s = Math.sign(s) * (KNEE + (1 - KNEE) * Math.tanh((abs - KNEE) / (1 - KNEE)));
      }
      d[i] = s;
      if (Math.abs(s) > post) post = Math.abs(s);
    }
  }
  if (post > ceiling) {
    const k = ceiling / post;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const d = rendered.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  return rendered;
}

// ------------------------------------------------------- кодирование файла
const FORMATS = {
  'mp3-320': { label: 'MP3 320 кбит/с', ext: 'mp3', mime: 'audio/mpeg', kbps: 320 },
  'mp3-192': { label: 'MP3 192 кбит/с', ext: 'mp3', mime: 'audio/mpeg', kbps: 192 },
  'mp3-128': { label: 'MP3 128 кбит/с', ext: 'mp3', mime: 'audio/mpeg', kbps: 128 },
  'wav-16':  { label: 'WAV 16 бит',     ext: 'wav', mime: 'audio/wav',  bits: 16 },
  'wav-24':  { label: 'WAV 24 бит',     ext: 'wav', mime: 'audio/wav',  bits: 24 },
};

function encodeWav(buffer, bits = 16) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, n = buffer.length;
  const bytesPer = bits / 8;
  const bytes = n * ch * bytesPer;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * bytesPer, true); v.setUint16(32, ch * bytesPer, true);
  v.setUint16(34, bits, true);
  str(36, 'data'); v.setUint32(40, bytes, true);

  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      if (bits === 16) {
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      } else {
        const q = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        v.setUint8(off, q & 0xff);
        v.setUint8(off + 1, (q >> 8) & 0xff);
        v.setUint8(off + 2, (q >> 16) & 0xff);
      }
      off += bytesPer;
    }
  }
  return new Blob([v.buffer], { type: 'audio/wav' });
}

/* MP3 через lamejs (лежит локально в vendor/, интернет не нужен).
   Кодируем блоками по 1152 сэмпла и периодически отдаём управление браузеру,
   иначе на длинном треке страница замирает без признаков жизни. */
async function encodeMp3(buffer, kbps, onProgress) {
  if (typeof lamejs === 'undefined') throw new Error('MP3-кодировщик не загрузился (vendor/lame.min.js)');
  const ch = Math.min(2, buffer.numberOfChannels), sr = buffer.sampleRate, n = buffer.length;
  const enc = new lamejs.Mp3Encoder(ch, sr, kbps);
  const toInt16 = src => {
    const out = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const s = Math.max(-1, Math.min(1, src[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };
  const L = toInt16(buffer.getChannelData(0));
  const R = ch > 1 ? toInt16(buffer.getChannelData(1)) : null;

  const BLOCK = 1152, parts = [];
  for (let i = 0; i < n; i += BLOCK) {
    const l = L.subarray(i, i + BLOCK);
    const chunk = ch > 1 ? enc.encodeBuffer(l, R.subarray(i, i + BLOCK)) : enc.encodeBuffer(l);
    if (chunk.length) parts.push(chunk);
    if ((i / BLOCK) % 200 === 0) {
      if (onProgress) onProgress(i / n);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  const last = enc.flush();
  if (last.length) parts.push(last);
  return new Blob(parts, { type: 'audio/mpeg' });
}

async function encodeAs(buffer, formatKey, onProgress) {
  const f = FORMATS[formatKey] || FORMATS['mp3-320'];
  const blob = f.ext === 'mp3'
    ? await encodeMp3(buffer, f.kbps, onProgress)
    : encodeWav(buffer, f.bits);
  return { blob, ext: f.ext };
}

/* ---- встроенный плеер ---------------------------------------------------
   Воспроизводится только результат обработки. В кэше лежит отрендеренный
   AudioBuffer, плееру он отдаётся как WAV (быстро и без потерь), а для
   скачивания кодируется в выбранный формат. */
const audio = new Audio();
audio.preload = 'auto';
let trackUrl = null, seeking = false, loadedKey = null;

// ключ текущих настроек: по нему видно, не устарел ли уже загруженный в плеер трек
const paramsKey = () => sourceName + '|' + JSON.stringify(getParams());

const fmt = t => {
  if (!isFinite(t) || t < 0) t = 0;
  t = Math.floor(t);
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
};

// пауза + возврат треугольника на кнопке
function pausePlayback() {
  audio.pause();
  $('#btnPlay').textContent = '▶';
}

function showTrack(buffer, key) {
  const prev = trackUrl;
  trackUrl = URL.createObjectURL(encodeWav(buffer, 16));
  loadedKey = key;
  audio.src = trackUrl;
  audio.load();
  $('#player').hidden = false;
  $('#btnPlay').disabled = false;
  $('#seek').value = 0;
  $('#tCur').textContent = '0:00';
  if (prev) setTimeout(() => URL.revokeObjectURL(prev), 3000);
}

// обработать, если результата ещё нет или настройки менялись после него
async function ensureTrack() {
  const key = paramsKey();
  if (audio.src && loadedKey === key) return;
  showTrack(await renderBuffer(), key);
}

$('#btnPlay').addEventListener('click', async () => {
  if (!sourceBuffer) return;
  if (!audio.paused) { pausePlayback(); return; }
  try {
    await ensureTrack();
    await audio.play();
  } catch (e) {
    setStatus('Не удалось воспроизвести: ' + e.message, true);
  }
});
audio.addEventListener('play',  () => { $('#btnPlay').textContent = '❚❚'; });
audio.addEventListener('pause', () => { $('#btnPlay').textContent = '▶'; });
audio.addEventListener('ended', () => { $('#btnPlay').textContent = '▶'; });
audio.addEventListener('loadedmetadata', () => { $('#tDur').textContent = fmt(audio.duration); });
audio.addEventListener('timeupdate', () => {
  $('#tCur').textContent = fmt(audio.currentTime);
  if (!seeking && audio.duration) $('#seek').value = (audio.currentTime / audio.duration) * 1000;
});

const seek = $('#seek');
seek.addEventListener('pointerdown', () => { seeking = true; });
seek.addEventListener('input', () => {
  if (audio.duration) $('#tCur').textContent = fmt((seek.value / 1000) * audio.duration);
});
const commitSeek = () => {
  if (seeking && audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
  seeking = false;
};
seek.addEventListener('pointerup', commitSeek);
seek.addEventListener('change', commitSeek);

let busyFlag = false;

function setBusy(busy) {
  busyFlag = busy;
  for (const id of ['#btnPreview', '#btnDownload', '#btnPlay'])
    $(id).disabled = busy || !sourceBuffer;
  // пока идёт рендер, не даём запустить второй поверх первого
  for (const id of ['#presetSelect', '#btnSavePreset', '#btnReset', '#btnDeletePreset'])
    $(id).disabled = busy;
  updateCacheMeta();
}

async function loadFile(file) {
  setStatus('Декодирую файл…');
  try {
    const ab = await file.arrayBuffer();
    const ctx = new AudioContext();
    sourceBuffer = await ctx.decodeAudioData(ab);
    ctx.close();
    sourceName = file.name.replace(/\.[^.]+$/, '');
    cache.clear();
    updateCacheMeta();
    pausePlayback();
    audio.removeAttribute('src');
    loadedKey = null;
    $('#player').hidden = false;
    $('#btnPlay').disabled = false;
    $('#seek').value = 0;
    $('#tCur').textContent = '0:00';
    $('#tDur').textContent = '0:00';
    const d = sourceBuffer.duration;
    $('#fileMeta').textContent =
      `${file.name} — ${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')}, ` +
      `${sourceBuffer.sampleRate} Гц, ${sourceBuffer.numberOfChannels === 1 ? 'моно' : 'стерео'}`;
    setBusy(false);
    setStatus('Файл загружен. Настройте параметры и нажмите «Обработать».');
  } catch (e) {
    sourceBuffer = null;
    setBusy(true);
    setStatus('Не удалось декодировать файл: ' + e.message, true);
  }
}

/* Кэш результатов: наборы переключают часто, поэтому держим несколько
   отрендеренных вариантов одного трека, а не один. Кладём в кэш только то,
   что реально обработали (выбор набора / воспроизведение) — ничего не
   рендерим впрок. Вытеснение — LRU, с ограничением и по числу, и по памяти:
   AudioBuffer занимает 4 байта на сэмпл на канал, минута стерео 44.1 кГц —
   это ~21 МБ, так что без потолка вкладка быстро съела бы всю память. */
const MAX_CACHE_ENTRIES = 8;
const MAX_CACHE_BYTES = 400 * 1024 * 1024;
const cache = new Map();          // key -> AudioBuffer, порядок вставки = давность
let fromCache = false;

const bufBytes = b => b.length * b.numberOfChannels * 4;
const cacheBytes = () => { let t = 0; for (const b of cache.values()) t += bufBytes(b); return t; };

function cacheGet(key) {
  if (!cache.has(key)) return null;
  const b = cache.get(key);
  cache.delete(key); cache.set(key, b);   // освежаем: теперь самый недавний
  return b;
}

function cachePut(key, buf) {
  cache.delete(key);
  cache.set(key, buf);
  while (cache.size > 1 && (cache.size > MAX_CACHE_ENTRIES || cacheBytes() > MAX_CACHE_BYTES)) {
    cache.delete(cache.keys().next().value);   // самый давний
  }
  updateCacheMeta();
}

function updateCacheMeta() {
  $('#btnClearCache').disabled = busyFlag || cache.size === 0;
  const el = $('#cacheMeta');
  if (!el) return;
  el.textContent = cache.size
    ? `В кэше вариантов: ${cache.size} (${(cacheBytes() / 1048576).toFixed(0)} МБ) — ` +
      'переключение между уже обработанными наборами мгновенное.'
    : '';
}

async function renderBuffer() {
  const p = getParams();
  const key = sourceName + '|' + JSON.stringify(p);
  const hit = cacheGet(key);
  if (hit) { fromCache = true; return hit; }
  fromCache = false;
  setBusy(true);
  setStatus('Обрабатываю…');
  await new Promise(r => setTimeout(r, 20));
  const t0 = performance.now();
  try {
    const buf = await render(sourceBuffer, p);
    cachePut(key, buf);
    setStatus(`Готово за ${((performance.now() - t0) / 1000).toFixed(1)} с.`);
    return buf;
  } finally {
    setBusy(false);
  }
}

// обработка без запуска воспроизведения
async function processTrack() {
  if (!sourceBuffer) return;
  pausePlayback();
  try {
    const key = paramsKey();
    showTrack(await renderBuffer(), key);
    setStatus((fromCache ? 'Настройки не менялись — результат уже готов.'
                         : statusEl.textContent) + ' Нажмите ▶ в плеере.');
  } catch (e) {
    setStatus('Ошибка обработки: ' + e.message, true);
  }
}

// ---------------------------------------------------------------- события
$('#file').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add('over');
}));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove('over');
}));
drop.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});

$('#btnPreview').addEventListener('click', processTrack);

$('#btnDownload').addEventListener('click', async () => {
  const fkey = $('#format').value;
  try {
    const buf = await renderBuffer();
    setBusy(true);
    setStatus(`Кодирую в ${FORMATS[fkey].label}…`);
    await new Promise(r => setTimeout(r, 20));
    const { blob, ext } = await encodeAs(buf, fkey,
      pr => setStatus(`Кодирую в ${FORMATS[fkey].label}… ${Math.round(pr * 100)}%`));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sourceName}_room.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setStatus(`Сохранено: ${a.download} (${(blob.size / 1048576).toFixed(1)} МБ)`);
  } catch (e) {
    setStatus('Ошибка экспорта: ' + e.message, true);
  } finally {
    setBusy(false);
  }
});

// выбор набора сразу применяется к панели параметров
async function applySelectedPreset(quiet) {
  const v = $('#presetSelect').value;
  if (!v) return;
  const name = v.slice(2);
  const own = v.startsWith('u:');
  const vals = own ? userPresets()[name] : BUILTIN[name];
  if (!vals) return;
  setParams(vals);
  $('#presetName').value = own ? name : '';
  pausePlayback();                       // старый результат больше не соответствует настройкам
  if (quiet) return;
  if (sourceBuffer) {
    setStatus(`Применён набор «${name}», обрабатываю…`);
    await processTrack();                // результат оседает в кэше — возврат к набору мгновенный
  } else {
    setStatus(`Применён набор «${name}».`);
  }
}
$('#presetSelect').addEventListener('change', () => applySelectedPreset(false));

$('#btnSavePreset').addEventListener('click', () => {
  const name = $('#presetName').value.trim();
  if (!name) { setStatus('Введите название набора.', true); return; }
  const all = userPresets();
  all[name] = getParams();
  saveUserPresets(all);
  refreshPresetList('u:' + name);
  setStatus(`Набор «${name}» сохранён в профиле.`);
});

$('#btnDeletePreset').addEventListener('click', () => {
  const v = $('#presetSelect').value;
  if (!v.startsWith('u:')) { setStatus('Встроенные наборы удалить нельзя.', true); return; }
  const name = v.slice(2);
  const all = userPresets();
  delete all[name];
  saveUserPresets(all);
  refreshPresetList();
  setStatus(`Набор «${name}» удалён.`);
});

$('#btnClearCache').addEventListener('click', () => {
  const freed = cacheBytes();
  const n = cache.size;
  cache.clear();
  updateCacheMeta();
  // загруженный в плеер трек не трогаем — он уже декодирован и памяти кэша не занимает
  setStatus(`Кеш очищен: ${n} вариант(ов), освобождено ${(freed / 1048576).toFixed(0)} МБ.`);
});

$('#btnReset').addEventListener('click', () => {
  setParams(DEFAULTS);
  pausePlayback();
  setStatus('Значения сброшены к умолчанию.');
});

// ---------------------------------------------------------------- старт
const LS_FORMAT = 'roomify.format.v1';
const fmtSel = $('#format');
for (const [k, f] of Object.entries(FORMATS)) fmtSel.appendChild(new Option(f.label, k));
fmtSel.value = localStorage.getItem(LS_FORMAT) || 'mp3-320';
if (!fmtSel.value) fmtSel.value = 'mp3-320';
fmtSel.addEventListener('change', () => localStorage.setItem(LS_FORMAT, fmtSel.value));

buildForm();
refreshPresetList();
let restored = false;
try {
  const last = JSON.parse(localStorage.getItem(LS_LAST));
  if (last) { setParams(last); restored = true; }
} catch (e) {}
if (!restored) applySelectedPreset(true);   // набор по умолчанию сразу виден на панели
setStatus('Загрузите аудиофайл, чтобы начать.');
