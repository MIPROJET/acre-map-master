import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listParcellesTool from "./tools/list-parcelles";
import getParcelleTool from "./tools/get-parcelle";
import listHierarchieTool from "./tools/list-hierarchie";
import listLotsTool from "./tools/list-lots";

import { SUPABASE_PROJECT_REF } from "./supabase";

// The OAuth issuer must be the direct Supabase host of the project that mints the tokens.

export default defineMcp({
  name: "acremap",
  title: "AcreMap",
  version: "0.1.0",
  instructions:
    "Outils AcreMap (levé GPS, morcellement, référencement de parcelles agricoles). " +
    "Utilisez list_parcelles pour trouver une parcelle, get_parcelle pour son détail (levés + lots), " +
    "list_lots pour les lots de morcellement et list_hierarchie pour les SP et domaines. " +
    "Les données sont lues au nom de l'utilisateur connecté.",
  auth: auth.oauth.issuer({
    issuer: `https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listParcellesTool, getParcelleTool, listLotsTool, listHierarchieTool],
});
