type Props = {
  name: string;
  phone: string;
  role: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onRole: (value: string) => void;
};

export function DayOfContactFields({ name, phone, role, onName, onPhone, onRole }: Props) {
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
            name="dayOfName"
            autoComplete="section-dayof name"
            required
            value={name}
            aria-describedby="day-of-note"
            onChange={(event) => onName(event.target.value)}
          />
        </label>
        <label>
          Day-of contact phone
          <input
            type="tel"
            name="dayOfPhone"
            autoComplete="section-dayof tel"
            required
            value={phone}
            aria-describedby="day-of-note"
            onChange={(event) => onPhone(event.target.value)}
          />
        </label>
      </div>
      <label>
        Role
        <input
          name="dayOfRole"
          autoComplete="off"
          required
          placeholder="Planner, maid of honor, mother of the bride"
          value={role}
          aria-describedby="day-of-note"
          onChange={(event) => onRole(event.target.value)}
        />
      </label>
    </fieldset>
  );
}
