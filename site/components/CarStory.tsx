import { factsForCar } from "@/data/carFacts";

export function CarStory({ car }: { car: string }) {
  const facts = factsForCar(car);
  if (!facts) return null;
  const origin = facts.nameOrigin.trim();
  const history = facts.history.trim();
  if (!origin && !history) return null;
  return (
    <section id="story" className="car-story">
      <h2>Her story</h2>
      {origin && <p>{origin}</p>}
      {history && <p>{history}</p>}
    </section>
  );
}
