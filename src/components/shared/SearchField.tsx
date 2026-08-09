// @ts-nocheck
import { Search, X } from "lucide-react";

/**
 * Visible, typable search with optional label and clear control (for non-technical users).
 */
export default function SearchField({
  value = "",
  onChange,
  onClear,
  placeholder = "Search…",
  label = "Search",
  hint,
  className = "",
  inputClassName = "",
  id,
  disabled = false,
}) {
  const inputId = id || "rt-search-field";
  const trimmed = String(value ?? "");
  const hasValue = Boolean(trimmed.trim());

  function handleClear() {
    if (onClear) {
      onClear();
      return;
    }
    onChange?.({ target: { value: "" } });
  }

  return (
    <div className={["rt-search-field-wrap", className].filter(Boolean).join(" ")}>
      {label ? (
        <label htmlFor={inputId} className="rt-search-field-label">
          {label}
        </label>
      ) : null}
      <div className="rt-search-field">
        <Search className="rt-search-field-icon" size={18} aria-hidden />
        <input
          id={inputId}
          type="search"
          value={trimmed}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className={["rt-search-field-input", inputClassName].filter(Boolean).join(" ")}
          aria-label={label || placeholder}
        />
        {hasValue ? (
          <button
            type="button"
            onClick={handleClear}
            className="rt-search-field-clear"
            aria-label="Clear search"
            title="Clear search"
          >
            <X size={16} />
            <span className="hidden sm:inline">Clear</span>
          </button>
        ) : null}
      </div>
      {hint ? <p className="rt-search-field-hint">{hint}</p> : null}
    </div>
  );
}
