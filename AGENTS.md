<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# PowerShell curl quoting trap

PowerShell 5.1 strips double quotes when passing arguments to native executables (like curl.exe). The command below sends `{username:admin}` (NOT valid JSON):

```powershell
curl.exe -d '{"username":"admin"}'   # BROKEN - quotes stripped
```

Fix: use `--%` (stop-parsing symbol):

```powershell
curl.exe --% -d "{\"username\":\"admin\"}"
```

Or use a temporary file with `-d @file.json`.
<!-- END:nextjs-agent-rules -->
