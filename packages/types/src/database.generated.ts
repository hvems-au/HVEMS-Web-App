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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      asset_classes: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["asset_category"]
          code: string
          created_at: string
          created_by: string | null
          default_meter_type: Database["public"]["Enums"]["meter_type"]
          id: string
          name: string
          organisation_id: string | null
          required_fields: string[]
          sort_order: number
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["asset_category"]
          code: string
          created_at?: string
          created_by?: string | null
          default_meter_type: Database["public"]["Enums"]["meter_type"]
          id?: string
          name: string
          organisation_id?: string | null
          required_fields?: string[]
          sort_order?: number
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["asset_category"]
          code?: string
          created_at?: string
          created_by?: string | null
          default_meter_type?: Database["public"]["Enums"]["meter_type"]
          id?: string
          name?: string
          organisation_id?: string | null
          required_fields?: string[]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_classes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_condition_causes: {
        Row: {
          asset_id: string
          id: string
          kind: Database["public"]["Enums"]["condition_cause_kind"]
          opened_at: string
          opened_by: string | null
          organisation_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_id: string | null
          source_type: string
        }
        Insert: {
          asset_id: string
          id?: string
          kind: Database["public"]["Enums"]["condition_cause_kind"]
          opened_at?: string
          opened_by?: string | null
          organisation_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string | null
          source_type: string
        }
        Update: {
          asset_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["condition_cause_kind"]
          opened_at?: string
          opened_by?: string | null
          organisation_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_condition_causes_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      asset_condition_history: {
        Row: {
          asset_id: string
          cause_id: string | null
          cause_kind: Database["public"]["Enums"]["condition_cause_kind"] | null
          changed_at: string
          changed_by: string | null
          from_condition: Database["public"]["Enums"]["asset_condition"]
          id: number
          organisation_id: string
          to_condition: Database["public"]["Enums"]["asset_condition"]
        }
        Insert: {
          asset_id: string
          cause_id?: string | null
          cause_kind?:
            | Database["public"]["Enums"]["condition_cause_kind"]
            | null
          changed_at?: string
          changed_by?: string | null
          from_condition: Database["public"]["Enums"]["asset_condition"]
          id?: never
          organisation_id: string
          to_condition: Database["public"]["Enums"]["asset_condition"]
        }
        Update: {
          asset_id?: string
          cause_id?: string | null
          cause_kind?:
            | Database["public"]["Enums"]["condition_cause_kind"]
            | null
          changed_at?: string
          changed_by?: string | null
          from_condition?: Database["public"]["Enums"]["asset_condition"]
          id?: never
          organisation_id?: string
          to_condition?: Database["public"]["Enums"]["asset_condition"]
        }
        Relationships: [
          {
            foreignKeyName: "asset_condition_history_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "asset_condition_history_cause_id_fkey"
            columns: ["cause_id"]
            isOneToOne: false
            referencedRelation: "asset_condition_causes"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_count_events: {
        Row: {
          actor_user_id: string | null
          count_after: number | null
          count_before: number | null
          asset_id: string
          delta: number
          id: number
          occurred_at: string
          organisation_id: string
          reason: string
        }
        Insert: {
          actor_user_id?: string | null
          count_after?: number | null
          count_before?: number | null
          asset_id: string
          delta: number
          id?: never
          occurred_at?: string
          organisation_id: string
          reason: string
        }
        Update: {
          actor_user_id?: string | null
          count_after?: number | null
          count_before?: number | null
          asset_id?: string
          delta?: number
          id?: never
          occurred_at?: string
          organisation_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_count_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_count_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_operator_permissions: {
        Row: {
          asset_id: string | null
          created_at: string
          created_by: string | null
          id: string
          membership_id: string
          organisation_id: string
          site_id: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          membership_id: string
          organisation_id: string
          site_id?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          membership_id?: string
          organisation_id?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_operator_permissions_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "asset_operator_permissions_membership_id_organisation_id_fkey"
            columns: ["membership_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "org_memberships"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "asset_operator_permissions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_operator_permissions_site_id_organisation_id_fkey"
            columns: ["site_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      assets: {
        Row: {
          archive_disposal: Database["public"]["Enums"]["asset_disposal"] | null
          archive_effective_date: string | null
          archive_reason: string | null
          archived_at: string | null
          asset_class_id: string
          asset_number: string
          fire_suppression_fitted: boolean | null
          fops_fitted: boolean | null
          rops_fitted: boolean | null
          became_current_at: string
          client_id: string | null
          condition: Database["public"]["Enums"]["asset_condition"]
          condition_changed_at: string
          created_at: string
          created_by: string | null
          current_engine_hours: number | null
          current_odometer_km: number | null
          duplicate_reason: string | null
          engine_hours_read_at: string | null
          id: string
          make: string | null
          meter_type: Database["public"]["Enums"]["meter_type"]
          model: string | null
          notes: string | null
          odometer_read_at: string | null
          organisation_id: string
          owner_type: Database["public"]["Enums"]["asset_owner_type"]
          photo_path: string | null
          registration_number: string | null
          registration_state: string | null
          responsible_membership_id: string | null
          serial_number: string | null
          site_id: string | null
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          archive_disposal?:
            | Database["public"]["Enums"]["asset_disposal"]
            | null
          archive_effective_date?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          asset_class_id: string
          asset_number: string
          fire_suppression_fitted?: boolean | null
          fops_fitted?: boolean | null
          rops_fitted?: boolean | null
          became_current_at?: string
          client_id?: string | null
          condition?: Database["public"]["Enums"]["asset_condition"]
          condition_changed_at?: string
          created_at?: string
          created_by?: string | null
          current_engine_hours?: number | null
          current_odometer_km?: number | null
          duplicate_reason?: string | null
          engine_hours_read_at?: string | null
          id?: string
          make?: string | null
          meter_type?: Database["public"]["Enums"]["meter_type"]
          model?: string | null
          notes?: string | null
          odometer_read_at?: string | null
          organisation_id: string
          owner_type?: Database["public"]["Enums"]["asset_owner_type"]
          photo_path?: string | null
          registration_number?: string | null
          registration_state?: string | null
          responsible_membership_id?: string | null
          serial_number?: string | null
          site_id?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          archive_disposal?:
            | Database["public"]["Enums"]["asset_disposal"]
            | null
          archive_effective_date?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          asset_class_id?: string
          asset_number?: string
          fire_suppression_fitted?: boolean | null
          fops_fitted?: boolean | null
          rops_fitted?: boolean | null
          became_current_at?: string
          client_id?: string | null
          condition?: Database["public"]["Enums"]["asset_condition"]
          condition_changed_at?: string
          created_at?: string
          created_by?: string | null
          current_engine_hours?: number | null
          current_odometer_km?: number | null
          duplicate_reason?: string | null
          engine_hours_read_at?: string | null
          id?: string
          make?: string | null
          meter_type?: Database["public"]["Enums"]["meter_type"]
          model?: string | null
          notes?: string | null
          odometer_read_at?: string | null
          organisation_id?: string
          owner_type?: Database["public"]["Enums"]["asset_owner_type"]
          photo_path?: string | null
          registration_number?: string | null
          registration_state?: string | null
          responsible_membership_id?: string | null
          serial_number?: string | null
          site_id?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_asset_class_id_fkey"
            columns: ["asset_class_id"]
            isOneToOne: false
            referencedRelation: "asset_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_client_id_organisation_id_fkey"
            columns: ["client_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "assets_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_responsible_membership_id_organisation_id_fkey"
            columns: ["responsible_membership_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "org_memberships"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "assets_site_id_organisation_id_fkey"
            columns: ["site_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      audit_daily_digests: {
        Row: { audit_count: number; day: string; digest: string; prev_digest: string | null; sealed_at: string; security_count: number }
        Insert: { audit_count: number; day: string; digest: string; prev_digest?: string | null; sealed_at?: string; security_count: number }
        Update: { audit_count?: number; day?: string; digest?: string; prev_digest?: string | null; sealed_at?: string; security_count?: number }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_method: Database["public"]["Enums"]["identification_method"]
          actor_user_id: string | null
          changes: Json
          context: Json
          entity_id: string | null
          entity_type: string
          id: number
          occurred_at: string
          organisation_id: string | null
        }
        Insert: {
          action: string
          actor_method: Database["public"]["Enums"]["identification_method"]
          actor_user_id?: string | null
          changes?: Json
          context?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
          occurred_at?: string
          organisation_id?: string | null
        }
        Update: {
          action?: string
          actor_method?: Database["public"]["Enums"]["identification_method"]
          actor_user_id?: string | null
          changes?: Json
          context?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
          occurred_at?: string
          organisation_id?: string | null
        }
        Relationships: []
      }
      breakdowns: {
        Row: {
          asset_id: string
          cause_id: string | null
          description: string
          evidence_paths: string[]
          id: string
          location: string | null
          organisation_id: string
          reported_at: string
          reported_by: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          asset_id: string
          cause_id?: string | null
          description: string
          evidence_paths?: string[]
          id?: string
          location?: string | null
          organisation_id: string
          reported_at?: string
          reported_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          asset_id?: string
          cause_id?: string | null
          description?: string
          evidence_paths?: string[]
          id?: string
          location?: string | null
          organisation_id?: string
          reported_at?: string
          reported_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "breakdowns_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "breakdowns_cause_id_fkey"
            columns: ["cause_id"]
            isOneToOne: false
            referencedRelation: "asset_condition_causes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breakdowns_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          abn: string | null
          address: string | null
          archived_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          organisation_id: string
          updated_at: string
        }
        Insert: {
          abn?: string | null
          address?: string | null
          archived_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          organisation_id: string
          updated_at?: string
        }
        Update: {
          abn?: string | null
          address?: string | null
          archived_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      critical_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          asset_id: string
          escalation_level: number
          id: string
          kind: string
          last_escalated_at: string | null
          organisation_id: string
          raised_at: string
          source_id: string | null
          source_type: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          asset_id: string
          escalation_level?: number
          id?: string
          kind: string
          last_escalated_at?: string | null
          organisation_id: string
          raised_at?: string
          source_id?: string | null
          source_type: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          asset_id?: string
          escalation_level?: number
          id?: string
          kind?: string
          last_escalated_at?: string | null
          organisation_id?: string
          raised_at?: string
          source_id?: string | null
          source_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "critical_alerts_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "critical_alerts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      defects: {
        Row: {
          asset_id: string
          cause_id: string | null
          closed_at: string | null
          closed_by: string | null
          deferral_reason: string | null
          deferred_until: string | null
          description: string | null
          due_date: string | null
          evidence_paths: string[]
          id: string
          inspection_id: string | null
          item_code: string | null
          merged_into: string | null
          organisation_id: string
          repaired_by: string | null
          reported_at: string
          reported_by: string | null
          resolution_note: string | null
          severity: Database["public"]["Enums"]["defect_severity"]
          source: string
          status: Database["public"]["Enums"]["defect_status"]
          title: string
          triaged_at: string | null
          triaged_by: string | null
        }
        Insert: {
          asset_id: string
          cause_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          deferral_reason?: string | null
          deferred_until?: string | null
          description?: string | null
          due_date?: string | null
          evidence_paths?: string[]
          id?: string
          inspection_id?: string | null
          item_code?: string | null
          merged_into?: string | null
          organisation_id: string
          repaired_by?: string | null
          reported_at?: string
          reported_by?: string | null
          resolution_note?: string | null
          severity: Database["public"]["Enums"]["defect_severity"]
          source: string
          status?: Database["public"]["Enums"]["defect_status"]
          title: string
          triaged_at?: string | null
          triaged_by?: string | null
        }
        Update: {
          asset_id?: string
          cause_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          deferral_reason?: string | null
          deferred_until?: string | null
          description?: string | null
          due_date?: string | null
          evidence_paths?: string[]
          id?: string
          inspection_id?: string | null
          item_code?: string | null
          merged_into?: string | null
          organisation_id?: string
          repaired_by?: string | null
          reported_at?: string
          reported_by?: string | null
          resolution_note?: string | null
          severity?: Database["public"]["Enums"]["defect_severity"]
          source?: string
          status?: Database["public"]["Enums"]["defect_status"]
          title?: string
          triaged_at?: string | null
          triaged_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defects_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "defects_cause_id_fkey"
            columns: ["cause_id"]
            isOneToOne: false
            referencedRelation: "asset_condition_causes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_inspection_id_organisation_id_fkey"
            columns: ["inspection_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "defects_merged_into_fk"
            columns: ["merged_into", "organisation_id"]
            isOneToOne: false
            referencedRelation: "defects"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "defects_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string
          expired_notified_at: string | null
          expires_on: string | null
          id: string
          issued_by: string | null
          kind: string
          label: string | null
          number: string
          organisation_id: string
          updated_at: string
          warned_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id: string
          expired_notified_at?: string | null
          expires_on?: string | null
          id?: string
          issued_by?: string | null
          kind: string
          label?: string | null
          number: string
          organisation_id: string
          updated_at?: string
          warned_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string
          expired_notified_at?: string | null
          expires_on?: string | null
          id?: string
          issued_by?: string | null
          kind?: string
          label?: string | null
          number?: string
          organisation_id?: string
          updated_at?: string
          warned_at?: string | null
        }
        Relationships: []
      }
      driver_profiles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          driver_number: number
          failed_attempts: number
          full_name: string
          id: string
          last_sign_in_at: string | null
          locked_until: string | null
          membership_id: string | null
          organisation_id: string
          phone: string | null
          pin_hash: string | null
          setup_code_hash: string | null
          setup_expires_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          driver_number: number
          failed_attempts?: number
          full_name: string
          id?: string
          last_sign_in_at?: string | null
          locked_until?: string | null
          membership_id?: string | null
          organisation_id: string
          phone?: string | null
          pin_hash?: string | null
          setup_code_hash?: string | null
          setup_expires_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          driver_number?: number
          failed_attempts?: number
          full_name?: string
          id?: string
          last_sign_in_at?: string | null
          locked_until?: string | null
          membership_id?: string | null
          organisation_id?: string
          phone?: string | null
          pin_hash?: string | null
          setup_code_hash?: string | null
          setup_expires_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_profiles_membership_id_organisation_id_fkey"
            columns: ["membership_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "org_memberships"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "driver_profiles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_codes: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          id: string
          organisation_id: string
          revoke_reason: string | null
          revoked_at: string | null
          short_code: string
          token: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          short_code: string
          token: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          short_code?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_codes_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "equipment_codes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_subscription_consents: {
        Row: {
          consented_at: string
          consented_by: string
          free_assets: number
          id: string
          organisation_id: string
          payment_method_id: string | null
          price_per_asset_cents: number
          withdrawn_at: string | null
        }
        Insert: {
          consented_at?: string
          consented_by: string
          free_assets: number
          id?: string
          organisation_id: string
          payment_method_id?: string | null
          price_per_asset_cents: number
          withdrawn_at?: string | null
        }
        Update: {
          consented_at?: string
          consented_by?: string
          free_assets?: number
          id?: string
          organisation_id?: string
          payment_method_id?: string | null
          price_per_asset_cents?: number
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_subscription_consents_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_subscription_consents_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      holds: {
        Row: {
          asset_id: string
          cause_id: string | null
          id: string
          kind: string
          organisation_id: string
          placed_at: string
          placed_by: string | null
          reason: string
          removal_note: string | null
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          asset_id: string
          cause_id?: string | null
          id?: string
          kind: string
          organisation_id: string
          placed_at?: string
          placed_by?: string | null
          reason: string
          removal_note?: string | null
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          asset_id?: string
          cause_id?: string | null
          id?: string
          kind?: string
          organisation_id?: string
          placed_at?: string
          placed_by?: string | null
          reason?: string
          removal_note?: string | null
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holds_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "holds_cause_id_fkey"
            columns: ["cause_id"]
            isOneToOne: false
            referencedRelation: "asset_condition_causes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holds_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_answers: {
        Row: {
          answer: Database["public"]["Enums"]["inspection_answer"]
          id: number
          inspection_id: string
          item_code: string
          note: string | null
          operator_item: boolean
          organisation_id: string
          prompt: string
          severity: Database["public"]["Enums"]["defect_severity"]
          sort_order: number
          template_code: string
          template_name: string
        }
        Insert: {
          answer: Database["public"]["Enums"]["inspection_answer"]
          id?: never
          inspection_id: string
          item_code: string
          note?: string | null
          operator_item: boolean
          organisation_id: string
          prompt: string
          severity: Database["public"]["Enums"]["defect_severity"]
          sort_order: number
          template_code: string
          template_name: string
        }
        Update: {
          answer?: Database["public"]["Enums"]["inspection_answer"]
          id?: never
          inspection_id?: string
          item_code?: string
          note?: string | null
          operator_item?: boolean
          organisation_id?: string
          prompt?: string
          severity?: Database["public"]["Enums"]["defect_severity"]
          sort_order?: number
          template_code?: string
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_answers_inspection_id_organisation_id_fkey"
            columns: ["inspection_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      inspection_photos: {
        Row: {
          created_at: string
          id: string
          inspection_id: string
          item_code: string | null
          organisation_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspection_id: string
          item_code?: string | null
          organisation_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          inspection_id?: string
          item_code?: string | null
          organisation_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_photos_inspection_id_organisation_id_fkey"
            columns: ["inspection_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      inspection_template_items: {
        Row: {
          active: boolean
          code: string
          id: string
          na_allowed: boolean
          operator_item: boolean
          prompt: string
          requires_fitted: string | null
          severity: Database["public"]["Enums"]["defect_severity"]
          sort_order: number
          template_id: string
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          na_allowed?: boolean
          operator_item?: boolean
          prompt: string
          requires_fitted?: string | null
          severity: Database["public"]["Enums"]["defect_severity"]
          sort_order: number
          template_id: string
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          na_allowed?: boolean
          operator_item?: boolean
          prompt?: string
          requires_fitted?: string | null
          severity?: Database["public"]["Enums"]["defect_severity"]
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_templates: {
        Row: {
          active: boolean
          applies_to_all: boolean
          asset_class_codes: string[]
          code: string
          created_at: string
          exclude_class_codes: string[]
          id: string
          kind: string
          name: string
          organisation_id: string | null
          sort_order: number
          version: number
        }
        Insert: {
          active?: boolean
          applies_to_all?: boolean
          asset_class_codes?: string[]
          code: string
          created_at?: string
          exclude_class_codes?: string[]
          id?: string
          kind?: string
          name: string
          organisation_id?: string | null
          sort_order?: number
          version?: number
        }
        Update: {
          active?: boolean
          applies_to_all?: boolean
          asset_class_codes?: string[]
          code?: string
          created_at?: string
          exclude_class_codes?: string[]
          id?: string
          kind?: string
          name?: string
          organisation_id?: string | null
          sort_order?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inspection_templates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          asset_id: string
          client_request_id: string | null
          engine_hours: number | null
          header: Json
          id: string
          kind: string
          notes: string | null
          odometer_km: number | null
          operator_fault: boolean
          organisation_id: string
          result: Database["public"]["Enums"]["inspection_result"]
          submitted_at: string
          submitted_by: string
          templates: Json
        }
        Insert: {
          asset_id: string
          client_request_id?: string | null
          engine_hours?: number | null
          header: Json
          id?: string
          kind?: string
          notes?: string | null
          odometer_km?: number | null
          operator_fault?: boolean
          organisation_id: string
          result: Database["public"]["Enums"]["inspection_result"]
          submitted_at?: string
          submitted_by: string
          templates: Json
        }
        Update: {
          asset_id?: string
          client_request_id?: string | null
          engine_hours?: number | null
          header?: Json
          id?: string
          kind?: string
          notes?: string | null
          odometer_km?: number | null
          operator_fault?: boolean
          organisation_id?: string
          result?: Database["public"]["Enums"]["inspection_result"]
          submitted_at?: string
          submitted_by?: string
          templates?: Json
        }
        Relationships: [
          {
            foreignKeyName: "inspections_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "inspections_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organisation_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organisation_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organisation_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_grants: {
        Row: {
          approval_limit_cents: number | null
          assigned_at: string
          assigned_by: string | null
          competency_note: string | null
          grant_type: Database["public"]["Enums"]["member_grant"]
          id: string
          membership_id: string
          organisation_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          approval_limit_cents?: number | null
          assigned_at?: string
          assigned_by?: string | null
          competency_note?: string | null
          grant_type: Database["public"]["Enums"]["member_grant"]
          id?: string
          membership_id: string
          organisation_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          approval_limit_cents?: number | null
          assigned_at?: string
          assigned_by?: string | null
          competency_note?: string | null
          grant_type?: Database["public"]["Enums"]["member_grant"]
          id?: string
          membership_id?: string
          organisation_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_grants_membership_id_organisation_id_fkey"
            columns: ["membership_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "org_memberships"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: { code_hash: string; created_at: string; id: string; used_at: string | null; user_id: string }
        Insert: { code_hash: string; created_at?: string; id?: string; used_at?: string | null; user_id: string }
        Update: { code_hash?: string; created_at?: string; id?: string; used_at?: string | null; user_id?: string }
        Relationships: []
      }
      meter_readings: {
        Row: {
          amends_reading_id: string | null
          asset_id: string
          client_request_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          identification_method: Database["public"]["Enums"]["identification_method"]
          jump_confirmed: boolean
          lower_reading_reason: string | null
          organisation_id: string
          out_of_sequence: boolean
          read_at: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["meter_reading_source"]
          source_id: string | null
          status: Database["public"]["Enums"]["meter_reading_status"]
          unit: Database["public"]["Enums"]["meter_unit"]
          value: number
        }
        Insert: {
          amends_reading_id?: string | null
          asset_id: string
          client_request_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          identification_method: Database["public"]["Enums"]["identification_method"]
          jump_confirmed?: boolean
          lower_reading_reason?: string | null
          organisation_id: string
          out_of_sequence?: boolean
          read_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["meter_reading_source"]
          source_id?: string | null
          status: Database["public"]["Enums"]["meter_reading_status"]
          unit: Database["public"]["Enums"]["meter_unit"]
          value: number
        }
        Update: {
          amends_reading_id?: string | null
          asset_id?: string
          client_request_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          identification_method?: Database["public"]["Enums"]["identification_method"]
          jump_confirmed?: boolean
          lower_reading_reason?: string | null
          organisation_id?: string
          out_of_sequence?: boolean
          read_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["meter_reading_source"]
          source_id?: string | null
          status?: Database["public"]["Enums"]["meter_reading_status"]
          unit?: Database["public"]["Enums"]["meter_unit"]
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_amends_reading_id_fkey"
            columns: ["amends_reading_id"]
            isOneToOne: false
            referencedRelation: "meter_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      notifications: {
        Row: {
          alert_id: string | null
          asset_id: string | null
          body: string | null
          created_at: string
          id: string
          inspection_id: string | null
          kind: string
          organisation_id: string
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          alert_id?: string | null
          asset_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          inspection_id?: string | null
          kind: string
          organisation_id: string
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          alert_id?: string | null
          asset_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          inspection_id?: string | null
          kind?: string
          organisation_id?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_alert_fk"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "critical_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          organisation_id: string
          removed_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organisation_id: string
          removed_at?: string | null
          role: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organisation_id?: string
          removed_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          abn: string | null
          closed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          first_exceeded_free_allowance_at: string | null
          id: string
          kind: Database["public"]["Enums"]["organisation_kind"]
          legal_name: string | null
          logo_path: string | null
          name: string
          settings: Json
          status: Database["public"]["Enums"]["organisation_status"]
          suspended_at: string | null
          suspension_reason: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          abn?: string | null
          closed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          first_exceeded_free_allowance_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["organisation_kind"]
          legal_name?: string | null
          logo_path?: string | null
          name: string
          settings?: Json
          status?: Database["public"]["Enums"]["organisation_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          abn?: string | null
          closed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          first_exceeded_free_allowance_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["organisation_kind"]
          legal_name?: string | null
          logo_path?: string | null
          name?: string
          settings?: Json
          status?: Database["public"]["Enums"]["organisation_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      password_lockouts: {
        Row: { email: string; failed_count: number; last_failed_at: string | null; locked_until: string | null }
        Insert: { email: string; failed_count?: number; last_failed_at?: string | null; locked_until?: string | null }
        Update: { email?: string; failed_count?: number; last_failed_at?: string | null; locked_until?: string | null }
        Relationships: []
      }
      payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          detached_at: string | null
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          organisation_id: string
          stripe_payment_method_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          detached_at?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          organisation_id: string
          stripe_payment_method_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          detached_at?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          organisation_id?: string
          stripe_payment_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string
          key: string
          sow_reference: string | null
          status: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description: string
          key: string
          sow_reference?: string | null
          status: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string
          key?: string
          sow_reference?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_staff: {
        Row: {
          active: boolean
          authorities: Database["public"]["Enums"]["platform_authority"][]
          created_at: string
          created_by: string | null
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          authorities?: Database["public"]["Enums"]["platform_authority"][]
          created_at?: string
          created_by?: string | null
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          authorities?: Database["public"]["Enums"]["platform_authority"][]
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          deactivated_at: string | null
          email: string
          email_bounced_at: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          email: string
          email_bounced_at?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          email?: string
          email_bounced_at?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      regulator_notices: {
        Row: {
          asset_id: string
          authority: string
          cause_id: string | null
          clear_by: string | null
          clearance_reference: string | null
          cleared_by: string | null
          cleared_on: string | null
          details: string
          evidence_paths: string[]
          id: string
          issued_on: string
          notice_number: string | null
          organisation_id: string
          recorded_at: string
          recorded_by: string | null
          severity: string
          status: string
        }
        Insert: {
          asset_id: string
          authority: string
          cause_id?: string | null
          clear_by?: string | null
          clearance_reference?: string | null
          cleared_by?: string | null
          cleared_on?: string | null
          details: string
          evidence_paths?: string[]
          id?: string
          issued_on: string
          notice_number?: string | null
          organisation_id: string
          recorded_at?: string
          recorded_by?: string | null
          severity: string
          status?: string
        }
        Update: {
          asset_id?: string
          authority?: string
          cause_id?: string | null
          clear_by?: string | null
          clearance_reference?: string | null
          cleared_by?: string | null
          cleared_on?: string | null
          details?: string
          evidence_paths?: string[]
          id?: string
          issued_on?: string
          notice_number?: string | null
          organisation_id?: string
          recorded_at?: string
          recorded_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulator_notices_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "regulator_notices_cause_id_fkey"
            columns: ["cause_id"]
            isOneToOne: false
            referencedRelation: "asset_condition_causes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulator_notices_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      return_to_service_events: {
        Row: {
          asset_id: string
          evidence_paths: string[]
          id: string
          note: string
          organisation_id: string
          returned_at: string
          returned_by: string
        }
        Insert: {
          asset_id: string
          evidence_paths?: string[]
          id?: string
          note: string
          organisation_id: string
          returned_at?: string
          returned_by: string
        }
        Update: {
          asset_id?: string
          evidence_paths?: string[]
          id?: string
          note?: string
          organisation_id?: string
          returned_at?: string
          returned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_to_service_events_asset_id_organisation_id_fkey"
            columns: ["asset_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "return_to_service_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          context: Json
          detail: Json
          event_type: string
          id: number
          occurred_at: string
          organisation_id: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          detail?: Json
          event_type: string
          id?: never
          occurred_at?: string
          organisation_id?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          detail?: Json
          event_type?: string
          id?: never
          occurred_at?: string
          organisation_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sites: {
        Row: {
          access_instructions: string | null
          address_line1: string | null
          address_line2: string | null
          archived_at: string | null
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          organisation_id: string
          postcode: string | null
          safety_instructions: string | null
          shift_times: string | null
          state: string | null
          suburb: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          access_instructions?: string | null
          address_line1?: string | null
          address_line2?: string | null
          archived_at?: string | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organisation_id: string
          postcode?: string | null
          safety_instructions?: string | null
          shift_times?: string | null
          state?: string | null
          suburb?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          access_instructions?: string | null
          address_line1?: string | null
          address_line2?: string | null
          archived_at?: string | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organisation_id?: string
          postcode?: string | null
          safety_instructions?: string | null
          shift_times?: string | null
          state?: string | null
          suburb?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_id_organisation_id_fkey"
            columns: ["client_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "sites_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_grants: {
        Row: {
          ended_by: string | null
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          organisation_id: string
          reason: string
          staff_user_id: string
          starts_at: string
        }
        Insert: {
          ended_by?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at: string
          id?: string
          organisation_id: string
          reason: string
          staff_user_id: string
          starts_at?: string
        }
        Update: {
          ended_by?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          organisation_id?: string
          reason?: string
          staff_user_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_grants_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      acknowledge_alert: { Args: { p_alert_id: string }; Returns: undefined }
      admin_reset_user_mfa: { Args: { p_reason: string; p_user_id: string }; Returns: string }
      admin_unlock_sign_in: { Args: { p_user_id: string }; Returns: undefined }
      admin_set_organisation_suspended: {
        Args: {
          p_organisation_id: string
          p_reason: string
          p_suspend: boolean
        }
        Returns: Database["public"]["Enums"]["organisation_status"]
      }
      admin_update_organisation: {
        Args: {
          p_abn: string
          p_legal_name: string
          p_name: string
          p_organisation_id: string
          p_timezone: string
        }
        Returns: undefined
      }
      amend_meter_reading: {
        Args: { p_reading_id: string; p_reason: string; p_value: number }
        Returns: string
      }
      archive_asset: {
        Args: {
          p_asset_id: string
          p_disposal?: Database["public"]["Enums"]["asset_disposal"]
          p_effective_date: string
          p_open_issues_acknowledged?: boolean
          p_reason: string
        }
        Returns: undefined
      }
      assign_grant: {
        Args: {
          p_approval_limit_cents?: number
          p_competency_note?: string
          p_grant: Database["public"]["Enums"]["member_grant"]
          p_membership_id: string
        }
        Returns: string
      }
      clear_defect: {
        Args: {
          p_defect_id: string
          p_evidence?: string[]
          p_repair_details: string
          p_repaired_by?: string
        }
        Returns: Json
      }
      clear_regulator_notice: {
        Args: {
          p_cleared_on: string
          p_evidence?: string[]
          p_notice_id: string
          p_reference: string
        }
        Returns: undefined
      }
      create_asset_class: {
        Args: {
          p_category: Database["public"]["Enums"]["asset_category"]
          p_default_meter_type: Database["public"]["Enums"]["meter_type"]
          p_name: string
          p_organisation_id: string
        }
        Returns: {
          active: boolean
          category: Database["public"]["Enums"]["asset_category"]
          code: string
          created_at: string
          created_by: string | null
          default_meter_type: Database["public"]["Enums"]["meter_type"]
          id: string
          name: string
          organisation_id: string | null
          required_fields: string[]
          sort_order: number
        }
        SetofOptions: {
          from: "*"
          to: "asset_classes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_driver_profile: {
        Args: {
          p_full_name: string
          p_organisation_id: string
          p_phone?: string
        }
        Returns: Json
      }
      create_invitation: {
        Args: {
          p_email: string
          p_organisation_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      create_organisation: {
        Args: {
          p_abn?: string
          p_kind: Database["public"]["Enums"]["organisation_kind"]
          p_name: string
        }
        Returns: string
      }
      decide_meter_reading: {
        Args: { p_accept: boolean; p_note?: string; p_reading_id: string }
        Returns: undefined
      }
      defer_defect: {
        Args: { p_defect_id: string; p_new_due: string; p_reason: string }
        Returns: undefined
      }
      dismiss_defect: {
        Args: { p_defect_id: string; p_reason: string }
        Returns: undefined
      }
      driver_sign_in: {
        Args: {
          p_code: string
          p_driver_number: number
          p_new_pin?: string
          p_secret: string
        }
        Returns: Json
      }
      end_support_access: { Args: { p_grant_id: string }; Returns: undefined }
      equipment_public: { Args: { p_code: string }; Returns: Json }
      generate_equipment_code: {
        Args: { p_asset_id: string; p_replace_reason?: string }
        Returns: string
      }
      import_assets: {
        Args: { p_dry_run?: boolean; p_organisation_id: string; p_rows: Json }
        Returns: Json
      }
      link_driver_account: {
        Args: { p_driver_id: string; p_user_id: string }
        Returns: undefined
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      member_sign_in_locks: {
        Args: { p_organisation_id: string }
        Returns: { failed_count: number; locked_until: string | null; membership_id: string }[]
      }
      merge_defect: {
        Args: { p_defect_id: string; p_into_id: string; p_reason?: string }
        Returns: undefined
      }
      my_capabilities: {
        Args: { p_organisation_id: string }
        Returns: string[]
      }
      my_contexts: {
        Args: never
        Returns: {
          kind: Database["public"]["Enums"]["organisation_kind"]
          mfa_required: boolean
          organisation_id: string
          organisation_name: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["organisation_status"]
        }[]
      }
      my_mfa_recovery_status: { Args: never; Returns: Json }
      my_support_pin: { Args: { p_organisation_id: string }; Returns: Json }
      rotate_support_pin: { Args: { p_organisation_id: string }; Returns: Json }
      my_staff_context: {
        Args: never
        Returns: {
          authorities: Database["public"]["Enums"]["platform_authority"][]
          mfa_satisfied: boolean
          role: Database["public"]["Enums"]["platform_role"]
        }[]
      }
      password_sign_in_status: { Args: { p_email: string }; Returns: Json }
      owner_end_support_access: { Args: { p_grant_id: string }; Returns: undefined }
      place_hold: {
        Args: { p_asset_id: string; p_kind: string; p_reason: string }
        Returns: string
      }
      prestart_checklist: { Args: { p_asset_id: string }; Returns: Json }
      record_password_sign_in: { Args: { p_email: string; p_portal?: string; p_success: boolean }; Returns: Json }
      record_fleet_subscription_consent: {
        Args: {
          p_free_assets: number
          p_organisation_id: string
          p_price_per_asset_cents: number
        }
        Returns: string
      }
      record_meter_reading: {
        Args: {
          p_add_meter?: boolean
          p_asset_id: string
          p_client_request_id?: string
          p_confirm_jump?: boolean
          p_lower_reason?: string
          p_read_at?: string
          p_source?: Database["public"]["Enums"]["meter_reading_source"]
          p_unit: Database["public"]["Enums"]["meter_unit"]
          p_value: number
        }
        Returns: {
          amends_reading_id: string | null
          asset_id: string
          client_request_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          identification_method: Database["public"]["Enums"]["identification_method"]
          jump_confirmed: boolean
          lower_reading_reason: string | null
          organisation_id: string
          out_of_sequence: boolean
          read_at: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["meter_reading_source"]
          source_id: string | null
          status: Database["public"]["Enums"]["meter_reading_status"]
          unit: Database["public"]["Enums"]["meter_unit"]
          value: number
        }
        SetofOptions: {
          from: "*"
          to: "meter_readings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_regulator_notice: {
        Args: {
          p_asset_id: string
          p_authority: string
          p_clear_by?: string
          p_details: string
          p_evidence?: string[]
          p_issued_on: string
          p_notice_number?: string
          p_severity: string
        }
        Returns: string
      }
      remove_hold: {
        Args: { p_hold_id: string; p_note: string }
        Returns: Json
      }
      remove_member: {
        Args: { p_membership_id: string; p_reason?: string }
        Returns: undefined
      }
      report_breakdown: {
        Args: {
          p_asset_id: string
          p_description: string
          p_evidence?: string[]
          p_location?: string
        }
        Returns: string
      }
      generate_mfa_recovery_codes: { Args: never; Returns: string[] }
      reset_member_mfa: { Args: { p_membership_id: string; p_reason: string }; Returns: string }
      verify_audit_chain: { Args: { p_from?: string; p_to?: string }; Returns: Json }
      use_mfa_recovery_code: { Args: { p_code: string }; Returns: Json }
      reset_driver_setup: { Args: { p_driver_id: string }; Returns: Json }
      resolve_breakdown: {
        Args: {
          p_breakdown_id: string
          p_evidence?: string[]
          p_resolution: string
        }
        Returns: undefined
      }
      return_to_service: {
        Args: { p_asset_id: string; p_evidence?: string[]; p_note: string }
        Returns: undefined
      }
      revoke_grant: {
        Args: { p_grant_id: string; p_reason: string }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_driver_active: {
        Args: { p_active: boolean; p_driver_id: string }
        Returns: undefined
      }
      start_support_access: {
        Args: { p_minutes: number; p_organisation_id: string; p_pin: string; p_reason: string }
        Returns: Json
      }
      submit_prestart: {
        Args: {
          p_answers: Json
          p_asset_id: string
          p_client_request_id?: string
          p_confirm_jump?: boolean
          p_declaration?: boolean
          p_engine_hours?: number
          p_lower_reading_reason?: string
          p_notes?: string
          p_odometer_km?: number
          p_photos?: Json
        }
        Returns: Json
      }
      triage_defect: {
        Args: {
          p_defect_id: string
          p_evidence?: string[]
          p_reason?: string
          p_severity: Database["public"]["Enums"]["defect_severity"]
        }
        Returns: undefined
      }
      unlock_member_sign_in: { Args: { p_membership_id: string }; Returns: undefined }
      update_member_role: {
        Args: {
          p_membership_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: undefined
      }
    }
    Enums: {
      asset_category: "vehicle" | "equipment"
      asset_condition: "active" | "needs_attention" | "out_of_service"
      asset_disposal:
        | "disposed"
        | "transferred_out"
        | "written_off"
        | "sold"
        | "other"
      asset_owner_type: "own" | "client_owned" | "hired_in"
      condition_cause_kind:
        | "critical_defect"
        | "unverified_unsafe_report"
        | "critical_finding_awaiting_review"
        | "out_of_service_hold"
        | "awaiting_return_to_service"
        | "minor_defect"
        | "needs_attention_hold"
        | "overdue_service"
      defect_severity: "critical" | "minor" | "advisory"
      defect_status: "open" | "closed" | "repaired" | "dismissed" | "merged"
      identification_method:
        | "password"
        | "password_mfa"
        | "driver_pin"
        | "support_access"
        | "system"
        | "unverified"
      inspection_answer: "ok" | "fault" | "na"
      inspection_result: "pass" | "pass_with_faults" | "fail"
      member_grant:
        | "clearance_authority"
        | "approval_limit"
        | "marketplace_buyer"
      member_role:
        | "owner"
        | "administrator"
        | "fleet_manager"
        | "technician"
        | "driver_operator"
        | "finance"
        | "viewer"
        | "account_owner"
        | "job_manager"
        | "provider_owner"
        | "provider_manager"
        | "provider_technician"
      membership_status: "active" | "suspended" | "removed"
      meter_reading_source:
        | "manual"
        | "inspection"
        | "work_order"
        | "import"
        | "onboarding"
      meter_reading_status:
        | "accepted"
        | "pending_acceptance"
        | "rejected"
        | "superseded"
      meter_type: "none" | "kilometres" | "hours" | "both"
      meter_unit: "km" | "hours"
      organisation_kind: "company" | "marketplace_customer" | "provider"
      organisation_status:
        | "active"
        | "restricted"
        | "suspended"
        | "closing"
        | "closed"
      platform_authority: "verification_officer" | "billing_approver"
      platform_role: "platform_administrator" | "support_agent"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      asset_category: ["vehicle", "equipment"],
      asset_condition: ["active", "needs_attention", "out_of_service"],
      asset_disposal: [
        "disposed",
        "transferred_out",
        "written_off",
        "sold",
        "other",
      ],
      asset_owner_type: ["own", "client_owned", "hired_in"],
      condition_cause_kind: [
        "critical_defect",
        "unverified_unsafe_report",
        "critical_finding_awaiting_review",
        "out_of_service_hold",
        "awaiting_return_to_service",
        "minor_defect",
        "needs_attention_hold",
        "overdue_service",
      ],
      defect_severity: ["critical", "minor", "advisory"],
      defect_status: ["open", "closed", "repaired", "dismissed", "merged"],
      identification_method: [
        "password",
        "password_mfa",
        "driver_pin",
        "support_access",
        "system",
        "unverified",
      ],
      inspection_answer: ["ok", "fault", "na"],
      inspection_result: ["pass", "pass_with_faults", "fail"],
      member_grant: [
        "clearance_authority",
        "approval_limit",
        "marketplace_buyer",
      ],
      member_role: [
        "owner",
        "administrator",
        "fleet_manager",
        "technician",
        "driver_operator",
        "finance",
        "viewer",
        "account_owner",
        "job_manager",
        "provider_owner",
        "provider_manager",
        "provider_technician",
      ],
      membership_status: ["active", "suspended", "removed"],
      meter_reading_source: [
        "manual",
        "inspection",
        "work_order",
        "import",
        "onboarding",
      ],
      meter_reading_status: [
        "accepted",
        "pending_acceptance",
        "rejected",
        "superseded",
      ],
      meter_type: ["none", "kilometres", "hours", "both"],
      meter_unit: ["km", "hours"],
      organisation_kind: ["company", "marketplace_customer", "provider"],
      organisation_status: [
        "active",
        "restricted",
        "suspended",
        "closing",
        "closed",
      ],
      platform_authority: ["verification_officer", "billing_approver"],
      platform_role: ["platform_administrator", "support_agent"],
    },
  },
} as const
