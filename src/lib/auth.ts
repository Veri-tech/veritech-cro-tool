import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "agency_admin" | "client";

export interface AppProfile {
  id: string;
  agency_id: string | null;
  role: AppRole | null;
  full_name: string | null;
}

export interface AppAgency {
  id: string;
  name: string;
  status: "active" | "suspended" | "cancelled";
  suspended_reason: string | null;
  logo_url: string | null;
  daily_audit_limit: number | null;
  monthly_token_budget: number | null;
  contact_email: string | null;
}

export interface AppClient {
  id: string;
  agency_id: string;
  name: string;
  archived: boolean | null;
}

export interface SessionInfo {
  user: User | null;
  profile: AppProfile | null;
  agency: AppAgency | null;
  client: AppClient | null;
}

async function fetchSession(): Promise<SessionInfo> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user ?? null;
  if (!user) return { user: null, profile: null, agency: null, client: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, agency_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  let agency: AppAgency | null = null;
  if (profile?.agency_id) {
    const { data } = await supabase
      .from("agencies")
      .select("id, name, status, suspended_reason, logo_url, daily_audit_limit, monthly_token_budget, contact_email")
      .eq("id", profile.agency_id)
      .maybeSingle();
    agency = (data as AppAgency | null) ?? null;
  }

  let client: AppClient | null = null;
  if (profile?.role === "client") {
    const { data } = await supabase
      .from("clients")
      .select("id, agency_id, name, archived")
      .eq("portal_user_id", user.id)
      .maybeSingle();
    client = (data as AppClient | null) ?? null;
  }

  return { user, profile: (profile as AppProfile | null) ?? null, agency, client };
}

export function useSession() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 30_000,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        qc.invalidateQueries({ queryKey: ["session"] });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  return query;
}

export function homePathForRole(role: AppRole | null | undefined): string {
  if (role === "super_admin") return "/admin";
  if (role === "agency_admin") return "/dashboard";
  if (role === "client") return "/portal";
  return "/login";
}

export async function signOutAndRedirect() {
  await supabase.auth.signOut();
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("veritech_running_audit");
    window.location.href = "/login";
  }
}

export function usePasswordStrength(pw: string): "weak" | "fair" | "strong" | null {
  const [s, setS] = useState<"weak" | "fair" | "strong" | null>(null);
  useEffect(() => {
    if (!pw) return setS(null);
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    setS(score <= 2 ? "weak" : score <= 3 ? "fair" : "strong");
  }, [pw]);
  return s;
}
