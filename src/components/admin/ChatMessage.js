"use client";

import { t } from "@/lib/i18n";
import ChatMarkdown from "./ChatMarkdown";
import ImageGenerationPanel from "./ImageGenerationPanel";

export default function ChatMessage({ m, uploadBackend }) {
  const handleCopy = (format) => {
    let textToCopy = "";
    if (format === "markdown" && m.role === "assistant") {
      textToCopy = m.content;
    } else {
      textToCopy = m.content.replace(/[\*_~`\\]/g, ""); // Strip markdown for raw text
    }
    navigator.clipboard.writeText(textToCopy).catch((err) => {
      console.warn("[ChatMessage] clipboard write failed:", err);
    });
  };

  return (
    <div className="space-y-1 relative group">
      <div className="text-xs uppercase tracking-wide text-gray-500 flex justify-between items-center">
        <span>{m.role === "user" ? "You" : "AI"}</span>
        {m.role === "assistant" && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <button
              onClick={() => handleCopy("raw")}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded"
              title={t("chat.copyRaw")}
            >
              {t("chat.copyRawShort")}
            </button>
            <button
              onClick={() => handleCopy("markdown")}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded"
              title={t("chat.copyMarkdown")}
            >
              {t("chat.copyMarkdownShort")}
            </button>
          </div>
        )}
      </div>
      {m.type === "image-generation" ? (
        <ImageGenerationPanel
          initialPrompt={m.prompt}
          description=""
          onSave={null}
          context="chat"
          uploadBackend={uploadBackend}
        />
      ) : (
        <>
          <ChatMarkdown content={m.content} />
          {m.sources && m.sources.length > 0 ? (
            <div className="text-[11px] text-gray-500 flex gap-2 flex-wrap">
              <span className="font-semibold">{t("chat.sources")}:</span>
              {m.sources.map((s, i) => (
                <a key={i} href={s.uri} className="underline" target="_blank" rel="noreferrer">
                  {s.title || s.uri}
                </a>
              ))}
            </div>
          ) : m.role === "assistant" ? (
            <div className="text-[11px] text-gray-400">{t("chat.noSources")}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
