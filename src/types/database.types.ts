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
            restaurants: {
                Row: {
                    id: string
                    name: string
                    slug: string | null
                    location: string | null
                    type: string | null
                    phone: string | null
                    email: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    slug?: string | null
                    location?: string | null
                    type?: string | null
                    phone?: string | null
                    email?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    slug?: string | null
                    location?: string | null
                    type?: string | null
                    phone?: string | null
                    email?: string | null
                    created_at?: string
                }
            }
            tables: {
                Row: {
                    id: string
                    restaurant_id: string
                    table_number: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    restaurant_id: string
                    table_number: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    restaurant_id?: string
                    table_number?: string
                    created_at?: string
                }
            }
            menu_items: {
                Row: {
                    id: string
                    restaurant_id: string
                    name: string
                    description: string | null
                    price: number
                    category: string
                    image: string | null
                    dietary: Json
                    in_stock: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    restaurant_id: string
                    name: string
                    description?: string | null
                    price: number
                    category: string
                    image?: string | null
                    dietary?: Json
                    in_stock?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    restaurant_id?: string
                    name?: string
                    description?: string | null
                    price?: number
                    category?: string
                    image?: string | null
                    dietary?: Json
                    in_stock?: boolean
                    created_at?: string
                }
            }
            orders: {
                Row: {
                    id: string
                    restaurant_id: string
                    table_id: string
                    status: string
                    total_amount: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    restaurant_id: string
                    table_id: string
                    status?: string
                    total_amount?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    restaurant_id?: string
                    table_id?: string
                    status?: string
                    total_amount?: number
                    created_at?: string
                }
            }
            order_items: {
                Row: {
                    id: string
                    order_id: string
                    menu_item_id: string
                    quantity: number
                    price: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    order_id: string
                    menu_item_id: string
                    quantity?: number
                    price: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    order_id?: string
                    menu_item_id?: string
                    quantity?: number
                    price?: number
                    created_at?: string
                }
            }
            profiles: {
                Row: {
                    id: string
                    first_name: string | null
                    last_name: string | null
                    phone: string | null
                    role: string | null
                    current_restaurant_id: string | null
                    created_at: string
                }
                Insert: {
                    id: string
                    first_name?: string | null
                    last_name?: string | null
                    phone?: string | null
                    role?: string | null
                    current_restaurant_id?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    first_name?: string | null
                    last_name?: string | null
                    phone?: string | null
                    role?: string | null
                    current_restaurant_id?: string | null
                    created_at?: string
                }
            },
            service_requests: {
                Row: {
                    id: string
                    restaurant_id: string
                    table_id: string
                    type: string
                    status: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    restaurant_id: string
                    table_id: string
                    type: string
                    status?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    restaurant_id?: string
                    table_id?: string
                    type?: string
                    status?: string
                    created_at?: string
                }
            }
        }
    }
}

export type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
export type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
export type Table = Database["public"]["Tables"]["tables"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
