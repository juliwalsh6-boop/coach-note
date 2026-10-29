// Supabase のテーブル定義に対応する型。
// supabase/migrations/*.sql を変更したらここも合わせて更新してください。
// （Supabase CLI の `supabase gen types typescript` で自動生成したものに置き換えても動きます）

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
      profiles: {
        Row: {
          id: string;
          role: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: string;
          display_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trainer_clients: {
        Row: {
          trainer_id: string;
          client_id: string;
          status: string;
          created_at: string;
        };
        Insert: {
          trainer_id: string;
          client_id: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          trainer_id?: string;
          client_id?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trainer_clients_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainer_clients_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      client_invites: {
        Row: {
          id: string;
          trainer_id: string;
          code: string;
          label: string | null;
          expires_at: string;
          used_by: string | null;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trainer_id: string;
          code: string;
          label?: string | null;
          expires_at?: string;
          used_by?: string | null;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          trainer_id?: string;
          code?: string;
          label?: string | null;
          expires_at?: string;
          used_by?: string | null;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_invites_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_invites_used_by_fkey";
            columns: ["used_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      checkins: {
        Row: {
          id: string;
          client_id: string;
          checkin_date: string;
          sleep: number;
          fatigue: number;
          soreness: number;
          stress: number;
          motivation: number;
          body_weight_kg: number | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          checkin_date: string;
          sleep: number;
          fatigue: number;
          soreness: number;
          stress: number;
          motivation: number;
          body_weight_kg?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          checkin_date?: string;
          sleep?: number;
          fatigue?: number;
          soreness?: number;
          stress?: number;
          motivation?: number;
          body_weight_kg?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkins_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_plans: {
        Row: {
          id: string;
          trainer_id: string;
          client_id: string;
          title: string;
          scheduled_date: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trainer_id: string;
          client_id: string;
          title: string;
          scheduled_date?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trainer_id?: string;
          client_id?: string;
          title?: string;
          scheduled_date?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_plans_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_plans_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_exercises: {
        Row: {
          id: string;
          plan_id: string;
          position: number;
          name: string;
          exercise_key: string;
          target_weight_kg: number | null;
          target_reps: number;
          target_sets: number;
          set_targets: Json | null;
          rest_seconds: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          position: number;
          name: string;
          exercise_key: string;
          target_weight_kg?: number | null;
          target_reps: number;
          target_sets: number;
          set_targets?: Json | null;
          rest_seconds?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          position?: number;
          name?: string;
          exercise_key?: string;
          target_weight_kg?: number | null;
          target_reps?: number;
          target_sets?: number;
          set_targets?: Json | null;
          rest_seconds?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_exercises_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sessions: {
        Row: {
          id: string;
          client_id: string;
          trainer_id: string | null;
          plan_id: string | null;
          title: string;
          performed_date: string;
          status: string;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          trainer_id?: string | null;
          plan_id?: string | null;
          title: string;
          performed_date: string;
          status?: string;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          trainer_id?: string | null;
          plan_id?: string | null;
          title?: string;
          performed_date?: string;
          status?: string;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sessions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sessions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sessions_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      session_exercises: {
        Row: {
          id: string;
          session_id: string;
          client_id: string;
          plan_exercise_id: string | null;
          position: number;
          name: string;
          exercise_key: string;
          target_weight_kg: number | null;
          target_reps: number | null;
          target_sets: number;
          rest_seconds: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          client_id: string;
          plan_exercise_id?: string | null;
          position: number;
          name: string;
          exercise_key: string;
          target_weight_kg?: number | null;
          target_reps?: number | null;
          target_sets: number;
          rest_seconds?: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          client_id?: string;
          plan_exercise_id?: string | null;
          position?: number;
          name?: string;
          exercise_key?: string;
          target_weight_kg?: number | null;
          target_reps?: number | null;
          target_sets?: number;
          rest_seconds?: number;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_exercises_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_exercises_plan_exercise_id_fkey";
            columns: ["plan_exercise_id"];
            isOneToOne: false;
            referencedRelation: "plan_exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_exercises_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      set_logs: {
        Row: {
          id: string;
          session_exercise_id: string;
          session_id: string;
          client_id: string;
          set_number: number;
          target_weight_kg: number | null;
          target_reps: number | null;
          actual_weight_kg: number | null;
          actual_reps: number | null;
          rpe: number | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_exercise_id: string;
          session_id: string;
          client_id: string;
          set_number: number;
          target_weight_kg?: number | null;
          target_reps?: number | null;
          actual_weight_kg?: number | null;
          actual_reps?: number | null;
          rpe?: number | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_exercise_id?: string;
          session_id?: string;
          client_id?: string;
          set_number?: number;
          target_weight_kg?: number | null;
          target_reps?: number | null;
          actual_weight_kg?: number | null;
          actual_reps?: number | null;
          rpe?: number | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "set_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "set_logs_session_exercise_id_fkey";
            columns: ["session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "session_exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "set_logs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      trainer_comments: {
        Row: {
          id: string;
          trainer_id: string;
          client_id: string;
          session_id: string | null;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trainer_id: string;
          client_id: string;
          session_id?: string | null;
          body: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          trainer_id?: string;
          client_id?: string;
          session_id?: string | null;
          body?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trainer_comments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainer_comments_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainer_comments_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      nutrition_targets: {
        Row: {
          id: string;
          client_id: string;
          trainer_id: string | null;
          effective_from: string;
          energy_kcal: number;
          protein_g: number;
          fat_g: number;
          carbs_g: number;
          energy_tolerance_kcal: number;
          protein_tolerance_g: number;
          fat_tolerance_g: number;
          carbs_tolerance_g: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          trainer_id?: string | null;
          effective_from: string;
          energy_kcal: number;
          protein_g: number;
          fat_g: number;
          carbs_g: number;
          energy_tolerance_kcal?: number;
          protein_tolerance_g?: number;
          fat_tolerance_g?: number;
          carbs_tolerance_g?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          trainer_id?: string | null;
          effective_from?: string;
          energy_kcal?: number;
          protein_g?: number;
          fat_g?: number;
          carbs_g?: number;
          energy_tolerance_kcal?: number;
          protein_tolerance_g?: number;
          fat_tolerance_g?: number;
          carbs_tolerance_g?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "nutrition_targets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "nutrition_targets_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      foods: {
        Row: {
          id: string;
          code: string | null;
          owner_trainer_id: string | null;
          name: string;
          brand_key: string | null;
          brand: string | null;
          channel: string;
          genre: string | null;
          category: string | null;
          meal_role: string;
          serving_label: string;
          serving_weight_g: number | null;
          nutrient_basis: string;
          energy_kcal: number;
          protein_g: number;
          fat_g: number;
          carbs_g: number;
          price_yen: number | null;
          price_note: string | null;
          source_type: string;
          source_url: string | null;
          source_note: string | null;
          verified_on: string | null;
          verification_status: string;
          availability: string;
          search_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code?: string | null;
          owner_trainer_id?: string | null;
          name: string;
          brand_key?: string | null;
          brand?: string | null;
          channel: string;
          genre?: string | null;
          category?: string | null;
          meal_role: string;
          serving_label?: string;
          serving_weight_g?: number | null;
          nutrient_basis: string;
          energy_kcal: number;
          protein_g: number;
          fat_g: number;
          carbs_g: number;
          price_yen?: number | null;
          price_note?: string | null;
          source_type: string;
          source_url?: string | null;
          source_note?: string | null;
          verified_on?: string | null;
          verification_status?: string;
          availability?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string | null;
          owner_trainer_id?: string | null;
          name?: string;
          brand_key?: string | null;
          brand?: string | null;
          channel?: string;
          genre?: string | null;
          category?: string | null;
          meal_role?: string;
          serving_label?: string;
          serving_weight_g?: number | null;
          nutrient_basis?: string;
          energy_kcal?: number;
          protein_g?: number;
          fat_g?: number;
          carbs_g?: number;
          price_yen?: number | null;
          price_note?: string | null;
          source_type?: string;
          source_url?: string | null;
          source_note?: string | null;
          verified_on?: string | null;
          verification_status?: string;
          availability?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "foods_owner_trainer_id_fkey";
            columns: ["owner_trainer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      meals: {
        Row: {
          id: string;
          client_id: string;
          eaten_on: string;
          meal_type: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          eaten_on: string;
          meal_type: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          eaten_on?: string;
          meal_type?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meals_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_photos: {
        Row: {
          id: string;
          meal_id: string;
          client_id: string;
          storage_path: string;
          content_hash: string | null;
          width: number | null;
          height: number | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          meal_id: string;
          client_id: string;
          storage_path: string;
          content_hash?: string | null;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          meal_id?: string;
          client_id?: string;
          storage_path?: string;
          content_hash?: string | null;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_photos_meal_id_client_id_fkey";
            columns: ["meal_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "meals";
            referencedColumns: ["id", "client_id"];
          },
        ];
      };
      meal_items: {
        Row: {
          id: string;
          meal_id: string;
          client_id: string;
          position: number;
          name: string;
          brand: string | null;
          origin: string;
          food_id: string | null;
          photo_id: string | null;
          unit: string;
          ref_amount: number;
          ref_energy_kcal: number;
          ref_protein_g: number;
          ref_fat_g: number;
          ref_carbs_g: number;
          amount: number;
          serving_label: string | null;
          serving_weight_g: number | null;
          weight_g: number | null;
          energy_kcal: number;
          protein_g: number;
          fat_g: number;
          carbs_g: number;
          ai_estimate: Json | null;
          ai_adjusted: boolean;
          request_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meal_id: string;
          client_id: string;
          position?: number;
          name: string;
          brand?: string | null;
          origin: string;
          food_id?: string | null;
          photo_id?: string | null;
          unit: string;
          ref_amount: number;
          ref_energy_kcal: number;
          ref_protein_g: number;
          ref_fat_g: number;
          ref_carbs_g: number;
          amount: number;
          serving_label?: string | null;
          serving_weight_g?: number | null;
          ai_estimate?: Json | null;
          request_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          position?: number;
          name?: string;
          brand?: string | null;
          unit?: string;
          ref_amount?: number;
          ref_energy_kcal?: number;
          ref_protein_g?: number;
          ref_fat_g?: number;
          ref_carbs_g?: number;
          amount?: number;
          serving_label?: string | null;
          serving_weight_g?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_id_client_id_fkey";
            columns: ["meal_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "meals";
            referencedColumns: ["id", "client_id"];
          },
          {
            foreignKeyName: "meal_items_food_id_fkey";
            columns: ["food_id"];
            isOneToOne: false;
            referencedRelation: "foods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_items_photo_id_fkey";
            columns: ["photo_id"];
            isOneToOne: false;
            referencedRelation: "meal_photos";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_comments: {
        Row: {
          id: string;
          meal_id: string;
          client_id: string;
          author_id: string;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          meal_id: string;
          client_id: string;
          author_id: string;
          body: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          meal_id?: string;
          client_id?: string;
          author_id?: string;
          body?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_comments_meal_id_client_id_fkey";
            columns: ["meal_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "meals";
            referencedColumns: ["id", "client_id"];
          },
          {
            foreignKeyName: "meal_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_meal_items: {
        Args: {
          p_date: string;
          p_meal_type: string;
          p_items: Json;
          p_photo?: Json | null;
          p_request_id?: string | null;
        };
        Returns: string;
      };
      consume_meal_analysis_quota: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      copy_meal: {
        Args: { p_source_meal_id: string; p_date: string; p_meal_type: string; p_request_id?: string | null };
        Returns: string;
      };
      get_nutrition_days: {
        Args: { p_client_id: string; p_from: string; p_to: string };
        Returns: {
          day: string;
          target_id: string | null;
          target_effective_from: string | null;
          target_energy_kcal: number | null;
          target_protein_g: number | null;
          target_fat_g: number | null;
          target_carbs_g: number | null;
          energy_tolerance_kcal: number | null;
          protein_tolerance_g: number | null;
          fat_tolerance_g: number | null;
          carbs_tolerance_g: number | null;
          energy_kcal: number;
          protein_g: number;
          fat_g: number;
          carbs_g: number;
          item_count: number;
          meal_count: number;
        }[];
      };
      get_trainer_nutrition_overview: {
        Args: { p_date: string };
        Returns: {
          client_id: string;
          display_name: string;
          target_energy_kcal: number | null;
          target_protein_g: number | null;
          target_fat_g: number | null;
          target_carbs_g: number | null;
          energy_tolerance_kcal: number | null;
          protein_tolerance_g: number | null;
          fat_tolerance_g: number | null;
          carbs_tolerance_g: number | null;
          energy_kcal: number;
          protein_g: number;
          fat_g: number;
          carbs_g: number;
          item_count: number;
          meal_count: number;
          photo_count: number;
          last_logged_at: string | null;
          unread_comment_count: number;
          latest_weight_kg: number | null;
          latest_weight_date: string | null;
        }[];
      };
      mark_meal_comments_read: {
        Args: { p_meal_ids: string[] };
        Returns: number;
      };
      save_nutrition_target: {
        Args: {
          p_client_id: string;
          p_effective_from: string;
          p_energy_kcal: number;
          p_protein_g: number;
          p_fat_g: number;
          p_carbs_g: number;
          p_energy_tolerance_kcal: number;
          p_protein_tolerance_g: number;
          p_fat_tolerance_g: number;
          p_carbs_tolerance_g: number;
          p_note?: string | null;
        };
        Returns: Database["public"]["Tables"]["nutrition_targets"]["Row"];
      };
      accept_invite: {
        Args: { p_code: string };
        Returns: string;
      };
      add_set: {
        Args: { p_session_exercise_id: string };
        Returns: Database["public"]["Tables"]["set_logs"]["Row"];
      };
      complete_workout_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      create_client_invite: {
        Args: { p_label?: string | null };
        Returns: Database["public"]["Tables"]["client_invites"]["Row"];
      };
      discard_workout_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      get_exercise_name_suggestions: {
        Args: Record<PropertyKey, never>;
        Returns: { name: string }[];
      };
      get_invite_info: {
        Args: { p_code: string };
        Returns: { trainer_name: string; status: string }[];
      };
      get_previous_sets: {
        Args: { p_session_id: string };
        Returns: {
          exercise_key: string;
          session_id: string;
          performed_date: string;
          set_number: number;
          actual_weight_kg: number | null;
          actual_reps: number | null;
        }[];
      };
      get_trainer_dashboard: {
        Args: { p_date: string };
        Returns: {
          client_id: string;
          display_name: string;
          linked_at: string;
          checkin_date: string | null;
          sleep: number | null;
          fatigue: number | null;
          soreness: number | null;
          stress: number | null;
          motivation: number | null;
          body_weight_kg: number | null;
          checkin_note: string | null;
          last_checkin_date: string | null;
          last_session_id: string | null;
          last_session_title: string | null;
          last_session_date: string | null;
          last_session_status: string | null;
        }[];
      };
      mark_comments_read: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      remove_client: {
        Args: { p_client_id: string };
        Returns: undefined;
      };
      remove_last_set: {
        Args: { p_session_exercise_id: string };
        Returns: string;
      };
      save_workout_plan: {
        Args: {
          p_plan_id: string | null;
          p_client_id: string;
          p_title: string;
          p_scheduled_date: string | null;
          p_note: string | null;
          p_exercises: Json;
        };
        Returns: string;
      };
      start_workout_session: {
        Args: { p_plan_id: string; p_local_date: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type FunctionReturns<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Returns"];
