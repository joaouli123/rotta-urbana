import React from 'react';
import Svg, {
  Circle,
  Rect,
  Path,
  Line,
  Ellipse,
  G,
} from 'react-native-svg';

// ─── Illustration 1: Phone + Map + Pins ────────────────────────────────────
export const IllustrationOrder = () => (
  <Svg width={260} height={260} viewBox="0 0 260 260">
    {/* Soft blue background circle */}
    <Circle cx={130} cy={130} r={118} fill="#D4EEF7" />

    {/* Phone body */}
    <Rect x={78} y={52} width={104} height={164} rx={16} fill="#FFFFFF" />
    <Rect x={78} y={52} width={104} height={164} rx={16} fill="none" stroke="#D0D0D0" strokeWidth={1.5} />
    {/* Camera + speaker */}
    <Circle cx={130} cy={64} r={4} fill="#E0E0E0" />
    <Rect x={118} y={61} width={24} height={5} rx={2.5} fill="#E8E8E8" />

    {/* Map area */}
    <Rect x={86} y={76} width={88} height={116} rx={6} fill="#E2F0D9" />

    {/* Map grid lines - horizontal */}
    <Line x1={86} y1={100} x2={174} y2={100} stroke="#C4D8B8" strokeWidth={0.8} />
    <Line x1={86} y1={120} x2={174} y2={120} stroke="#C4D8B8" strokeWidth={0.8} />
    <Line x1={86} y1={140} x2={174} y2={140} stroke="#C4D8B8" strokeWidth={0.8} />
    <Line x1={86} y1={160} x2={174} y2={160} stroke="#C4D8B8" strokeWidth={0.8} />
    {/* Map grid lines - vertical */}
    <Line x1={108} y1={76} x2={108} y2={192} stroke="#C4D8B8" strokeWidth={0.8} />
    <Line x1={130} y1={76} x2={130} y2={192} stroke="#C4D8B8" strokeWidth={0.8} />
    <Line x1={152} y1={76} x2={152} y2={192} stroke="#C4D8B8" strokeWidth={0.8} />

    {/* Dashed route line */}
    <Path
      d="M 100 178 Q 118 150 142 126"
      stroke="#FF8C5A"
      strokeWidth={2.5}
      fill="none"
      strokeDasharray="5,4"
      strokeLinecap="round"
    />

    {/* Big lime map pin */}
    <Path
      d="M 130 58 C 112 58 98 72 98 90 C 98 110 130 136 130 136 C 130 136 162 110 162 90 C 162 72 148 58 130 58 Z"
      fill="#C1F11D"
    />
    <Circle cx={130} cy={90} r={12} fill="rgba(0,0,0,0.22)" />
    <Circle cx={126} cy={86} r={4.5} fill="rgba(255,255,255,0.5)" />

    {/* Small red pin - bottom left */}
    <Path
      d="M 95 173 C 88 173 82 179 82 187 C 82 197 95 211 95 211 C 95 211 108 197 108 187 C 108 179 102 173 95 173 Z"
      fill="#EF4444"
    />
    <Circle cx={95} cy={187} r={7} fill="rgba(255,255,255,0.32)" />

    {/* Small blue pin - mid right */}
    <Path
      d="M 162 128 C 155 128 149 134 149 142 C 149 152 162 166 162 166 C 162 166 175 152 175 142 C 175 134 169 128 162 128 Z"
      fill="#3B82F6"
    />
    <Circle cx={162} cy={142} r={7} fill="rgba(255,255,255,0.32)" />

    {/* Home button */}
    <Circle cx={130} cy={224} r={8} fill="#F0F0F0" stroke="#E0E0E0" strokeWidth={1} />
  </Svg>
);

// ─── Illustration 2: Taxi Car + Route + Pins ───────────────────────────────
export const IllustrationCar = () => (
  <Svg width={280} height={250} viewBox="0 0 280 250">
    {/* Soft pink/coral background circle */}
    <Circle cx={140} cy={112} r={104} fill="#FFD6E2" />

    {/* Dashed route line */}
    <Path
      d="M 58 72 Q 140 44 222 72"
      stroke="rgba(255,255,255,0.9)"
      strokeWidth={2.5}
      fill="none"
      strokeDasharray="6,5"
      strokeLinecap="round"
    />

    {/* Origin pin — lime */}
    <Path
      d="M 58 72 C 50 72 43 79 43 88 C 43 99 58 115 58 115 C 58 115 73 99 73 88 C 73 79 66 72 58 72 Z"
      fill="#C1F11D"
    />
    <Circle cx={58} cy={88} r={9} fill="rgba(0,0,0,0.2)" />
    <Circle cx={55} cy={85} r={3.5} fill="rgba(255,255,255,0.5)" />

    {/* Destination pin — red */}
    <Path
      d="M 222 72 C 214 72 207 79 207 88 C 207 99 222 115 222 115 C 222 115 237 99 237 88 C 237 79 230 72 222 72 Z"
      fill="#EF4444"
    />
    <Circle cx={222} cy={88} r={9} fill="rgba(255,255,255,0.3)" />
    <Circle cx={219} cy={85} r={3.5} fill="rgba(255,255,255,0.5)" />

    {/* Car shadow */}
    <Ellipse cx={140} cy={224} rx={84} ry={8} fill="rgba(0,0,0,0.1)" />

    {/* Car body */}
    <Rect x={54} y={158} width={172} height={54} rx={14} fill="#F7C800" />

    {/* Cabin (trapezoidal) */}
    <Path d="M 89 158 L 107 122 L 175 122 L 193 158 Z" fill="#F7C800" />

    {/* Window divider trim */}
    <Path d="M 140 124 L 138 156" stroke="#E5B800" strokeWidth={2} />

    {/* Left window */}
    <Path
      d="M 110 126 Q 109 122 116 122 L 134 122 L 132 154 L 110 154 Q 108 154 108 152 Z"
      fill="#9AD4F0"
      opacity={0.85}
    />
    {/* Right window */}
    <Path
      d="M 144 122 L 168 122 Q 176 122 175 128 L 170 154 L 144 154 Z"
      fill="#9AD4F0"
      opacity={0.85}
    />

    {/* Front headlight */}
    <Rect x={210} y={162} width={18} height={10} rx={4} fill="#FFFACD" />
    {/* Front bumper detail */}
    <Rect x={209} y={175} width={19} height={6} rx={3} fill="#E8B600" />

    {/* Rear taillight */}
    <Rect x={54} y={162} width={14} height={9} rx={3} fill="#FF5555" />
    {/* Rear bumper */}
    <Rect x={53} y={175} width={16} height={6} rx={3} fill="#E8B600" />

    {/* TAXI sign on roof */}
    <Rect x={120} y={112} width={40} height={14} rx={4} fill="#F7C800" stroke="#E8B600" strokeWidth={1} />
    <Rect x={123} y={115} width={8} height={8} rx={1} fill="#111111" />
    <Rect x={134} y={115} width={8} height={8} rx={1} fill="#111111" />
    <Rect x={145} y={115} width={8} height={8} rx={1} fill="#111111" />

    {/* Left wheel */}
    <Circle cx={98} cy={204} r={24} fill="#222222" />
    <Circle cx={98} cy={204} r={14} fill="#444444" />
    <Circle cx={98} cy={204} r={6} fill="#BBBBBB" />
    <Circle cx={98} cy={193} r={2.5} fill="#666666" />
    <Circle cx={109} cy={200} r={2.5} fill="#666666" />
    <Circle cx={87} cy={200} r={2.5} fill="#666666" />

    {/* Right wheel */}
    <Circle cx={182} cy={204} r={24} fill="#222222" />
    <Circle cx={182} cy={204} r={14} fill="#444444" />
    <Circle cx={182} cy={204} r={6} fill="#BBBBBB" />
    <Circle cx={182} cy={193} r={2.5} fill="#666666" />
    <Circle cx={193} cy={200} r={2.5} fill="#666666" />
    <Circle cx={171} cy={200} r={2.5} fill="#666666" />
  </Svg>
);

// ─── Illustration 3: City Skyline + Pins ───────────────────────────────────
export const IllustrationCity = () => (
  <Svg width={260} height={260} viewBox="0 0 260 260">
    {/* Soft blue background circle */}
    <Circle cx={130} cy={130} r={118} fill="#C6E8F5" />

    {/* Sky gradient — lighter at top */}
    <Circle cx={130} cy={130} r={118} fill="#E8F6FC" opacity={0.35} />

    {/* ── Buildings (silhouette) ── */}
    {/* Far left tall */}
    <Rect x={18} y={148} width={28} height={88} rx={3} fill="#5696B8" opacity={0.55} />
    <Rect x={24} y={132} width={16} height={20} rx={2} fill="#5696B8" opacity={0.55} />
    {/* Left mid */}
    <Rect x={50} y={138} width={38} height={98} rx={3} fill="#4585A8" opacity={0.5} />
    <Rect x={56} y={120} width={26} height={22} rx={2} fill="#4585A8" opacity={0.5} />
    {/* Left small */}
    <Rect x={92} y={160} width={24} height={76} rx={3} fill="#3A7898" opacity={0.45} />
    {/* Right small */}
    <Rect x={145} y={165} width={24} height={71} rx={3} fill="#3A7898" opacity={0.45} />
    {/* Right mid */}
    <Rect x={172} y={142} width={40} height={94} rx={3} fill="#4585A8" opacity={0.5} />
    <Rect x={180} y={124} width={24} height={22} rx={2} fill="#4585A8" opacity={0.5} />
    {/* Far right */}
    <Rect x={216} y={152} width={30} height={84} rx={3} fill="#5696B8" opacity={0.55} />

    {/* Windows */}
    <Rect x={23} y={157} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={23} y={170} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={23} y={183} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={56} y={148} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={70} y={148} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={56} y={162} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={70} y={162} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={178} y={150} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={193} y={150} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={178} y={164} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={193} y={164} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={220} y={162} width={8} height={6} rx={1} fill="white" opacity={0.5} />
    <Rect x={220} y={175} width={8} height={6} rx={1} fill="white" opacity={0.5} />

    {/* Small red pin left */}
    <Path
      d="M 74 88 C 67 88 60 95 60 103 C 60 114 74 129 74 129 C 74 129 88 114 88 103 C 88 95 81 88 74 88 Z"
      fill="#EF4444"
    />
    <Circle cx={74} cy={103} r={8} fill="rgba(255,255,255,0.3)" />

    {/* Small blue pin right */}
    <Path
      d="M 190 96 C 183 96 176 103 176 111 C 176 122 190 137 190 137 C 190 137 204 122 204 111 C 204 103 197 96 190 96 Z"
      fill="#3B82F6"
    />
    <Circle cx={190} cy={111} r={8} fill="rgba(255,255,255,0.3)" />

    {/* BIG lime center pin */}
    <Path
      d="M 130 42 C 108 42 90 60 90 82 C 90 108 130 148 130 148 C 130 148 170 108 170 82 C 170 60 152 42 130 42 Z"
      fill="#C1F11D"
    />
    <Circle cx={130} cy={82} r={22} fill="rgba(0,0,0,0.18)" />

    {/* Mini car icon inside big pin */}
    <Rect x={119} y={78} width={22} height={11} rx={3} fill="rgba(0,0,0,0.45)" />
    <Path d="M 123 78 L 125 72 L 135 72 L 137 78 Z" fill="rgba(0,0,0,0.45)" />
    <Circle cx={123} cy={89} r={3.5} fill="rgba(0,0,0,0.55)" />
    <Circle cx={137} cy={89} r={3.5} fill="rgba(0,0,0,0.55)" />
    <Circle cx={121} cy={76} r={2} fill="rgba(255,255,255,0.3)" />
  </Svg>
);
