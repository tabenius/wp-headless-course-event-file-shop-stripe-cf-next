import { getD1Database } from "@/lib/d1Bindings";

const MAX_MESSAGES = 40;

export async function saveChatHistory(historyKey, chatHistory) {
  const messages = Array.isArray(chatHistory)
    ? chatHistory.slice(-MAX_MESSAGES)
    : [];

  try {
    const db = await getD1Database();
    const statements = [
      db
        .prepare("DELETE FROM chat_messages WHERE history_key = ?")
        .bind(historyKey),
      ...messages.map((msg) =>
        db
          .prepare(
            "INSERT INTO chat_messages (history_key, role, content) VALUES (?, ?, ?)",
          )
          .bind(historyKey, msg.role || "user", msg.content || ""),
      ),
    ];
    await db.batch(statements);
    return true;
  } catch (error) {
    console.error("Failed to save chat history:", error);
    return false;
  }
}

export async function getChatHistory(historyKey) {
  try {
    const db = await getD1Database();
    const { results } = await db
      .prepare(
        "SELECT role, content FROM chat_messages WHERE history_key = ? ORDER BY id",
      )
      .bind(historyKey)
      .all();
    return (results || []).map((r) => ({ role: r.role, content: r.content }));
  } catch (error) {
    console.error("Failed to retrieve chat history:", error);
    return [];
  }
}

export async function clearChatHistory(historyKey) {
  try {
    const db = await getD1Database();
    await db
      .prepare("DELETE FROM chat_messages WHERE history_key = ?")
      .bind(historyKey)
      .run();
    return true;
  } catch (error) {
    console.error("Failed to clear chat history:", error);
    return false;
  }
}
