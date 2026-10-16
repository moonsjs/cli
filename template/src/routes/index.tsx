import { Link, useLoaderData } from "@moonsjs/react";

export const loader = async () => ({
  greeting: "Halo dari SSR",
  when: new Date("2024-01-01T00:00:00Z"),
  tags: new Map([["phase", "M1"]]),
});

export default function Home() {
  const data = useLoaderData<typeof loader>();
  return (
    <section>
      <h1 id="home-title">{data.greeting}</h1>
      <p>
        tanggal: <time id="home-date">{data.when.toISOString()}</time>
      </p>
      <p id="home-tag">tag: {data.tags.get("phase")}</p>
      <p>
        <Link to="/about">Ke About</Link>
      </p>
    </section>
  );
}
