interface Props {
  hex: string;
  size?: number;
  className?: string;
}

/** A solid circular chip of the colour's representative hex (with a subtle ring
    so light colours stay visible on a white background). */
export function HexDot({ hex, size = 14, className }: Props) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ring-1 ring-black/15 ${className ?? ""}`}
      style={{ width: size, height: size, backgroundColor: hex }}
      title={hex.toUpperCase()}
    />
  );
}
