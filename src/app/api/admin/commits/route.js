import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";

export async function GET(request) {
  const session = getAdminSessionFromCookieHeader(
    request.headers.get("cookie") || "",
  );
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GITHUB_DEPLOY_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return NextResponse.json({
      ok: false,
      error: "Set GITHUB_DEPLOY_TOKEN and GITHUB_REPO to view commit history.",
    });
  }

  try {
    // Fine-grained tokens use "Bearer", classic PATs use "token"
    const authPrefix = token.startsWith("ghp_") ? "token" : "Bearer";
    const response = await fetch(
      `https://api.github.com/repos/${repo}/commits?per_page=50`,
      {
        headers: {
          Authorization: `${authPrefix} ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "ragbaz-admin",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("GitHub commits API failed:", response.status, text);
      const hint =
        response.status === 403
          ? " — the token may need 'contents:read' permission"
          : response.status === 404
            ? " — check that GITHUB_REPO is correct (owner/repo)"
            : "";
      return NextResponse.json({
        ok: false,
        error: `GitHub API returned ${response.status}${hint}`,
      });
    }

    const data = await response.json();
    const commits = data.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      date: c.commit.author.date,
      author: c.commit.author.name,
    }));

    return NextResponse.json({ ok: true, commits });
  } catch (err) {
    console.error("GitHub commits fetch error:", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch commits" });
  }
}
