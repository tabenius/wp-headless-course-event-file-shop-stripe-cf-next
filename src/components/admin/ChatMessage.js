"use client";

import { t } from "@/lib/i18n";
import ChatMarkdown from "./ChatMarkdown";
import ImageGenerationPanel from "./ImageGenerationPanel";

export default function ChatMessage({ m, uploadBackend }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-gray-500">{m.role === "user" ? "You" : "AI"}</div>
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
