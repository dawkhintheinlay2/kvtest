// main.ts (Full Streamtape Manager Code)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "fallback-admin-token";

console.log("Streamtape Manager Server is starting...");

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname, searchParams } = url;
  const method = req.method;

  // Main Admin Page
  if (pathname === "/") {
    if (searchParams.get("token") !== ADMIN_TOKEN) {
      return new Response("Forbidden: Invalid Admin Token. Please use the correct URL: /?token=YOUR_ADMIN_TOKEN", { status: 403 });
    }
    const links = [];
    for await (const entry of kv.list<string>({ prefix: ["streamtape_urls"] })) {
      links.push(entry.value);
    }
    return new Response(getAdminPageHTML(links, ADMIN_TOKEN), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Add a new link
  if (pathname === "/add" && method === "POST") {
    const formData = await req.formData();
    if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
    const newUrl = formData.get("url") as string;
    if (newUrl && newUrl.includes("streamtape.com")) {
      await kv.set(["streamtape_urls", newUrl], newUrl);
    }
    return Response.redirect(`${url.origin}/?token=${ADMIN_TOKEN}`, 302);
  }

  // Delete a link
  if (pathname === "/delete" && method === "POST") {
    const formData = await req.formData();
    if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
    const urlToDelete = formData.get("url") as string;
    if (urlToDelete) {
      await kv.delete(["streamtape_urls", urlToDelete]);
    }
    return Response.redirect(`${url.origin}/?token=${ADMIN_TOKEN}`, 302);
  }

  // Manually trigger the cron job
  if (pathname === "/run-now") {
     if (searchParams.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
     console.log("Manual trigger: Starting keeper job.");
     keepFilesActive(); // Run in background
     return new Response("OK! Job started. Check logs.", { status: 200 });
  }

  return new Response("Not Found", { status: 404 });
}

async function keepFilesActive() {
  console.log(`Keeper job started: ${new Date().toISOString()}`);
  const urls = [];
  for await (const entry of kv.list<string>({ prefix: ["streamtape_urls"] })) { urls.push(entry.value); }
  if (urls.length === 0) { console.log("No URLs to process."); return; }
  console.log(`Processing ${urls.length} URLs.`);
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      console.log(`Pinged ${url} - Status: ${res.status}`);
    } catch (e) { console.error(`Failed to ping ${url}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("Keeper job finished.");
}

Deno.cron("weeklyStreamtapeKeeper", "0 3 * * 0", keepFilesActive);

serve(handler);

function getAdminPageHTML(links: string[], token: string): string {
  let linkListHTML = links.map(link => `
    <li class="link-item">
      <span class="link-text">${link}</span>
      <form method="POST" action="/delete" class="delete-form">
        <input type="hidden" name="token" value="${token}">
        <input type="hidden" name="url" value="${link}">
        <button type="submit" class="delete-btn" title="Delete this link">&times;</button>
      </form>
    </li>
  `).join('');

  return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Streamtape Link Manager</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#1a1a2e;color:#e0e0e0;margin:0;padding:2rem;display:flex;justify-content:center;}.container{width:100%;max-width:800px;background:#162447;padding:2rem;border-radius:10px;}h1{color:#e43f5a;}form{display:flex;gap:1rem;margin-bottom:2rem;}input[type="text"]{flex-grow:1;padding:0.8rem;background:#1a1a2e;border:1px solid #1f4068;color:#e0e0e0;border-radius:5px;}button{padding:0.8rem 1.5rem;background:#e43f5a;color:white;border:none;border-radius:5px;cursor:pointer;}ul{list-style:none;padding:0;}.link-item{display:flex;justify-content:space-between;align-items:center;background:#1f4068;padding:0.8rem;border-radius:5px;margin-bottom:0.5rem;}.link-text{word-break:break-all;margin-right:1rem;}.delete-form{margin:0;}.delete-btn{background:none;color:#ffc1cc;font-size:1.5rem;padding:0 0.5rem;line-height:1;}</style>
    </head><body><div class="container"><h1>Streamtape Link Manager</h1><form method="POST" action="/add"><input type="hidden" name="token" value="${token}"><input type="text" name="url" placeholder="Enter Streamtape URL..." required><button type="submit">Add Link</button></form>
    <h2>Active Links (${links.length})</h2><ul>${links.length > 0 ? linkListHTML : '<p>No links yet.</p>'}</ul></div></body></html>`;
}
