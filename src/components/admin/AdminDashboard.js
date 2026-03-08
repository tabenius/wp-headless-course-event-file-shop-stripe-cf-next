"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  const [healthLoading, setHealthLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsMessage, setProductsMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/course-access")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok)
          throw new Error(json?.error || "Du behöver logga in som administratör.");
        setCourses(json.courses || {});
        setUsers(Array.isArray(json.users) ? json.users : []);
        setWpCourses(Array.isArray(json.wpCourses) ? json.wpCourses : []);
        setStorage(json.storage || null);
      })
      .catch((fetchError) => {
        setError(fetchError.message || "Det gick inte att hämta admin-data.");
      });

    fetch("/api/admin/products")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok)
          throw new Error(json?.error || "Kunde inte hämta produkter.");
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
        setError(fetchError.message || "Det gick inte att hämta produktlistan.");
      });
  }, []);

  useEffect(() => {
    if (!selectedCourse) return;
    const config = courses[selectedCourse];
    if (!config) {
      setPrice("");
      setCurrency("SEK");
      setAllowedUsers([]);
      return;
    }
    setPrice(toCurrencyUnits(config.priceCents ?? 0));
    setCurrency((config.currency || "SEK").toUpperCase());
    setAllowedUsers(Array.isArray(config.allowedUsers) ? config.allowedUsers : []);
  }, [selectedCourse, courses]);

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
        throw new Error(json?.error || "Det gick inte att spara produkter.");
      }
      const rows = Array.isArray(json.products) ? json.products : [];
      setProducts(rows.map((product) => ({ ...emptyProduct(), ...product, slugEdited: true })));
      setProductsMessage("Produktlistan sparades.");
    } catch (saveError) {
      setError(saveError.message || "Det gick inte att spara produkter.");
    } finally {
      setProductsLoading(false);
    }
  }

  async function saveCourse() {
    if (!selectedCourse) {
      setError("Ange en kurs-URI.");
      return;
    }
    if (price === "" || price === null || price === undefined) {
      setError("Ange ett pris (kan vara 0).");
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
      setError(json?.error || "Det gick inte att spara.");
      return;
    }
    setCourses(json.courses || {});
    setMessage("Kursåtkomst uppdaterad.");
  }

  async function logoutAdmin() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  async function runHealthCheck() {
    setHealthLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/health");
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Hälsokontrollen misslyckades.");
      }
      setHealthChecks(json.checks || {});
    } catch (healthError) {
      const msg =
        healthError instanceof Error ? healthError.message : "Hälsokontrollen misslyckades.";
      setError(msg);
    } finally {
      setHealthLoading(false);
    }
  }

  return (
    <section className="max-w-6xl mx-auto px-6 py-16 space-y-10">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Admin</h1>
        <button
          type="button"
          onClick={logoutAdmin}
          className="px-4 py-2 rounded border hover:bg-gray-50"
        >
          Logga ut
        </button>
      </div>

      {storage ? (
        <p className="text-sm text-gray-600">
          Lagring: <strong>{storage.provider}</strong>
        </p>
      ) : null}

      <div className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Integrationskontroll</h2>
          <button
            type="button"
            onClick={runHealthCheck}
            className="px-4 py-2 rounded border hover:bg-gray-50 disabled:opacity-50"
            disabled={healthLoading}
          >
            {healthLoading ? "Kör..." : "Kör kontroll"}
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
                  <strong>{key}:</strong> {value?.message || "Inga detaljer"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Kör kontroll för att verifiera integrationer.</p>
        )}
      </div>

      <div className="border rounded p-5 space-y-4">
        <h2 className="text-2xl font-semibold">Shop-produkter</h2>
        <p className="text-sm text-gray-600">Hantera filer och kursprodukter för /shop.</p>

        <div className="space-y-6">
          {products.map((product, index) => (
            <div key={`${product.slug || "row"}-${index}`} className="border rounded p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Produkt {index + 1}</h3>
                <button
                  type="button"
                  onClick={() => removeProductRow(index)}
                  className="text-red-700 text-sm hover:underline"
                >
                  Ta bort
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Namn"
                  value={product.name}
                  onChange={(event) => updateProduct(index, "name", event.target.value)}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="text"
                  placeholder="Slug"
                  value={product.slug}
                  onChange={(event) => updateProduct(index, "slug", event.target.value)}
                  className="border rounded px-3 py-2"
                />
                <select
                  value={product.type}
                  onChange={(event) => updateProduct(index, "type", event.target.value)}
                  className="border rounded px-3 py-2"
                >
                  <option value="digital_file">Digital fil</option>
                  <option value="course">Kursprodukt</option>
                </select>
                <input
                  type="text"
                  placeholder="Valuta (t.ex. sek)"
                  value={product.currency}
                  onChange={(event) => updateProduct(index, "currency", event.target.value.toUpperCase())}
                  className="border rounded px-3 py-2"
                />
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="Pris i ören (obligatoriskt)"
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
                  Aktiv produkt
                </label>
              </div>

              <textarea
                rows="3"
                placeholder="Beskrivning"
                value={product.description}
                onChange={(event) => updateProduct(index, "description", event.target.value)}
                className="w-full border rounded px-3 py-2"
              />

              <input
                type="text"
                placeholder="Bild-URL (https://...)"
                value={product.imageUrl}
                onChange={(event) => updateProduct(index, "imageUrl", event.target.value)}
                className="w-full border rounded px-3 py-2"
              />

              {product.type === "digital_file" ? (
                <input
                  type="text"
                  placeholder="Fil-URL (https://...)"
                  value={product.fileUrl}
                  onChange={(event) => updateProduct(index, "fileUrl", event.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              ) : (
                <input
                  type="text"
                  placeholder="Kurs-URI (/courses/min-kurs)"
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
            Lägg till produkt
          </button>
          <button
            type="button"
            onClick={saveProducts}
            className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
            disabled={productsLoading}
          >
            {productsLoading ? "Sparar..." : "Spara produkter"}
          </button>
        </div>
        {productsMessage ? <p className="text-green-700 text-sm">{productsMessage}</p> : null}
      </div>

      <div className="border rounded p-5 space-y-4">
        <h2 className="text-2xl font-semibold">Kursåtkomst</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="text-sm text-gray-700">Välj kurs</label>
            {wpCourses.length > 0 ? (
              <select
                className="w-full border rounded px-3 py-2"
                value={selectedCourse}
                onChange={(event) => setSelectedCourse(event.target.value)}
              >
                <option value="">-- Välj en kurs --</option>
                {wpCourses.map((course) => (
                  <option key={course.uri} value={course.uri}>
                    {course.title}
                    {course.priceRendered ? ` (${course.priceRendered})` : ""}
                    {course.duration ? ` — ${course.duration}` : ""}
                  </option>
                ))}
                {knownCourses
                  .filter((uri) => !wpCourses.some((c) => c.uri === uri))
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
                  placeholder="/courses/my-course"
                  className="w-full border rounded px-3 py-2"
                />
                {knownCourses.length > 0 ? (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={selectedCourse}
                    onChange={(event) => setSelectedCourse(event.target.value)}
                  >
                    <option value="">Välj befintlig kurs</option>
                    {knownCourses.map((courseUri) => (
                      <option key={courseUri} value={courseUri}>
                        {courseUri}
                      </option>
                    ))}
                  </select>
                ) : null}
              </>
            )}

            <label className="text-sm text-gray-700">Kursavgift (obligatoriskt, kan vara 0)</label>
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
            <label className="text-sm text-gray-700">Tillåtna användare</label>
            <div className="border rounded p-3 max-h-72 overflow-auto space-y-2">
              {users.length === 0 && allowedUsers.length === 0 ? (
                <p className="text-sm text-gray-500">Inga registrerade användare hittades.</p>
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
                placeholder="Lägg till e-post manuellt"
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addManualEmail}
                className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
              >
                Lägg till
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
          {loading ? "Sparar..." : "Spara åtkomstinställningar"}
        </button>
      </div>

      {message ? <p className="text-green-700">{message}</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}
    </section>
  );
}
