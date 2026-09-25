import React, { useMemo } from 'react';
import { Image, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';

// Blank modules the QR standard asks for around the code, so scanners find it.
const QUIET_ZONE = 4;

/** The string as UTF-8 bytes, one char per byte, for the generator's byte mode. */
function utf8Bytes(value: string): string {
  try {
    return encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return value;
  }
}

/** The dark modules as one path, joining the runs on each row. */
function qrPath(value: string): { path: string; size: number } | null {
  if (!value) return null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(utf8Bytes(value), 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < count; row += 1) {
      let col = 0;
      while (col < count) {
        if (!qr.isDark(row, col)) { col += 1; continue; }
        const start = col;
        while (col < count && qr.isDark(row, col)) col += 1;
        path += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h${start - col}z`;
      }
    }
    return { path, size: count + QUIET_ZONE * 2 };
  } catch {
    return null;
  }
}

interface Props {
  /** The Pix copia e cola code. */
  value: string;
  /** Mercado Pago's own QR image, used when the code cannot be drawn here. */
  fallbackBase64?: string | null;
  size?: number;
}

/** The Pix QR Code, drawn in the app from the copia e cola code. */
export const PixQrCode: React.FC<Props> = ({ value, fallbackBase64, size = 200 }) => {
  const qr = useMemo(() => qrPath(value), [value]);
  if (qr) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel="QR Code do Pix">
        <Svg width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`}>
          <Rect x={0} y={0} width={qr.size} height={qr.size} fill="#FFFFFF" />
          <Path d={qr.path} fill="#000000" />
        </Svg>
      </View>
    );
  }
  if (fallbackBase64) {
    return (
      <Image
        source={{ uri: `data:image/png;base64,${fallbackBase64}` }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="QR Code do Pix"
      />
    );
  }
  return null;
};
