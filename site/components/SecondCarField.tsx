"use client";

import { secondCarAddon, secondCarPriceText } from "@/data/packages";

export function SecondCarField({
  checked,
  onChange,
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  if (!secondCarAddon.enabled) return null;
  return (
    <label className="check">
      <input
        type="checkbox"
        name="second_car"
        checked={checked}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
      />
      <span>
        {secondCarAddon.title}
        {` — ${secondCarPriceText()}`}
      </span>
    </label>
  );
}
