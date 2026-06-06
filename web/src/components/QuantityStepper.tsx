import { Minus, Plus } from "lucide-react";

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

export function QuantityStepper({ value, onChange, min = 0, max = 99 }: Props) {
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-stone-700 disabled:opacity-40 active:scale-95 transition";
  return (
    <div className="inline-flex items-center gap-2" onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        className={btn}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease quantity"
      >
        <Minus size={16} />
      </button>
      <span className="w-6 text-center text-base font-semibold tabular-nums text-stone-800">
        {value}
      </span>
      <button
        type="button"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase quantity"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
