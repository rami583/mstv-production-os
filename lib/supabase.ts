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
          start_time: string;
          end_time: string;
          end_of_day_time: string | null;
          status: EventStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_name: string;
          event_name: string;
          date: string;
          client_arrival_time?: string | null;
          start_time: string;
          end_time: string;
          end_of_day_time?: string | null;
          status?: EventStatus;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          label: string;
          status?: CompletionStatus;
          details?: string | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          option_id: string;
          label: string;
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
          status: LinkStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          label: string;
          url?: string | null;
          status?: LinkStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_links"]["Insert"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          subtitle: string | null;
          status: CompletionStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          title: string;
          subtitle?: string | null;
          status?: CompletionStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          first_name: string;
          role: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          role?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_members"]["Insert"]>;
        Relationships: [];
      };
      task_assignees: {
        Row: {
          task_id: string;
          team_member_id: string;
        };
        Insert: {
          task_id: string;
          team_member_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_assignees"]["Insert"]>;
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
