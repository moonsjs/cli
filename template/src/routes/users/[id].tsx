import { useLoaderData, useParams, type LoaderArgs } from "@moonsjs/react";

export const loader = async ({ params }: LoaderArgs<"/users/[id]">) => ({
  id: params.id,
  name: params.id === "u1" ? "Alice" : `User ${params.id}`,
});

export default function UserPage() {
  const data = useLoaderData<typeof loader>();
  const params = useParams<"/users/[id]">();
  return (
    <section>
      <h1 id="user-title">User {params.id}</h1>
      <p id="user-name">name: {data.name}</p>
    </section>
  );
}
