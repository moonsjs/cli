import { Link } from "@moonsjs/react";

export default function About() {
  return (
    <section>
      <h1 id="about-title">About Moons</h1>
      <p>Fixture M1: file-based router + SSR + hydration.</p>
      <p>
        <Link to="/">Back to Home</Link>
      </p>
    </section>
  );
}
