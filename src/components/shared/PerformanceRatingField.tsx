import React from "react";
import {
  PERFORMANCE_RATING_INTEGER_OPTIONS,
  formatPerformanceRating,
  parseDecimalPerformanceRating,
  parseIntegerPerformanceRating,
  performanceRatingLabel,
} from "../../utils/ratingLabels";

function preventWheelInputChange(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

type IntegerSelectProps = {
  value: unknown;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function IntegerPerformanceRatingSelect({
  value,
  onChange,
  disabled = false,
  className = "rt-input w-56 py-3 px-4 text-sm",
  placeholder = "Select rating…",
}: IntegerSelectProps) {
  const parsed = parseIntegerPerformanceRating(value);
  const selectValue = parsed == null ? "" : String(parsed);

  return (
    <select
      value={selectValue}
      disabled={disabled}
      onChange={(e) => {
        const raw = String(e.target.value ?? "").trim();
        onChange(raw === "" ? null : parseIntegerPerformanceRating(raw));
      }}
      className={[
        className,
        disabled ? "opacity-75 cursor-not-allowed" : "focus:border-blue-500",
      ].join(" ")}
    >
      <option value="">{placeholder}</option>
      {PERFORMANCE_RATING_INTEGER_OPTIONS.map((option) => (
        <option key={option.value} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type DecimalInputProps = {
  value: unknown;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  showLabel?: boolean;
};

export function DecimalPerformanceRatingInput({
  value,
  onChange,
  disabled = false,
  className = "rt-input w-28 py-2 px-3 text-sm",
  placeholder = "1.0 – 5.0",
  showLabel = true,
}: DecimalInputProps) {
  const parsed = parseDecimalPerformanceRating(value);
  const display = parsed == null ? "" : String(parsed);

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="number"
        min={1}
        max={5}
        step={0.1}
        value={display}
        disabled={disabled}
        onWheel={preventWheelInputChange}
        onChange={(e) => {
          const raw = String(e.target.value ?? "").trim();
          onChange(raw === "" ? null : parseDecimalPerformanceRating(raw));
        }}
        className={className}
        placeholder={placeholder}
      />
      {showLabel && parsed != null && performanceRatingLabel(parsed) ? (
        <span className="text-[10px] text-[rgb(var(--muted))]">{formatPerformanceRating(parsed)}</span>
      ) : null}
    </div>
  );
}
