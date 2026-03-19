"use client";

import { useEffect, useState } from "react";

let toastCounter = 0;

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    function onToast(event) {
      const detail = event.detail || {};
      const id = ++toastCounter;
      const message =
        typeof detail.message === "string"
          ? detail.message
          : "Something happened.";
      const type = detail.type || "info";
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, detail.duration || 5000);
    }
    window.addEventListener("toast", onToast);
    return () => window.removeEventListener("toast", onToast);
  }, []);

  const bg = {
    info: "bg-gray-900 text-white",
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    warning: "bg-amber-500 text-white",
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 w-80 max-w-[90vw]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`shadow-lg rounded px-4 py-3 text-sm ${bg[toast.type] || bg.info}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
