export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      pledges: {
        Row: {
          amount_per_lap: number | null;
          created_at: string;
          fixed_amount: number | null;
          id: string;
          payment_method_choice: Database["public"]["Enums"]["payment_method_choice"] | null;
          sponsor_email: string | null;
          sponsor_name: string;
          status: Database["public"]["Enums"]["pledge_status"];
          student_id: string;
          type: Database["public"]["Enums"]["pledge_type"];
          updated_at: string;
        };
        Insert: {
          amount_per_lap?: number | null;
          created_at?: string;
          fixed_amount?: number | null;
          id?: string;
          payment_method_choice?: Database["public"]["Enums"]["payment_method_choice"] | null;
          sponsor_email?: string | null;
          sponsor_name: string;
          status?: Database["public"]["Enums"]["pledge_status"];
          student_id: string;
          type: Database["public"]["Enums"]["pledge_type"];
          updated_at?: string;
        };
        Update: {
          amount_per_lap?: number | null;
          created_at?: string;
          fixed_amount?: number | null;
          id?: string;
          payment_method_choice?: Database["public"]["Enums"]["payment_method_choice"] | null;
          sponsor_email?: string | null;
          sponsor_name?: string;
          status?: Database["public"]["Enums"]["pledge_status"];
          student_id?: string;
          type?: Database["public"]["Enums"]["pledge_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pledges_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          school_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          school_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      run_results: {
        Row: {
          created_at: string;
          id: string;
          laps_completed: number;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          laps_completed: number;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          laps_completed?: number;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_results_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: true;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      runs: {
        Row: {
          created_at: string;
          created_by: string;
          date: string;
          id: string;
          school_id: string;
          status: Database["public"]["Enums"]["run_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          date: string;
          id?: string;
          school_id: string;
          status?: Database["public"]["Enums"]["run_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          date?: string;
          id?: string;
          school_id?: string;
          status?: Database["public"]["Enums"]["run_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "runs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      students: {
        Row: {
          class_name: string;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          qr_code: string;
          run_id: string;
          slug: string;
          token: string;
          updated_at: string;
        };
        Insert: {
          class_name: string;
          created_at?: string;
          first_name: string;
          id?: string;
          last_name: string;
          qr_code: string;
          run_id: string;
          slug: string;
          token?: string;
          updated_at?: string;
        };
        Update: {
          class_name?: string;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          qr_code?: string;
          run_id?: string;
          slug?: string;
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      sponsor_payment_links: {
        Row: {
          amount_cents: number;
          created_at: string;
          currency: string;
          expires_at: string;
          id: string;
          paid_at: string | null;
          pledge_id: string;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          token: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          currency?: string;
          expires_at: string;
          id?: string;
          paid_at?: string | null;
          pledge_id: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          token?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          currency?: string;
          expires_at?: string;
          id?: string;
          paid_at?: string | null;
          pledge_id?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sponsor_payment_links_pledge_id_fkey";
            columns: ["pledge_id"];
            isOneToOne: true;
            referencedRelation: "pledges";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_webhook_events: {
        Row: {
          created_at: string;
          event_id: string;
          event_type: string;
          id: string;
          livemode: boolean;
          payload: Json;
          processed_at: string | null;
          processing_status: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          event_type: string;
          id?: string;
          livemode: boolean;
          payload: Json;
          processed_at?: string | null;
          processing_status: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          event_type?: string;
          id?: string;
          livemode?: boolean;
          payload?: Json;
          processed_at?: string | null;
          processing_status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_pledge_by_token: {
        Args: {
          p_student_token: string;
          p_sponsor_name: string;
          p_sponsor_email: string;
          p_type: Database["public"]["Enums"]["pledge_type"];
          p_amount_per_lap?: number;
          p_fixed_amount?: number;
        };
        Returns: string;
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      current_user_school_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_public_student_by_token: {
        Args: { p_student_token: string };
        Returns: {
          student_id: string;
          first_name: string;
          last_name: string;
          class_name: string;
          run_title: string;
          run_date: string;
        }[];
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_teacher: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      teacher_has_run_access: {
        Args: { target_run_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "teacher";
      pledge_status: "pending" | "notified" | "paid";
      pledge_type: "per_lap" | "fixed_amount";
      payment_method_choice: "cash" | "stripe";
      run_status: "draft" | "active" | "completed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type PublicSchema = Database["public"];

export type TableName = keyof PublicSchema["Tables"];

export type TableRow<T extends TableName> = PublicSchema["Tables"][T]["Row"];

export type TableInsert<T extends TableName> = PublicSchema["Tables"][T]["Insert"];

export type TableUpdate<T extends TableName> = PublicSchema["Tables"][T]["Update"];

export type PublicEnum<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
