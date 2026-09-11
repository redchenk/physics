import type { CSSProperties, ReactNode } from 'react';

type OhmVisualProps = {
  voltage: number;
  resistance: number;
};

type LensVisualProps = {
  focalLength: number;
  objectDistance: number;
  screenPosition: number;
};

type SoundVisualProps = {
  frequencyHz: number;
  loudness: number;
  waveformCode: number;
};

const COLORS = {
  canvas: '#071612',
  panel: '#0d211b',
  grid: '#17332a',
  line: '#b9c9c1',
  muted: '#829990',
  mint: '#70d6ad',
  amber: '#f2b96f',
  coral: '#ff8d76',
  cyan: '#68c9dc',
};

const figureStyle: CSSProperties = {
  margin: 0,
  overflow: 'hidden',
  border: '1px solid rgba(142, 178, 162, 0.24)',
  borderRadius: '20px',
  background: COLORS.canvas,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
};

const captionStyle: CSSProperties = {
  padding: '12px 16px 14px',
  borderTop: '1px solid rgba(142, 178, 162, 0.16)',
  color: '#b9c9c1',
  background: '#0a1b16',
  fontSize: '14px',
  lineHeight: 1.6,
};

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function numberLabel(value: number, digits = 1) {
  return finite(value, 0).toFixed(digits).replace(/\.0$/, '');
}

const SOUND_WAVEFORMS = ['正弦波', '三角波', '方波', '锯齿波'] as const;

function soundWaveSample(phase: number, waveformCode: number) {
  const normalizedPhase = ((phase % 1) + 1) % 1;
  if (waveformCode === 1) return 1 - 4 * Math.abs(normalizedPhase - 0.5);
  if (waveformCode === 2) return normalizedPhase < 0.5 ? 1 : -1;
  if (waveformCode === 3) return 2 * normalizedPhase - 1;
  return Math.sin(normalizedPhase * Math.PI * 2);
}

export function SoundVisual({ frequencyHz, loudness, waveformCode }: SoundVisualProps) {
  const frequency = clamp(finite(frequencyHz, 440), 50, 2_000);
  const amplitude = clamp(finite(loudness, 35), 0, 100) / 100;
  const waveformIndex = Math.round(clamp(finite(waveformCode, 0), 0, 3));
  const windowSeconds = 0.02;
  const left = 72;
  const right = 856;
  const centerY = 240;
  const height = 126 * amplitude;
  const points = Array.from({ length: 321 }, (_, index) => {
    const ratio = index / 320;
    const sample = soundWaveSample(ratio * windowSeconds * frequency, waveformIndex);
    return `${(left + ratio * (right - left)).toFixed(1)},${(centerY - sample * height).toFixed(1)}`;
  }).join(' ');
  const description = `声音信号观测：频率 ${numberLabel(frequency, 0)} 赫兹，数字响度 ${numberLabel(amplitude * 100, 0)}，波形 ${SOUND_WAVEFORMS[waveformIndex]}，横轴时间窗 20 毫秒。`;

  return (
    <figure style={figureStyle}>
      <svg
        viewBox="0 0 900 430"
        width="100%"
        height="auto"
        aria-label={description}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', minHeight: '290px' }}
      >
        <defs>
          <pattern id="sound-minor-grid" width="19.6" height="15.75" patternUnits="userSpaceOnUse">
            <path d="M 19.6 0 L 0 0 0 15.75" fill="none" stroke={COLORS.grid} strokeWidth="1" />
          </pattern>
          <pattern id="sound-major-grid" width="78.4" height="63" patternUnits="userSpaceOnUse">
            <rect width="78.4" height="63" fill="url(#sound-minor-grid)" />
            <path d="M 78.4 0 L 0 0 0 63" fill="none" stroke="#295445" strokeWidth="1.4" />
          </pattern>
          <filter id="sound-trace-glow" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect width="900" height="430" fill={COLORS.canvas} />
        <SvgText x={38} y={42} size={18} weight={700} fill="#e9f4ef">声音时域观测台</SvgText>
        <SvgText x={862} y={42} anchor="end" size={13} fill={COLORS.muted}>
          20 ms 全屏 · 2 ms/格
        </SvgText>
        <rect x={left} y="82" width={right - left} height="315" rx="8" fill="url(#sound-major-grid)" stroke="#295445" />
        <line x1={left} y1={centerY} x2={right} y2={centerY} stroke="#74a18f" strokeWidth="1.5" opacity="0.7" />
        <polyline
          points={points}
          fill="none"
          stroke={COLORS.mint}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#sound-trace-glow)"
        />
        <SvgText x={left} y={centerY - 137} size={12} fill={COLORS.muted}>+ 振幅</SvgText>
        <SvgText x={left} y={centerY + 157} size={12} fill={COLORS.muted}>− 振幅</SvgText>
        <SvgText x={right} y={418} anchor="end" size={12} fill={COLORS.muted}>时间 →</SvgText>
        <g>
          <rect x="92" y="98" width="246" height="48" rx="12" fill="#0d211bea" stroke="#295445" />
          <SvgText x={110} y={128} size={14} fill={COLORS.line} weight={700}>
            {numberLabel(frequency, 0)} Hz · 数字响度 {numberLabel(amplitude * 100, 0)} · {SOUND_WAVEFORMS[waveformIndex]}
          </SvgText>
        </g>
      </svg>
      <figcaption style={captionStyle}>{description}</figcaption>
    </figure>
  );
}

function SvgText({
  x,
  y,
  children,
  anchor = 'start',
  fill = COLORS.line,
  size = 15,
  weight = 500,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
  size?: number;
  weight?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
    >
      {children}
    </text>
  );
}

export function OhmVisual({ voltage, resistance }: OhmVisualProps) {
  const safeVoltage = clamp(finite(voltage, 0), 0, 48);
  const safeResistance = clamp(finite(resistance, 1), 0.1, 1_000);
  const current = safeVoltage / safeResistance;
  const meterFill = clamp(current / 2, 0, 1) * 208;

  const description = `当前电路仪表读数：电压 ${numberLabel(safeVoltage)} 伏，电阻 ${numberLabel(safeResistance)} 欧姆，电流 ${numberLabel(current, 2)} 安。`;

  return (
    <figure style={figureStyle}>
      <svg
        viewBox="0 0 900 460"
        width="100%"
        height="auto"
        aria-label={description}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', minHeight: '300px' }}
      >
        <defs>
          <pattern id="ohm-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={COLORS.grid} strokeWidth="1" />
          </pattern>
          <filter id="ohm-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="900" height="460" fill={COLORS.canvas} />
        <rect width="900" height="460" fill="url(#ohm-grid)" opacity="0.72" />

        <SvgText x={42} y={46} size={18} weight={700} fill="#e9f4ef">
          直流电路观测台
        </SvgText>
        <SvgText x={42} y={70} size={13} fill={COLORS.muted}>
          参数变化会同步反映到仪表上
        </SvgText>

        {/* Main circuit */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M 112 126 H 236 M 398 126 H 510 V 326 H 382 M 256 326 H 112 V 126"
            stroke={COLORS.line}
            strokeWidth="4"
          />

          {/* Resistor: deliberately drawn as a component rather than a symbolic equation. */}
          <path
            d="M 236 126 l 14 -18 l 22 36 l 22 -36 l 22 36 l 22 -36 l 22 36 l 18 -18"
            stroke={COLORS.amber}
            strokeWidth="5"
            filter="url(#ohm-glow)"
          />
          <SvgText x={317} y={92} anchor="middle" size={14} fill={COLORS.amber} weight={700}>
            R = {numberLabel(safeResistance)} Ω
          </SvgText>

          {/* Ammeter in series. */}
          <circle cx="510" cy="226" r="42" fill={COLORS.panel} stroke={COLORS.cyan} strokeWidth="4" />
          <SvgText x={510} y={234} anchor="middle" size={24} fill={COLORS.cyan} weight={800}>
            A
          </SvgText>

          {/* Voltage source. */}
          <line x1="256" y1="326" x2="282" y2="326" stroke={COLORS.line} strokeWidth="4" />
          <line x1="356" y1="326" x2="382" y2="326" stroke={COLORS.line} strokeWidth="4" />
          <circle cx="319" cy="326" r="37" fill={COLORS.panel} stroke={COLORS.mint} strokeWidth="4" />
          <line x1="304" y1="311" x2="304" y2="329" stroke={COLORS.mint} strokeWidth="3" />
          <line x1="295" y1="320" x2="313" y2="320" stroke={COLORS.mint} strokeWidth="3" />
          <line x1="330" y1="320" x2="344" y2="320" stroke={COLORS.mint} strokeWidth="3" />
          <SvgText x={319} y={385} anchor="middle" size={14} fill={COLORS.mint} weight={700}>
            U = {numberLabel(safeVoltage)} V
          </SvgText>

          {/* Voltmeter branch across the resistor. */}
          <path d="M 236 126 V 213 H 270 M 364 213 H 398 V 126" stroke={COLORS.muted} strokeWidth="3" />
          <circle cx="317" cy="213" r="47" fill={COLORS.panel} stroke={COLORS.mint} strokeWidth="3" />
          <SvgText x={317} y={221} anchor="middle" size={24} fill={COLORS.mint} weight={800}>
            V
          </SvgText>
        </g>

        {/* Readout rack */}
        <rect x="594" y="86" width="264" height="294" rx="18" fill={COLORS.panel} stroke="#244a3d" />
        <SvgText x={622} y={122} size={14} fill={COLORS.muted} weight={700}>
          实时仪表
        </SvgText>

        <SvgText x={622} y={164} size={13} fill={COLORS.muted}>
          电压表
        </SvgText>
        <SvgText x={830} y={166} anchor="end" size={26} fill={COLORS.mint} weight={800}>
          {numberLabel(safeVoltage)} V
        </SvgText>

        <line x1="622" y1="187" x2="830" y2="187" stroke="#244a3d" />

        <SvgText x={622} y={226} size={13} fill={COLORS.muted}>
          电阻设定
        </SvgText>
        <SvgText x={830} y={228} anchor="end" size={26} fill={COLORS.amber} weight={800}>
          {numberLabel(safeResistance)} Ω
        </SvgText>

        <line x1="622" y1="249" x2="830" y2="249" stroke="#244a3d" />

        <SvgText x={622} y={288} size={13} fill={COLORS.muted}>
          电流表
        </SvgText>
        <SvgText x={830} y={290} anchor="end" size={26} fill={COLORS.cyan} weight={800}>
          {numberLabel(current, 2)} A
        </SvgText>
        <rect x="622" y="318" width="208" height="12" rx="6" fill="#17332a" />
        <rect x="622" y="318" width={meterFill} height="12" rx="6" fill={COLORS.cyan} opacity="0.9" />
        <SvgText x={622} y={354} size={12} fill={COLORS.muted}>
          0 A
        </SvgText>
        <SvgText x={830} y={354} anchor="end" size={12} fill={COLORS.muted}>
          2 A+
        </SvgText>
      </svg>
      <figcaption style={captionStyle}>{description}</figcaption>
    </figure>
  );
}

type Point = { x: number; y: number };

function lineEndpoint(start: Point, through: Point, targetX: number): Point {
  const dx = through.x - start.x;
  if (Math.abs(dx) < 0.001) return { x: start.x, y: start.y };

  const slope = (through.y - start.y) / dx;
  let x = targetX;
  let y = start.y + slope * (x - start.x);
  const top = 30;
  const bottom = 430;

  if (y < top && Math.abs(slope) > 0.001) {
    y = top;
    x = start.x + (top - start.y) / slope;
  } else if (y > bottom && Math.abs(slope) > 0.001) {
    y = bottom;
    x = start.x + (bottom - start.y) / slope;
  }

  return { x: clamp(x, 24, 876), y };
}

function Arrow({
  x,
  axisY,
  tipY,
  color,
  dashed = false,
}: {
  x: number;
  axisY: number;
  tipY: number;
  color: string;
  dashed?: boolean;
}) {
  const direction = tipY < axisY ? -1 : 1;
  const headY = tipY;
  const neckY = tipY - direction * 17;

  return (
    <g
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      strokeDasharray={dashed ? '9 7' : undefined}
      opacity={dashed ? 0.78 : 1}
    >
      <line x1={x} y1={axisY} x2={x} y2={tipY} />
      <path d={`M ${x - 10} ${neckY} L ${x} ${headY} L ${x + 10} ${neckY}`} />
    </g>
  );
}

export function LensVisual({ focalLength, objectDistance, screenPosition }: LensVisualProps) {
  const f = clamp(finite(focalLength, 10), 2, 100);
  const u = clamp(finite(objectDistance, 20), 1, 200);
  const screen = clamp(finite(screenPosition, 20), 0, 200);

  const lensX = 450;
  const axisY = 248;
  const scale = Math.min(13, 360 / Math.max(2 * f, u, screen, 1));
  const leftF = lensX - f * scale;
  const rightF = lensX + f * scale;
  const left2F = lensX - 2 * f * scale;
  const right2F = lensX + 2 * f * scale;
  const objectX = lensX - u * scale;
  const screenX = lensX + screen * scale;
  const objectHeight = 88;
  const objectTip: Point = { x: objectX, y: axisY - objectHeight };

  const denominator = u - f;
  const imageDistance = Math.abs(denominator) < 0.0001 ? Number.POSITIVE_INFINITY : (f * u) / denominator;
  const imageX = lensX + imageDistance * scale;
  const magnification = Number.isFinite(imageDistance) ? -imageDistance / u : 0;
  const rawImageTipY = axisY - magnification * objectHeight;
  const imageIsWithinFrame =
    Number.isFinite(imageX) && imageX >= 28 && imageX <= 872 && rawImageTipY >= 34 && rawImageTipY <= 426;

  const horizontalLensPoint: Point = { x: lensX, y: objectTip.y };
  const centerPoint: Point = { x: lensX, y: axisY };
  const rayOneEnd = lineEndpoint(horizontalLensPoint, { x: rightF, y: axisY }, 870);
  const rayTwoEnd = lineEndpoint(objectTip, centerPoint, 870);
  const isFocusedOnScreen = imageDistance > 0 && Math.abs(screen - imageDistance) <= Math.max(0.5, f * 0.06);

  const description = `当前透镜几何量：焦距 ${numberLabel(f)} 厘米，物距 ${numberLabel(u)} 厘米，光屏距透镜 ${numberLabel(screen)} 厘米。主光轴两侧均标出焦点 F 和二倍焦距 2F。`;

  return (
    <figure style={figureStyle}>
      <svg
        viewBox="0 0 900 470"
        width="100%"
        height="auto"
        aria-label={description}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', minHeight: '310px' }}
      >
        <defs>
          <pattern id="lens-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={COLORS.grid} strokeWidth="1" />
          </pattern>
          <linearGradient id="convex-lens-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4e91ab" stopOpacity="0.36" />
            <stop offset="0.48" stopColor="#bcecff" stopOpacity="0.72" />
            <stop offset="1" stopColor="#4e91ab" stopOpacity="0.36" />
          </linearGradient>
          <filter id="lens-glow" x="-35%" y="-20%" width="170%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="900" height="470" fill={COLORS.canvas} />
        <rect width="900" height="470" fill="url(#lens-grid)" opacity="0.7" />

        <SvgText x={36} y={42} size={18} weight={700} fill="#e9f4ef">
          凸透镜光路观测台
        </SvgText>
        <SvgText x={864} y={42} anchor="end" size={13} fill={COLORS.muted}>
          f {numberLabel(f)} cm · u {numberLabel(u)} cm · 光屏 {numberLabel(screen)} cm
        </SvgText>

        {/* Principal axis and its measured reference points. */}
        <line x1="24" y1={axisY} x2="876" y2={axisY} stroke={COLORS.line} strokeWidth="2" opacity="0.72" />
        {[
          { x: left2F, label: '2F' },
          { x: leftF, label: 'F' },
          { x: rightF, label: 'F' },
          { x: right2F, label: '2F' },
        ].map((mark, index) => (
          <g key={`${mark.label}-${index}`}>
            <line x1={mark.x} y1={axisY - 8} x2={mark.x} y2={axisY + 8} stroke={COLORS.amber} strokeWidth="3" />
            <circle cx={mark.x} cy={axisY} r="4" fill={COLORS.amber} />
            <SvgText x={mark.x} y={axisY + 30} anchor="middle" size={15} fill={COLORS.amber} weight={800}>
              {mark.label}
            </SvgText>
          </g>
        ))}

        {/* Object */}
        <Arrow x={objectX} axisY={axisY} tipY={objectTip.y} color={COLORS.mint} />
        <SvgText x={objectX} y={axisY + 53} anchor="middle" size={14} fill={COLORS.mint} weight={700}>
          物体
        </SvgText>

        {/* Two representative rays before and after refraction. */}
        <g fill="none" stroke={COLORS.amber} strokeWidth="3" strokeLinecap="round">
          <line x1={objectTip.x} y1={objectTip.y} x2={horizontalLensPoint.x} y2={horizontalLensPoint.y} />
          <line x1={horizontalLensPoint.x} y1={horizontalLensPoint.y} x2={rayOneEnd.x} y2={rayOneEnd.y} />
          <line x1={objectTip.x} y1={objectTip.y} x2={centerPoint.x} y2={centerPoint.y} />
          <line x1={centerPoint.x} y1={centerPoint.y} x2={rayTwoEnd.x} y2={rayTwoEnd.y} />
        </g>

        {/* For a virtual intersection, show only the conventional backward projections. */}
        {imageDistance < 0 && imageIsWithinFrame ? (
          <g fill="none" stroke={COLORS.amber} strokeWidth="2" strokeDasharray="8 7" opacity="0.56">
            <line x1={horizontalLensPoint.x} y1={horizontalLensPoint.y} x2={imageX} y2={rawImageTipY} />
            <line x1={centerPoint.x} y1={centerPoint.y} x2={imageX} y2={rawImageTipY} />
          </g>
        ) : null}

        {/* Image marker: styling conveys the optical construction without stating a rule. */}
        {imageIsWithinFrame ? (
          <Arrow
            x={imageX}
            axisY={axisY}
            tipY={rawImageTipY}
            color={COLORS.coral}
            dashed={imageDistance < 0}
          />
        ) : null}

        {/* Screen can be positioned independently of the calculated ray intersection. */}
        <g>
          <rect
            x={screenX - 6}
            y="82"
            width="12"
            height="324"
            rx="6"
            fill={isFocusedOnScreen ? '#dff9ee' : '#8aa097'}
            opacity={isFocusedOnScreen ? 0.9 : 0.58}
            filter={isFocusedOnScreen ? 'url(#lens-glow)' : undefined}
          />
          <line x1={screenX - 22} y1="407" x2={screenX + 22} y2="407" stroke={COLORS.line} strokeWidth="4" />
          <SvgText x={screenX} y={435} anchor="middle" size={13} fill={COLORS.line} weight={700}>
            光屏
          </SvgText>
        </g>

        {/* A strongly convex silhouette prevents confusion with a concave lens. */}
        <path
          d="M 450 66 C 405 133 405 363 450 430 C 495 363 495 133 450 66 Z"
          fill="url(#convex-lens-fill)"
          stroke={COLORS.cyan}
          strokeWidth="4"
          filter="url(#lens-glow)"
        />
        <line x1={450} y1="82" x2={450} y2="414" stroke="#d9f7ff" strokeWidth="2" opacity="0.7" />
        <SvgText x={450} y={457} anchor="middle" size={14} fill={COLORS.cyan} weight={800}>
          凸透镜
        </SvgText>
      </svg>
      <figcaption style={captionStyle}>
        当前几何量：焦距 f = {numberLabel(f)} cm；物距 u = {numberLabel(u)} cm；光屏距透镜 ={' '}
        {numberLabel(screen)} cm。图中已在主光轴左右两侧标出 F 和 2F。
      </figcaption>
    </figure>
  );
}
