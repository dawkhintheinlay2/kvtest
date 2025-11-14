// main.ts (NO CRON JOB VERSION - FINAL)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "fallback-admin-token";

console.log("Streamtape Manager (Manual Trigger Only) is starting...");

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;

    if (pathname === "/") {
        return new Response(getLoginPageHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (pathname === "/admin") {
        if (searchParams.get("token") !== ADMIN_TOKEN) {
            return new Response("Forbidden: Invalid Admin Token.", { status: 403 });
        }
        const links = [];
        for await (const entry of kv.list<string>({ prefix: ["streamtape_urls"] })) {
            links.push(entry.value);
        }
        // Add the "Run Now" button to the admin page
        return new Response(getAdminPageHTML(links, ADMIN_TOKEN), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (pathname === "/add" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const newUrl = formData.get("url") as string;
        if (newUrl && newUrl.includes("streamtape.com")) {
            await kv.set(["streamtape_urls", newUrl], newUrl);
        }
        return Response.redirect(`${url.origin}/admin?token=${ADMIN_TOKEN}`, 302);
    }

    if (pathname === "/delete" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const urlToDelete = formData.get("url") as string;
        if (urlToDelete) {
            await kv.delete(["streamtape_urls", urlToDelete]);
        }
        return Response.redirect(`${url.origin}/admin?token=${ADMIN_TOKEN}`, 302);
    }

    // This is the endpoint to manually run the keeper job
    if (pathname === "/run-now" && method === "POST") {
         if ((await req.formData()).get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
         console.log("Manual trigger: Starting keeper job.");
         keepFilesActive(); // Run in background, don't wait for it to finish
         // Redirect back with a success message
         return Response.redirect(`${url.origin}/admin?token=${ADMIN_TOKEN}&status=started`, 302);
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

// The Deno.cron line is now completely removed.

serve(handler);

function getLoginPageHTML(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Admin Login</title><style>body{display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;font-family:sans-serif;}.login-container{background:#162447;padding:2.5rem;border-radius:10px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);}h1{color:#e43f5a;margin-top:0;}input{width:100%;padding:0.8rem;margin-bottom:1rem;border-radius:5px;border:1px solid #1f4068;background:#1a1a2e;color:#e0e0e0;}button{width:100%;padding:0.8rem;border:none;border-radius:5px;background:#e43f5a;color:white;cursor:pointer;font-weight:bold;}</style></head><body><div class="login-container"><h1>Admin Panel Login</h1><form id="login-form"><input type="password" id="token-input" placeholder="Enter Admin Token" required><button type="submit">Login</button></form></div>
    <script>document.getElementById('login-form').addEventListener('submit',(e)=>{e.preventDefault();const t=document.getElementById('token-input').value;if(t){window.location.href='/admin?token='+encodeURIComponent(t);}});<\/script></body></html>`;
}

function getAdminPageHTML(links: string[], token: string): string {
  let linkListHTML = links.map(link => `
    <li class="link-item"><span class="link-text">${link}</span><form method="POST" action="/delete" class="delete-form"><input type="hidden" name="token" value="${token}"><input type="hidden" name="url" value="${link}"><button type="submit" class="delete-btn" title="Delete">&times;</button></form></li>`).join('');
  return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Streamtape Link Manager</title><style>body{font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;margin:0;padding:2rem;display:flex;justify-content:center;}.container{width:100%;max-width:800px;background:#162447;padding:2rem;border-radius:10px;}h1,h2{color:#e43f5a;}form{display:flex;gap:1rem;margin-bottom:2rem;}input[type="text"]{flex-grow:1;padding:0.8rem;background:#1a1a2e;border:1px solid #1f4068;color:#e0e0e0;border-radius:5px;}button{padding:0.8rem 1.5rem;background:#e43f5a;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:bold;}ul{list-style:none;padding:0;}.link-item{display:flex;justify-content:space-between;align-items:center;background:#1f4068;padding:0.8rem;border-radius:5px;margin-bottom:0.5rem;}.link-text{word-break:break-all;margin-right:1rem;}.delete-form{margin:0;}.delete-btn{background:none;color:#ffc1cc;font-size:1.5rem;padding:0 0.5rem;line-height:1;} .run-now-form button { background: #17a2b8; }</style></head>
    <body><div class="container"><h1>Streamtape Link Manager</h1>
    <form method="POST" action="/add"><input type="hidden" name="token" value="${token}"><input type="text" name="url" placeholder="Enter Streamtape URL..." required><button type="submit">Add Link</button></form>
    <form method="POST" action="/run-now" class="run-now-form"><input type="hidden" name="token" value="${token}"><button type="submit">Run File Keeper Now</button></form>
    <h2>Active Links (${links.length})</h2><ul>${links.length > 0 ? linkListHTML : '<p>No links yet.</p>'}</ul></div></body></html>`;
}
