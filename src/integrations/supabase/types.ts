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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      domaines: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          notes: string | null
          sp_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          sp_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          sp_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domaines_sp_id_fkey"
            columns: ["sp_id"]
            isOneToOne: false
            referencedRelation: "sps"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          file_name: string
          file_type: string
          id: string
          parcelle_id: string | null
          parsed: Json | null
          size_bytes: number | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_name: string
          file_type: string
          id?: string
          parcelle_id?: string | null
          parsed?: Json | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_name?: string
          file_type?: string
          id?: string
          parcelle_id?: string | null
          parsed?: Json | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          area_m2: number
          assigned_at: string | null
          assignee_name: string | null
          bornes: Json | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_reserve: boolean
          measurement_id: string | null
          parcelle_id: string
          polygon: Json
          updated_at: string
        }
        Insert: {
          area_m2?: number
          assigned_at?: string | null
          assignee_name?: string | null
          bornes?: Json | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_reserve?: boolean
          measurement_id?: string | null
          parcelle_id: string
          polygon?: Json
          updated_at?: string
        }
        Update: {
          area_m2?: number
          assigned_at?: string | null
          assignee_name?: string | null
          bornes?: Json | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_reserve?: boolean
          measurement_id?: string | null
          parcelle_id?: string
          polygon?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          area_m2: number
          created_at: string
          created_by: string | null
          device_profile: Json | null
          id: string
          notes: string | null
          parcelle_id: string | null
          perimeter_m: number
          points: Json
          qa: Json | null
          status: string
          trace: Json
          unit: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          area_m2?: number
          created_at?: string
          created_by?: string | null
          device_profile?: Json | null
          id?: string
          notes?: string | null
          parcelle_id?: string | null
          perimeter_m?: number
          points?: Json
          qa?: Json | null
          status?: string
          trace?: Json
          unit?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          area_m2?: number
          created_at?: string
          created_by?: string | null
          device_profile?: Json | null
          id?: string
          notes?: string | null
          parcelle_id?: string | null
          perimeter_m?: number
          points?: Json
          qa?: Json | null
          status?: string
          trace?: Json
          unit?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "measurements_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelle_assignments: {
        Row: {
          created_at: string
          id: string
          parcelle_id: string
          role_label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parcelle_id: string
          role_label?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parcelle_id?: string
          role_label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcelle_assignments_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelle_photos: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          parcelle_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          parcelle_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          parcelle_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcelle_photos_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelles: {
        Row: {
          code: string
          convention_date: string | null
          convention_status: string
          created_at: string
          created_by: string | null
          declared_area: number | null
          domaine_id: string
          group_photo: string | null
          id: string
          name: string | null
          notes: string | null
          owner_name: string
          owner_phone: string | null
          owner_photo: string | null
          parcelle_photo: string | null
          updated_at: string
        }
        Insert: {
          code: string
          convention_date?: string | null
          convention_status?: string
          created_at?: string
          created_by?: string | null
          declared_area?: number | null
          domaine_id: string
          group_photo?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          owner_name?: string
          owner_phone?: string | null
          owner_photo?: string | null
          parcelle_photo?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          convention_date?: string | null
          convention_status?: string
          created_at?: string
          created_by?: string | null
          declared_area?: number | null
          domaine_id?: string
          group_photo?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          owner_name?: string
          owner_phone?: string | null
          owner_photo?: string | null
          parcelle_photo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcelles_domaine_id_fkey"
            columns: ["domaine_id"]
            isOneToOne: false
            referencedRelation: "domaines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          disabled: boolean
          full_name: string
          id: string
          must_change_password: boolean
          phone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          full_name?: string
          id: string
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          disabled?: boolean
          full_name?: string
          id?: string
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      sps: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          departement: string
          district: string
          id: string
          name: string
          notes: string | null
          region: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          departement?: string
          district?: string
          id?: string
          name: string
          notes?: string | null
          region?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          departement?: string
          district?: string
          id?: string
          name?: string
          notes?: string | null
          region?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "agent" | "viewer"
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
    Enums: {
      app_role: ["admin", "agent", "viewer"],
    },
  },
} as const
