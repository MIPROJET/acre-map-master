import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/import")({
  // L'import est désormais intégré à la page Traitement (dropzone + file d'attente hors ligne).
  beforeLoad: () => {
    throw redirect({ to: "/app/traitement", replace: true });
  },
  component: () => null,
});
