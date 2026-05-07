import { ClientTrigger } from "./client-trigger";

export default function Page() {
  return (
    <main>
      <h1>Next.js Basic</h1>
      <p>Use the button below or call /api/demo to generate a sample incident.</p>
      <ClientTrigger />
    </main>
  );
}