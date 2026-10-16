import { Link, useLoaderData } from "@moonsjs/react";

export const loader = async () => ({
  users: [
    { id: "u1", name: "Alice" },
    { id: "u2", name: "Bob" },
  ],
});

export default function Users() {
  const data = useLoaderData<typeof loader>();
  return (
    <section>
      <h1 id="users-title">Users</h1>
      <ul>
        {data.users.map((user) => (
          <li key={user.id}>
            <Link to="/users/[id]" params={{ id: user.id }}>
              {user.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
