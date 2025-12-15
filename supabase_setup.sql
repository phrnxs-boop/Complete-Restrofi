-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Restaurants table
CREATE TABLE restaurants (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    slug text UNIQUE,
    location text,
    type text,
    phone text,
    email text,
    created_at timestamp DEFAULT now()
);

-- Tables inside restaurants
CREATE TABLE tables (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number text NOT NULL,  -- Store as text for flexibility (5, A1, etc.)
    created_at timestamp DEFAULT now(),
    UNIQUE(restaurant_id, table_number)
);

-- Menu items
CREATE TABLE menu_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    price numeric(10, 2) NOT NULL,
    category text NOT NULL,
    image text,
    dietary jsonb DEFAULT '[]',
    in_stock boolean DEFAULT true,
    created_at timestamp DEFAULT now()
);

-- Orders
CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'PENDING',
    total_amount numeric(10, 2) DEFAULT 0,
    created_at timestamp DEFAULT now()
);

-- Order items (normalized)
CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id uuid NOT NULL REFERENCES menu_items(id),
    quantity integer NOT NULL DEFAULT 1,
    price numeric(10, 2) NOT NULL,
    created_at timestamp DEFAULT now()
);


-- Service requests
CREATE TABLE service_requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    type text NOT NULL,
    status text DEFAULT 'PENDING',
    created_at timestamp DEFAULT now()
);

-- Profiles for Auth
CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  first_name text,
  last_name text,
  phone text,
  role text DEFAULT 'customer', -- 'admin', 'staff', 'customer'
  current_restaurant_id uuid REFERENCES restaurants(id),
  created_at timestamp DEFAULT now()
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone." ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile." ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, phone)
  VALUES (new.id, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name', new.phone);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ADDITIONAL POLICIES FOR CUSTOMER APP ACCESS

-- 1. Restaurants: Public Read
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public restaurants read" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Admins update restaurants" ON restaurants FOR UPDATE USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- 2. Tables: Public Read, Admin Write
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public tables read" ON tables FOR SELECT USING (true);
CREATE POLICY "Admins/Staff create tables" ON tables FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'staff'))
);

-- 3. Menu Items: Public Read
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public menu read" ON menu_items FOR SELECT USING (true);
CREATE POLICY "Admins manage menu" ON menu_items FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'staff'))
);

-- 4. Orders: Public/Guest Insert, Read Own
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- Allow anyone to create an order (Guest checkout)
CREATE POLICY "Guests create orders" ON orders FOR INSERT WITH CHECK (true);
-- Allow viewing own orders (for logged in users) OR public if we want guests to track status (simplified for now)
-- For strict security, guests would need a session ID, but for this MVP, we allow public read by ID if they have the UUID (which is hard to guess).
-- BETTER: Allow reading if they created it? (auth.uid() = user_id) but guests have no ID.
-- PRACTICAL MVP: Allow Public Read for now, or match by Table ID?
CREATE POLICY "Public read orders" ON orders FOR SELECT USING (true); 
CREATE POLICY "Admins manage orders" ON orders FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'staff'))
);

-- 5. Order Items: Public Insert
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Guests create order items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read order items" ON order_items FOR SELECT USING (true);

-- 6. Service Requests
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Guests create requests" ON service_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read requests" ON service_requests FOR SELECT USING (true);

