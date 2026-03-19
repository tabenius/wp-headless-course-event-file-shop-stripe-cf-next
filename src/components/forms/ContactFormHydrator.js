"use client";

import { useEffect } from "react";

export default function ContactFormHydrator() {
  useEffect(() => {
    function handleSubmit(event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!form.classList.contains("contact-form")) return;
      event.preventDefault();

      const formData = new FormData(form);
      const action = form.getAttribute("action") || "/api/contact";

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Skickar...";
      }

      fetch(action, {
        method: "POST",
        body: formData,
      })
        .then(async (res) => {
          let json = {};
          try {
            json = await res.json();
          } catch {
            /* ignore */
          }
          const success = res.ok && json?.ok;
          const message =
            json?.message ||
            json?.error ||
            (success
              ? "Tack, ditt meddelande har skickats."
              : "Det gick inte att skicka meddelandet just nu.");
          const replacement = document.createElement("div");
          replacement.className = `contact-form-result rounded border px-4 py-3 ${
            success
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`;
          replacement.textContent = message;
          form.replaceWith(replacement);
        })
        .catch(() => {
          const replacement = document.createElement("div");
          replacement.className =
            "contact-form-result rounded border px-4 py-3 bg-red-50 border-red-200 text-red-800";
          replacement.textContent =
            "Det gick inte att skicka meddelandet. Kontrollera anslutningen och försök igen.";
          form.replaceWith(replacement);
        });
    }

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, []);

  return null;
}
