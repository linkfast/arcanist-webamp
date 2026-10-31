import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { cn } from "./ui";

/** A QR code of a link, drawn as one SVG path on white (cameras read dark on light). */
export function QrCode({ text, className }: { text: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) d += `M${col + 2} ${row + 2}h1v1h-1z`;
    return { size: count + 4, path: d };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={cn("rounded-lg bg-white", className)} role="img" aria-label={text} shapeRendering="crispEdges">
      <path d={path} fill="#000" />
    </svg>
  );
}
