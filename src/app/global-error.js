"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div style={{ maxWidth: "400px", textAlign: "center" }}>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                marginBottom: "1rem",
              }}
            >
              Something went wrong
            </h1>
            <p style={{ color: "#666", marginBottom: "1.5rem" }}>
              {error?.digest
                ? `Error reference: ${error.digest}`
                : "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "0.5rem 1.5rem",
                borderRadius: "0.375rem",
                backgroundColor: "#1f2937",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
