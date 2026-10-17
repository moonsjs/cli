import { useState } from "react";
import { hello } from "../server/hello.server";

export default function Hello() {
  const [message, setMessage] = useState("Call the server function");
  return (
    <main>
      <h1>Hello</h1>
      <button
        onClick={() => {
          void hello({ input: { name: "Moons" } }).then((result) => setMessage(result.message));
        }}
      >
        {message}
      </button>
    </main>
  );
}
