export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admin_role_assignments: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          id: string;
          role_code: string;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role_code: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role_code?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_role_assignments_role_code_fkey";
            columns: ["role_code"];
            isOneToOne: false;
            referencedRelation: "admin_roles";
            referencedColumns: ["code"];
          },
        ];
      };
      admin_roles: {
        Row: {
          code: string;
          description: string;
        };
        Insert: {
          code: string;
          description: string;
        };
        Update: {
          code?: string;
          description?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          actor_id: string | null;
          created_at: string;
          entity_id: string;
          entity_table: string;
          event_type: string;
          id: string;
          metadata: Json | null;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          entity_id: string;
          entity_table: string;
          event_type: string;
          id?: string;
          metadata?: Json | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_table?: string;
          event_type?: string;
          id?: string;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          parent_id: string | null;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          parent_id?: string | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          parent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      category_aliases: {
        Row: {
          alias: string;
          category_id: string;
          id: string;
          source_note: string | null;
        };
        Insert: {
          alias: string;
          category_id: string;
          id?: string;
          source_note?: string | null;
        };
        Update: {
          alias?: string;
          category_id?: string;
          id?: string;
          source_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "category_aliases_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      education_levels: {
        Row: {
          code: string;
          id: string;
          is_active: boolean;
          name: string;
          rank: number;
        };
        Insert: {
          code: string;
          id?: string;
          is_active?: boolean;
          name: string;
          rank: number;
        };
        Update: {
          code?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          rank?: number;
        };
        Relationships: [];
      };
      job_age_rules: {
        Row: {
          age_cutoff_date: string;
          id: string;
          is_confident: boolean;
          job_post_id: string;
          max_age: number | null;
          min_age: number | null;
          parse_note: string | null;
          relaxation_combination_mode: string;
        };
        Insert: {
          age_cutoff_date: string;
          id?: string;
          is_confident?: boolean;
          job_post_id: string;
          max_age?: number | null;
          min_age?: number | null;
          parse_note?: string | null;
          relaxation_combination_mode?: string;
        };
        Update: {
          age_cutoff_date?: string;
          id?: string;
          is_confident?: boolean;
          job_post_id?: string;
          max_age?: number | null;
          min_age?: number | null;
          parse_note?: string | null;
          relaxation_combination_mode?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_age_rules_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: true;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      job_documents: {
        Row: {
          checksum: string | null;
          created_at: string;
          document_type: string;
          downloaded_at: string | null;
          id: string;
          job_notification_id: string;
          published_date: string | null;
          source_url: string;
          storage_path: string | null;
          version: number;
        };
        Insert: {
          checksum?: string | null;
          created_at?: string;
          document_type: string;
          downloaded_at?: string | null;
          id?: string;
          job_notification_id: string;
          published_date?: string | null;
          source_url: string;
          storage_path?: string | null;
          version?: number;
        };
        Update: {
          checksum?: string | null;
          created_at?: string;
          document_type?: string;
          downloaded_at?: string | null;
          id?: string;
          job_notification_id?: string;
          published_date?: string | null;
          source_url?: string;
          storage_path?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "job_documents_job_notification_id_fkey";
            columns: ["job_notification_id"];
            isOneToOne: false;
            referencedRelation: "job_notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      job_experience_rules: {
        Row: {
          as_of_date: string | null;
          domain_note: string | null;
          id: string;
          is_confident: boolean;
          job_post_id: string;
          max_years: number | null;
          min_years: number | null;
          parse_note: string | null;
        };
        Insert: {
          as_of_date?: string | null;
          domain_note?: string | null;
          id?: string;
          is_confident?: boolean;
          job_post_id: string;
          max_years?: number | null;
          min_years?: number | null;
          parse_note?: string | null;
        };
        Update: {
          as_of_date?: string | null;
          domain_note?: string | null;
          id?: string;
          is_confident?: boolean;
          job_post_id?: string;
          max_years?: number | null;
          min_years?: number | null;
          parse_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_experience_rules_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: true;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      job_gender_rules: {
        Row: {
          allowed_gender: string;
          id: string;
          job_post_id: string;
        };
        Insert: {
          allowed_gender: string;
          id?: string;
          job_post_id: string;
        };
        Update: {
          allowed_gender?: string;
          id?: string;
          job_post_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_gender_rules_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: true;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      job_history: {
        Row: {
          change_reason: string | null;
          changed_at: string;
          changed_by: string | null;
          field_name: string;
          id: string;
          job_notification_id: string;
          job_post_id: string | null;
          new_value: string | null;
          old_value: string | null;
        };
        Insert: {
          change_reason?: string | null;
          changed_at?: string;
          changed_by?: string | null;
          field_name: string;
          id?: string;
          job_notification_id: string;
          job_post_id?: string | null;
          new_value?: string | null;
          old_value?: string | null;
        };
        Update: {
          change_reason?: string | null;
          changed_at?: string;
          changed_by?: string | null;
          field_name?: string;
          id?: string;
          job_notification_id?: string;
          job_post_id?: string | null;
          new_value?: string | null;
          old_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_history_job_notification_id_fkey";
            columns: ["job_notification_id"];
            isOneToOne: false;
            referencedRelation: "job_notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_history_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: false;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      job_imports: {
        Row: {
          ai_model: string | null;
          ai_provider: string | null;
          created_at: string;
          document_url: string | null;
          extracted_at: string | null;
          id: string;
          job_notification_id: string | null;
          job_source_id: string;
          raw_extraction_output: Json | null;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source_url: string;
          status: string;
          updated_at: string;
          validation_errors: Json | null;
        };
        Insert: {
          ai_model?: string | null;
          ai_provider?: string | null;
          created_at?: string;
          document_url?: string | null;
          extracted_at?: string | null;
          id?: string;
          job_notification_id?: string | null;
          job_source_id: string;
          raw_extraction_output?: Json | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_url: string;
          status: string;
          updated_at?: string;
          validation_errors?: Json | null;
        };
        Update: {
          ai_model?: string | null;
          ai_provider?: string | null;
          created_at?: string;
          document_url?: string | null;
          extracted_at?: string | null;
          id?: string;
          job_notification_id?: string | null;
          job_source_id?: string;
          raw_extraction_output?: Json | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_url?: string;
          status?: string;
          updated_at?: string;
          validation_errors?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_imports_job_notification_id_fkey";
            columns: ["job_notification_id"];
            isOneToOne: false;
            referencedRelation: "job_notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_imports_job_source_id_fkey";
            columns: ["job_source_id"];
            isOneToOne: false;
            referencedRelation: "job_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      job_notifications: {
        Row: {
          application_end_date: string | null;
          application_start_date: string | null;
          created_at: string;
          department_id: string | null;
          description: string | null;
          expires_at: string | null;
          id: string;
          notification_date: string;
          official_advertisement_url: string;
          official_application_url: string | null;
          organization_id: string;
          published_at: string | null;
          recruitment_type: string;
          slug: string;
          source_id: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          application_end_date?: string | null;
          application_start_date?: string | null;
          created_at?: string;
          department_id?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          notification_date: string;
          official_advertisement_url: string;
          official_application_url?: string | null;
          organization_id: string;
          published_at?: string | null;
          recruitment_type: string;
          slug: string;
          source_id: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          application_end_date?: string | null;
          application_start_date?: string | null;
          created_at?: string;
          department_id?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          notification_date?: string;
          official_advertisement_url?: string;
          official_application_url?: string | null;
          organization_id?: string;
          published_at?: string | null;
          recruitment_type?: string;
          slug?: string;
          source_id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_notifications_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_notifications_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "job_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_notifications_status_fkey";
            columns: ["status"];
            isOneToOne: false;
            referencedRelation: "job_statuses";
            referencedColumns: ["code"];
          },
        ];
      };
      job_posts: {
        Row: {
          created_at: string;
          id: string;
          job_notification_id: string;
          pay_scale_max: number | null;
          pay_scale_min: number | null;
          pay_scale_note: string | null;
          title: string;
          updated_at: string;
          vacancy_count: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_notification_id: string;
          pay_scale_max?: number | null;
          pay_scale_min?: number | null;
          pay_scale_note?: string | null;
          title: string;
          updated_at?: string;
          vacancy_count?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_notification_id?: string;
          pay_scale_max?: number | null;
          pay_scale_min?: number | null;
          pay_scale_note?: string | null;
          title?: string;
          updated_at?: string;
          vacancy_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_posts_job_notification_id_fkey";
            columns: ["job_notification_id"];
            isOneToOne: false;
            referencedRelation: "job_notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      job_qualification_requirements: {
        Row: {
          confidence_score: number | null;
          created_at: string;
          education_level_id: string | null;
          group_id: number;
          id: string;
          job_post_id: string;
          parse_note: string | null;
          qualification_id: string | null;
          updated_at: string;
          verification_status: string;
        };
        Insert: {
          confidence_score?: number | null;
          created_at?: string;
          education_level_id?: string | null;
          group_id?: number;
          id?: string;
          job_post_id: string;
          parse_note?: string | null;
          qualification_id?: string | null;
          updated_at?: string;
          verification_status?: string;
        };
        Update: {
          confidence_score?: number | null;
          created_at?: string;
          education_level_id?: string | null;
          group_id?: number;
          id?: string;
          job_post_id?: string;
          parse_note?: string | null;
          qualification_id?: string | null;
          updated_at?: string;
          verification_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_qualification_requirements_education_level_id_fkey";
            columns: ["education_level_id"];
            isOneToOne: false;
            referencedRelation: "education_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_qualification_requirements_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: false;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_qualification_requirements_qualification_id_fkey";
            columns: ["qualification_id"];
            isOneToOne: false;
            referencedRelation: "qualifications";
            referencedColumns: ["id"];
          },
        ];
      };
      job_relaxations: {
        Row: {
          age_relaxation_years: number;
          category_id: string | null;
          created_at: string;
          id: string;
          is_confident: boolean;
          job_post_id: string;
          parse_note: string | null;
          status_id: string | null;
        };
        Insert: {
          age_relaxation_years?: number;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          is_confident?: boolean;
          job_post_id: string;
          parse_note?: string | null;
          status_id?: string | null;
        };
        Update: {
          age_relaxation_years?: number;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          is_confident?: boolean;
          job_post_id?: string;
          parse_note?: string | null;
          status_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_relaxations_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_relaxations_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: false;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_relaxations_status_id_fkey";
            columns: ["status_id"];
            isOneToOne: false;
            referencedRelation: "statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      job_sources: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          last_checked_at: string | null;
          name: string;
          official_domain: string;
          organization_id: string | null;
          source_type: string;
          source_url: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          last_checked_at?: string | null;
          name: string;
          official_domain: string;
          organization_id?: string | null;
          source_type: string;
          source_url: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          last_checked_at?: string | null;
          name?: string;
          official_domain?: string;
          organization_id?: string | null;
          source_type?: string;
          source_url?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_sources_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      job_state_scope: {
        Row: {
          id: string;
          job_post_id: string;
          scope_type: string;
        };
        Insert: {
          id?: string;
          job_post_id: string;
          scope_type: string;
        };
        Update: {
          id?: string;
          job_post_id?: string;
          scope_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_state_scope_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: true;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      job_state_scope_states: {
        Row: {
          id: string;
          job_state_scope_id: string;
          state_id: string;
        };
        Insert: {
          id?: string;
          job_state_scope_id: string;
          state_id: string;
        };
        Update: {
          id?: string;
          job_state_scope_id?: string;
          state_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_state_scope_states_job_state_scope_id_fkey";
            columns: ["job_state_scope_id"];
            isOneToOne: false;
            referencedRelation: "job_state_scope";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_state_scope_states_state_id_fkey";
            columns: ["state_id"];
            isOneToOne: false;
            referencedRelation: "states";
            referencedColumns: ["id"];
          },
        ];
      };
      job_status_requirements: {
        Row: {
          created_at: string;
          id: string;
          is_confident: boolean;
          job_post_id: string;
          parse_note: string | null;
          requirement_type: string;
          status_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_confident?: boolean;
          job_post_id: string;
          parse_note?: string | null;
          requirement_type: string;
          status_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_confident?: boolean;
          job_post_id?: string;
          parse_note?: string | null;
          requirement_type?: string;
          status_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_status_requirements_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: false;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_status_requirements_status_id_fkey";
            columns: ["status_id"];
            isOneToOne: false;
            referencedRelation: "statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      job_statuses: {
        Row: {
          code: string;
          description: string;
          sort_order: number;
        };
        Insert: {
          code: string;
          description: string;
          sort_order: number;
        };
        Update: {
          code?: string;
          description?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          org_type: string;
          short_code: string | null;
          state_id: string | null;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          org_type: string;
          short_code?: string | null;
          state_id?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          org_type?: string;
          short_code?: string | null;
          state_id?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_state_id_fkey";
            columns: ["state_id"];
            isOneToOne: false;
            referencedRelation: "states";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_statuses: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          status_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          status_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          status_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_statuses_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_statuses_status_id_fkey";
            columns: ["status_id"];
            isOneToOne: false;
            referencedRelation: "statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          category_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          domicile_state_id: string | null;
          education_level_id: string | null;
          experience_years: number | null;
          full_name: string | null;
          gender: string | null;
          id: string;
          state_id: string | null;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          domicile_state_id?: string | null;
          education_level_id?: string | null;
          experience_years?: number | null;
          full_name?: string | null;
          gender?: string | null;
          id: string;
          state_id?: string | null;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          domicile_state_id?: string | null;
          education_level_id?: string | null;
          experience_years?: number | null;
          full_name?: string | null;
          gender?: string | null;
          id?: string;
          state_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_domicile_state_id_fkey";
            columns: ["domicile_state_id"];
            isOneToOne: false;
            referencedRelation: "states";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_education_level_id_fkey";
            columns: ["education_level_id"];
            isOneToOne: false;
            referencedRelation: "education_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_state_id_fkey";
            columns: ["state_id"];
            isOneToOne: false;
            referencedRelation: "states";
            referencedColumns: ["id"];
          },
        ];
      };
      qualifications: {
        Row: {
          code: string;
          created_at: string;
          education_level_id: string;
          field_of_study: string | null;
          id: string;
          is_generic: boolean;
          name: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          education_level_id: string;
          field_of_study?: string | null;
          id?: string;
          is_generic?: boolean;
          name: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          education_level_id?: string;
          field_of_study?: string | null;
          id?: string;
          is_generic?: boolean;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qualifications_education_level_id_fkey";
            columns: ["education_level_id"];
            isOneToOne: false;
            referencedRelation: "education_levels";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_attempts: {
        Row: {
          attempted_at: string;
          bucket_key: string;
          id: string;
        };
        Insert: {
          attempted_at?: string;
          bucket_key: string;
          id?: string;
        };
        Update: {
          attempted_at?: string;
          bucket_key?: string;
          id?: string;
        };
        Relationships: [];
      };
      saved_jobs: {
        Row: {
          id: string;
          job_post_id: string;
          profile_id: string;
          saved_at: string;
        };
        Insert: {
          id?: string;
          job_post_id: string;
          profile_id: string;
          saved_at?: string;
        };
        Update: {
          id?: string;
          job_post_id?: string;
          profile_id?: string;
          saved_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_post_id_fkey";
            columns: ["job_post_id"];
            isOneToOne: false;
            referencedRelation: "job_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_jobs_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      states: {
        Row: {
          code: string;
          id: string;
          is_active: boolean;
          is_union_territory: boolean;
          name: string;
        };
        Insert: {
          code: string;
          id?: string;
          is_active?: boolean;
          is_union_territory?: boolean;
          name: string;
        };
        Update: {
          code?: string;
          id?: string;
          is_active?: boolean;
          is_union_territory?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      statuses: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_qualifications: {
        Row: {
          created_at: string;
          id: string;
          institution: string | null;
          profile_id: string;
          qualification_id: string;
          year_completed: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          institution?: string | null;
          profile_id: string;
          qualification_id: string;
          year_completed?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          institution?: string | null;
          profile_id?: string;
          qualification_id?: string;
          year_completed?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_qualifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_qualifications_qualification_id_fkey";
            columns: ["qualification_id"];
            isOneToOne: false;
            referencedRelation: "qualifications";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: { check_user_id: string; min_role: string };
        Returns: boolean;
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
