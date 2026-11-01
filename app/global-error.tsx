"use client";

/** Dernier filet de sécurité : si même la mise en page plante. Pas de dépendance au reste de l'app. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f2f4f9", color: "#151c38", display: "grid", minHeight: "100vh", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>JobPilot a rencontré un problème</h1>
          <p style={{ color: "#566083" }}>Tes données sont en sécurité. Recharge la page, ou réessaie dans un instant.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "12px 22px", borderRadius: 999, border: 0, background: "#f5b800", color: "#151c38", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>Réessayer</button>
        </div>
      </body>
    </html>
  );
}
