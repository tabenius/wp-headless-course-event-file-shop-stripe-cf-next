"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import ChatMarkdown from "./ChatMarkdown";
import ImageGenerationPanel from "./ImageGenerationPanel";

export default function ChatMessage({ m, uploadBackend, onFeedback }) {
  const [feedback, setFeedback] = useState(m.feedback || null);

  const handleFeedback = (value) => {
    setFeedback(value);
    if (onFeedback) onFeedback(value);
  };

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
          {m.role === "assistant" && (
            <div className="flex gap-1 mt-1">
              {feedback ? (
                <span className="text-[11px] text-gray-400">{t("chat.feedbackThanks")}</span>
              ) : (
                <>
                  <button
                    onClick={() => handleFeedback("up")}
                    className="text-[11px] px-1.5 py-0.5 rounded hover:bg-green-100 text-gray-400 hover:text-green-600"
                    title={t("chat.thumbsUp")}
                  >
                    &#x1F44D;
                  </button>
                  <button
                    onClick={() => handleFeedback("down")}
                    className="text-[11px] px-1.5 py-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                    title={t("chat.thumbsDown")}
                  >
                    &#x1F44E;
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
