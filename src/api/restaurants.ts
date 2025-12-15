import { supabase } from "../lib/supabaseClient";
import { Restaurant } from "../types/database.types";

export async function getRestaurant(id: string) {
    return await supabase.from("restaurants").select("*").eq("id", id).maybeSingle();
}

export async function createRestaurant(data: Partial<Restaurant>) {
    return await supabase.from("restaurants").insert(data).select().single();
}

export async function updateRestaurant(id: string, data: Partial<Restaurant>) {
    return await supabase.from("restaurants").update(data).eq("id", id).select().single();
}
