import { Link, useLoaderData } from "@moonsjs/react";
import type { ReactNode } from "react";

export const loader = async () => ({ site: "Moons Basic" });

export default function Layout({ children }: { children?: ReactNode }) {
  const data = useLoaderData<typeof loader>();
  return (
    <div className="layout">
      <header>
        <strong id="site-name">{data.site}</strong>
        <nav>
          <Link to="/">Home</Link> <Link to="/about">About</Link>{" "}
          <Link to="/users">Users</Link>{" "}
          <Link to="/docs/[...rest]" params={{ rest: "intro" }}>
            Docs
          </Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
