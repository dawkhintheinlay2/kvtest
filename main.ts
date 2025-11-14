// main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "fallback-admin-token";

console.log("Streamtape Manager (Final UI/UX) is starting...");

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

    if (pathname === "/run-now" && method === "POST") {
         if ((await req.formData()).get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
         console.log("Manual trigger: Starting keeper job.");
         keepFilesActive();
         return Response.redirect(`${url.origin}/admin?token=${ADMIN_TOKEN}&status=started`, 302);
    }
  
    if (pathname === "/job-status") {
        const statusEntry = await kv.get<{ status: string }>(["job_status"]);
        return new Response(JSON.stringify(statusEntry.value || { status: "idle" }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response("Not Found", { status: 404 });
}

async function keepFilesActive() {
    await kv.set(["job_status"], { status: "running" });
    console.log(`Keeper job started: ${new Date().toISOString()}`);
    
    const urls = [];
    for await (const entry of kv.list<string>({ prefix: ["streamtape_urls"] })) { urls.push(entry.value); }
    
    if (urls.length === 0) { console.log("No URLs to process."); } 
    else {
        console.log(`Processing ${urls.length} URLs.`);
        for (const url of urls) {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                console.log(`Pinged ${url} - Status: ${res.status}`);
            } catch (e) { console.error(`Failed to ping ${url}: ${e.message}`); }
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    await kv.set(["job_status"], { status: "finished" });
    console.log("Keeper job finished.");
}

serve(handler);

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Admin Login</title><style>body{display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;font-family:sans-serif;}.login-container{background:#162447;padding:2.5rem;border-radius:10px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);}h1{color:#e43f5a;margin-top:0;}input{width:100%;padding:0.8rem;margin-bottom:1rem;border-radius:5px;border:1px solid #1f4068;background:#1a1a2e;color:#e0e0e0;}button{width:100%;padding:0.8rem;border:none;border-radius:5px;background:#e43f5a;color:white;cursor:pointer;font-weight:bold;}</style></head><body><div class="login-container"><h1>Admin Panel Login</h1><form id="login-form"><input type="password" id="token-input" placeholder="Enter Admin Token" required><button type="submit">Login</button></form></div>
    <script>document.getElementById('login-form').addEventListener('submit',(e)=>{e.preventDefault();const t=document.getElementById('token-input').value;if(t){window.location.href='/admin?token='+encodeURIComponent(t);}});<\/script></body></html>`;
}

function getAdminPageHTML(links: string[], token: string): string {
    const totalLinks = links.length;
    let linkListHTML = links.map(link => `
    <li class="link-item">
      <span class="link-text" title="${link}">${link}</span>
      <form method="POST" action="/delete" class="delete-form">
        <input type="hidden" name="token" value="${token}">
        <input type="hidden" name="url" value="${link}">
        <button type="submit" class="delete-btn" title="Delete">&times;</button>
      </form>
    </li>`).join('');

    return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Streamtape Link Manager</title>
    <style>
        :root { --bg: #1a1a2e; --primary: #1f4068; --secondary: #162447; --accent: #e43f5a; --text: #e0e0e0; --success: #28a745; --info: #17a2b8; }
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:2rem;display:flex;justify-content:center;}
        .container{width:100%;max-width:960px;background:var(--secondary);padding:2rem;border-radius:10px;}
        h1,h2{color:var(--accent);border-bottom:2px solid var(--accent);padding-bottom:0.5rem;}
        form{margin-bottom:1.5rem;}
        .form-group{display:flex;gap:1rem;}
        input[type="text"]{flex-grow:1;padding:0.8rem;background:var(--bg);border:1px solid var(--primary);color:var(--text);border-radius:5px;font-size:1rem;}
        button{padding:0.8rem 1.5rem;background:var(--accent);color:white;border:none;border-radius:5px;cursor:pointer;font-weight:bold;}
        .run-now-btn{background: var(--info);}
        ul{list-style:none;padding:0;}
        .link-item{display:flex;justify-content:space-between;align-items:center;background:var(--primary);padding:0.8rem 1.2rem;border-radius:5px;margin-bottom:0.8rem;}
        .link-text {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-grow:1;margin-right:1rem;}
        .delete-form{margin:0;}.delete-btn{background:none;color:#ffc1cc;font-size:1.5rem;padding:0 0.5rem;line-height:1;}
        .notification{padding:1rem;border-radius:5px;margin-bottom:1.5rem;text-align:center;display:none;font-weight:bold;}
        .notification.info{background:var(--info);color:white;}
        .notification.success{background:var(--success);color:white;}
    </style>
    </head><body><div class="container">
    <div id="notification" class="notification"></div>
    <h1>Streamtape Link Manager</h1>
    <form method="POST" action="/add"><input type="hidden" name="token" value="${token}"><div class="form-group"><input type="text" name="url" placeholder="Enter Streamtape URL..." required><button type="submit">Add Link</button></div></form>
    <form method="POST" action="/run-now" id="run-now-form"><input type="hidden" name="token" value="${token}"><button type="button" id="run-now-btn" class="run-now-btn">Run File Keeper Now</button></form>
    <h2>Active Links (${totalLinks})</h2><ul>${totalLinks > 0 ? linkListHTML : '<p>No links yet.</p>'}</ul></div>
    <script>
        const notif = document.getElementById('notification');
        const urlParams = new URLSearchParams(window.location.search);
        let pollingInterval;
        document.getElementById('run-now-btn').addEventListener('click', (e) => {
            const totalLinks = ${totalLinks};
            const confirmationMessage = \`Are you sure you want to run the keeper job for \${totalLinks} links? This might take a while if you have many links.\`;
            if (confirm(confirmationMessage)) {
                document.getElementById('run-now-form').submit();
            }
        });
        function checkJobStatus() {
            fetch('/job-status').then(res => res.json()).then(data => {
                if (data.status === 'running') {
                    notif.className = 'notification info'; notif.textContent = 'Job is running in the background...'; notif.style.display = 'block';
                } else if (data.status === 'finished') {
                    notif.className = 'notification success'; notif.textContent = 'Job finished successfully!'; notif.style.display = 'block';
                    clearInterval(pollingInterval);
                    setTimeout(() => { notif.style.display = 'none'; }, 5000);
                    window.history.replaceState({}, document.title, window.location.pathname + "?token=${token}");
                }
            }).catch(() => { clearInterval(pollingInterval); });
        }
        if (urlParams.get('status') === 'running') {
            pollingInterval = setInterval(checkJobStatus, 5000);
            checkJobStatus();
        }
    </script>
    </body></html>`;
}
