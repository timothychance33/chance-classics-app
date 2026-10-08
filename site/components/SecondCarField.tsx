"use client";

import { secondCarAddon } from "@/data/packages";

export function SecondCarField({
  checked,
  onChange,
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  if (!secondCarAddon.enabled) return null;
  const price = secondCarAddon.priceUsd;
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
        {price == null ? " — Ask for a quote" : ` — $${price}`}
      </span>
    </label>
  );
}
