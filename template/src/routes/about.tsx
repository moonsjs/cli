import { Link } from "@moonsjs/react";

export default function About() {
  return (
    <section>
      <h1 id="about-title">Tentang Moons</h1>
      <p>Fixture M1: router file-based + SSR + hydration.</p>
      <p>
        <Link to="/">Balik ke Home</Link>
      </p>
    </section>
  );
}
