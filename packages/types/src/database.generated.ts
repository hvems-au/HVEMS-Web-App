// Generated from the hosted Supabase schema (project anvqykllajezwaasguqp).
// Do not edit by hand. Regenerate after each migration:
//   supabase gen types typescript --project-id anvqykllajezwaasguqp > packages/types/src/database.generated.ts

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
          default_meter_type: Database["public"]["Enums"]["meter_type"]
          id: string
          name: string
          required_fields: string[]
          sort_order: number
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["asset_category"]
          code: string
          default_meter_type: Database["public"]["Enums"]["meter_type"]
          id?: string
          name: string
          required_fields?: string[]
          sort_order?: number
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["asset_category"]
          code?: string
          default_meter_type?: Database["public"]["Enums"]["meter_type"]
          id?: string
          name?: string
          required_fields?: string[]
          sort_order?: number
        }
        Relationships: []
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
          asset_id: string
          delta: number
          id: number
          occurred_at: string
          organisation_id: string
          reason: string
        }
        Insert: {
          asset_id: string
          delta: number
          id?: never
          occurred_at?: string
          organisation_id: string
          reason: string
        }
        Update: {
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
          created_at: string
          created_by: string | null
          first_exceeded_free_allowance_at: string | null
          id: string
          kind: Database["public"]["Enums"]["organisation_kind"]
          legal_name: string | null
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
          created_at?: string
          created_by?: string | null
          first_exceeded_free_allowance_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["organisation_kind"]
          legal_name?: string | null
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
          created_at?: string
          created_by?: string | null
          first_exceeded_free_allowance_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["organisation_kind"]
          legal_name?: string | null
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
      security_events: {
        Row: {
          detail: Json
          event_type: string
          id: number
          occurred_at: string
          organisation_id: string | null
          user_id: string | null
        }
        Insert: {
          detail?: Json
          event_type: string
          id?: never
          occurred_at?: string
          organisation_id?: string | null
          user_id?: string | null
        }
        Update: {
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
      end_support_access: { Args: { p_grant_id: string }; Returns: undefined }
      import_assets: {
        Args: { p_dry_run?: boolean; p_organisation_id: string; p_rows: Json }
        Returns: Json
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
      my_staff_context: {
        Args: never
        Returns: {
          authorities: Database["public"]["Enums"]["platform_authority"][]
          mfa_satisfied: boolean
          role: Database["public"]["Enums"]["platform_role"]
        }[]
      }
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
      remove_member: {
        Args: { p_membership_id: string; p_reason?: string }
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
      start_support_access: {
        Args: { p_minutes: number; p_organisation_id: string; p_reason: string }
        Returns: string
      }
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
      asset_disposal: "retired" | "sold" | "other"
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
      identification_method:
        | "password"
        | "password_mfa"
        | "driver_pin"
        | "support_access"
        | "system"
        | "unverified"
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
      asset_disposal: ["retired", "sold", "other"],
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
      identification_method: [
        "password",
        "password_mfa",
        "driver_pin",
        "support_access",
        "system",
        "unverified",
      ],
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
