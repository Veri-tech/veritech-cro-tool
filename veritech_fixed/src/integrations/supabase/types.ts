export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          daily_audit_limit: number | null
          id: string
          logo_url: string | null
          monthly_token_budget: number | null
          name: string
          owner_id: string | null
          primary_color: string | null
          slug: string | null
          status: string | null
          suspended_at: string | null
          suspended_reason: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          daily_audit_limit?: number | null
          id?: string
          logo_url?: string | null
          monthly_token_budget?: number | null
          name: string
          owner_id?: string | null
          primary_color?: string | null
          slug?: string | null
          status?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          daily_audit_limit?: number | null
          id?: string
          logo_url?: string | null
          monthly_token_budget?: number | null
          name?: string
          owner_id?: string | null
          primary_color?: string | null
          slug?: string | null
          status?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          agency_id: string | null
          audit_id: string | null
          cost_usd: number | null
          created_at: string | null
          id: string
          tokens_input: number | null
          tokens_output: number | null
          tokens_total: number | null
        }
        Insert: {
          agency_id?: string | null
          audit_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
        }
        Update: {
          agency_id?: string | null
          audit_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_log_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_queue: {
        Row: {
          agency_id: string | null
          audit_id: string | null
          completed_at: string | null
          id: string
          started_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          agency_id?: string | null
          audit_id?: string | null
          completed_at?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          agency_id?: string | null
          audit_id?: string | null
          completed_at?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_queue_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_queue_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_requests: {
        Row: {
          agency_id: string
          audit_id: string | null
          client_id: string
          created_at: string | null
          id: string
          page_label: string | null
          page_url: string
          requested_by: string | null
          status: string | null
        }
        Insert: {
          agency_id: string
          audit_id?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          page_label?: string | null
          page_url: string
          requested_by?: string | null
          status?: string | null
        }
        Update: {
          agency_id?: string
          audit_id?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          page_label?: string | null
          page_url?: string
          requested_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_requests_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          agency_id: string
          aov_at_run: number | null
          client_id: string
          created_at: string | null
          critical_count: number | null
          error_message: string | null
          friction_count: number | null
          id: string
          initiated_by: string | null
          output: string | null
          page_label: string | null
          page_url: string
          parsed_data: Json | null
          pdf_url: string | null
          rating: string | null
          retry_count: number | null
          revenue_high: number | null
          revenue_low: number | null
          run_by: string | null
          score: number | null
          status: string | null
          traffic_at_run: number | null
        }
        Insert: {
          agency_id: string
          aov_at_run?: number | null
          client_id: string
          created_at?: string | null
          critical_count?: number | null
          error_message?: string | null
          friction_count?: number | null
          id?: string
          initiated_by?: string | null
          output?: string | null
          page_label?: string | null
          page_url: string
          parsed_data?: Json | null
          pdf_url?: string | null
          rating?: string | null
          retry_count?: number | null
          revenue_high?: number | null
          revenue_low?: number | null
          run_by?: string | null
          score?: number | null
          status?: string | null
          traffic_at_run?: number | null
        }
        Update: {
          agency_id?: string
          aov_at_run?: number | null
          client_id?: string
          created_at?: string | null
          critical_count?: number | null
          error_message?: string | null
          friction_count?: number | null
          id?: string
          initiated_by?: string | null
          output?: string | null
          page_label?: string | null
          page_url?: string
          parsed_data?: Json | null
          pdf_url?: string | null
          rating?: string | null
          retry_count?: number | null
          revenue_high?: number | null
          revenue_low?: number | null
          run_by?: string | null
          score?: number | null
          status?: string | null
          traffic_at_run?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_integrations: {
        Row: {
          access_token: string | null
          account_email: string | null
          agency_id: string | null
          auth_method: string
          client_id: string | null
          connected_at: string | null
          ga4_properties_list: Json | null
          ga4_property_id: string | null
          gsc_site_url: string | null
          gsc_sites_list: Json | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          manual_credentials: string | null
          provider: string | null
          refresh_token: string | null
          scopes: string[] | null
          semrush_account_id: string | null
          semrush_has_keyword_api: boolean | null
          semrush_has_traffic_api: boolean | null
          semrush_plan: string | null
          status: string | null
          token_expiry: string | null
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          agency_id?: string | null
          auth_method?: string
          client_id?: string | null
          connected_at?: string | null
          ga4_properties_list?: Json | null
          ga4_property_id?: string | null
          gsc_site_url?: string | null
          gsc_sites_list?: Json | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          manual_credentials?: string | null
          provider?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          semrush_account_id?: string | null
          semrush_has_keyword_api?: boolean | null
          semrush_has_traffic_api?: boolean | null
          semrush_plan?: string | null
          status?: string | null
          token_expiry?: string | null
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          agency_id?: string | null
          auth_method?: string
          client_id?: string | null
          connected_at?: string | null
          ga4_properties_list?: Json | null
          ga4_property_id?: string | null
          gsc_site_url?: string | null
          gsc_sites_list?: Json | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          manual_credentials?: string | null
          provider?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          semrush_account_id?: string | null
          semrush_has_keyword_api?: boolean | null
          semrush_has_traffic_api?: boolean | null
          semrush_plan?: string | null
          status?: string | null
          token_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_integrations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted: boolean | null
          agency_id: string | null
          client_id: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          token: string
        }
        Insert: {
          accepted?: boolean | null
          agency_id?: string | null
          client_id?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          token?: string
        }
        Update: {
          accepted?: boolean | null
          agency_id?: string | null
          client_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agency_id: string
          archived: boolean | null
          archived_at: string | null
          avg_order_value: number | null
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          domain: string | null
          id: string
          industry: string | null
          monthly_traffic: number | null
          name: string
          note_date: string | null
          notes: string | null
          portal_user_id: string | null
          setup_complete: boolean
        }
        Insert: {
          agency_id: string
          archived?: boolean | null
          archived_at?: string | null
          avg_order_value?: number | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          monthly_traffic?: number | null
          name: string
          note_date?: string | null
          notes?: string | null
          portal_user_id?: string | null
          setup_complete?: boolean
        }
        Update: {
          agency_id?: string
          archived?: boolean | null
          archived_at?: string | null
          avg_order_value?: number | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          monthly_traffic?: number | null
          name?: string
          note_date?: string | null
          notes?: string | null
          portal_user_id?: string | null
          setup_complete?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_audits: {
        Row: {
          agency_id: string
          audit_id: string | null
          client_id: string
          competitor_id: string | null
          created_at: string | null
          data_source: string | null
          id: string
          market_share_job_id: string | null
          output: string | null
          page_url: string
          rating: string | null
          score: number | null
          traffic_est: number | null
        }
        Insert: {
          agency_id: string
          audit_id?: string | null
          client_id: string
          competitor_id?: string | null
          created_at?: string | null
          data_source?: string | null
          id?: string
          market_share_job_id?: string | null
          output?: string | null
          page_url: string
          rating?: string | null
          score?: number | null
          traffic_est?: number | null
        }
        Update: {
          agency_id?: string
          audit_id?: string | null
          client_id?: string
          competitor_id?: string | null
          created_at?: string | null
          data_source?: string | null
          id?: string
          market_share_job_id?: string | null
          output?: string | null
          page_url?: string
          rating?: string | null
          score?: number | null
          traffic_est?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_audits_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_audits_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_audits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_audits_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          agency_id: string
          client_id: string
          created_at: string | null
          domain: string
          id: string
          name: string | null
        }
        Insert: {
          agency_id: string
          client_id: string
          created_at?: string | null
          domain: string
          id?: string
          name?: string | null
        }
        Update: {
          agency_id?: string
          client_id?: string
          created_at?: string | null
          domain?: string
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      market_share_jobs: {
        Row: {
          agency_id: string
          audit_id: string | null
          can_resume: boolean | null
          client_id: string
          created_at: string | null
          current_step_label: string | null
          error_message: string | null
          id: string
          resume_from_step: number | null
          status: string | null
          steps_completed: number | null
          steps_total: number | null
          synthesis_output: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          audit_id?: string | null
          can_resume?: boolean | null
          client_id: string
          created_at?: string | null
          current_step_label?: string | null
          error_message?: string | null
          id?: string
          resume_from_step?: number | null
          status?: string | null
          steps_completed?: number | null
          steps_total?: number | null
          synthesis_output?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          audit_id?: string | null
          can_resume?: boolean | null
          client_id?: string
          created_at?: string | null
          current_step_label?: string | null
          error_message?: string | null
          id?: string
          resume_from_step?: number | null
          status?: string | null
          steps_completed?: number | null
          steps_total?: number | null
          synthesis_output?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_share_jobs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_share_jobs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_share_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          agency_id: string | null
          body: string | null
          created_at: string | null
          id: string
          link: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          agency_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          agency_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agency_id: string | null
          created_at: string | null
          full_name: string | null
          id: string
          role: string | null
        }
        Insert: {
          agency_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          role?: string | null
        }
        Update: {
          agency_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
    }
    Views: {
      client_integrations_safe: {
        Row: {
          account_email: string | null
          agency_id: string | null
          auth_method: string | null
          client_id: string | null
          connected_at: string | null
          ga4_properties_list: Json | null
          ga4_property_id: string | null
          gsc_site_url: string | null
          gsc_sites_list: Json | null
          has_credentials: boolean | null
          id: string | null
          last_error: string | null
          last_synced_at: string | null
          provider: string | null
          scopes: string[] | null
          semrush_account_id: string | null
          semrush_has_keyword_api: boolean | null
          semrush_has_traffic_api: boolean | null
          semrush_plan: string | null
          status: string | null
          token_expiry: string | null
        }
        Insert: {
          account_email?: string | null
          agency_id?: string | null
          auth_method?: string | null
          client_id?: string | null
          connected_at?: string | null
          ga4_properties_list?: Json | null
          ga4_property_id?: string | null
          gsc_site_url?: string | null
          gsc_sites_list?: Json | null
          has_credentials?: never
          id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string | null
          scopes?: string[] | null
          semrush_account_id?: string | null
          semrush_has_keyword_api?: boolean | null
          semrush_has_traffic_api?: boolean | null
          semrush_plan?: string | null
          status?: string | null
          token_expiry?: string | null
        }
        Update: {
          account_email?: string | null
          agency_id?: string | null
          auth_method?: string | null
          client_id?: string | null
          connected_at?: string | null
          ga4_properties_list?: Json | null
          ga4_property_id?: string | null
          gsc_site_url?: string | null
          gsc_sites_list?: Json | null
          has_credentials?: never
          id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string | null
          scopes?: string[] | null
          semrush_account_id?: string | null
          semrush_has_keyword_api?: boolean | null
          semrush_has_traffic_api?: boolean | null
          semrush_plan?: string | null
          status?: string | null
          token_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_integrations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_user_agency_id: { Args: { _uid: string }; Returns: string }
      get_user_role: { Args: { _uid: string }; Returns: string }
      is_super_admin: { Args: { _uid: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
