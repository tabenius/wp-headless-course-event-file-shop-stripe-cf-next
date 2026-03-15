"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { multipartUpload } from "@/lib/multipartUploadClient";
import ImageUploader from "./ImageUploader";

function toCurrencyUnits(cents) {
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : "0.00";
}

function toCents(units) {
  const parsed = Number.parseFloat(units);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function emptyProduct() {
  return {
    name: "",
    slug: "",
    type: "digital_file",
    description: "",
    imageUrl: "",
    priceCents: 0,
    currency: "SEK",
    fileUrl: "",
    courseUri: "",
    active: true,
    slugEdited: false,
  };
}

function UserAccessPanel({ users, courses, allWpContent, products }) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [panelMsg, setPanelMsg] = useState("");

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name || "").toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  // All URIs that have access configs
  const allUris = Object.keys(courses).sort();

  // Which URIs this user has access to
  const userAccess = selectedUser
    ? allUris.filter((uri) =>
        Array.isArray(courses[uri]?.allowedUsers) &&
        courses[uri].allowedUsers.includes(selectedUser.email),
      )
    : [];

  function uriLabel(uri) {
    const wp = allWpContent.find((item) => item.uri === uri);
    if (wp) return wp.title || wp.name || uri;
    const shop = products.find((p) => p.courseUri === uri);
    if (shop) return shop.name || uri;
    return uri;
  }

  async function toggleAccess(uri, grant) {
    if (!selectedUser) return;
    setSaving(true);
    setPanelMsg("");
    try {
      const config = courses[uri] || { allowedUsers: [], priceCents: 0, currency: "SEK" };
      const currentUsers = Array.isArray(config.allowedUsers) ? [...config.allowedUsers] : [];
      const nextUsers = grant
        ? [...new Set([...currentUsers, selectedUser.email])]
        : currentUsers.filter((e) => e !== selectedUser.email);
      const res = await fetch("/api/admin/course-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseUri: uri,
          allowedUsers: nextUsers,
          priceCents: config.priceCents || 0,
          currency: config.currency || "SEK",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed");
      // Update courses in parent — use a custom event
      window.dispatchEvent(new CustomEvent("admin:coursesUpdated", { detail: json.courses }));
      setPanelMsg(grant ? "Access granted." : "Access revoked.");
    } catch (err) {
      setPanelMsg(err.message || "Failed to update access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="w-full border rounded px-3 py-2 text-sm"
      />
      {filtered.length > 0 && (
        <div className="border rounded max-h-40 overflow-auto divide-y">
          {filtered.slice(0, 20).map((u) => (
            <button
              key={u.email}
              type="button"
              onClick={() => setSelectedUser(u)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                selectedUser?.email === u.email ? "bg-blue-50 font-medium" : ""
              }`}
            >
              {u.name} <span className="text-gray-400">({u.email})</span>
            </button>
          ))}
        </div>
      )}
      {selectedUser && (
        <div className="border rounded p-4 space-y-3 bg-gray-50">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-medium">{selectedUser.name}</div>
              <div className="text-xs text-gray-500">{selectedUser.email}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>
          <div className="text-xs font-medium text-gray-600">Content access:</div>
          {allUris.length === 0 ? (
            <p className="text-xs text-gray-400">No content items configured yet.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-auto">
              {allUris.map((uri) => {
                const hasAccess = userAccess.includes(uri);
                return (
                  <label key={uri} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hasAccess}
                      disabled={saving}
                      onChange={() => toggleAccess(uri, !hasAccess)}
                    />
                    <span className={hasAccess ? "text-gray-900" : "text-gray-500"}>
                      {uriLabel(uri)}
                    </span>
                    <span className="text-[10px] text-gray-400">{uri}</span>
                  </label>
                );
              })}
            </div>
          )}
          {panelMsg && <p className="text-xs text-green-700">{panelMsg}</p>}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [courses, setCourses] = useState({});
  const [users, setUsers] = useState([]);
  const [wpCourses, setWpCourses] = useState([]);
  const [wcProducts, setWcProducts] = useState([]);
  const [wpEvents, setWpEvents] = useState([]);
  const [storage, setStorage] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [price, setPrice] = useState("0.00");
  const [currency, setCurrency] = useState("SEK");
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [manualEmail, setManualEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [healthChecks, setHealthChecks] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [healthLoading, setHealthLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [activeTab, setActiveTab] = useState("products");
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsMode, setAnalyticsMode] = useState("none"); // "zone" | "workers" | "none"
  const [analyticsConfigured, setAnalyticsConfigured] = useState(false);
  const [commits, setCommits] = useState(null);
  const [commitsError, setCommitsError] = useState("");
  const editFormRef = useRef(null);
  const [resendConfigured, setResendConfigured] = useState(false);

  // Derived values for shop product selection
  const isShopSelection = selectedCourse.startsWith("__shop_");
  const shopIndex = isShopSelection
    ? Number.parseInt(selectedCourse.replace("__shop_", ""), 10)
    : -1;
  const selectedShopProduct =
    isShopSelection && shopIndex >= 0 && shopIndex < products.length
      ? products[shopIndex]
      : null;
  const isWpSelection =
    selectedCourse &&
    !selectedCourse.startsWith("__") &&
    selectedCourse !== "";

  // The URI used for access config (empty if not applicable)
  const accessUri = useMemo(() => {
    if (
      !selectedCourse ||
      selectedCourse === "__custom__" ||
      selectedCourse === "__new__"
    )
      return "";
    if (isShopSelection) {
      return selectedShopProduct?.type === "course"
        ? selectedShopProduct.courseUri
        : "";
    }
    return selectedCourse;
  }, [selectedCourse, isShopSelection, selectedShopProduct]);

  useEffect(() => {
    fetch("/api/admin/course-access")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok)
          throw new Error(json?.error || t("admin.fetchAdminDataFailed"));
        setCourses(json.courses || {});
        setUsers(Array.isArray(json.users) ? json.users : []);
        setWpCourses(Array.isArray(json.wpCourses) ? json.wpCourses : []);
        setWcProducts(Array.isArray(json.wcProducts) ? json.wcProducts : []);
        setWpEvents(Array.isArray(json.wpEvents) ? json.wpEvents : []);
        setStorage(json.storage || null);
        setResendConfigured(!!json.resendConfigured);
      })
      .catch((fetchError) => {
        setError(fetchError.message || t("admin.fetchAdminDataFailed"));
      });

    fetch("/api/admin/products")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok)
          throw new Error(json?.error || t("admin.fetchProductsFailed"));
        const rows = Array.isArray(json.products) ? json.products : [];
        setProducts(
          rows.map((product) => ({
            ...emptyProduct(),
            ...product,
            slugEdited: true,
          })),
        );
      })
      .catch((fetchError) => {
        setError(fetchError.message || t("admin.fetchProductListFailed"));
      });

    fetch("/api/admin/analytics")
      .then(async (res) => {
        const json = await res.json();
        if (res.ok && json?.ok) {
          setAnalytics(json.analytics);
          setAnalyticsMode(json.mode || "none");
          setAnalyticsConfigured(json.configured);
        }
      })
      .catch(() => {});
  }, []);

  // Build a unified list of all WordPress content items
  const allWpContent = useMemo(() => {
    const items = [];
    for (const p of wcProducts) items.push(p);
    for (const c of wpCourses) items.push(c);
    for (const e of wpEvents) items.push(e);
    return items;
  }, [wcProducts, wpCourses, wpEvents]);

  // Load price + access when selection changes
  useEffect(() => {
    if (!selectedCourse || selectedCourse === "__new__") return;

    // Shop product: load price from product data
    if (isShopSelection && selectedShopProduct) {
      setPrice(toCurrencyUnits(selectedShopProduct.priceCents ?? 0));
      setCurrency((selectedShopProduct.currency || "SEK").toUpperCase());
      const uri =
        selectedShopProduct.type === "course"
          ? selectedShopProduct.courseUri
          : "";
      if (uri && courses[uri]) {
        setAllowedUsers(
          Array.isArray(courses[uri].allowedUsers)
            ? courses[uri].allowedUsers
            : [],
        );
      } else {
        setAllowedUsers([]);
      }
      return;
    }

    // WP item or manual URI
    const config = courses[selectedCourse];
    if (config) {
      setPrice(toCurrencyUnits(config.priceCents ?? 0));
      setCurrency((config.currency || "SEK").toUpperCase());
      setAllowedUsers(
        Array.isArray(config.allowedUsers) ? config.allowedUsers : [],
      );
      return;
    }
    // Auto-fill price from WordPress content
    const match = allWpContent.find((item) => item.uri === selectedCourse);
    const rawPrice = match?.price || match?.priceRendered || "";
    if (rawPrice) {
      const numericPrice = parseFloat(
        String(rawPrice)
          .replace(/[^\d.,]/g, "")
          .replace(",", "."),
      );
      if (Number.isFinite(numericPrice) && numericPrice > 0) {
        setPrice(numericPrice.toFixed(2));
      } else {
        setPrice("");
      }
    } else {
      setPrice("");
    }
    setCurrency("SEK");
    setAllowedUsers([]);
  }, [selectedCourse, courses, allWpContent, isShopSelection, selectedShopProduct]);

  const knownCourses = useMemo(
    () => Object.keys(courses).sort((a, b) => a.localeCompare(b)),
    [courses],
  );

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  function toggleUser(email) {
    setAllowedUsers((prev) =>
      prev.includes(email)
        ? prev.filter((value) => value !== email)
        : [...prev, email],
    );
  }

  function addManualEmail() {
    const email = manualEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (!allowedUsers.includes(email)) {
      setAllowedUsers((prev) => [...prev, email]);
    }
    setManualEmail("");
  }

  function updateProduct(index, key, value) {
    setProducts((prev) =>
      prev.map((product, idx) => {
        if (idx !== index) return product;
        if (key === "name") {
          const nextName = value;
          const nextSlug = product.slugEdited
            ? product.slug
            : slugify(nextName);
          return { ...product, name: nextName, slug: nextSlug };
        }
        if (key === "slug") {
          return { ...product, slug: slugify(value), slugEdited: true };
        }
        return { ...product, [key]: value };
      }),
    );
  }

  function removeShopProduct(index) {
    setProducts((prev) => prev.filter((_, idx) => idx !== index));
    setSelectedCourse("");
  }

  function handleSelection(value) {
    if (value === "__new__") {
      const newProducts = [...products, emptyProduct()];
      setProducts(newProducts);
      setSelectedCourse(`__shop_${newProducts.length - 1}`);
      setTimeout(() => editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } else {
      setSelectedCourse(value);
    }
  }

  // Unified save: handles both shop products and content access
  async function saveUnified() {
    setError("");
    setMessage("");

    // Validate WP item selection
    if (isWpSelection) {
      if (price === "" || price === null || price === undefined) {
        setError(t("admin.enterPrice"));
        return;
      }
    }

    setLoading(true);

    try {
      // If a shop product was edited, sync price back and save all products
      if (isShopSelection && shopIndex >= 0) {
        const updated = products.map((p, i) =>
          i === shopIndex
            ? { ...p, priceCents: toCents(price), currency: currency.toUpperCase() }
            : p,
        );
        const payload = updated.map((p) => ({
          name: p.name,
          slug: p.slug,
          type: p.type === "course" ? "course" : "digital_file",
          description: p.description,
          imageUrl: p.imageUrl,
          priceCents: Number.isFinite(p.priceCents)
            ? p.priceCents
            : Number.parseInt(String(p.priceCents || "0"), 10) || 0,
          currency: (p.currency || "SEK").toUpperCase(),
          fileUrl: p.fileUrl,
          courseUri: p.courseUri,
          active: p.active !== false,
        }));

        const res = await fetch("/api/admin/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: payload }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || t("admin.saveProductsFailed"));
        }
        const rows = Array.isArray(json.products) ? json.products : [];
        setProducts(
          rows.map((p) => ({ ...emptyProduct(), ...p, slugEdited: true })),
        );
      }

      // Save access config if there's a content URI
      const uri = accessUri;
      if (uri) {
        const res = await fetch("/api/admin/course-access", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseUri: uri,
            allowedUsers,
            priceCents: toCents(price),
            currency,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || t("admin.saveFailed"));
        }
        setCourses(json.courses || {});
      }

      setMessage(t("admin.courseAccessUpdated"));
    } catch (err) {
      setError(err.message || t("admin.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  // Listen for tab-switch events from AdminHeader
  const showHealthTab = useCallback(() => setActiveTab("health"), []);
  useEffect(() => {
    window.addEventListener("admin:showHealth", showHealthTab);
    function onSwitchTab(e) {
      if (e.detail) setActiveTab(e.detail);
    }
    window.addEventListener("admin:switchTab", onSwitchTab);
    return () => {
      window.removeEventListener("admin:showHealth", showHealthTab);
      window.removeEventListener("admin:switchTab", onSwitchTab);
    };
  }, [showHealthTab]);

  // Fetch commit log when advanced tab is shown
  useEffect(() => {
    if (activeTab !== "advanced" || commits) return;
    fetch("/api/admin/commits")
      .then(async (res) => {
        const json = await res.json();
        if (json?.ok) setCommits(json.commits);
        else setCommitsError(json?.error || "Failed to load commits");
      })
      .catch(() => setCommitsError("Failed to load commits"));
  }, [activeTab, commits]);

  // Listen for courses updated from UserAccessPanel
  useEffect(() => {
    function onCoursesUpdated(e) {
      if (e.detail) setCourses(e.detail);
    }
    window.addEventListener("admin:coursesUpdated", onCoursesUpdated);
    return () => window.removeEventListener("admin:coursesUpdated", onCoursesUpdated);
  }, []);

  const [uploadProgress, setUploadProgress] = useState(null);

  async function uploadFile(index, field) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = field === "imageUrl" ? "image/*" : "*/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const MULTIPART_THRESHOLD = 95 * 1024 * 1024; // 95 MB

      try {
        if (file.size > MULTIPART_THRESHOLD) {
          // Large file — use multipart upload directly to R2
          setUploadProgress({ percent: 0, currentPart: 0, totalParts: 0 });
          const url = await multipartUpload(file, {
            onProgress: (p) => setUploadProgress(p),
          });
          setUploadProgress(null);
          updateProduct(index, field, url);
        } else {
          // Small file — use regular upload through Worker
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/admin/upload", {
            method: "POST",
            body: formData,
          });
          const json = await res.json();
          if (!res.ok || !json?.ok) {
            setError(json?.error || t("admin.uploadFailed"));
            return;
          }
          updateProduct(index, field, json.url);
        }
      } catch (err) {
        setUploadProgress(null);
        setError(err.message || t("admin.uploadFailed"));
      }
    };
    input.click();
  }

  async function runHealthCheck() {
    setHealthLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/health");
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || t("admin.healthCheckFailed"));
      }
      setHealthChecks(json.checks || {});
      if (json.webhookUrl) setWebhookUrl(json.webhookUrl);
    } catch (healthError) {
      const msg =
        healthError instanceof Error
          ? healthError.message
          : t("admin.healthCheckFailed");
      setError(msg);
    } finally {
      setHealthLoading(false);
    }
  }

  async function purgeCache() {
    setPurging(true);
    setPurgeMessage("");
    try {
      const res = await fetch("/api/admin/purge-cache", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.purgeFailed"));
      setPurgeMessage(t("admin.cachePurged"));
    } catch (err) {
      setError(err.message || t("admin.purgeFailed"));
    } finally {
      setPurging(false);
    }
  }

  async function triggerDeploy() {
    setDeploying(true);
    setDeployMessage("");
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.deployFailed"));
      setDeployMessage(t("admin.deployTriggered"));
    } catch (err) {
      setError(err.message || t("admin.deployFailed"));
    } finally {
      setDeploying(false);
    }
  }

  // Whether to show the detail panel
  const showDetail =
    (isWpSelection || isShopSelection) &&
    selectedCourse !== "__custom__";

  return (
    <section className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      {/* ── Stats tab ── */}
      {activeTab === "stats" && (
        <div className="space-y-6">
          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {wcProducts.length + wpCourses.length + wpEvents.length + products.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">Total items</div>
            </div>
            <div className="border rounded p-4 text-center">
              <div className="text-2xl font-bold text-blue-700">{wcProducts.length}</div>
              <div className="text-xs text-gray-500 mt-1">WooCommerce</div>
            </div>
            <div className="border rounded p-4 text-center">
              <div className="text-2xl font-bold text-green-700">
                {wpCourses.length + wpEvents.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">Courses &amp; Events</div>
            </div>
            <div className="border rounded p-4 text-center">
              <div className="text-2xl font-bold text-purple-700">{users.length}</div>
              <div className="text-xs text-gray-500 mt-1">Registered users</div>
            </div>
          </div>

          {/* Traffic analytics */}
          {analytics ? (
            <div className="border rounded p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Traffic (last 24h)</h2>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  analyticsMode === "zone"
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {analyticsMode === "zone" ? "Zone analytics (full)" : "Workers analytics (basic)"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">{analytics.totals.requests.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Requests</div>
                </div>
                {analyticsMode === "zone" ? (
                  <>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xl font-bold">{analytics.totals.pageViews.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Page views</div>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xl font-bold">{analytics.totals.uniques.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Unique visitors</div>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xl font-bold">{(analytics.totals.bytes / 1024 / 1024).toFixed(1)} MB</div>
                      <div className="text-xs text-gray-500">Bandwidth</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xl font-bold">{(analytics.totals.subrequests || 0).toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Subrequests</div>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xl font-bold">{(analytics.totals.errors || 0).toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Errors</div>
                    </div>
                    <div className="bg-gray-50 rounded p-3 opacity-40">
                      <div className="text-xl font-bold">&mdash;</div>
                      <div className="text-xs text-gray-500">Bandwidth</div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Hourly chart */}
                {analytics.hourly.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">Requests per hour</h3>
                    <div className="flex items-end gap-px h-24 bg-gray-50 rounded p-2">
                      {(() => {
                        const maxReq = Math.max(...analytics.hourly.map((h) => h.requests), 1);
                        return analytics.hourly.map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-blue-400 rounded-t min-h-[2px]"
                            style={{ height: `${(h.requests / maxReq) * 100}%` }}
                            title={`${new Date(h.time).getHours()}:00 \u2014 ${h.requests} requests`}
                          />
                        ));
                      })()}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 px-2">
                      <span>{analytics.hourly.length > 0 ? new Date(analytics.hourly[0].time).getHours() + ":00" : ""}</span>
                      <span>Now</span>
                    </div>
                  </div>
                )}

                {/* Top referrers (zone mode only) */}
                {analyticsMode === "zone" && analytics.referrers.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">Top referrers</h3>
                    <div className="space-y-1">
                      {analytics.referrers.slice(0, 10).map((r, i) => {
                        const maxCount = analytics.referrers[0]?.count || 1;
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <div className="w-24 truncate text-gray-600" title={r.host}>
                              {r.host}
                            </div>
                            <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                              <div
                                className="h-full bg-green-400 rounded"
                                style={{ width: `${(r.count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-500 w-12 text-right">{r.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {analyticsMode === "workers" && (
                  <div className="flex items-center text-xs text-gray-400 p-4">
                    <p>
                      Referrers, page views, and bandwidth require zone-level analytics.
                      Route your Worker through a custom domain and set <code className="bg-gray-100 px-1 rounded">CF_ZONE_ID</code> to upgrade.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : !analyticsConfigured ? (
            <div className="border rounded p-4 text-sm text-gray-500">
              <strong>Traffic analytics:</strong> Set <code className="bg-gray-100 px-1 rounded">CF_API_TOKEN</code> and
              {" "}<code className="bg-gray-100 px-1 rounded">CLOUDFLARE_ACCOUNT_ID</code> for basic Workers analytics,
              or also add <code className="bg-gray-100 px-1 rounded">CF_ZONE_ID</code> for full zone analytics
              (referrers, page views, unique visitors).
            </div>
          ) : null}
        </div>
      )}

      {/* ── Health tab ── */}
      {activeTab === "health" && (
        <div className="border rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {t("admin.healthCheck")}
            </h2>
            <button
              type="button"
              onClick={runHealthCheck}
              className="px-4 py-2 rounded border hover:bg-gray-50 disabled:opacity-50"
              disabled={healthLoading}
              title={t("admin.healthCheckDesc")}
            >
              {healthLoading ? t("admin.running") : t("admin.runCheck")}
            </button>
          </div>
          {healthChecks ? (
            <ul className="space-y-2 text-sm">
              {Object.entries(healthChecks).map(([key, value]) => (
                <li key={key} className="flex items-start gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full mt-1.5 ${
                      value?.ok ? "bg-green-600" : "bg-red-600"
                    }`}
                  />
                  <span>
                    <strong>{key}:</strong>{" "}
                    {value?.message || t("common.noDetails")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">
              {t("admin.healthCheckDesc")}
            </p>
          )}

          {webhookUrl && (
            <div className="bg-gray-50 border rounded p-4 space-y-2 text-sm">
              <h3 className="font-semibold">{t("admin.stripeWebhook")}</h3>
              <p className="text-gray-600">
                {t("admin.stripeWebhookConfigureIn")}{" "}
                <a
                  href="https://dashboard.stripe.com/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 underline"
                >
                  {t("admin.stripeWebhookDashboardLink")}
                </a>
              </p>
              <div className="flex items-center gap-2">
                <label className="text-gray-500 shrink-0">
                  {t("admin.endpointUrl")}:
                </label>
                <code className="bg-white border rounded px-2 py-1 text-xs break-all flex-1 select-all">
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                  }}
                  className="px-2 py-1 rounded border hover:bg-gray-100 text-xs whitespace-nowrap"
                  title={t("common.copy")}
                >
                  {t("common.copy")}
                </button>
              </div>
              <p className="text-gray-500">
                {t("admin.eventsToListen")}:{" "}
                <code className="bg-white border rounded px-1 text-xs">
                  checkout.session.completed
                </code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Unified Products & Access tab ── */}
      {activeTab === "products" && (
        <div className="border rounded p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">
                {t("admin.contentAccess")}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {t("admin.contentAccessDesc")}
              </p>
            </div>
            {process.env.NEXT_PUBLIC_STRIPE_MODE !== "live" && (
              <a
                href="https://dashboard.stripe.com/test/payments"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-purple-700 hover:underline shrink-0"
                title={t("admin.stripePaymentsTooltip")}
              >
                {t("admin.stripePayments")} &rarr;
              </a>
            )}
          </div>

          {/* All products list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                {t("admin.selectContent")}
              </label>
              <button
                type="button"
                onClick={() => handleSelection("__new__")}
                className="text-sm text-purple-700 hover:underline"
              >
                + {t("admin.addProduct")}
              </button>
            </div>

            <div className="space-y-1">
              {/* WooCommerce Products */}
              {wcProducts.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2">WooCommerce</p>
                  {wcProducts.map((product) => {
                    const isActive = selectedCourse === product.uri;
                    const configured = courses[product.uri];
                    const cat = product.productCategories?.edges?.[0]?.node?.name;
                    const imgUrl = product.featuredImage?.node?.sourceUrl;
                    return (
                      <button
                        key={`wc-${product.uri}`}
                        type="button"
                        onClick={() => handleSelection(product.uri)}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-purple-100 border-2 border-purple-400"
                            : "bg-white border-2 border-transparent hover:bg-purple-50 hover:border-purple-200"
                        }`}
                      >
                        {imgUrl ? (
                          <img src={imgUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {product.price ? product.price.replace(/&nbsp;/g, " ") : ""}
                            {cat ? ` · ${cat}` : ""}
                            {product.uri ? ` · ${product.uri}` : ""}
                          </p>
                        </div>
                        {configured && (
                          <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded shrink-0">{t("admin.configuredBadge")}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* LearnPress Courses */}
              {wpCourses.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2">LearnPress</p>
                  {wpCourses.map((course) => {
                    const isActive = selectedCourse === course.uri;
                    const configured = courses[course.uri];
                    return (
                      <button
                        key={`lp-${course.uri}`}
                        type="button"
                        onClick={() => handleSelection(course.uri)}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-purple-100 border-2 border-purple-400"
                            : "bg-white border-2 border-transparent hover:bg-purple-50 hover:border-purple-200"
                        }`}
                      >
                        <div className="w-10 h-10 rounded bg-blue-50 shrink-0 flex items-center justify-center text-blue-400 text-xs font-bold">LP</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{course.title}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {course.priceRendered || ""}
                            {course.duration ? ` · ${course.duration}` : ""}
                            {course.uri ? ` · ${course.uri}` : ""}
                          </p>
                        </div>
                        {configured && (
                          <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded shrink-0">{t("admin.configuredBadge")}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Events */}
              {wpEvents.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2">Events</p>
                  {wpEvents.map((event) => {
                    const isActive = selectedCourse === event.uri;
                    const configured = courses[event.uri];
                    const imgUrl = event.featuredImage?.node?.sourceUrl;
                    return (
                      <button
                        key={`ev-${event.uri}`}
                        type="button"
                        onClick={() => handleSelection(event.uri)}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-purple-100 border-2 border-purple-400"
                            : "bg-white border-2 border-transparent hover:bg-purple-50 hover:border-purple-200"
                        }`}
                      >
                        {imgUrl ? (
                          <img src={imgUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-amber-50 shrink-0 flex items-center justify-center text-amber-400 text-xs font-bold">EV</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          <p className="text-xs text-gray-500 truncate">{event.uri}</p>
                        </div>
                        {configured && (
                          <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded shrink-0">{t("admin.configuredBadge")}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Shop Products */}
              {products.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2">{t("admin.shopProducts")}</p>
                  {products.map((p, i) => {
                    const isActive = selectedCourse === `__shop_${i}`;
                    return (
                      <button
                        key={`shop-${i}`}
                        type="button"
                        onClick={() => handleSelection(`__shop_${i}`)}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-purple-100 border-2 border-purple-400"
                            : "bg-white border-2 border-transparent hover:bg-purple-50 hover:border-purple-200"
                        }`}
                      >
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-amber-50 shrink-0 flex items-center justify-center text-amber-300">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                              <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L2.5 11.06zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {p.name || `${t("admin.product")} ${i + 1}`}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {p.priceCents ? `${toCurrencyUnits(p.priceCents)} ${p.currency || "SEK"}` : "—"}
                            {" · "}
                            {p.type === "course" ? t("admin.courseProduct") : t("admin.digitalFile")}
                            {p.slug ? ` · /${p.slug}` : ""}
                          </p>
                        </div>
                        {p.active === false && (
                          <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded shrink-0">Inactive</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Known course URIs not in WP or shop */}
              {knownCourses.filter(
                (uri) =>
                  !allWpContent.some((item) => item.uri === uri) &&
                  !products.some((p) => p.courseUri === uri || p.slug === uri),
              ).length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2">Other</p>
                  {knownCourses
                    .filter(
                      (uri) =>
                        !allWpContent.some((item) => item.uri === uri) &&
                        !products.some((p) => p.courseUri === uri || p.slug === uri),
                    )
                    .map((courseUri) => {
                      const isActive = selectedCourse === courseUri;
                      return (
                        <button
                          key={courseUri}
                          type="button"
                          onClick={() => handleSelection(courseUri)}
                          className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                            isActive
                              ? "bg-purple-100 border-2 border-purple-400"
                              : "bg-white border-2 border-transparent hover:bg-purple-50 hover:border-purple-200"
                          }`}
                        >
                          <div className="w-10 h-10 rounded bg-gray-100 shrink-0 flex items-center justify-center text-gray-400 text-xs font-bold">URI</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{courseUri}</p>
                          </div>
                        </button>
                      );
                    })}
                </>
              )}

              {/* Manual entry */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSelection("__new__")}
                  className="px-3 py-1.5 rounded border text-sm text-purple-700 hover:bg-purple-50"
                >
                  + {t("admin.addProduct")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCourse("__custom__")}
                  className="px-3 py-1.5 rounded border text-sm text-gray-600 hover:bg-gray-50"
                >
                  {t("admin.manualEntry")}
                </button>
              </div>
              {selectedCourse === "__custom__" && (
                <input
                  type="text"
                  value=""
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  placeholder={t("admin.courseUriInputPlaceholder")}
                  className="w-full border rounded px-3 py-2 text-sm"
                  autoFocus
                />
              )}
            </div>
          </div>

          <div ref={editFormRef} />
          {/* ── WP item info card ── */}
          {isWpSelection &&
            (() => {
              const wpItem = allWpContent.find(
                (item) => item.uri === selectedCourse,
              );
              if (!wpItem) return null;
              const imgUrl = wpItem?.featuredImage?.node?.sourceUrl;
              const desc =
                wpItem?.shortDescription || wpItem?.content || "";
              const wpPrice = (
                wpItem?.price ||
                wpItem?.priceRendered ||
                ""
              ).replace(/&nbsp;/g, " ");
              const sourceLabel =
                wpItem?._source === "woocommerce"
                  ? "WooCommerce"
                  : wpItem?._source === "learnpress"
                    ? "LearnPress"
                    : wpItem?._source === "wordpress"
                      ? "WordPress Event"
                      : "Manual";
              const typeLabel =
                wpItem?._type === "product"
                  ? t("common.product")
                  : wpItem?._type === "course"
                    ? t("common.course")
                    : wpItem?._type === "event"
                      ? t("common.event")
                      : "Content";

              return (
                <div className="border rounded p-4 space-y-4 bg-gray-50">
                  <div className="flex gap-4">
                    <ImageUploader
                      value={imgUrl || ""}
                      onUploaded={(url) => {
                        setWpEvents((prev) =>
                          prev.map((ev) =>
                            ev.uri === selectedCourse
                              ? { ...ev, featuredImage: { node: { sourceUrl: url } } }
                              : ev,
                          ),
                        );
                        setWcProducts((prev) =>
                          prev.map((p) =>
                            p.uri === selectedCourse
                              ? { ...p, featuredImage: { node: { sourceUrl: url } } }
                              : p,
                          ),
                        );
                        setWpCourses((prev) =>
                          prev.map((c) =>
                            c.uri === selectedCourse
                              ? { ...c, featuredImage: { node: { sourceUrl: url } } }
                              : c,
                          ),
                        );
                      }}
                      onError={(msg) => setError(msg)}
                      renderTrigger={(openPicker) => (
                        <button
                          type="button"
                          onClick={openPicker}
                          className="relative w-36 h-36 rounded border shrink-0 overflow-hidden group bg-gray-100"
                          title={t("admin.uploadImage")}
                        >
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
                                <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                            </svg>
                          </div>
                        </button>
                      )}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="text-lg font-semibold truncate">
                        {wpItem?.title || wpItem?.name || selectedCourse}
                      </h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          {sourceLabel}
                        </span>
                        <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                          {typeLabel}
                        </span>
                        {wpPrice && (
                          <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                            WP: {wpPrice}
                          </span>
                        )}
                        {courses[selectedCourse] && (
                          <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                            {t("admin.configuredBadge")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        URI: {selectedCourse}
                      </p>
                    </div>
                  </div>
                  {desc && (
                    <div
                      className="text-sm text-gray-600 max-h-24 overflow-auto prose prose-sm"
                      dangerouslySetInnerHTML={{ __html: desc }}
                    />
                  )}
                </div>
              );
            })()}

          {/* ── Shop product edit form ── */}
          {isShopSelection && selectedShopProduct && (
            <div className="border rounded p-4 space-y-4 bg-amber-50">
              <div className="flex justify-between items-start gap-4">
                <div className="flex items-start gap-4">
                  <ImageUploader
                    value={selectedShopProduct.imageUrl}
                    onUploaded={(url) => updateProduct(shopIndex, "imageUrl", url)}
                    onError={(msg) => setError(msg)}
                    renderTrigger={(openPicker) => (
                      <button
                        type="button"
                        onClick={openPicker}
                        className="relative w-36 h-36 rounded border shrink-0 overflow-hidden group bg-gray-100"
                        title={t("admin.uploadImage")}
                      >
                        {selectedShopProduct.imageUrl ? (
                          <img
                            src={selectedShopProduct.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
                              <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                          </svg>
                        </div>
                      </button>
                    )}
                  />
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">
                      {selectedShopProduct.name ||
                        `${t("admin.product")} ${shopIndex + 1}`}
                    </h3>
                    <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded text-xs">
                      {t("admin.shopProducts")}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeShopProduct(shopIndex)}
                  className="text-red-700 text-sm hover:underline"
                >
                  {t("common.remove")}
                </button>
              </div>

              <p className="text-xs text-gray-500">
                {t("admin.shopProductsDesc")}
              </p>

              <div className="grid md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder={t("admin.namePlaceholder")}
                  value={selectedShopProduct.name}
                  onChange={(e) =>
                    updateProduct(shopIndex, "name", e.target.value)
                  }
                  className="border rounded px-3 py-2"
                />
                <div>
                  <input
                    type="text"
                    placeholder={t("admin.slugPlaceholder")}
                    value={selectedShopProduct.slug}
                    onChange={(e) =>
                      updateProduct(shopIndex, "slug", e.target.value)
                    }
                    className="w-full border rounded px-3 py-2"
                    title={t("admin.slugHint")}
                  />
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t("admin.slugHint")}
                  </p>
                </div>
                <div>
                  <select
                    value={selectedShopProduct.type}
                    onChange={(e) =>
                      updateProduct(shopIndex, "type", e.target.value)
                    }
                    className="w-full border rounded px-3 py-2"
                    title={t("admin.productTypeHint")}
                  >
                    <option value="digital_file">
                      {t("admin.digitalFile")}
                    </option>
                    <option value="course">
                      {t("admin.courseProduct")}
                    </option>
                  </select>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t("admin.productTypeHint")}
                  </p>
                </div>
                <label
                  className="flex items-center gap-2 text-sm"
                  title={t("admin.activeProductHint")}
                >
                  <input
                    type="checkbox"
                    checked={selectedShopProduct.active !== false}
                    onChange={(e) =>
                      updateProduct(shopIndex, "active", e.target.checked)
                    }
                  />
                  {t("admin.activeProduct")}
                  <span className="text-[11px] text-gray-400 font-normal">
                    &mdash; {t("admin.activeProductHint")}
                  </span>
                </label>
              </div>

              <textarea
                rows="3"
                placeholder={t("admin.descriptionPlaceholder")}
                value={selectedShopProduct.description}
                onChange={(e) =>
                  updateProduct(shopIndex, "description", e.target.value)
                }
                className="w-full border rounded px-3 py-2"
              />

              {selectedShopProduct.type === "digital_file" ? (
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t("admin.fileUrlPlaceholder")}
                      value={selectedShopProduct.fileUrl}
                      onChange={(e) =>
                        updateProduct(shopIndex, "fileUrl", e.target.value)
                      }
                      className="flex-1 border rounded px-3 py-2"
                      title={t("admin.fileUrlHint")}
                    />
                    <button
                      type="button"
                      onClick={() => uploadFile(shopIndex, "fileUrl")}
                      className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
                      title={t("admin.uploadSizeHint")}
                    >
                      {t("admin.uploadFile")}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t("admin.fileUrlHint")}
                  </p>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    placeholder={t("admin.courseUriPlaceholder")}
                    value={selectedShopProduct.courseUri}
                    onChange={(e) =>
                      updateProduct(shopIndex, "courseUri", e.target.value)
                    }
                    className="w-full border rounded px-3 py-2"
                    title={t("admin.courseUriHint")}
                  />
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t("admin.courseUriHint")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Price & access config (shown for all selected items) ── */}
          {showDetail && (
            <>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">
                    {t("admin.courseFee")}
                  </label>
                  <p className="text-xs text-gray-400">
                    {t("admin.feeHint")}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      required
                      placeholder="0.00"
                      className="w-full border rounded px-3 py-2"
                      title={t("admin.feeHint")}
                    />
                    <input
                      type="text"
                      value={currency}
                      onChange={(e) =>
                        setCurrency(e.target.value.toUpperCase())
                      }
                      className="w-24 border rounded px-3 py-2"
                      maxLength={5}
                      title={t("admin.currencyHint")}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {t("admin.priceSavedLocally")}
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">
                    {t("admin.allowedUsers")}
                  </label>
                  <p className="text-xs text-gray-400">
                    {t("admin.allowedUsersHint")}
                  </p>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users..."
                    className="w-full border rounded px-3 py-1.5 text-sm mb-1"
                  />
                  <div className="border rounded p-3 max-h-56 overflow-auto space-y-2 bg-white">
                    {users.length === 0 && allowedUsers.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {t("admin.noUsersFound")}
                      </p>
                    ) : (
                      <>
                        {filteredUsers.map((user) => (
                          <label
                            key={user.email}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={allowedUsers.includes(user.email)}
                              onChange={() => toggleUser(user.email)}
                            />
                            <span>
                              {user.name} ({user.email})
                            </span>
                          </label>
                        ))}
                        {allowedUsers
                          .filter(
                            (email) =>
                              !users.some((u) => u.email === email),
                          )
                          .map((email) => (
                            <label
                              key={email}
                              className="flex items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={true}
                                onChange={() => toggleUser(email)}
                              />
                              <span>{email}</span>
                            </label>
                          ))}
                      </>
                    )}
                  </div>
                  <div>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          (e.preventDefault(), addManualEmail())
                        }
                        placeholder={t("admin.addEmailPlaceholder")}
                        className="w-full border rounded px-3 py-2 text-sm"
                        title={t("admin.addEmailHint")}
                      />
                      <button
                        type="button"
                        onClick={addManualEmail}
                        className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
                      >
                        {t("common.add")}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {t("admin.addEmailHint")}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={saveUnified}
                className="px-6 py-2 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? t("admin.saving") : t("admin.saveCourseAccess")}
              </button>
            </>
          )}
          {/* User management — reverse access view */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">{t("admin.userAccessOverview")}</h3>
            <p className="text-xs text-gray-500">
              {t("admin.userAccessOverviewDesc")}
            </p>
            <UserAccessPanel users={users} courses={courses} allWpContent={allWpContent} products={products} />
          </div>
        </div>
      )}

      {/* ── Advanced tab ── */}
      {activeTab === "advanced" && (
        <div className="border rounded p-5 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t("admin.advancedSettings")}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={purgeCache}
                disabled={purging}
                className="px-3 py-1.5 rounded border hover:bg-gray-50 text-sm disabled:opacity-50"
                title={t("admin.purgeCacheTooltip")}
              >
                {purging ? t("admin.purgingCache") : t("admin.purgeCache")}
              </button>
              <button
                type="button"
                onClick={triggerDeploy}
                disabled={deploying}
                className="px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-gray-700 text-sm disabled:opacity-50"
                title={t("admin.deployTooltip")}
              >
                {deploying ? t("admin.deploying") : t("admin.deploy")}
              </button>
            </div>
          </div>
          {purgeMessage && (
            <p className="text-green-700 text-sm">{purgeMessage}</p>
          )}
          {deployMessage && (
            <p className="text-green-700 text-sm">{deployMessage}</p>
          )}

          {/* Storage configuration */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">{t("admin.storageBackend")}</h3>
            <p className="text-xs text-gray-500">
              Controls where course access rules, pricing, and user permissions are stored.
              Set the <code className="bg-gray-100 px-1 rounded">COURSE_ACCESS_BACKEND</code> environment variable to change.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  id: "cloudflare-kv",
                  name: "Cloudflare KV",
                  desc: "Fast, edge-distributed key-value store. Best for production on Cloudflare Workers. Requires CLOUDFLARE_ACCOUNT_ID, CF_API_TOKEN, and CF_KV_NAMESPACE_ID.",
                  active: storage?.provider === "cloudflare-kv",
                },
                {
                  id: "wordpress-graphql-user-meta",
                  name: "WordPress GraphQL",
                  desc: "Stores access data in WordPress user meta via WPGraphQL mutations. Requires a custom WordPress plugin and COURSE_ACCESS_BACKEND=wordpress.",
                  active: storage?.provider === "wordpress-graphql-user-meta",
                },
                {
                  id: "local-file",
                  name: "Local file",
                  desc: "Stores data in .data/course-access.json on the server filesystem. Suitable for local development only \u2014 data is lost on redeploy.",
                  active: storage?.provider === "local-file",
                },
              ].map((opt) => (
                <div
                  key={opt.id}
                  className={`border-2 rounded p-4 space-y-2 ${
                    opt.active
                      ? "border-green-400 bg-green-50"
                      : "border-gray-200 bg-white opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${opt.active ? "bg-green-600" : "bg-gray-300"}`} />
                    <span className="font-medium text-sm">{opt.name}</span>
                  </div>
                  <p className="text-xs text-gray-500">{opt.desc}</p>
                  {opt.active && (
                    <span className="inline-block text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">
                      Active
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Environment info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">{t("admin.environment")}</h3>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <div className="font-medium text-gray-700">WordPress</div>
                <div className="text-gray-500 break-all">
                  {process.env.NEXT_PUBLIC_WORDPRESS_URL || "Not configured"}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <div className="font-medium text-gray-700">Stripe mode</div>
                <div className="text-gray-500">
                  {process.env.NEXT_PUBLIC_STRIPE_MODE === "live" ? "Live" : "Test"}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <div className="font-medium text-gray-700">File uploads</div>
                <div className="text-gray-500">
                  {storage?.provider === "cloudflare-kv" || process.env.S3_BUCKET_NAME
                    ? "Cloudflare R2 (S3-compatible)"
                    : "WordPress Media Library"}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <div className="font-medium text-gray-700">Email delivery</div>
                <div className="text-gray-500">
                  {resendConfigured
                    ? "Resend API"
                    : "Not configured"}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3 space-y-1">
                <div className="font-medium text-gray-700">Analytics</div>
                <div className="text-gray-500">
                  {analyticsMode === "zone" ? (
                    <span className="text-green-700">Zone analytics (full) &mdash; CF_ZONE_ID set</span>
                  ) : analyticsMode === "workers" ? (
                    <span className="text-amber-700">Workers analytics (basic) &mdash; no CF_ZONE_ID</span>
                  ) : (
                    <span>Not configured &mdash; set CF_API_TOKEN</span>
                  )}
                </div>
                {analyticsMode === "workers" && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Add a custom domain (e.g. xtas.nu) to Cloudflare, route your Worker through it,
                    and set CF_ZONE_ID to unlock referrers, page views, unique visitors, and bandwidth.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Recent commits */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">{t("admin.recentCommits")}</h3>
            {commitsError && (
              <p className="text-xs text-gray-400">{commitsError}</p>
            )}
            {commits ? (
              <div className="bg-gray-900 text-gray-100 rounded p-4 font-mono text-xs max-h-96 overflow-auto space-y-0.5">
                {commits.map((c) => (
                  <div key={c.sha} className="flex gap-2">
                    <span className="text-yellow-400 shrink-0">{c.sha}</span>
                    <span className="truncate">{c.message}</span>
                  </div>
                ))}
              </div>
            ) : !commitsError ? (
              <p className="text-xs text-gray-400">{t("admin.commitsLoading")}</p>
            ) : null}
          </div>
        </div>
      )}

      {uploadProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Uploading part {uploadProgress.currentPart} / {uploadProgress.totalParts}</span>
            <span>{uploadProgress.percent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}
      {message ? <p className="text-green-700">{message}</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}
    </section>
  );
}
