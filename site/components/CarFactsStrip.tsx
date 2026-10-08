import { bodyLabel, carIdentity, factsForCar } from "@/data/carFacts";

export function CarFactsStrip({ car }: { car: string }) {
  const facts = factsForCar(car);
  if (!facts) return null;
  const identity = carIdentity(facts);
  const body = bodyLabel(facts.body);
  const items = [
    identity ? { label: "Car", value: identity } : null,
    facts.color ? { label: "Color", value: facts.color } : null,
    facts.passengers != null
      ? { label: "Passengers", value: `${facts.passengers} besides the chauffeur` }
      : null,
    body ? { label: "Body", value: body } : null,
    facts.airConditioning === true ? { label: "Air conditioning", value: "Yes" } : null,
    facts.airConditioning === false ? { label: "Air conditioning", value: "No" } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  if (!items.length) return null;
  return (
    <section className="fact-strip" aria-label="Quick facts">
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
