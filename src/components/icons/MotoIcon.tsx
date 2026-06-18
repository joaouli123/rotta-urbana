import React from 'react';
import Svg, { Circle, Path, Rect, G } from 'react-native-svg';

interface MotoIconProps {
  /** Height in px; width is ~1.9x to match the car PNG icons. */
  size?: number;
  body?: string;
  tire?: string;
}

/**
 * Side-view motorcycle, drawn to sit in the same card slot as the car PNGs
 * (icone_economico/conforto/premium). Vector so it stays crisp at any size and
 * needs no raster asset. A matching `assets/icons/icone_moto.svg` exists for
 * designers who want to rasterize a PNG later.
 */
const MotoIcon: React.FC<MotoIconProps> = ({ size = 44, body = '#C1F11D', tire = '#17181C' }) => {
  const w = size * 1.9;
  return (
    <Svg width={w} height={size} viewBox="0 0 132 74" fill="none">
      {/* ── wheels ── */}
      <G>
        <Circle cx="32" cy="54" r="16" fill={tire} />
        <Circle cx="32" cy="54" r="8.5" fill="#FFFFFF" />
        <Circle cx="32" cy="54" r="3" fill={body} />
        <Circle cx="104" cy="54" r="16" fill={tire} />
        <Circle cx="104" cy="54" r="8.5" fill="#FFFFFF" />
        <Circle cx="104" cy="54" r="3" fill={body} />
      </G>

      {/* ── frame: swingarm + downtube to the front fork ── */}
      <Path
        d="M32 54 L62 50 L78 38 L98 42 L104 54"
        stroke={body}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* ── engine block ── */}
      <Rect x="58" y="42" width="26" height="12" rx="3" fill={tire} />

      {/* ── fuel tank ── */}
      <Path d="M60 39 Q63 33 72 33 L80 33 L82 41 Q72 44 60 41 Z" fill={body} />

      {/* ── seat + tail ── */}
      <Path d="M30 36 L58 35 Q60 35 60 38 L60 40 L34 41 Q29 41 30 36 Z" fill={tire} />
      {/* tail light */}
      <Rect x="26" y="34" width="6" height="5" rx="1.5" fill={body} />

      {/* ── front fork ── */}
      <Path d="M98 42 L104 54" stroke={tire} strokeWidth="5" strokeLinecap="round" />
      {/* ── handlebar ── */}
      <Path d="M97 40 L108 27" stroke={tire} strokeWidth="5" strokeLinecap="round" />
      <Path d="M105 25 L114 28" stroke={tire} strokeWidth="5" strokeLinecap="round" />

      {/* ── headlight ── */}
      <Path d="M108 30 L118 33 L118 39 L108 38 Z" fill={body} />

      {/* ── front fender ── */}
      <Path d="M92 46 Q104 38 116 46" stroke={body} strokeWidth="4" strokeLinecap="round" fill="none" />
    </Svg>
  );
};

export default MotoIcon;
