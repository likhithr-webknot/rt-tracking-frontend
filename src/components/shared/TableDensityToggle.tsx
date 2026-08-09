import type { TableDensity } from "../../hooks/useTableDensity";

type TableDensityToggleProps = {
  value: TableDensity;
  onChange: (next: TableDensity) => void;
  className?: string;
};

/** Compact control for Default vs Comfortable table row density. */
export default function TableDensityToggle({
  value,
  onChange,
  className = "",
}: TableDensityToggleProps) {
  return (
    <div
      className={["rt-segmented shrink-0", className].filter(Boolean).join(" ")}
      role="group"
      aria-label="Table density"
    >
      {(
        [
          { id: "default", label: "Default" },
          { id: "comfortable", label: "Comfortable" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={[
            "rt-segmented-item",
            value === opt.id ? "rt-segmented-item--active" : "",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
