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

export default function AdminDashboard() {
  const router = useRouter();
  const [courses, setCourses] = useState({});
  const [users, setUsers] = useState([]);
  const [storage, setStorage] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [price, setPrice] = useState("0.00");
  const [currency, setCurrency] = useState("usd");
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [healthChecks, setHealthChecks] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/course-access")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok)
          throw new Error(json?.error || "Du behöver logga in som administratör.");
        setCourses(json.courses || {});
        setUsers(Array.isArray(json.users) ? json.users : []);
        setStorage(json.storage || null);
      })
      .catch((fetchError) => {
        setError(fetchError.message || "Det gick inte att hämta admin-data.");
      });
  }, []);

  useEffect(() => {
    if (!selectedCourse) return;
    const config = courses[selectedCourse];
    if (!config) {
      setPrice("0.00");
      setCurrency("usd");
      setAllowedUsers([]);
      return;
    }
    setPrice(toCurrencyUnits(config.priceCents || 0));
    setCurrency(config.currency || "usd");
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

  async function saveCourse() {
    if (!selectedCourse) {
      setError("Ange en kurs-URI.");
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
      const message =
        healthError instanceof Error ? healthError.message : "Hälsokontrollen misslyckades.";
      setError(message);
    } finally {
      setHealthLoading(false);
    }
  }

  return (
    <section className="max-w-5xl mx-auto px-6 py-16 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Admin för kursåtkomst</h1>
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
          <p className="text-sm text-gray-600">
            Kör kontrollen för att verifiera WordPress GraphQL, Stripe, autentisering och inloggningstjänster.
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-3">
          <label className="text-sm text-gray-700">Kurs-URI</label>
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

          <label className="text-sm text-gray-700">Kursavgift</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              min="0"
              step="0.01"
              className="w-full border rounded px-3 py-2"
            />
            <input
              type="text"
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toLowerCase())}
              className="w-24 border rounded px-3 py-2"
              maxLength={5}
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm text-gray-700">Tillåtna användare</label>
          <div className="border rounded p-3 max-h-72 overflow-auto space-y-2">
            {users.length === 0 ? (
              <p className="text-sm text-gray-500">Inga registrerade användare hittades.</p>
            ) : (
              users.map((user) => (
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
              ))
            )}
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

      {message ? <p className="text-green-700">{message}</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}
    </section>
  );
}
