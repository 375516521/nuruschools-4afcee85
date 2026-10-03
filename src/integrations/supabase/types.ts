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
      academic_years: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          school_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          school_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          school_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_counters: {
        Row: {
          id: string
          last_sequence: number
          school_id: string
          year: number
        }
        Insert: {
          id?: string
          last_sequence?: number
          school_id: string
          year: number
        }
        Update: {
          id?: string
          last_sequence?: number
          school_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "admission_counters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_tag: string | null
          category: string | null
          condition: string
          created_at: string
          grade_id: string | null
          id: string
          location: string | null
          name: string
          photo_url: string | null
          purchased_on: string | null
          quantity: number
          school_id: string
          serial_number: string | null
          stream_id: string | null
          updated_at: string
          value: number
        }
        Insert: {
          asset_tag?: string | null
          category?: string | null
          condition?: string
          created_at?: string
          grade_id?: string | null
          id?: string
          location?: string | null
          name: string
          photo_url?: string | null
          purchased_on?: string | null
          quantity?: number
          school_id: string
          serial_number?: string | null
          stream_id?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          asset_tag?: string | null
          category?: string | null
          condition?: string
          created_at?: string
          grade_id?: string | null
          id?: string
          location?: string | null
          name?: string
          photo_url?: string | null
          purchased_on?: string | null
          quantity?: number
          school_id?: string
          serial_number?: string | null
          stream_id?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          afternoon_status: string
          created_at: string
          date: string
          grade_id: string | null
          id: string
          marked_by: string | null
          morning_status: string
          remark: string | null
          school_id: string
          status: string
          stream_id: string | null
          student_id: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          afternoon_status?: string
          created_at?: string
          date?: string
          grade_id?: string | null
          id?: string
          marked_by?: string | null
          morning_status?: string
          remark?: string | null
          school_id: string
          status?: string
          stream_id?: string | null
          student_id: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          afternoon_status?: string
          created_at?: string
          date?: string
          grade_id?: string | null
          id?: string
          marked_by?: string | null
          morning_status?: string
          remark?: string | null
          school_id?: string
          status?: string
          stream_id?: string | null
          student_id?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          ip_address: string | null
          school_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          school_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          school_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      competency_scores: {
        Row: {
          competency: string
          id: string
          level: Database["public"]["Enums"]["cbc_level"]
          school_id: string
          student_id: string
          term_id: string
        }
        Insert: {
          competency: string
          id?: string
          level: Database["public"]["Enums"]["cbc_level"]
          school_id: string
          student_id: string
          term_id: string
        }
        Update: {
          competency?: string
          id?: string
          level?: Database["public"]["Enums"]["cbc_level"]
          school_id?: string
          student_id?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competency_scores_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competency_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competency_scores_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          academic_year_id: string
          created_at: string
          grade_id: string
          id: string
          is_active: boolean
          max_score: number
          name: string
          school_id: string
          stream_id: string | null
          term_id: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          grade_id: string
          id?: string
          is_active?: boolean
          max_score?: number
          name: string
          school_id: string
          stream_id?: string | null
          term_id: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          grade_id?: string
          id?: string
          is_active?: boolean
          max_score?: number
          name?: string
          school_id?: string
          stream_id?: string | null
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_discounts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          school_id: string
          student_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          school_id: string
          student_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          school_id?: string
          student_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_discounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_discounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_discounts_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string
          recorded_by: string | null
          reference: string | null
          school_id: string
          student_id: string
          term_id: string
        }
        Insert: {
          amount: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          school_id: string
          student_id: string
          term_id: string
        }
        Update: {
          amount?: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          school_id?: string
          student_id?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          academic_year_id: string
          amount: number
          grade_id: string
          id: string
          item: string
          school_id: string
          stream_id: string | null
          term_id: string
        }
        Insert: {
          academic_year_id: string
          amount?: number
          grade_id: string
          id?: string
          item?: string
          school_id: string
          stream_id?: string | null
          term_id: string
        }
        Update: {
          academic_year_id?: string
          amount?: number
          grade_id?: string
          id?: string
          item?: string
          school_id?: string
          stream_id?: string | null
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_id_configs: {
        Row: {
          grade_id: string
          id: string
          id_prefix: string
          last_number: number
          school_id: string
          start_number: number
          upto_number: number
        }
        Insert: {
          grade_id: string
          id?: string
          id_prefix: string
          last_number?: number
          school_id: string
          start_number?: number
          upto_number?: number
        }
        Update: {
          grade_id?: string
          id?: string
          id_prefix?: string
          last_number?: number
          school_id?: string
          start_number?: number
          upto_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_id_configs_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: true
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_id_configs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          band: Database["public"]["Enums"]["grade_band"]
          id: string
          level_order: number
          name: string
          school_id: string
        }
        Insert: {
          band: Database["public"]["Enums"]["grade_band"]
          id?: string
          level_order: number
          name: string
          school_id: string
        }
        Update: {
          band?: Database["public"]["Enums"]["grade_band"]
          id?: string
          level_order?: number
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hoi_access: {
        Row: {
          created_at: string
          grade_ids: string[]
          id: string
          modules: string[]
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grade_ids?: string[]
          id?: string
          modules?: string[]
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grade_ids?: string[]
          id?: string
          modules?: string[]
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hoi_access_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      library_books: {
        Row: {
          author: string | null
          available_copies: number
          category: string | null
          created_at: string
          id: string
          isbn: string | null
          school_id: string
          shelf: string | null
          title: string
          total_copies: number
          updated_at: string
        }
        Insert: {
          author?: string | null
          available_copies?: number
          category?: string | null
          created_at?: string
          id?: string
          isbn?: string | null
          school_id: string
          shelf?: string | null
          title: string
          total_copies?: number
          updated_at?: string
        }
        Update: {
          author?: string | null
          available_copies?: number
          category?: string | null
          created_at?: string
          id?: string
          isbn?: string | null
          school_id?: string
          shelf?: string | null
          title?: string
          total_copies?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_books_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      library_loans: {
        Row: {
          book_id: string
          borrowed_on: string
          created_at: string
          due_on: string | null
          id: string
          returned_on: string | null
          school_id: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          borrowed_on?: string
          created_at?: string
          due_on?: string | null
          id?: string
          returned_on?: string | null
          school_id: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          borrowed_on?: string
          created_at?: string
          due_on?: string | null
          id?: string
          returned_on?: string | null
          school_id?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_loans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_loans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      marks: {
        Row: {
          comment: string | null
          exam_id: string
          id: string
          performance_level: string | null
          school_id: string
          score: number | null
          student_id: string
          subject_id: string
        }
        Insert: {
          comment?: string | null
          exam_id: string
          id?: string
          performance_level?: string | null
          school_id: string
          score?: number | null
          student_id: string
          subject_id: string
        }
        Update: {
          comment?: string | null
          exam_id?: string
          id?: string
          performance_level?: string | null
          school_id?: string
          score?: number | null
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_transactions: {
        Row: {
          account_reference: string | null
          amount: number
          checkout_request_id: string | null
          created_at: string
          id: string
          initiated_by: string | null
          merchant_request_id: string | null
          mpesa_receipt: string | null
          payment_id: string | null
          phone: string
          result_code: string | null
          result_desc: string | null
          school_id: string
          status: string
          student_id: string | null
          term_id: string | null
          updated_at: string
        }
        Insert: {
          account_reference?: string | null
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          payment_id?: string | null
          phone: string
          result_code?: string | null
          result_desc?: string | null
          school_id: string
          status?: string
          student_id?: string | null
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          account_reference?: string | null
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          payment_id?: string | null
          phone?: string
          result_code?: string | null
          result_desc?: string | null
          school_id?: string
          status?: string
          student_id?: string | null
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "fee_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_events: {
        Row: {
          acknowledged: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string | null
          school_id: string | null
          stage: string
          user_id: string | null
        }
        Insert: {
          acknowledged?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          role?: string | null
          school_id?: string | null
          stage?: string
          user_id?: string | null
        }
        Update: {
          acknowledged?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string | null
          school_id?: string | null
          stage?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_password_reset_at: string | null
          must_change_password: boolean
          phone: string | null
          school_id: string | null
          signature_url: string | null
          title: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          last_password_reset_at?: string | null
          must_change_password?: boolean
          phone?: string | null
          school_id?: string | null
          signature_url?: string | null
          title?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_password_reset_at?: string | null
          must_change_password?: boolean
          phone?: string | null
          school_id?: string | null
          signature_url?: string | null
          title?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_grade_access: {
        Row: {
          created_at: string
          grade_id: string
          id: string
          is_enabled: boolean
          school_id: string
        }
        Insert: {
          created_at?: string
          grade_id: string
          id?: string
          is_enabled?: boolean
          school_id: string
        }
        Update: {
          created_at?: string
          grade_id?: string
          id?: string
          is_enabled?: boolean
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_grade_access_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_grade_access_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_module_access: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          module_key: string
          school_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_key: string
          school_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_key?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_module_access_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          county: string | null
          created_at: string
          email: string | null
          grading_scale: Json | null
          hoi_email: string | null
          hoi_name: string | null
          hoi_phone: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          modules: Json
          name: string
          phone: string | null
          plan: string
          school_code: string
          uli_code: string | null
        }
        Insert: {
          county?: string | null
          created_at?: string
          email?: string | null
          grading_scale?: Json | null
          hoi_email?: string | null
          hoi_name?: string | null
          hoi_phone?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          modules?: Json
          name: string
          phone?: string | null
          plan?: string
          school_code: string
          uli_code?: string | null
        }
        Update: {
          county?: string | null
          created_at?: string
          email?: string | null
          grading_scale?: Json | null
          hoi_email?: string | null
          hoi_name?: string | null
          hoi_phone?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          modules?: Json
          name?: string
          phone?: string | null
          plan?: string
          school_code?: string
          uli_code?: string | null
        }
        Relationships: []
      }
      streams: {
        Row: {
          grade_id: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          grade_id: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          grade_id?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          adm_no: string
          created_at: string
          dob: string | null
          first_name: string
          gender: string | null
          grade_id: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          last_name: string
          photo_url: string | null
          school_id: string
          status: Database["public"]["Enums"]["student_status"]
          status_reason: string | null
          stream_id: string | null
          student_id: string | null
          user_id: string | null
          year_joined: number
        }
        Insert: {
          adm_no: string
          created_at?: string
          dob?: string | null
          first_name: string
          gender?: string | null
          grade_id?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          last_name: string
          photo_url?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["student_status"]
          status_reason?: string | null
          stream_id?: string | null
          student_id?: string | null
          user_id?: string | null
          year_joined?: number
        }
        Update: {
          adm_no?: string
          created_at?: string
          dob?: string | null
          first_name?: string
          gender?: string | null
          grade_id?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          last_name?: string
          photo_url?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["student_status"]
          status_reason?: string | null
          stream_id?: string | null
          student_id?: string | null
          user_id?: string | null
          year_joined?: number
        }
        Relationships: [
          {
            foreignKeyName: "students_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          grade_id: string | null
          id: string
          name: string
          school_id: string
        }
        Insert: {
          code?: string | null
          grade_id?: string | null
          id?: string
          name: string
          school_id: string
        }
        Update: {
          code?: string | null
          grade_id?: string | null
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_subjects: {
        Row: {
          grade_id: string
          id: string
          school_id: string
          stream_id: string | null
          subject_id: string
          teacher_id: string
        }
        Insert: {
          grade_id: string
          id?: string
          school_id: string
          stream_id?: string | null
          subject_id: string
          teacher_id: string
        }
        Update: {
          grade_id?: string
          id?: string
          school_id?: string
          stream_id?: string | null
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          school_id: string
          tsc_number: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          school_id: string
          tsc_number?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          school_id?: string
          tsc_number?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          closing_date: string | null
          end_date: string | null
          id: string
          is_active: boolean
          next_term_opening_date: string | null
          opening_date: string | null
          school_id: string
          start_date: string | null
          term_number: number
        }
        Insert: {
          academic_year_id: string
          closing_date?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          next_term_opening_date?: string | null
          opening_date?: string | null
          school_id: string
          start_date?: string | null
          term_number: number
        }
        Update: {
          academic_year_id?: string
          closing_date?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          next_term_opening_date?: string | null
          opening_date?: string | null
          school_id?: string
          start_date?: string | null
          term_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          created_at: string
          destination: string | null
          fee_cleared: boolean
          id: string
          reason: string | null
          school_id: string
          student_id: string
          transfer_type: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          fee_cleared?: boolean
          id?: string
          reason?: string | null
          school_id: string
          student_id: string
          transfer_type: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          fee_cleared?: boolean
          id?: string
          reason?: string | null
          school_id?: string
          student_id?: string
          transfer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_school_id: { Args: never; Returns: string }
      generate_adm_no: {
        Args: { _school_id: string; _year: number }
        Returns: string
      }
      generate_student_id: { Args: { _grade_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hoi_can_access_grade: { Args: { _grade_id: string }; Returns: boolean }
      in_my_school: { Args: { _school: string }; Returns: boolean }
      is_school_admin: { Args: { _school: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      log_audit: {
        Args: { _action: string; _entity?: string; _entity_id?: string }
        Returns: undefined
      }
      parent_login: {
        Args: { _adm_no: string; _guardian_phone: string }
        Returns: {
          adm_no: string
          full_name: string
          grade: string
          id: string
          photo_url: string
          school_name: string
          stream: string
          student_id: string
        }[]
      }
      parent_lookup: {
        Args: {
          _adm_no?: string
          _first_name?: string
          _guardian_phone?: string
        }
        Returns: {
          adm_no: string
          full_name: string
          grade: string
          id: string
          photo_url: string
          school_name: string
          stream: string
          student_id: string
        }[]
      }
      parent_student_summary: { Args: { _student_id: string }; Returns: Json }
      record_password_reset: {
        Args: { _email: string; _stage?: string }
        Returns: undefined
      }
      username_available: { Args: { _username: string }; Returns: boolean }
      verify_student_id: {
        Args: { _adm_no: string }
        Returns: {
          adm_no: string
          full_name: string
          grade: string
          photo_url: string
          school_code: string
          school_name: string
          status: string
          stream: string
          student_id: string
        }[]
      }
    }
    Enums: {
      app_role: "superadmin" | "hoi" | "teacher" | "student"
      cbc_level: "exceeding" | "meeting" | "approaching" | "below"
      grade_band: "pre_primary" | "primary" | "junior" | "senior"
      payment_method: "cash" | "bank" | "mpesa" | "cheque" | "waiver"
      student_status:
        | "active"
        | "deactivated"
        | "graduated"
        | "archived"
        | "transferred_out"
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
      app_role: ["superadmin", "hoi", "teacher", "student"],
      cbc_level: ["exceeding", "meeting", "approaching", "below"],
      grade_band: ["pre_primary", "primary", "junior", "senior"],
      payment_method: ["cash", "bank", "mpesa", "cheque", "waiver"],
      student_status: [
        "active",
        "deactivated",
        "graduated",
        "archived",
        "transferred_out",
      ],
    },
  },
} as const
