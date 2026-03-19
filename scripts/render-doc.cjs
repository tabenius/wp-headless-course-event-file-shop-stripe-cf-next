const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const RAGBAZ = `██████╗  █████╗  ██████╗ ██████╗  █████╗ ███████╗
██╔══██╗██╔══██╗██╔════╝ ██╔══██╗██╔══██╗╚══███╔╝
██████╔╝███████║██║  ███╗██████╔╝███████║  ███╔╝ 
██╔══██╗██╔══██║██║   ██║██╔══██╗██╔══██║ ███╔╝  
██║  ██║██║  ██║╚██████╔╝██████╔╝██║  ██║███████╗
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝`;

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  let html = "";
  let buffer = [];
  let inList = false;

  const flushParagraph = () => {
    if (buffer.length > 0) {
      html += `<p>${inlineFormat(buffer.join(" ").trim())}</p>`;
      buffer = [];
    }
  };

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = Math.min(4, headingMatch[1].length);
      html += `<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`;
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      if (!inList) {
        inList = true;
        html += "<ul>";
      }
      const item = trimmed.replace(/^[-*+]\s+/, "");
      html += `<li>${inlineFormat(item)}</li>`;
      continue;
    }
    buffer.push(trimmed);
  }

  flushParagraph();
  closeList();
  return html;
}

async function main() {
  const docPath = path.join(process.cwd(), "docs", "README.sv.md");
  const cssPath = path.join(process.cwd(), "src", "app", "theme.generated.css");
  const outputPath = path.join(process.cwd(), "docs", "README.sv.html");

  const [markdown, css] = await Promise.all([
    readFile(docPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);
  const body = renderMarkdown(markdown);

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dokumentation — RAGBAZ</title>
  <style>
    :root {
      font-family: "Nunito", "Segoe UI", sans-serif;
      background: #f5f5f4;
      color: #1f2937;
    }
    body {
      margin: 0;
      padding: 0;
    }
    body > pre.header {
      margin: 0;
      padding: 1rem 1.5rem;
      background: #111827;
      color: #f8fafc;
      font-family: "Courier New", monospace;
    }
    main.content {
      padding: 2rem;
      max-width: 960px;
      margin: 0 auto 4rem;
      line-height: 1.6;
    }
    main.content h1,
    main.content h2,
    main.content h3,
    main.content h4 {
      margin-top: 2rem;
      margin-bottom: 0.75rem;
      font-weight: 700;
    }
    main.content p {
      margin-bottom: 1rem;
    }
    main.content ul {
      margin-left: 1.25rem;
      margin-bottom: 1rem;
    }
    main.content a {
      color: #064e3b;
      text-decoration: underline;
    }
    ${css}
  </style>
</head>
<body>
  <pre class="header">${RAGBAZ}</pre>
  <main class="content">
    ${body}
  </main>
</body>
</html>`;

  await writeFile(outputPath, html, "utf8");
  console.log(`Generated ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
