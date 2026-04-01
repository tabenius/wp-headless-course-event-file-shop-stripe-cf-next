import { getD1Database } from "@/lib/d1Bindings";
import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
  deleteCloudflareKv,
} from "@/lib/cloudflareKv";

const MAX_MESSAGES = 40;

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

export async function saveChatHistory(historyKey, chatHistory) {
  const messages = Array.isArray(chatHistory)
    ? chatHistory.slice(-MAX_MESSAGES)
    : [];

  try {
    const db = await tryGetD1();
    if (db) {
      // Replace: clear then insert all (keeps it capped at MAX_MESSAGES)
      await db
        .prepare("DELETE FROM chat_messages WHERE history_key = ?")
        .bind(historyKey)
        .run();
      for (const msg of messages) {
        await db
          .prepare(
            "INSERT INTO chat_messages (history_key, role, content) VALUES (?, ?, ?)",
          )
          .bind(historyKey, msg.role || "user", msg.content || "")
          .run();
      }
      return true;
    }

    // KV fallback
    await writeCloudflareKvJson(`chat_history:${historyKey}`, messages);
    return true;
  } catch (error) {
    console.error("Failed to save chat history:", error);
    return false;
  }
}

export async function getChatHistory(historyKey) {
  try {
    const db = await tryGetD1();
    if (db) {
      const { results } = await db
        .prepare(
          "SELECT role, content FROM chat_messages WHERE history_key = ? ORDER BY id",
        )
        .bind(historyKey)
        .all();
      return (results || []).map((r) => ({ role: r.role, content: r.content }));
    }

    // KV fallback
    const history = await readCloudflareKvJson(`chat_history:${historyKey}`);
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.error("Failed to retrieve chat history:", error);
    return [];
  }
}

export async function clearChatHistory(historyKey) {
  try {
    const db = await tryGetD1();
    if (db) {
      await db
        .prepare("DELETE FROM chat_messages WHERE history_key = ?")
        .bind(historyKey)
        .run();
      return true;
    }

    await deleteCloudflareKv(`chat_history:${historyKey}`);
    return true;
  } catch (error) {
    console.error("Failed to clear chat history:", error);
    return false;
  }
}
