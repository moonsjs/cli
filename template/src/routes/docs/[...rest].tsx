import { useLoaderData, useParams, type LoaderArgs } from "@moonsjs/react";

export const loader = async ({ params }: LoaderArgs<"/docs/[...rest]">) => ({ rest: params.rest });

export default function Docs() {
  const data = useLoaderData<typeof loader>();
  const params = useParams<"/docs/[...rest]">();
  return (
    <section>
      <h1 id="docs-title">Docs</h1>
      <p id="docs-params">path: {params.rest}</p>
      <p id="docs-loader">loader: {data.rest}</p>
    </section>
  );
}
