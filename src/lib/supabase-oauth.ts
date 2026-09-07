import { supabase } from "@/integrations/supabase/client";

type OAuthResult = Promise<{
  data: any;
  error: { message: string } | null;
}>;

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => OAuthResult;
  approveAuthorization: (id: string) => OAuthResult;
  denyAuthorization: (id: string) => OAuthResult;
};

export function getSupabaseOAuth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}