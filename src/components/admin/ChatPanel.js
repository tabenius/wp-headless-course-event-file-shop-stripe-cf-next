"use client";

import { useRef, useEffect } from "react";
import { t } from "@/lib/i18n";
import ChatMessage from "./ChatMessage";

export default function ChatPanel({ chatMessages, chatInput, setChatInput, sendChat, chatLoading, uploadBackend }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  return (
    <div className="border rounded p-4 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t("chat.title")}</h2>
        <p className="text-sm text-gray-500">{t("chat.subtitle")}</p>
      </div>
      <div className="space-y-3 max-h-[28rem] overflow-auto border rounded p-3 bg-white">
        {chatMessages.length === 0 ? (
          <div className="text-sm text-gray-500">{t("chat.empty")}</div>
        ) : (
          chatMessages.map((m, idx) => (
            <ChatMessage key={idx} m={m} uploadBackend={uploadBackend} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendChat();
            }
          }}
          placeholder={t("chat.placeholder")}
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={sendChat}
          disabled={chatLoading}
          className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {chatLoading ? t("admin.running") : t("chat.send")}
        </button>
      </div>
    </div>
  );
}
