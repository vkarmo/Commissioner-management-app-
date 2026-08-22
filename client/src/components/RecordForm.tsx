import { useState, type FormEvent } from "react";
import type { FieldConfig } from "../types";

interface RecordFormProps {
  fields: FieldConfig[];
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  submitLabel: string;
}

export function RecordForm({ fields, initial, onSubmit, submitLabel }: RecordFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(initial ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    for (const field of fields) {
      if (field.required && !values[field.key]) {
        setError(`${field.label} is required`);
        return;
      }
    }
    setSaving(true);
    try {
      const normalized = { ...values };
      for (const field of fields) {
        if (field.type === "number" && normalized[field.key] !== undefined) {
          normalized[field.key] = Number(normalized[field.key]);
        }
      }
      await onSubmit(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="record-form">
      {fields.map((field) => (
        <label key={field.key} className="form-field">
          <span>
            {field.label}
            {field.required && <span className="required-mark"> *</span>}
          </span>
          {field.type === "textarea" ? (
            <textarea
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              rows={3}
            />
          ) : field.type === "select" ? (
            <select
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
            >
              <option value="" disabled>
                Select…
              </option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          )}
        </label>
      ))}
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
