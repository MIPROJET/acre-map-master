import { createFileRoute, redirect } from "@tanstack/react-router";

// L'ancienne fiche parcelle/morcellement est remplacée par la page /app/morcellement.
export const Route = createFileRoute("/app/parcelles/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/morcellement", search: { measurement: params.id }, replace: true });
  },
  component: () => null,
});
