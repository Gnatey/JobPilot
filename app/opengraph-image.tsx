import { ImageResponse } from "next/og";

/** Image de partage (aperçu dans Google, Slack, WhatsApp, LinkedIn…) : le cadran du logo et la promesse de la page d'accueil. */
export const alt = "JobPilot : colle une offre, JobPilot s'occupe du reste";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#111833", color: "#ffffff", padding: "0 90px", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700, color: "#f5b800" }}>JobPilot</div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 62, fontWeight: 700, lineHeight: 1.08 }}>Colle une offre. JobPilot s'occupe du reste.</div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 30, color: "#aeb6d4" }}>Score de compatibilité, CV et lettre sur mesure, suivi des candidatures.</div>
        </div>
        <svg width="300" height="300" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="40" stroke="#3a4570" strokeWidth="7" strokeLinecap="round" strokeDasharray="188.5 999" transform="rotate(135 50 50)" />
          <circle cx="50" cy="50" r="40" stroke="#f5b800" strokeWidth="7" strokeLinecap="round" strokeDasharray="164 999" transform="rotate(135 50 50)" />
        </svg>
      </div>
    ),
    size,
  );
}
