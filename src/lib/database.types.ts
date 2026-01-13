export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string
          name: string
          code: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          code: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          code?: string
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'admin' | 'store_user'
          store_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role: 'admin' | 'store_user'
          store_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'admin' | 'store_user'
          store_id?: string | null
          created_at?: string
        }
      }
      suppliers: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          store_id: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          phone?: string | null
          store_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          phone?: string | null
          store_id?: string
          created_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
      }
      products: {
        Row: {
          id: string
          name: string
          unit: string
          category_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          unit: string
          category_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          unit?: string
          category_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      product_suppliers: {
        Row: {
          id: string
          product_id: string
          supplier_id: string
          store_id: string
          price: number
          last_price_update: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          supplier_id: string
          store_id: string
          price?: number
          last_price_update?: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          supplier_id?: string
          store_id?: string
          price?: number
          last_price_update?: string
          created_at?: string
        }
      }
      stock: {
        Row: {
          id: string
          product_id: string
          store_id: string
          location: 'kitchen' | 'room'
          quantity: number
          minimum_stock: number
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          store_id: string
          location: 'kitchen' | 'room'
          quantity?: number
          minimum_stock?: number
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          store_id?: string
          location?: 'kitchen' | 'room'
          quantity?: number
          minimum_stock?: number
          updated_at?: string
        }
      }
      stock_history: {
        Row: {
          id: string
          stock_id: string
          change_type: 'reception' | 'sale' | 'adjustment' | 'count'
          quantity_change: number
          previous_quantity: number
          new_quantity: number
          reference_id: string | null
          notes: string | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          stock_id: string
          change_type: 'reception' | 'sale' | 'adjustment' | 'count'
          quantity_change: number
          previous_quantity: number
          new_quantity: number
          reference_id?: string | null
          notes?: string | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          stock_id?: string
          change_type?: 'reception' | 'sale' | 'adjustment' | 'count'
          quantity_change?: number
          previous_quantity?: number
          new_quantity?: number
          reference_id?: string | null
          notes?: string | null
          user_id?: string | null
          created_at?: string
        }
      }
      technical_sheets: {
        Row: {
          id: string
          name: string
          version: number
          is_active: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          version?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          version?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
      }
      technical_sheet_ingredients: {
        Row: {
          id: string
          technical_sheet_id: string
          product_id: string
          quantity: number
          store_id: string
        }
        Insert: {
          id?: string
          technical_sheet_id: string
          product_id: string
          quantity: number
          store_id: string
        }
        Update: {
          id?: string
          technical_sheet_id?: string
          product_id?: string
          quantity?: number
          store_id?: string
        }
      }
      orders: {
        Row: {
          id: string
          order_number: string
          supplier_id: string
          store_id: string
          status: 'pending' | 'sent' | 'received' | 'cancelled'
          total_amount: number
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_number: string
          supplier_id: string
          store_id: string
          status?: 'pending' | 'sent' | 'received' | 'cancelled'
          total_amount?: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_number?: string
          supplier_id?: string
          store_id?: string
          status?: 'pending' | 'sent' | 'received' | 'cancelled'
          total_amount?: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_price: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          total_price?: number
        }
      }
      receptions: {
        Row: {
          id: string
          order_id: string
          store_id: string
          received_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          store_id: string
          received_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          store_id?: string
          received_by?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      reception_items: {
        Row: {
          id: string
          reception_id: string
          product_id: string
          ordered_quantity: number
          received_quantity: number
          unit_price: number
          location: 'kitchen' | 'room'
        }
        Insert: {
          id?: string
          reception_id: string
          product_id: string
          ordered_quantity: number
          received_quantity: number
          unit_price: number
          location: 'kitchen' | 'room'
        }
        Update: {
          id?: string
          reception_id?: string
          product_id?: string
          ordered_quantity?: number
          received_quantity?: number
          unit_price?: number
          location?: 'kitchen' | 'room'
        }
      }
      sales_imports: {
        Row: {
          id: string
          store_id: string
          import_date: string
          filename: string
          status: 'processed' | 'simulated' | 'error' | 'reverted'
          total_items: number
          imported_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          import_date: string
          filename: string
          status?: 'processed' | 'simulated' | 'error' | 'reverted'
          total_items?: number
          imported_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          import_date?: string
          filename?: string
          status?: 'processed' | 'simulated' | 'error' | 'reverted'
          total_items?: number
          imported_by?: string | null
          created_at?: string
        }
      }
      sales_import_items: {
        Row: {
          id: string
          import_id: string
          article_name: string
          quantity: number
          technical_sheet_id: string | null
          processed: boolean
          error_message: string | null
        }
        Insert: {
          id?: string
          import_id: string
          article_name: string
          quantity: number
          technical_sheet_id?: string | null
          processed?: boolean
          error_message?: string | null
        }
        Update: {
          id?: string
          import_id?: string
          article_name?: string
          quantity?: number
          technical_sheet_id?: string | null
          processed?: boolean
          error_message?: string | null
        }
      }
      alerts: {
        Row: {
          id: string
          store_id: string | null
          type: 'low_stock' | 'price_outdated' | 'missing_sheet' | 'csv_missing' | 'stock_deviation'
          severity: 'info' | 'warning' | 'critical'
          message: string
          reference_id: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          store_id?: string | null
          type: 'low_stock' | 'price_outdated' | 'missing_sheet' | 'csv_missing' | 'stock_deviation'
          severity?: 'info' | 'warning' | 'critical'
          message: string
          reference_id?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string | null
          type?: 'low_stock' | 'price_outdated' | 'missing_sheet' | 'csv_missing' | 'stock_deviation'
          severity?: 'info' | 'warning' | 'critical'
          message?: string
          reference_id?: string | null
          is_read?: boolean
          created_at?: string
        }
      }
    }
  }
}
