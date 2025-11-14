// main.ts (Simplest Test)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

console.log("Attempting to start server and open Deno KV...");

// This is the only critical line we are testing.
const kv = await Deno.openKv();

async function handler(_req: Request): Promise<Response> {
  // If the code reaches here, it means Deno KV was opened successfully.
  await kv.set(["last_visit"], new Date());
  const lastVisit = await kv.get(["last_visit"]);
  
  return new Response(`Hello! Deno KV is working. Last visit: ${lastVisit.value}`, {
    headers: { "Content-Type": "text/plain" },
  });
}

serve(handler);
