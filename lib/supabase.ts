import { createClient } from "@supabase/supabase-js";

export type EventStatus = "Brouillon" | "En préparation" | "En attente client" | "Prêt" | "En direct" | "Terminé";
export type CompletionStatus = "incomplete" | "completed";
export type LinkStatus = "missing" | "available";

export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          client_name: string;
          event_name: string;
          date: string;
          client_arrival_time: string | null;
          start_time: string | null;
          end_time: string | null;
          end_of_day_time: string | null;
          status: EventStatus;
          deleted_at: string | null;
          deleted_by: string | null;
          quote_reference: string | null;
          quote_version: string | null;
          source_quote_text: string | null;
          last_quote_imported_at: string | null;
          imported_from: string | null;
          external_import_id: string | null;
          event_role: "production" | "external_context";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_name: string;
          event_name: string;
          date: string;
          client_arrival_time?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          end_of_day_time?: string | null;
          status?: EventStatus;
          deleted_at?: string | null;
          deleted_by?: string | null;
          quote_reference?: string | null;
          quote_version?: string | null;
          source_quote_text?: string | null;
          last_quote_imported_at?: string | null;
          imported_from?: string | null;
          external_import_id?: string | null;
          event_role?: "production" | "external_context";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [];
      };
      event_options: {
        Row: {
          id: string;
          event_id: string;
          label: string;
          status: CompletionStatus;
          details: string | null;
          assigned_team_member_id: string | null;
          completed_by_profile_id: string | null;
          completed_by_label: string | null;
          completed_by_initials: string | null;
          completed_at: string | null;
          created_by_profile_id: string | null;
          created_by_role: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          label: string;
          status?: CompletionStatus;
          details?: string | null;
          assigned_team_member_id?: string | null;
          completed_by_profile_id?: string | null;
          completed_by_label?: string | null;
          completed_by_initials?: string | null;
          completed_at?: string | null;
          created_by_profile_id?: string | null;
          created_by_role?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_options"]["Insert"]>;
        Relationships: [];
      };
      event_option_items: {
        Row: {
          id: string;
          option_id: string;
          label: string;
          created_by_profile_id: string | null;
          created_by_role: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          option_id: string;
          label: string;
          created_by_profile_id?: string | null;
          created_by_role?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_option_items"]["Insert"]>;
        Relationships: [];
      };
      event_links: {
        Row: {
          id: string;
          event_id: string;
          label: string;
          url: string | null;
          stream_key: string | null;
          status: LinkStatus;
          created_by_profile_id: string | null;
          created_by_role: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          label: string;
          url?: string | null;
          stream_key?: string | null;
          status?: LinkStatus;
          created_by_profile_id?: string | null;
          created_by_role?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_links"]["Insert"]>;
        Relationships: [];
      };
      event_link_entries: {
        Row: {
          id: string;
          link_id: string;
          url: string | null;
          stream_key: string | null;
          position: number;
          created_by_profile_id: string | null;
          created_by_role: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          link_id: string;
          url?: string | null;
          stream_key?: string | null;
          position?: number;
          created_by_profile_id?: string | null;
          created_by_role?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_link_entries"]["Insert"]>;
        Relationships: [];
      };
      event_documents: {
        Row: {
          id: string;
          event_id: string;
          group_id: string;
          file_name: string;
          file_path: string;
          file_type: string | null;
          file_size: number | null;
          created_by_profile_id: string | null;
          created_by_role: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          group_id: string;
          file_name: string;
          file_path: string;
          file_type?: string | null;
          file_size?: number | null;
          created_by_profile_id?: string | null;
          created_by_role?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_documents"]["Insert"]>;
        Relationships: [];
      };
      event_document_groups: {
        Row: {
          id: string;
          event_id: string;
          label: string;
          created_by_profile_id: string | null;
          created_by_role: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          label: string;
          created_by_profile_id?: string | null;
          created_by_role?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_document_groups"]["Insert"]>;
        Relationships: [];
      };
      event_activity_log: {
        Row: {
          id: string;
          event_id: string;
          action_type: string;
          entity_type: string | null;
          entity_id: string | null;
          description: string;
          previous_value: Record<string, unknown> | null;
          new_value: Record<string, unknown> | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          action_type: string;
          entity_type?: string | null;
          entity_id?: string | null;
          description: string;
          previous_value?: Record<string, unknown> | null;
          new_value?: Record<string, unknown> | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_activity_log"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          related_event_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          related_event_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          role: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          role?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          first_name: string;
          last_name: string | null;
          initials: string | null;
          is_assignable: boolean | null;
          visibility: string | null;
          role: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name?: string | null;
          initials?: string | null;
          is_assignable?: boolean | null;
          visibility?: string | null;
          role?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_members"]["Insert"]>;
        Relationships: [];
      };
      external_calendars: {
        Row: {
          id: string;
          name: string;
          ics_url: string | null;
          color: string | null;
          visibility: string | null;
          provider_type: string;
          provider_account_id: string | null;
          provider_calendar_id: string | null;
          calendar_role: "business_primary" | "external_context";
          sync_capability: string;
          sync_enabled: boolean;
          last_sync_started_at: string | null;
          last_sync_finished_at: string | null;
          last_sync_status: string | null;
          last_sync_error: string | null;
          external_updated_at: string | null;
          created_by_profile_id: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          ics_url?: string | null;
          color?: string | null;
          visibility?: string | null;
          provider_type?: string;
          provider_account_id?: string | null;
          provider_calendar_id?: string | null;
          calendar_role?: "business_primary" | "external_context";
          sync_capability?: string;
          sync_enabled?: boolean;
          last_sync_started_at?: string | null;
          last_sync_finished_at?: string | null;
          last_sync_status?: string | null;
          last_sync_error?: string | null;
          external_updated_at?: string | null;
          created_by_profile_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["external_calendars"]["Insert"]>;
        Relationships: [];
      };
      external_calendar_accounts: {
        Row: {
          id: string;
          user_id: string;
          provider_type: string;
          provider_account_id: string | null;
          provider_account_email: string | null;
          provider_email: string | null;
          display_name: string | null;
          sync_capability: string;
          scopes: string[];
          access_token_encrypted: string | null;
          refresh_token_encrypted: string | null;
          credential_payload_encrypted: string | null;
          token_expires_at: string | null;
          connection_status: string;
          last_sync_at: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_type: string;
          provider_account_id?: string | null;
          provider_account_email?: string | null;
          provider_email?: string | null;
          display_name?: string | null;
          sync_capability?: string;
          scopes?: string[];
          access_token_encrypted?: string | null;
          refresh_token_encrypted?: string | null;
          credential_payload_encrypted?: string | null;
          token_expires_at?: string | null;
          connection_status?: string;
          last_sync_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["external_calendar_accounts"]["Insert"]>;
        Relationships: [];
      };
      external_calendar_events: {
        Row: {
          id: string;
          external_calendar_id: string;
          external_event_id: string;
          title: string;
          description: string | null;
          location: string | null;
          start_time: string;
          end_time: string | null;
          all_day: boolean | null;
          raw_event: Record<string, unknown> | null;
          last_synced_at: string | null;
        };
        Insert: {
          id?: string;
          external_calendar_id: string;
          external_event_id: string;
          title: string;
          description?: string | null;
          location?: string | null;
          start_time: string;
          end_time?: string | null;
          all_day?: boolean | null;
          raw_event?: Record<string, unknown> | null;
          last_synced_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["external_calendar_events"]["Insert"]>;
        Relationships: [];
      };
      external_event_links: {
        Row: {
          id: string;
          event_id: string;
          external_calendar_id: string;
          provider_type: string;
          provider_calendar_id: string;
          external_event_id: string;
          external_event_uid: string | null;
          sync_direction: string;
          sync_status: string;
          local_updated_at: string | null;
          last_synced_at: string | null;
          last_external_updated_at: string | null;
          conflict_detected_at: string | null;
          conflict_reason: string | null;
          last_sync_error: string | null;
          deleted_locally_at: string | null;
          deleted_externally_at: string | null;
          raw_external_event: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          external_calendar_id: string;
          provider_type: string;
          provider_calendar_id: string;
          external_event_id: string;
          external_event_uid?: string | null;
          sync_direction?: string;
          sync_status?: string;
          local_updated_at?: string | null;
          last_synced_at?: string | null;
          last_external_updated_at?: string | null;
          conflict_detected_at?: string | null;
          conflict_reason?: string | null;
          last_sync_error?: string | null;
          deleted_locally_at?: string | null;
          deleted_externally_at?: string | null;
          raw_external_event?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["external_event_links"]["Insert"]>;
        Relationships: [];
      };
      external_calendar_sync_log: {
        Row: {
          id: string;
          account_id: string | null;
          external_calendar_id: string | null;
          event_id: string | null;
          external_event_link_id: string | null;
          operation: string;
          status: string;
          message: string | null;
          technical_detail: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          external_calendar_id?: string | null;
          event_id?: string | null;
          external_event_link_id?: string | null;
          operation: string;
          status: string;
          message?: string | null;
          technical_detail?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["external_calendar_sync_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : null;
