import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function POST() {
  // Verify admin session
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, message: "Cache purged" });
  } catch (err) {
    console.error("Purge cache failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to purge cache" },
      { status: 500 },
    );
  }
}
