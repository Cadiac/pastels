interface Props {
  code: string;
  hex: string;
  name: string;
  className?: string;
}

/** The cropped swatch PNG, with the sampled hex as a background fallback. */
export function SwatchImg({ code, hex, name, className }: Props) {
  return (
    <img
      src={`/swatches/${code}.png`}
      alt={`${name} swatch`}
      loading="lazy"
      style={{ backgroundColor: hex }}
      className={className}
      draggable={false}
    />
  );
}
