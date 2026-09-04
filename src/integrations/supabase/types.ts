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
      dictation_reviews: {
        Row: { id: string; user_id: string; card_id: string; deck_id: string; answer: string; rating: string; reviewed_at: string; legacy: Json | null };
        Insert: { id: string; user_id: string; card_id: string; deck_id: string; answer: string; rating: string; reviewed_at: string; legacy?: Json | null };
        Update: { id?: string };
        Relationships: [];
      }

      backup_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          emailed_to: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          size_bytes: number | null
          status: string
          storage_path: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          emailed_to?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          size_bytes?: number | null
          status: string
          storage_path?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          emailed_to?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          created_at: string
          email: string
          enabled: boolean
          include_media: boolean
          last_backup_at: string | null
          preferences: Json
          retention_count: number
          timezone: string
          updated_at: string
          user_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          email: string
          enabled?: boolean
          include_media?: boolean
          last_backup_at?: string | null
          preferences?: Json
          retention_count?: number
          timezone?: string
          updated_at?: string
          user_id: string
          weekday?: number
        }
        Update: {
          created_at?: string
          email?: string
          enabled?: boolean
          include_media?: boolean
          last_backup_at?: string | null
          preferences?: Json
          retention_count?: number
          timezone?: string
          updated_at?: string
          user_id?: string
          weekday?: number
        }
        Relationships: []
      }
      cards: {
        Row: {
          audio_id: string | null
          back: string
          card_type: string
          dictation_answer: string | null
          created_at: string
          deck_id: string
          due_date: string
          ease_factor: number
          flagged: boolean
          front: string
          id: string
          interval: number
          lapse_count: number
          progress_updated_at: string
          repetition: number
          review_count: number
          status: string
          steps_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_id?: string | null
          back: string
          card_type?: string
          dictation_answer?: string | null
          created_at?: string
          deck_id: string
          due_date?: string
          ease_factor?: number
          flagged?: boolean
          front: string
          id?: string
          interval?: number
          lapse_count?: number
          progress_updated_at?: string
          repetition?: number
          review_count?: number
          status?: string
          steps_index?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_id?: string | null
          back?: string
          card_type?: string
          dictation_answer?: string | null
          created_at?: string
          deck_id?: string
          due_date?: string
          ease_factor?: number
          flagged?: boolean
          front?: string
          id?: string
          interval?: number
          lapse_count?: number
          progress_updated_at?: string
          repetition?: number
          review_count?: number
          status?: string
          steps_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_audio_id_fkey"
            columns: ["audio_id"]
            isOneToOne: false
            referencedRelation: "deck_audios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_audios: {
        Row: {
          created_at: string
          deck_id: string
          file_path: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          file_path: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          file_path?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_audios_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          audio_count: number
          card_count: number
          content_updated_at: string
          created_at: string
          description: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          audio_count?: number
          card_count?: number
          content_updated_at?: string
          created_at?: string
          description?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          audio_count?: number
          card_count?: number
          content_updated_at?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      review_history: {
        Row: {
          card_id: string
          id: string
          rating: string
          reviewed_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          id?: string
          rating: string
          reviewed_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          id?: string
          rating?: string
          reviewed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
