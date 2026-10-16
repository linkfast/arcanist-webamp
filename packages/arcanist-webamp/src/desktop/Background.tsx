import { memo, useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { isDark, isOled, settings, useSettings, type ArcaneBackground } from "../settings";

// The desktop's backgrounds: Arcanist's own (an arcane library: astrolabes, runes and constellations), drawn as
// inline SVG with no image or network, in a light and a dark version; a solid color; or the user's picture. With the
// Arcanist OLED skin, the art glows on pure black and a slow beam of light sweeps it.

/** Seeded random numbers: the same stars every time. */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Elder Futhark runes, drawn in a 6 × 10 box. */
const RUNES = [
  "M1 0V10M1 2L5 0M1 5L5 3",
  "M1 10V0L5 3V10",
  "M1 0V10M1 3L5 5L1 7",
  "M1 0V10M1 0L5 2M1 3L5 5",
  "M1 10V0L5 2.5L1 5L5 10",
  "M5 0L1 5L5 10",
  "M0 0L6 10M6 0L0 10",
  "M1 10V0L5 2.5L1 5",
  "M1 0V10M5 0V10M1 3L5 6",
  "M3 0V10M1 3L5 6",
  "M3 0V10",
  "M2 1L0 4L2 7M4 3L6 6L4 9",
  "M3 0V10M3 0L5 2M3 10L1 8",
  "M1 0V10M1 0L5 2.5M1 10L5 7.5",
  "M3 0V10M3 4L0 0M3 4L6 0",
  "M5 0L1 3L5 7L1 10",
  "M3 0V10M3 0L0 3M3 0L6 3",
  "M1 0V10M1 0L5 2.5L1 5L5 7.5L1 10",
  "M0 10V0L3 3L6 0V10",
  "M0 10V0L6 5M6 10V0L0 5",
  "M1 10V0L5 3",
  "M3 0L6 5L3 10L0 5Z",
  "M0 0V10L6 0V10L0 0",
  "M0 10L4.5 4L3 1L1.5 4L6 10",
];

interface Palette {
  /** The background's gradient stops. */
  sky: string[];
  line: string;
  gold: string;
  star: string;
  glow: string;
}

const PALETTES: Record<ArcaneBackground, { dark: Palette; light: Palette }> = {
  astrolabe: {
    dark: { sky: ["#2b2163", "#130f2e", "#07060f"], line: "#c4b5fd", gold: "#e9c46a", star: "#ede9fe", glow: "#8b5cf6" },
    light: { sky: ["#ffffff", "#ece8f8", "#d9d1f1"], line: "#4338ca", gold: "#a67c1a", star: "#3730a3", glow: "#a78bfa" },
  },
  constellations: {
    dark: { sky: ["#05242c", "#0b1a3a", "#170f33"], line: "#99f6e4", gold: "#fde68a", star: "#f0fdfa", glow: "#2dd4bf" },
    light: { sky: ["#eef8f7", "#e6ecf8", "#ece4f7"], line: "#0f766e", gold: "#a16207", star: "#1e1b4b", glow: "#5eead4" },
  },
  sigil: {
    dark: { sky: ["#3a1c5c", "#170d2c", "#07050e"], line: "#e9d5ff", gold: "#f0c674", star: "#faf5ff", glow: "#c026d3" },
    light: { sky: ["#fdfbff", "#f0e8fb", "#e0d4f4"], line: "#6b21a8", gold: "#9a6b10", star: "#4c1d95", glow: "#e879f9" },
  },
  aurora: {
    dark: { sky: ["#0b0b1e", "#0a0a18", "#05050c"], line: "#e0e7ff", gold: "#fcd34d", star: "#ffffff", glow: "#6366f1" },
    light: { sky: ["#fbfaff", "#f4f2fb", "#ecebf6"], line: "#3730a3", gold: "#a16207", star: "#312e81", glow: "#818cf8" },
  },
};

const W = 1600;
const H = 1000;

function Stars({ seed, count, p, dark }: { seed: number; count: number; p: Palette; dark: boolean }) {
  const next = random(seed);
  const stars = Array.from({ length: count }, () => ({ x: next() * W, y: next() * H, r: 0.4 + next() ** 3 * 1.6, o: 0.25 + next() * 0.6 }));
  return (
    <g fill={p.star}>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o * (dark ? 1 : 0.55)} className={i % 9 === 0 ? "arcane-glow" : undefined} style={i % 9 === 0 ? { animationDelay: `${-i * 0.7}s` } : undefined} />
      ))}
    </g>
  );
}

function RuneRing({ cx, cy, r, count, size, stroke, width, offset = 0 }: { cx: number; cy: number; r: number; count: number; size: number; stroke: string; width: number; offset?: number }) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360;
        return <path key={i} d={RUNES[(i + offset) % RUNES.length]} transform={`translate(${cx} ${cy}) rotate(${angle}) translate(0 ${-r}) scale(${size}) translate(-3 -5)`} />;
      })}
    </g>
  );
}

function Ticks({ cx, cy, r, count, length, stroke, width }: { cx: number; cy: number; r: number; count: number; length: number; stroke: string; width: number }) {
  const lines: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const l = i % (count / 12) === 0 ? length * 2 : i % (count / 36) === 0 ? length * 1.4 : length;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    lines.push(<line key={i} x1={cx + c * r} y1={cy + s * r} x2={cx + c * (r - l)} y2={cy + s * (r - l)} />);
  }
  return (
    <g stroke={stroke} strokeWidth={width}>
      {lines}
    </g>
  );
}

function polygon(cx: number, cy: number, r: number, points: number, step = 1, rotation = -90): string {
  return Array.from({ length: points }, (_, i) => {
    const a = (((i * step) / points) * 360 + rotation) * (Math.PI / 180);
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
}

function Astrolabe({ p, dark }: { p: Palette; dark: boolean }) {
  const [cx, cy] = [1130, 520];
  const a = dark ? 1 : 0.85;
  return (
    <>
      <Stars seed={7} count={140} p={p} dark={dark} />
      <g fill="none" stroke={p.line} opacity={0.16 * a} strokeWidth={1}>
        <ellipse cx={cx} cy={cy} rx={760} ry={230} transform={`rotate(-18 ${cx} ${cy})`} />
        <ellipse cx={cx} cy={cy} rx={640} ry={340} transform={`rotate(24 ${cx} ${cy})`} strokeDasharray="2 10" />
      </g>
      <g className="arcane-spin">
        <circle cx={cx} cy={cy} r={452} fill="none" stroke={p.gold} strokeWidth={1.2} opacity={0.32 * a} />
        <circle cx={cx} cy={cy} r={440} fill="none" stroke={p.gold} strokeWidth={0.8} opacity={0.26 * a} />
        <g opacity={0.3 * a}>
          <Ticks cx={cx} cy={cy} r={440} count={144} length={8} stroke={p.gold} width={0.8} />
        </g>
        <circle cx={cx} cy={cy} r={412} fill="none" stroke={p.line} strokeWidth={0.8} opacity={0.22 * a} />
        <g opacity={0.3 * a}>
          <RuneRing cx={cx} cy={cy} r={390} count={36} size={1.7} stroke={p.line} width={0.7} />
        </g>
        <circle cx={cx} cy={cy} r={366} fill="none" stroke={p.line} strokeWidth={0.8} opacity={0.22 * a} />
      </g>
      <g className="arcane-spin-back" fill="none" stroke={p.line} strokeWidth={0.9} opacity={0.2 * a}>
        <circle cx={cx} cy={cy} r={366} stroke="none" />
        <circle cx={cx} cy={cy} r={290} />
        <circle cx={cx} cy={cy} r={210} strokeDasharray="1 7" />
        <circle cx={cx + 70} cy={cy - 30} r={250} />
        <circle cx={cx - 50} cy={cy + 40} r={170} />
        <circle cx={cx} cy={cy} r={120} />
        <polygon points={polygon(cx, cy, 290, 7, 3)} />
        <line x1={cx - 366} y1={cy} x2={cx + 366} y2={cy} />
        <line x1={cx} y1={cy - 366} x2={cx} y2={cy + 366} />
        <line x1={cx - 259} y1={cy - 259} x2={cx + 259} y2={cy + 259} strokeDasharray="3 9" />
        <line x1={cx - 259} y1={cy + 259} x2={cx + 259} y2={cy - 259} strokeDasharray="3 9" />
        <circle cx={cx + 290} cy={cy} r={7} fill={p.gold} stroke="none" opacity={0.9} />
        <circle cx={cx - 120} cy={cy} r={4} fill={p.line} stroke="none" />
      </g>
      <circle cx={cx} cy={cy} r={18} fill="none" stroke={p.gold} strokeWidth={1.2} opacity={0.4 * a} />
      <circle cx={cx} cy={cy} r={4} fill={p.gold} opacity={0.5 * a} />
    </>
  );
}

const FIGURES: [number, number][][] = [
  [[180, 160], [260, 210], [330, 190], [410, 260], [470, 230], [520, 320]],
  [[1220, 120], [1300, 180], [1280, 270], [1380, 300], [1440, 230], [1300, 180]],
  [[980, 640], [1060, 600], [1140, 650], [1120, 740], [1040, 770], [980, 640]],
  [[300, 720], [380, 680], [450, 730], [520, 700], [600, 760]],
  [[700, 260], [760, 330], [840, 310], [900, 380], [860, 450]],
  [[1360, 560], [1440, 620], [1500, 600], [1540, 700]],
];

function Constellations({ p, dark }: { p: Palette; dark: boolean }) {
  const a = dark ? 1 : 0.8;
  const [cx, cy] = [800, 1350];
  return (
    <>
      <g className="arcane-spin-back" fill="none" stroke={p.line} strokeWidth={0.8} opacity={0.12 * a}>
        {[500, 700, 900, 1100, 1300].map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r} />
        ))}
        {Array.from({ length: 24 }, (_, i) => {
          const angle = (i / 24) * Math.PI * 2;
          return <line key={i} x1={cx + Math.cos(angle) * 500} y1={cy + Math.sin(angle) * 500} x2={cx + Math.cos(angle) * 1300} y2={cy + Math.sin(angle) * 1300} strokeDasharray="2 8" />;
        })}
      </g>
      <Stars seed={42} count={220} p={p} dark={dark} />
      <g fill="none" stroke={p.line} strokeWidth={0.9} opacity={0.3 * a} strokeLinejoin="round">
        {FIGURES.map((points, i) => (
          <polyline key={i} points={points.map(([x, y]) => `${x},${y}`).join(" ")} />
        ))}
      </g>
      <g fill={p.star}>
        {FIGURES.flat().map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={7} fill={p.glow} opacity={0.18 * a} className="arcane-glow" style={{ animationDelay: `${-i * 1.3}s` }} />
            <circle cx={x} cy={y} r={2.2} opacity={0.85 * a} />
          </g>
        ))}
      </g>
      <g opacity={0.22 * a}>
        <RuneRing cx={800} cy={1350} r={560} count={48} size={1.4} stroke={p.gold} width={0.7} offset={5} />
      </g>
    </>
  );
}

function Sigil({ p, dark }: { p: Palette; dark: boolean }) {
  const [cx, cy] = [800, 500];
  const a = dark ? 1 : 0.85;
  return (
    <>
      <Stars seed={3} count={120} p={p} dark={dark} />
      <circle cx={cx} cy={cy} r={330} fill={p.glow} opacity={dark ? 0.07 : 0.1} className="arcane-glow" />
      <g className="arcane-spin">
        <circle cx={cx} cy={cy} r={420} fill="none" stroke={p.gold} strokeWidth={1} opacity={0.3 * a} />
        <circle cx={cx} cy={cy} r={404} fill="none" stroke={p.gold} strokeWidth={0.7} opacity={0.24 * a} />
        <g opacity={0.32 * a}>
          <RuneRing cx={cx} cy={cy} r={380} count={42} size={1.6} stroke={p.line} width={0.7} offset={11} />
        </g>
        <circle cx={cx} cy={cy} r={356} fill="none" stroke={p.line} strokeWidth={0.8} opacity={0.22 * a} />
      </g>
      <g className="arcane-spin-back" fill="none" stroke={p.line} strokeWidth={0.9} opacity={0.22 * a} strokeLinejoin="round">
        <polygon points={polygon(cx, cy, 356, 7, 3)} />
        <polygon points={polygon(cx, cy, 356, 7, 2)} strokeDasharray="2 6" />
        <polygon points={polygon(cx, cy, 196, 7)} />
        <circle cx={cx} cy={cy} r={196} strokeDasharray="1 5" />
        {Array.from({ length: 7 }, (_, i) => {
          const angle = ((i / 7) * 360 - 90) * (Math.PI / 180);
          return <circle key={i} cx={cx + Math.cos(angle) * 356} cy={cy + Math.sin(angle) * 356} r={14} />;
        })}
      </g>
      <g fill="none" stroke={p.gold} strokeWidth={1} opacity={0.4 * a}>
        <circle cx={cx} cy={cy} r={110} />
        <polygon points={polygon(cx, cy, 110, 3)} />
        <polygon points={polygon(cx, cy, 110, 3, 1, 90)} />
        <circle cx={cx} cy={cy} r={26} />
      </g>
      <circle cx={cx} cy={cy} r={6} fill={p.gold} opacity={0.6 * a} />
    </>
  );
}

function Aurora({ p, dark, oled }: { p: Palette; dark: boolean; oled?: boolean }) {
  const blobs = dark
    ? [
        ["#0f766e", 0.42],
        ["#4338ca", 0.5],
        ["#7c3aed", 0.38],
      ]
    : [
        ["#99f6e4", 0.55],
        ["#c7d2fe", 0.7],
        ["#e9d5ff", 0.7],
      ];
  const [cx, cy] = [800, 520];
  const a = dark ? 1 : 0.8;
  const id = `aurora${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <defs>
        {blobs.map(([color], i) => (
          <radialGradient key={i} id={`${id}-${i}`}>
            <stop offset="0" stopColor={color as string} />
            <stop offset="1" stopColor={color as string} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      <g className="arcane-drift">
        {/* On OLED the clouds stay faint: most of the screen stays off. */}
        <ellipse cx={360} cy={260} rx={620} ry={380} fill={`url(#${id}-0)`} opacity={(blobs[0][1] as number) * (oled ? 0.3 : 1)} />
        <ellipse cx={1250} cy={340} rx={640} ry={420} fill={`url(#${id}-1)`} opacity={(blobs[1][1] as number) * (oled ? 0.3 : 1)} />
        <ellipse cx={820} cy={900} rx={720} ry={360} fill={`url(#${id}-2)`} opacity={(blobs[2][1] as number) * (oled ? 0.3 : 1)} />
      </g>
      <Stars seed={19} count={110} p={p} dark={dark} />
      <g className="arcane-spin" fill="none" stroke={p.line} strokeWidth={0.8} opacity={0.12 * a}>
        {[0, 30, 60, 90, 120, 150].map((angle) => (
          <ellipse key={angle} cx={cx} cy={cy} rx={520} ry={150} transform={`rotate(${angle} ${cx} ${cy})`} />
        ))}
        <circle cx={cx} cy={cy} r={520} strokeDasharray="1 9" />
      </g>
      <g opacity={0.2 * a}>
        <RuneRing cx={cx} cy={cy} r={590} count={60} size={1.3} stroke={p.gold} width={0.7} offset={17} />
      </g>
    </>
  );
}

const DRAWINGS: Record<ArcaneBackground, (props: { p: Palette; dark: boolean; oled?: boolean }) => ReactNode> = {
  astrolabe: Astrolabe,
  constellations: Constellations,
  sigil: Sigil,
  aurora: Aurora,
};

/** Where each background's beam of light turns, in OLED mode (its center, as on the screen). */
const SWEEP_CENTER: Record<ArcaneBackground, [number, number]> = {
  astrolabe: [70, 50],
  constellations: [50, 135],
  sigil: [50, 50],
  aurora: [50, 52],
};

/**
 * The OLED version: the dark art on pure black, its lines glowing (an SVG filter, drawn once: the art stays still),
 * and a beam of light that sweeps it. The beam costs no repaint: a mask turns one way and the brighter copy of the
 * art inside it turns back, so the art stays put and only the beam moves.
 */
function OledArt({ id, animate, style }: { id: ArcaneBackground; animate: boolean; style?: CSSProperties }) {
  const p = PALETTES[id].dark;
  const Drawing = DRAWINGS[id];
  const glow = `oled${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const art = (bright: boolean) => (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <filter id={`${glow}-${bright ? 1 : 0}`} x="-5%" y="-5%" width="110%" height="110%">
          <feComponentTransfer in="SourceGraphic" result="lines">
            <feFuncA type="linear" slope={bright ? 4.5 : 2.4} />
          </feComponentTransfer>
          <feGaussianBlur in="lines" stdDeviation={bright ? 4 : 2.5} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="lines" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glow}-${bright ? 1 : 0})`}>
        <Drawing p={p} dark oled />
      </g>
    </svg>
  );
  const [x, y] = SWEEP_CENTER[id];
  return (
    <div style={{ ...style, background: "#000", overflow: "hidden" }}>
      {art(false)}
      {animate && (
        <div className="oled-sweep" style={{ left: `calc(${x}vw - 150vmax)`, top: `calc(${y}vh - 150vmax)` }}>
          <div className="oled-sweep-art" style={{ left: `calc(150vmax - ${x}vw)`, top: `calc(150vmax - ${y}vh)`, transformOrigin: `${x}vw ${y}vh` }}>
            {art(true)}
          </div>
        </div>
      )}
    </div>
  );
}

/** One of Arcanist's backgrounds, in the light or dark version (or the OLED one). */
export const ArcaneArt = memo(function ArcaneArt({
  id,
  dark,
  oled = false,
  animate = false,
  className,
  style,
}: {
  id: ArcaneBackground;
  dark: boolean;
  oled?: boolean;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (oled) return <OledArt id={id} animate={animate} style={style} />;
  return <FlatArt id={id} dark={dark} animate={animate} className={className} style={style} />;
});

function FlatArt({ id, dark, animate, className, style }: { id: ArcaneBackground; dark: boolean; animate: boolean; className?: string; style?: CSSProperties }) {
  const p = PALETTES[id][dark ? "dark" : "light"];
  const Drawing = DRAWINGS[id];
  const sky = useMemo(
    () =>
      id === "constellations"
        ? `linear-gradient(160deg, ${p.sky[0]}, ${p.sky[1]} 55%, ${p.sky[2]})`
        : `radial-gradient(ellipse at ${id === "astrolabe" ? "70% 50%" : "50% 50%"}, ${p.sky[0]}, ${p.sky[1]} 55%, ${p.sky[2]})`,
    [id, p],
  );
  return (
    <div className={className} style={{ ...style, background: sky }}>
      <svg className={animate ? "arcane-animated" : undefined} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
        <Drawing p={p} dark={dark} />
      </svg>
    </div>
  );
}

/** The desktop's background, behind Webamp and Arcanist's windows. */
export function DesktopBackground() {
  const s = useSettings();
  const bg = s.background;
  const dark = isDark(s);
  const style: CSSProperties = { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" };
  // The OLED skin: Arcanist's art (the chosen one, or the astrolabe) glowing on black, whatever the background.
  if (isOled(s)) return <ArcaneArt id={bg.kind === "arcane" ? bg.id : "astrolabe"} dark oled animate={s.animate} style={style} />;
  if (bg.kind === "color") return <div style={{ ...style, background: bg.color }} />;
  if (bg.kind === "image" && settings.wallpaper)
    return (
      <div
        style={{
          ...style,
          background: `var(--desktop) center / cover no-repeat url(${JSON.stringify(settings.wallpaper)})`,
        }}
      />
    );
  return <ArcaneArt id={bg.kind === "arcane" ? bg.id : "astrolabe"} dark={dark} animate={s.animate} style={style} />;
}
