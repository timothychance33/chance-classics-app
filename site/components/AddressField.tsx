"use client";

import { useEffect, useId, useRef, useState } from "react";

type Prediction = { description: string; placeId: string };

type Props = {
  name: string;
  required?: boolean;
  value: string;
  placeId: string;
  onValue: (value: string, placeId: string) => void;
  placeholder?: string;
};

export function AddressField({ name, required, value, placeId, onValue, placeholder }: Props) {
  const listId = useId();
  const sessionToken = useRef("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Prediction[]>([]);

  function currentSession() {
    if (!sessionToken.current) sessionToken.current = crypto.randomUUID();
    return sessionToken.current;
  }

  useEffect(() => {
    if (placeId || value.trim().length < 3) {
      setItems([]);
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: value.trim(), sessionToken: currentSession() });
      fetch(`/api/places/?${params}`)
        .then((response) => response.json())
        .then((data) => setItems(Array.isArray(data.predictions) ? data.predictions : []))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [value, placeId]);

  return (
    <div className="address-field">
      <input
        name={name}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onValue(event.target.value, "");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && items.length > 0 && (
        <ul id={listId} className="address-suggest" role="listbox">
          {items.map((item) => (
            <li key={item.placeId}>
              <button
                type="button"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  sessionToken.current = "";
                  onValue(item.description, item.placeId);
                  setOpen(false);
                  setItems([]);
                }}
              >
                {item.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
