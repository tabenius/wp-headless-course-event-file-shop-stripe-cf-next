"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t } from "@/lib/i18n";
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

export default function AdminDashboard() {
  const router = useRouter();
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
  const [activeTab, setActiveTab] = useState("health");
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState("");

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

  async function logoutAdmin() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  async function uploadFile(index, field) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = field === "imageUrl" ? "image/*" : "*/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      try {
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
      } catch {
        setError(t("admin.uploadFailed"));
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
    <section className="max-w-6xl mx-auto px-6 py-16 space-y-10">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t("admin.title")}</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/docs"
            className="px-4 py-2 rounded border hover:bg-gray-50 text-sm"
          >
            {t("admin.documentation")}
          </Link>
          <button
            type="button"
            onClick={logoutAdmin}
            className="px-4 py-2 rounded border hover:bg-gray-50"
          >
            {t("admin.signOut")}
          </button>
        </div>
      </div>

      {storage ? (
        <p className="text-sm text-gray-600">
          {t("admin.storage")}: <strong>{storage.provider}</strong>
        </p>
      ) : null}

      {/* Architecture overview */}
      <div className="border rounded p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("admin.architecture")}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("admin.architectureHint")}
            </p>
          </div>
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

        <div className="flex flex-col md:flex-row items-center justify-center gap-3 text-xs text-center">
          <div className="border-2 border-blue-300 bg-blue-50 rounded-lg px-4 py-3 w-36">
            <div className="font-bold text-blue-800">WordPress</div>
            <div className="text-gray-500 mt-1">WPGraphQL</div>
            <div className="text-gray-400">CMS + Media</div>
          </div>
          <div className="text-gray-400 text-lg md:rotate-0 rotate-90">
            &rarr;
          </div>
          <div className="border-2 border-green-300 bg-green-50 rounded-lg px-4 py-3 w-36">
            <div className="font-bold text-green-800">Next.js</div>
            <div className="text-gray-500 mt-1">OpenNext</div>
            <div className="text-gray-400">{t("admin.cacheTime")}</div>
          </div>
          <div className="text-gray-400 text-lg md:rotate-0 rotate-90">
            &rarr;
          </div>
          <div className="border-2 border-orange-300 bg-orange-50 rounded-lg px-4 py-3 w-36">
            <div className="font-bold text-orange-800">Cloudflare</div>
            <div className="text-gray-500 mt-1">Workers + KV</div>
            <div className="text-gray-400">Edge CDN</div>
          </div>
          <div className="text-gray-400 text-lg md:rotate-0 rotate-90">
            &rarr;
          </div>
          <div className="border-2 border-purple-300 bg-purple-50 rounded-lg px-4 py-3 w-36">
            <div className="font-bold text-purple-800">Stripe</div>
            <div className="text-gray-500 mt-1">Payments</div>
            <div className="text-gray-400">Webhooks</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b">
          {[
            {
              id: "health",
              label: t("admin.healthCheck"),
              desc: t("admin.healthTabDesc"),
            },
            {
              id: "products",
              label: t("admin.contentAccess"),
              desc: t("admin.contentAccessTabDesc"),
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.desc}
              className={`px-5 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-gray-800 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2 px-1">
          {activeTab === "health" && t("admin.healthTabDesc")}
          {activeTab === "products" && t("admin.contentAccessTabDesc")}
        </p>
      </div>

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

          {/* Unified content selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              {t("admin.selectContent")}
            </label>
            <p className="text-xs text-gray-400">
              {t("admin.selectContentHint")}
            </p>
            <select
              className="w-full border rounded px-3 py-2"
              value={selectedCourse}
              onChange={(e) => handleSelection(e.target.value)}
            >
              <option value="">{t("admin.selectContentDefault")}</option>

              {wcProducts.length > 0 && (
                <optgroup label="WooCommerce Products">
                  {wcProducts.map((product) => {
                    const cat =
                      product.productCategories?.edges?.[0]?.node?.name;
                    const configured = courses[product.uri];
                    return (
                      <option key={`wc-${product.uri}`} value={product.uri}>
                        {product.name}
                        {product.price
                          ? ` (${product.price.replace(/&nbsp;/g, " ")})`
                          : ""}
                        {cat ? ` — ${cat}` : ""}
                        {configured ? " ✓" : ""}
                      </option>
                    );
                  })}
                </optgroup>
              )}

              {wpCourses.length > 0 && (
                <optgroup label="LearnPress Courses">
                  {wpCourses.map((course) => {
                    const configured = courses[course.uri];
                    return (
                      <option key={`lp-${course.uri}`} value={course.uri}>
                        {course.title}
                        {course.priceRendered
                          ? ` (${course.priceRendered})`
                          : ""}
                        {course.duration ? ` — ${course.duration}` : ""}
                        {configured ? " ✓" : ""}
                      </option>
                    );
                  })}
                </optgroup>
              )}

              {wpEvents.length > 0 && (
                <optgroup label="Events">
                  {wpEvents.map((event) => {
                    const configured = courses[event.uri];
                    return (
                      <option key={`ev-${event.uri}`} value={event.uri}>
                        {event.title}
                        {configured ? " ✓" : ""}
                      </option>
                    );
                  })}
                </optgroup>
              )}

              {products.length > 0 && (
                <optgroup label={t("admin.shopProducts")}>
                  {products.map((p, i) => (
                    <option key={`shop-${i}`} value={`__shop_${i}`}>
                      {p.name || `${t("admin.product")} ${i + 1}`}
                      {p.priceCents
                        ? ` (${toCurrencyUnits(p.priceCents)} ${p.currency || "SEK"})`
                        : ""}
                      {p.type === "course" ? ` — ${t("admin.courseProduct")}` : ` — ${t("admin.digitalFile")}`}
                    </option>
                  ))}
                </optgroup>
              )}

              {knownCourses
                .filter(
                  (uri) =>
                    !allWpContent.some((item) => item.uri === uri) &&
                    !products.some(
                      (p) => p.courseUri === uri || p.slug === uri,
                    ),
                )
                .map((courseUri) => (
                  <option key={courseUri} value={courseUri}>
                    {courseUri}
                  </option>
                ))}

              <option value="__new__">+ {t("admin.addProduct")}</option>
              <option value="__custom__">{t("admin.manualEntry")}</option>
            </select>

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
                    {imgUrl && (
                      <img
                        src={imgUrl}
                        alt=""
                        className="w-24 h-24 object-cover rounded border shrink-0"
                      />
                    )}
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
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">
                    {selectedShopProduct.name ||
                      `${t("admin.product")} ${shopIndex + 1}`}
                  </h3>
                  <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded text-xs">
                    {t("admin.shopProducts")}
                  </span>
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
                    — {t("admin.activeProductHint")}
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

              <ImageUploader
                value={selectedShopProduct.imageUrl}
                onUploaded={(url) => updateProduct(shopIndex, "imageUrl", url)}
                onError={(msg) => setError(msg)}
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
                  <div className="border rounded p-3 max-h-56 overflow-auto space-y-2 bg-white">
                    {users.length === 0 && allowedUsers.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {t("admin.noUsersFound")}
                      </p>
                    ) : (
                      <>
                        {users.map((user) => (
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
        </div>
      )}

      {message ? <p className="text-green-700">{message}</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}
    </section>
  );
}
