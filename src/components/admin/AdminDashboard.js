"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t } from "@/lib/i18n";

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
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsMessage, setProductsMessage] = useState("");
  const [activeTab, setActiveTab] = useState("health");
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState("");

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

  useEffect(() => {
    if (!selectedCourse) return;
    const config = courses[selectedCourse];
    if (config) {
      setPrice(toCurrencyUnits(config.priceCents ?? 0));
      setCurrency((config.currency || "SEK").toUpperCase());
      setAllowedUsers(Array.isArray(config.allowedUsers) ? config.allowedUsers : []);
      return;
    }
    // Auto-fill price from WordPress content if no existing config
    const match = allWpContent.find((item) => item.uri === selectedCourse);
    const rawPrice = match?.price || match?.priceRendered || "";
    if (rawPrice) {
      const numericPrice = parseFloat(String(rawPrice).replace(/[^\d.,]/g, "").replace(",", "."));
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
  }, [selectedCourse, courses, allWpContent]);

  const knownCourses = useMemo(
    () => Object.keys(courses).sort((a, b) => a.localeCompare(b)),
    [courses],
  );

  function toggleUser(email) {
    setAllowedUsers((prev) =>
      prev.includes(email) ? prev.filter((value) => value !== email) : [...prev, email],
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
          const nextSlug = product.slugEdited ? product.slug : slugify(nextName);
          return { ...product, name: nextName, slug: nextSlug };
        }
        if (key === "slug") {
          return { ...product, slug: slugify(value), slugEdited: true };
        }
        return { ...product, [key]: value };
      }),
    );
  }

  function addProductRow() {
    setProducts((prev) => [...prev, emptyProduct()]);
  }

  function removeProductRow(index) {
    setProducts((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function saveProducts() {
    setProductsLoading(true);
    setProductsMessage("");
    setError("");

    const payload = products.map((product) => ({
      name: product.name,
      slug: product.slug,
      type: product.type === "course" ? "course" : "digital_file",
      description: product.description,
      imageUrl: product.imageUrl,
      priceCents: Number.isFinite(product.priceCents)
        ? product.priceCents
        : Number.parseInt(String(product.priceCents || "0"), 10) || 0,
      currency: (product.currency || "SEK").toUpperCase(),
      fileUrl: product.fileUrl,
      courseUri: product.courseUri,
      active: product.active !== false,
    }));

    try {
      const response = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: payload }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || t("admin.saveProductsFailed"));
      }
      const rows = Array.isArray(json.products) ? json.products : [];
      setProducts(rows.map((product) => ({ ...emptyProduct(), ...product, slugEdited: true })));
      setProductsMessage(t("admin.productsSaved"));
    } catch (saveError) {
      setError(saveError.message || t("admin.saveProductsFailed"));
    } finally {
      setProductsLoading(false);
    }
  }

  async function saveCourse() {
    if (!selectedCourse) {
      setError(t("admin.enterCourseUri"));
      return;
    }
    if (price === "" || price === null || price === undefined) {
      setError(t("admin.enterPrice"));
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);
    const response = await fetch("/api/admin/course-access", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseUri: selectedCourse,
        allowedUsers,
        priceCents: toCents(price),
        currency,
      }),
    });
    const json = await response.json();
    setLoading(false);
    if (!response.ok || !json?.ok) {
      setError(json?.error || t("admin.saveFailed"));
      return;
    }
    setCourses(json.courses || {});
    setMessage(t("admin.courseAccessUpdated"));
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
        healthError instanceof Error ? healthError.message : t("admin.healthCheckFailed");
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
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("admin.purgeFailed"));
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
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("admin.deployFailed"));
      setDeployMessage(t("admin.deployTriggered"));
    } catch (err) {
      setError(err.message || t("admin.deployFailed"));
    } finally {
      setDeploying(false);
    }
  }

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
          <h2 className="text-lg font-semibold">{t("admin.architecture")}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={purgeCache}
              disabled={purging}
              className="px-3 py-1.5 rounded border hover:bg-gray-50 text-sm disabled:opacity-50"
            >
              {purging ? t("admin.purgingCache") : t("admin.purgeCache")}
            </button>
            <button
              type="button"
              onClick={triggerDeploy}
              disabled={deploying}
              className="px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-gray-700 text-sm disabled:opacity-50"
            >
              {deploying ? t("admin.deploying") : t("admin.deploy")}
            </button>
          </div>
        </div>
        {purgeMessage && <p className="text-green-700 text-sm">{purgeMessage}</p>}
        {deployMessage && <p className="text-green-700 text-sm">{deployMessage}</p>}

        {/* Simple architecture diagram */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 text-xs text-center">
          <div className="border-2 border-blue-300 bg-blue-50 rounded-lg px-4 py-3 w-36">
            <div className="font-bold text-blue-800">WordPress</div>
            <div className="text-gray-500 mt-1">WPGraphQL</div>
            <div className="text-gray-400">CMS + Media</div>
          </div>
          <div className="text-gray-400 text-lg md:rotate-0 rotate-90">&rarr;</div>
          <div className="border-2 border-green-300 bg-green-50 rounded-lg px-4 py-3 w-36">
            <div className="font-bold text-green-800">Next.js</div>
            <div className="text-gray-500 mt-1">OpenNext</div>
            <div className="text-gray-400">{t("admin.cacheTime")}</div>
          </div>
          <div className="text-gray-400 text-lg md:rotate-0 rotate-90">&rarr;</div>
          <div className="border-2 border-orange-300 bg-orange-50 rounded-lg px-4 py-3 w-36">
            <div className="font-bold text-orange-800">Cloudflare</div>
            <div className="text-gray-500 mt-1">Workers + KV</div>
            <div className="text-gray-400">Edge CDN</div>
          </div>
          <div className="text-gray-400 text-lg md:rotate-0 rotate-90">&rarr;</div>
          <div className="border-2 border-purple-300 bg-purple-50 rounded-lg px-4 py-3 w-36">
            <div className="font-bold text-purple-800">Stripe</div>
            <div className="text-gray-500 mt-1">Payments</div>
            <div className="text-gray-400">Webhooks</div>
          </div>
        </div>
      </div>

      <div className="flex border-b">
        {[
          { id: "health", label: t("admin.healthCheck") },
          { id: "products", label: t("admin.shopProducts") },
          { id: "access", label: t("admin.contentAccess") },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
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

      {activeTab === "health" && (
      <div className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t("admin.healthCheck")}</h2>
          <button
            type="button"
            onClick={runHealthCheck}
            className="px-4 py-2 rounded border hover:bg-gray-50 disabled:opacity-50"
            disabled={healthLoading}
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
                  <strong>{key}:</strong> {value?.message || t("common.noDetails")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">{t("admin.runCheckHint")}</p>
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
              <label className="text-gray-500 shrink-0">{t("admin.endpointUrl")}:</label>
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
              {t("admin.eventsToListen")}: <code className="bg-white border rounded px-1 text-xs">checkout.session.completed</code>
            </p>
          </div>
        )}
      </div>
      )}

      {activeTab === "products" && (
      <div className="border rounded p-5 space-y-4">
        <h2 className="text-2xl font-semibold">{t("admin.shopProducts")}</h2>
        <p className="text-sm text-gray-600">{t("admin.shopProductsHint")}</p>

        <div className="space-y-6">
          {products.map((product, index) => (
            <div key={index} className="border rounded p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">{t("admin.product")} {index + 1}</h3>
                <button
                  type="button"
                  onClick={() => removeProductRow(index)}
                  className="text-red-700 text-sm hover:underline"
                >
                  {t("common.remove")}
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder={t("admin.namePlaceholder")}
                  value={product.name}
                  onChange={(event) => updateProduct(index, "name", event.target.value)}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="text"
                  placeholder={t("admin.slugPlaceholder")}
                  value={product.slug}
                  onChange={(event) => updateProduct(index, "slug", event.target.value)}
                  className="border rounded px-3 py-2"
                />
                <select
                  value={product.type}
                  onChange={(event) => updateProduct(index, "type", event.target.value)}
                  className="border rounded px-3 py-2"
                >
                  <option value="digital_file">{t("admin.digitalFile")}</option>
                  <option value="course">{t("admin.courseProduct")}</option>
                </select>
                <input
                  type="text"
                  placeholder={t("admin.currencyPlaceholder")}
                  value={product.currency}
                  onChange={(event) => updateProduct(index, "currency", event.target.value.toUpperCase())}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="number"
                  min="0"
                  required
                  placeholder={t("admin.priceCentsPlaceholder")}
                  value={product.priceCents}
                  onChange={(event) =>
                    updateProduct(index, "priceCents", Number.parseInt(event.target.value || "0", 10) || 0)
                  }
                  className="border rounded px-3 py-2"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={product.active !== false}
                    onChange={(event) => updateProduct(index, "active", event.target.checked)}
                  />
                  {t("admin.activeProduct")}
                </label>
              </div>

              <textarea
                rows="3"
                placeholder={t("admin.descriptionPlaceholder")}
                value={product.description}
                onChange={(event) => updateProduct(index, "description", event.target.value)}
                className="w-full border rounded px-3 py-2"
              />

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t("admin.imageUrlPlaceholder")}
                  value={product.imageUrl}
                  onChange={(event) => updateProduct(index, "imageUrl", event.target.value)}
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => uploadFile(index, "imageUrl")}
                  className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
                  title={t("admin.uploadSizeHint")}
                >
                  {t("admin.uploadImage")}
                </button>
              </div>
              {product.imageUrl && (
                <img src={product.imageUrl} alt="" className="h-16 w-auto rounded border object-cover" />
              )}

              {product.type === "digital_file" ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t("admin.fileUrlPlaceholder")}
                    value={product.fileUrl}
                    onChange={(event) => updateProduct(index, "fileUrl", event.target.value)}
                    className="flex-1 border rounded px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={() => uploadFile(index, "fileUrl")}
                    className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
                    title={t("admin.uploadSizeHint")}
                  >
                    {t("admin.uploadFile")}
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder={t("admin.courseUriPlaceholder")}
                  value={product.courseUri}
                  onChange={(event) => updateProduct(index, "courseUri", event.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={addProductRow}
            className="px-4 py-2 rounded border hover:bg-gray-50"
          >
            {t("admin.addProduct")}
          </button>
          <button
            type="button"
            onClick={saveProducts}
            className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
            disabled={productsLoading}
          >
            {productsLoading ? t("admin.saving") : t("admin.saveProducts")}
          </button>
        </div>
        {productsMessage ? <p className="text-green-700 text-sm">{productsMessage}</p> : null}
      </div>
      )}

      {activeTab === "access" && (
      <div className="border rounded p-5 space-y-4">
        <h2 className="text-2xl font-semibold">{t("admin.contentAccess")}</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="text-sm text-gray-700">{t("admin.selectCourse")}</label>
            {allWpContent.length > 0 ? (
              <select
                className="w-full border rounded px-3 py-2"
                value={selectedCourse}
                onChange={(event) => setSelectedCourse(event.target.value)}
              >
                <option value="">{t("admin.selectContentDefault")}</option>
                {wcProducts.length > 0 && (
                  <optgroup label="WooCommerce Products">
                    {wcProducts.map((product) => {
                      const cat = product.productCategories?.edges?.[0]?.node?.name;
                      const configured = courses[product.uri];
                      return (
                        <option key={`wc-${product.uri}`} value={product.uri}>
                          {product.name}
                          {product.price ? ` (${product.price.replace(/&nbsp;/g, " ")})` : ""}
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
                          {course.priceRendered ? ` (${course.priceRendered})` : ""}
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
                {knownCourses
                  .filter((uri) => !allWpContent.some((item) => item.uri === uri))
                  .map((courseUri) => (
                    <option key={courseUri} value={courseUri}>
                      {courseUri}
                    </option>
                  ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  value={selectedCourse}
                  onChange={(event) => setSelectedCourse(event.target.value)}
                  placeholder={t("admin.courseUriInputPlaceholder")}
                  className="w-full border rounded px-3 py-2"
                />
                {knownCourses.length > 0 ? (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={selectedCourse}
                    onChange={(event) => setSelectedCourse(event.target.value)}
                  >
                    <option value="">{t("admin.selectExistingCourse")}</option>
                    {knownCourses.map((courseUri) => (
                      <option key={courseUri} value={courseUri}>
                        {courseUri}
                      </option>
                    ))}
                  </select>
                ) : null}
              </>
            )}

            <label className="text-sm text-gray-700">{t("admin.courseFee")}</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                min="0"
                step="0.01"
                required
                placeholder="0.00"
                className="w-full border rounded px-3 py-2"
              />
              <input
                type="text"
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                className="w-24 border rounded px-3 py-2"
                maxLength={5}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm text-gray-700">{t("admin.allowedUsers")}</label>
            <div className="border rounded p-3 max-h-72 overflow-auto space-y-2">
              {users.length === 0 && allowedUsers.length === 0 ? (
                <p className="text-sm text-gray-500">{t("admin.noUsersFound")}</p>
              ) : (
                <>
                  {users.map((user) => (
                    <label key={user.email} className="flex items-center gap-2 text-sm">
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
                    .filter((email) => !users.some((u) => u.email === email))
                    .map((email) => (
                      <label key={email} className="flex items-center gap-2 text-sm">
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
            <div className="flex gap-2">
              <input
                type="email"
                value={manualEmail}
                onChange={(event) => setManualEmail(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addManualEmail())}
                placeholder={t("admin.addEmailPlaceholder")}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addManualEmail}
                className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
              >
                {t("common.add")}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={saveCourse}
          className="px-6 py-2 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? t("admin.saving") : t("admin.saveCourseAccess")}
        </button>
      </div>
      )}

      {message ? <p className="text-green-700">{message}</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}
    </section>
  );
}
