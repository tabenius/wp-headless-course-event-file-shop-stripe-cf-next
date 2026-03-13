import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  // Verify admin session
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GITHUB_DEPLOY_TOKEN;
  const repo = process.env.GITHUB_REPO; // e.g. "owner/repo"
  const workflow = process.env.GITHUB_DEPLOY_WORKFLOW || "deploy.yml";

  if (!token || !repo) {
    return NextResponse.json(
      { ok: false, error: "GitHub deploy is not configured. Set GITHUB_DEPLOY_TOKEN and GITHUB_REPO." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );

    if (response.status === 204 || response.ok) {
      return NextResponse.json({ ok: true, message: "Deploy triggered" });
    }

    const text = await response.text().catch(() => "");
    console.error("GitHub API error:", response.status, text);
    return NextResponse.json(
      { ok: false, error: `GitHub API returned ${response.status}` },
      { status: 502 },
    );
  } catch (err) {
    console.error("Deploy trigger failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to trigger deploy" },
      { status: 500 },
    );
  }
}
