type FieldErrors = {
  name?: string;
  phone?: string;
  role?: string;
};

type Props = {
  name: string;
  phone: string;
  role: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onRole: (value: string) => void;
  errors?: FieldErrors;
  onBlur?: (field: "name" | "phone" | "role") => void;
};

export function DayOfContactFields({ name, phone, role, onName, onPhone, onRole, errors, onBlur }: Props) {
  return (
    <fieldset className="day-of">
      <legend>Day-of contact</legend>
      <p className="note" id="day-of-note">
        Who the driver should call the day of the event. This is the planner, maid of honor, mother of the bride, or whoever will answer while the bride or host is busy. It is separate from the name and phone used to book.
      </p>
      <div className="book-grid">
        <label>
          Day-of contact name
          <input
            id="day-of-name"
            name="dayOfName"
            autoComplete="section-dayof name"
            autoCapitalize="words"
            aria-required="true"
            aria-invalid={errors?.name ? true : undefined}
            aria-describedby={errors?.name ? "day-of-name-error day-of-note" : "day-of-note"}
            value={name}
            onBlur={() => onBlur?.("name")}
            onChange={(event) => onName(event.target.value)}
          />
          <FieldError id="day-of-name-error" message={errors?.name || ""} />
        </label>
        <label>
          Day-of contact phone
          <input
            id="day-of-phone"
            type="tel"
            inputMode="tel"
            name="dayOfPhone"
            autoComplete="section-dayof tel"
            aria-required="true"
            aria-invalid={errors?.phone ? true : undefined}
            aria-describedby={errors?.phone ? "day-of-phone-error day-of-note" : "day-of-note"}
            value={phone}
            onBlur={() => onBlur?.("phone")}
            onChange={(event) => onPhone(event.target.value)}
          />
          <FieldError id="day-of-phone-error" message={errors?.phone || ""} />
        </label>
      </div>
      <label>
        Role
        <input
          id="day-of-role"
          name="dayOfRole"
          autoComplete="off"
          aria-required="true"
          aria-invalid={errors?.role ? true : undefined}
          aria-describedby={errors?.role ? "day-of-role-error day-of-note" : "day-of-note"}
          placeholder="Planner, maid of honor, mother of the bride"
          value={role}
          onBlur={() => onBlur?.("role")}
          onChange={(event) => onRole(event.target.value)}
        />
        <FieldError id="day-of-role-error" message={errors?.role || ""} />
      </label>
    </fieldset>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <span id={id} className="field-error" role={message ? "alert" : undefined}>
      {message}
    </span>
  );
}
