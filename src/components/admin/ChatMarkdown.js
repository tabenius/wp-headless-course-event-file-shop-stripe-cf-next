"use client";

function parseInline(text) {
  const result = [];
  // Match **bold**, *italic*, `code` — in that order so ** is tried before *
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let key = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) result.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      result.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      result.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      result.push(
        <code
          key={key++}
          className="bg-gray-100 px-1 rounded font-mono text-xs"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) result.push(text.slice(last));
  return result;
}

function parseTable(tableLines) {
  // Filter separator rows like | --- | --- |
  const rows = tableLines
    .filter((row) => !/^\s*\|[\s\-:|]+\|\s*$/.test(row))
    .map((row) =>
      row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  if (rows.length === 0) return null;
  return (
    <table className="text-xs border-collapse w-full my-1">
      <thead>
        <tr>
          {rows[0].map((cell, ci) => (
            <th
              key={ci}
              className="border border-gray-300 px-2 py-0.5 bg-gray-50 text-left font-semibold"
            >
              {parseInline(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(1).map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} className="border border-gray-300 px-2 py-0.5">
                {parseInline(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ChatMarkdown({ content }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={key++}
          className="bg-gray-900 text-gray-100 rounded p-2 text-xs overflow-x-auto font-mono my-1"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Headings
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h3) {
      elements.push(
        <h3 key={key++} className="font-semibold text-sm mt-2 mb-0.5">
          {parseInline(h3[1])}
        </h3>,
      );
      i++;
      continue;
    }
    if (h2) {
      elements.push(
        <h2 key={key++} className="font-semibold text-sm mt-2 mb-0.5">
          {parseInline(h2[1])}
        </h2>,
      );
      i++;
      continue;
    }
    if (h1) {
      elements.push(
        <h1 key={key++} className="font-bold text-base mt-2 mb-0.5">
          {parseInline(h1[1])}
        </h1>,
      );
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const table = parseTable(tableLines);
      if (table)
        elements.push(
          <div key={key++} className="overflow-x-auto">
            {table}
          </div>,
        );
      continue;
    }

    // Bullet list
    if (/^[-*] /.test(line.trim())) {
      const bulletLines = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        bulletLines.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc pl-4 text-sm space-y-0.5 my-1">
          {bulletLines.map((bl, bi) => (
            <li key={bi}>{parseInline(bl)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular text
    elements.push(
      <p key={key++} className="text-sm text-gray-900">
        {parseInline(line)}
      </p>,
    );
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}
