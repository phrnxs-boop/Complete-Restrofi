import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { MenuItem, CartItem, Order, OrderStatus, ServiceRequest, ServiceType, RestaurantProfile, CustomerProfile, AuthMode } from '../types';
import { supabase } from '../src/lib/supabaseClient';
import * as restaurantsApi from '../src/api/restaurants';
import * as menuApi from '../src/api/menu';
import * as ordersApi from '../src/api/orders';
import * as profileApi from '../src/api/profile';
import * as serviceApi from '../src/api/service';
import { User, Session } from '@supabase/supabase-js';

interface ToastState {
  message: string;
  visible: boolean;
}

export type ViewMode = 'LANDING' | 'ONBOARDING' | 'APP' | 'PRIVACY' | 'TERMS' | 'CONTACT';

interface RestaurantContextType {
  // Application Flow State
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isLoading: boolean;
  // Loading States
  isPlacingOrder: boolean;
  isUpdatingOrder: Set<string>; // Set of order IDs currently updating
  error: string | null;

  // SaaS / Multi-tenant
  currentRestaurant: RestaurantProfile | null;
  updateRestaurantProfile: (profile: Partial<RestaurantProfile>) => Promise<RestaurantProfile>;
  switchRestaurant: (id: string) => Promise<void>;

  // Core functionality
  tableId: string | null;  // UUID for database operations
  tableNumber: string | null;  // Table number for display (1, 2, 3...)
  setTableId: (id: string) => void;
  setTableNumber: (number: string) => void;
  cart: CartItem[];
  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  placeOrder: () => Promise<void>;
  activeOrders: Order[];
  activeRequests: ServiceRequest[];
  requestService: (type: ServiceType) => Promise<void>;
  completeRequest: (id: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;

  // Pagination
  loadMoreOrders: () => Promise<void>;
  hasMoreOrders: boolean;
  isOrdersLoading: boolean;

  // Global Stats
  dailyStats: { revenue: number; activeCount: number; completedCount: number };
  refreshStats: () => Promise<void>;

  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;

  // Menu Management
  menuItems: MenuItem[];
  categories: string[];
  addCategory: (category: string) => void;
  addMenuItem: (item: Omit<MenuItem, 'id' | 'restaurantId'>) => Promise<void>;
  addMenuItems: (items: Omit<MenuItem, 'id' | 'restaurantId'>[]) => Promise<void>;
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem: (id: string) => Promise<void>;
  replaceMenu: (items: MenuItem[], targetRestaurantId?: string) => Promise<void>;

  // Order Success
  lastOrder: Order | null;
  clearLastOrder: () => void;

  // Notification
  toast: ToastState;

  // Auth
  user: User | null;
  profile: CustomerProfile | null;
  isAdmin: boolean;
  setIsAdmin: (isAdmin: boolean) => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  authModalMode: AuthMode;
  openAuthModal: (mode?: AuthMode) => void;
  handleLogout: () => Promise<void>;

  // Auth Actions
  signInWithEmail: (email: string, pass: string) => Promise<{ error: any }>;
  signUpWithEmail: (email: string, pass: string, meta: { first: string; last: string }) => Promise<{ error: any }>;
  signInWithPhone: (phone: string) => Promise<{ error: any }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: any }>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export const RestaurantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('LANDING');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Loading State initialization
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState<Set<string>>(new Set());

  // ... (keep existing code)

  // --- SaaS State ---
  const [currentRestaurant, setCurrentRestaurant] = useState<RestaurantProfile | null>(null);

  const [tableId, setTableId] = useState<string | null>(null); // UUID for database
  const [tableNumber, setTableNumber] = useState<string | null>(null); // Table number for display (1, 2, 3...)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false });
  const toastTimer = useRef<any>(null);

  // --- Data State (Fetched from Supabase) ---
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [activeRequests, setActiveRequests] = useState<ServiceRequest[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Pagination State
  const [ordersPage, setOrdersPage] = useState(0);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [dailyStats, setDailyStats] = useState({ revenue: 0, activeCount: 0, completedCount: 0 });


  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>('LOGIN');

  const openAuthModal = (mode: AuthMode = 'LOGIN') => {
    console.log("OPEN AUTH MODAL CALLED WITH:", mode);
    setAuthModalMode(mode);
    setIsLoginModalOpen(true);
  };

  // Helper function to resolve table number to table_id
  const resolveTableId = async (restaurantId: string, tableNumber: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .ilike('table_number', tableNumber)
        .maybeSingle();

      if (data) return data.id;

      // Create table if doesn't exist (Only if we have permissions, otherwise fail gracefully)
      // This will fail for anon users, so we catch it.
      const { data: newTable, error: insertError } = await supabase
        .from('tables')
        .insert({
          restaurant_id: restaurantId,
          table_number: tableNumber
        })
        .select('id')
        .single();

      if (insertError) {
        console.warn("Could not auto-create table (likely permission denied for guest):", insertError.message);
        return null;
      }

      return newTable?.id || null;
    } catch (err) {
      console.warn("Error resolving table:", err);
      return null;
    }
  };

  // Helper function to parse URL parameters - STRICT URL ONLY
  const parseURLParams = async (): Promise<{ rid: string | null; tableId: string | null; tableNumber: string | null }> => {
    let rid: string | null = null;
    let tableNumberStr: string | null = null;
    let urlTableId: string | null = null;

    // Parse URL search params
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('restaurantId')) rid = searchParams.get('restaurantId'); // Support standard param
    if (searchParams.get('rid')) rid = searchParams.get('rid'); // Support legacy shorthand

    if (searchParams.get('tableNo')) tableNumberStr = searchParams.get('tableNo');
    if (searchParams.get('table')) tableNumberStr = searchParams.get('table'); // Legacy

    if (searchParams.get('tableId')) urlTableId = searchParams.get('tableId');

    // Hash Check (for specific routers if needed in future, keeping legacy for safety)
    if (window.location.hash.includes('?')) {
      try {
        const hashStr = decodeURIComponent(window.location.hash);
        const hashQuery = hashStr.split('?')[1];
        if (hashQuery) {
          const hashParams = new URLSearchParams(hashQuery);
          if (hashParams.get('rid')) rid = hashParams.get('rid');
          if (hashParams.get('restaurantId')) rid = hashParams.get('restaurantId');
          if (hashParams.get('table')) tableNumberStr = hashParams.get('table');
          if (hashParams.get('tableNo')) tableNumberStr = hashParams.get('tableNo');
          if (hashParams.get('tableId')) urlTableId = hashParams.get('tableId');
        }
      } catch (e) {
        console.warn("Error parsing hash params:", e);
      }
    }

    // WE NO LONGER RESOLVE OR GUESS. PURE URL TRUTH.
    return { rid, tableId: urlTableId, tableNumber: tableNumberStr };
  };


  // 1. INITIALIZATION & STRICT SUPABASE FETCH
  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { rid, tableId, tableNumber } = await parseURLParams();

        if (rid && tableId && tableNumber) {
          // STRICT QR SCAN MODE
          // We trust the URL completely.
          await switchRestaurant(rid);
          setTableId(tableId);
          setTableNumber(tableNumber);
          setIsAdmin(false);
          setViewMode('APP'); // Customer View
        } else if (rid) {
          // Restaurant ID is present, BUT specific Table details are missing.
          // This is now invalid for a customer scan. We block it.
          // Unless we are explicitly checking for admin/landing? 
          // For now, per instructions: "If tableId is missing, block the menu".
          // However, we must allow Admin Dashboard access if someone just lands on /?rid=... and logs in?
          // The instruction says: "Hide Login and Signup buttons completely on all customer menu routes."
          // But if they are just at /?rid=... are they a customer?
          // "On the menu page... read tableId... If tableId is missing, block the menu".

          await switchRestaurant(rid);
          // We set specific error to block UI component if we are in consumer mode logic
          setError("Please rescan QR code (Missing Table Information)");

          // CRITICAL: Do NOT go to LANDING, because LaunchLanding might redirect admins to Dashboard.
          // Stay in APP mode, but the 'error' above will block the UI rendering in strict render logic.
          setViewMode('APP');
        } else {
          // No ID in URL means we are on the global Landing page
          setViewMode('LANDING');
        }
      } catch (err: any) {
        console.error("Critical Initialization Error:", err);
        // Check specifically for failed fetch (often env vars/network)
        if (err.message && err.message.includes('Failed to fetch')) {
          setError("Cannot connect to Database. Please check your network or API Keys.");
        } else {
          setError(err.message || "Failed to connect to the restaurant system.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    initApp();

    // AUTH LISTENER
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (uid: string) => {
    const { data, error } = await profileApi.getProfile(uid);

    if (data) {
      const loadedProfile: CustomerProfile = {
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        role: data.role as any,
        current_restaurant_id: data.current_restaurant_id
      };
      setProfile(loadedProfile);

      // Strict URL Check for QR Code Isolation
      const isQRUrl = window.location.search.includes('rid=') || window.location.search.includes('restaurantId=') ||
        window.location.hash.includes('rid=') || window.location.hash.includes('restaurantId=');

      // Admin Logic: Only if NOT in QR mode and User is Admin/Staff with Restaurant
      if (!isQRUrl && (loadedProfile.role === 'admin' || loadedProfile.role === 'staff') && loadedProfile.current_restaurant_id) {
        setIsAdmin(true);
        if (!currentRestaurant || currentRestaurant.id !== loadedProfile.current_restaurant_id) {
          switchRestaurant(loadedProfile.current_restaurant_id);
        }
      } else {
        // Force Customer View if scanning QR, even if user is admin
        setIsAdmin(false);
      }
    } else if (error) {
      console.error("Error fetching profile:", error);
      // Handle missing profile (orphaned user) or ANY critical error preventing login
      // This prevents the "Taking longer than expected" infinite loading screen
      console.warn("Critical profile error. Forcing logout to prevent stickiness.");
      handleLogout();
    }
  };

  // URL Change Listeners for QR scan and navigation
  useEffect(() => {
    const handleURLChange = async () => {
      try {
        const { rid, tableId, tableNumber } = await parseURLParams();

        if (rid && tableId) {
          // QR scan flow: ensure customer mode
          if (currentRestaurant?.id !== rid) {
            await switchRestaurant(rid);
          }
          setTableId(tableId);
          setTableNumber(tableNumber); // Store table number for display
          setIsAdmin(false); // Force customer mode
          setViewMode('APP');
        } else if (rid) {
          // Restaurant ID present but no table
          if (currentRestaurant?.id !== rid) {
            await switchRestaurant(rid);
          }
          setViewMode('APP');
        } else {
          // No restaurant ID: back to landing
          setViewMode('LANDING');
        }
      } catch (err: any) {
        console.error("URL change handling error:", err);
        setError(err.message || "Failed to handle URL change");
      }
    };

    // Listen for browser navigation
    window.addEventListener('popstate', handleURLChange);
    window.addEventListener('hashchange', handleURLChange);

    return () => {
      window.removeEventListener('popstate', handleURLChange);
      window.removeEventListener('hashchange', handleURLChange);
    };
  }, [currentRestaurant?.id]);

  // --- DATA FETCHING & REALTIME ---

  const transformOrder = (dbOrder: any): Order => {
    const items = dbOrder.order_items?.map((oi: any) => ({
      ...oi.menu_items,
      quantity: oi.quantity
    })) || [];

    return {
      id: dbOrder.id,
      restaurantId: dbOrder.restaurant_id,
      tableId: dbOrder.tables?.table_number || '?',
      items: items,
      status: dbOrder.status as OrderStatus,
      timestamp: Date.parse(dbOrder.created_at),
      total: dbOrder.total_amount
    };
  };

  const fetchOrders = async (reset = true) => {
    if (!currentRestaurant) return;
    if (!reset && !hasMoreOrders) return;

    setIsOrdersLoading(true);

    try {
      const page = reset ? 0 : ordersPage + 1;
      const { data, error } = await ordersApi.getActiveOrders(currentRestaurant.id, page, 20);

      if (error) throw error;

      if (data) {
        const transformed = data.map(transformOrder);

        if (reset) {
          setActiveOrders(transformed);
          setOrdersPage(0);
          setHasMoreOrders(data.length === 20);
        } else {
          setActiveOrders(prev => [...prev, ...transformed]);
          setOrdersPage(page);
          setHasMoreOrders(data.length === 20);
        }
      }
    } catch (e) {
      console.error("Fetch orders failed", e);
    } finally {
      setIsOrdersLoading(false);
    }
  };

  const loadMoreOrders = () => fetchOrders(false);

  const fetchMenu = async () => {
    if (!currentRestaurant) return;
    // CACHING: Try to load from localStorage first for instant render
    const cacheKey = `menu-cache-${currentRestaurant.id}`;
    // Logic from before...
    const cached = localStorage.getItem(cacheKey);
    if (cached && menuItems.length === 0) {
      try {
        const parsed = JSON.parse(cached);
        setMenuItems(parsed.items);
        setCategories(parsed.categories);
      } catch (e) { console.error(e); }
    }

    const { data, error } = await menuApi.getMenu(currentRestaurant.id);
    if (data && !error) {
      // Transform logic
      const transformedItems: MenuItem[] = data
        .filter((dbItem: any) => !dbItem.deleted_at)
        .map((dbItem: any) => ({
          id: dbItem.id,
          restaurantId: dbItem.restaurant_id,
          name: dbItem.name,
          description: dbItem.description,
          price: dbItem.price,
          category: dbItem.category,
          image: dbItem.image,
          dietary: dbItem.dietary,
          inStock: dbItem.in_stock !== false
        }));

      const cats = Array.from(new Set([...['starter', 'main', 'dessert', 'drink'], ...data.map((i: any) => i.category)]));
      setMenuItems(transformedItems);
      setCategories(cats);
      localStorage.setItem(cacheKey, JSON.stringify({ items: transformedItems, categories: cats }));
    }
  };

  const fetchRequests = async () => {
    if (!currentRestaurant) return;
    const { data, error } = await serviceApi.getServiceRequests(currentRestaurant.id);
    if (data && !error) {
      const transformedRequests = data.map((dbReq: any) => ({
        id: dbReq.id,
        restaurantId: dbReq.restaurant_id,
        tableId: dbReq.tables.table_number,
        type: dbReq.type as ServiceType,
        status: dbReq.status,
        timestamp: Date.parse(dbReq.created_at)
      }));

      setActiveRequests(transformedRequests);
    }
  };

  const refreshStats = async () => {
    if (!currentRestaurant) return;
    const { data } = await ordersApi.getTodayStats(currentRestaurant.id);
    if (data) {
      const revenue = data
        .filter((o: any) => o.status === 'PAID')
        .reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
      const active = data.filter((o: any) => o.status !== 'PAID').length;
      const completed = data.filter((o: any) => o.status === 'PAID').length;
      setDailyStats({ revenue, activeCount: active, completedCount: completed });
    }
  };

  // INITIAL LOAD & SUBSCRIPTIONS
  useEffect(() => {
    if (!currentRestaurant?.id) return;

    fetchMenu();
    fetchOrders(true);
    fetchRequests();
    refreshStats(); // Initial stats fetch

    const handleRealtimeOrder = async (payload: any) => {
      console.log("Realtime Order Event:", payload);
      refreshStats(); // Refresh stats on any order change
      if (payload.eventType === 'INSERT') {
        // Fetch single order details (with relations)
        const { data } = await ordersApi.getOrderById(payload.new.id);
        if (data) {
          const newOrder = transformOrder(data);
          setActiveOrders(prev => [newOrder, ...prev]);
          showToast(`New Order from Table ${newOrder.tableId}!`);

          // Play Sound
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log("Audio play blocked", e));
        }
      } else if (payload.eventType === 'UPDATE') {
        setActiveOrders(prev => prev.map(o =>
          o.id === payload.new.id ? { ...o, status: payload.new.status } : o
        ));
      }
    };

    const channel = supabase.channel(`restaurant-${currentRestaurant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${currentRestaurant.id}` }, handleRealtimeOrder)
      // For order_items, usually triggers an ORDER update in logic or just refresh. 
      // For simplicity in pagination refactoring, we might just refresh if items change, but better to fetch single order.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, async (payload) => {
        // Find which order this item belongs to and refresh just that order
        const { data } = await ordersApi.getOrderById(payload.new.order_id);
        if (data) {
          const updatedOrder = transformOrder(data);
          setActiveOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: `restaurant_id=eq.${currentRestaurant.id}` }, () => fetchRequests())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${currentRestaurant.id}` }, () => fetchMenu())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRestaurant?.id]);


  // --- ACTIONS ---

  const switchRestaurant = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await restaurantsApi.getRestaurant(id);
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Restaurant not found");

      setCurrentRestaurant(data as RestaurantProfile);
      setCart([]);
      setLastOrder(null);
      setViewMode('APP');
    } catch (err: any) {
      console.error("Switch failed:", err);
      setError(err.message || "Could not switch restaurant.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateRestaurantProfile = async (profile: Partial<RestaurantProfile>): Promise<RestaurantProfile> => {
    // Let Supabase generate UUID automatically, provide only the required fields
    const newProfile = {
      name: profile.name || 'New Restaurant',
      type: profile.type || 'Fine Dining',
      location: profile.location || '',
      phone: profile.phone || '',
      email: profile.email || ''
    };

    const { data, error } = await restaurantsApi.createRestaurant(newProfile);

    if (error) {
      console.error("Error creating restaurant:", JSON.stringify(error));
      throw new Error(error.message || JSON.stringify(error));
    } else {
      const restaurantProfile: RestaurantProfile = {
        id: data.id,
        name: data.name,
        type: data.type,
        location: data.location,
        phone: data.phone,
        email: data.email
      };

      // CRITICAL: Update the user's profile to link this restaurant and set as admin
      if (user) {
        await profileApi.setCurrentRestaurant(user.id, data.id);
        await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id); // Keeping role update direct for now or add to API

        // Update local state to reflect admin status immediately
        setIsAdmin(true);
      }

      setCurrentRestaurant(restaurantProfile);
      return restaurantProfile;
    }
  };

  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  const addToCart = (item: MenuItem) => {
    if (item.inStock === false) return;
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
    showToast(`${item.name} added to feast`);
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === itemId) return { ...i, quantity: Math.max(0, i.quantity + delta) };
      return i;
    }).filter(i => i.quantity > 0));
  };

  const placeOrder = async () => {
    // Use tableId from state (Strict URL Mode)
    if (cart.length === 0 || !currentRestaurant || !tableId) return;

    setIsPlacingOrder(true);
    try {
      // Use strict tableId from URL/State
      const resolvedTableId = tableId;
      if (!resolvedTableId) throw new Error('Table ID missing');

      // Calculate total with tax (matching CartDrawer logic)
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax = subtotal * 0.05;
      const totalAmount = subtotal + tax;

      // Insert order
      const { data: orderData, error: orderError } = await ordersApi.createOrder({
        restaurant_id: currentRestaurant.id,
        table_id: resolvedTableId,
        status: OrderStatus.PENDING,
        total_amount: totalAmount
      });

      if (orderError) throw orderError;

      // Insert order items
      const orderItems = cart.map(item => ({
        order_id: orderData.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        price: item.price
      }));

      const { error: itemsError } = await ordersApi.createOrderItems(orderItems);

      if (itemsError) throw itemsError;

      // Clear cart and show success
      setCart([]);
      setIsCartOpen(false);
      setLastOrder({
        id: orderData.id,
        restaurantId: currentRestaurant.id,
        tableId: tableNumber, // Use tableNumber (1, 2, 3...) for display
        items: cart,
        status: OrderStatus.PENDING,
        total: totalAmount,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Order placement failed:', error);
      alert('Failed to place order: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const clearLastOrder = () => setLastOrder(null);

  const requestService = async (type: ServiceType) => {
    if (!tableNumber || !currentRestaurant) {
      alert("Please scan a table QR code to request service.");
      return;
    }

    try {
      const resolvedTableId = await resolveTableId(currentRestaurant.id, tableNumber);
      if (!resolvedTableId) throw new Error('Table not found');

      const { error } = await serviceApi.createServiceRequest({
        restaurant_id: currentRestaurant.id,
        table_id: resolvedTableId,
        type: type,
        status: 'PENDING'
      });

      if (error) throw error;
      alert('Staff has been notified.');
    } catch (error) {
      console.error('Service request failed:', error);
      alert('Failed to request service.');
    }
  };

  const completeRequest = async (id: string) => {
    await serviceApi.updateServiceRequestStatus(id, 'COMPLETED');
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    // OPTIMISTIC UPDATE: Update UI immediately
    const previousOrders = [...activeOrders];

    // 1. Optimistically update local state
    setActiveOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, status: status } : o
    ));

    // 2. Set loading state (optional, can be skipped for instant feel, but good for feedback)
    setIsUpdatingOrder(prev => new Set(prev).add(orderId));

    try {
      // 3. Perform network request
      const { error } = await ordersApi.updateOrderStatus(orderId, status);
      if (error) throw new Error(error.message);

      showToast(`Order updated to ${status}`);
      refreshStats(); // Refresh stats immediately to reflect changes in revenue/counts
    } catch (err: any) {
      console.error("Order update failed:", err);
      // 4. Revert on failure
      setActiveOrders(previousOrders);
      showToast(`Failed to update order: ${err.message}`);
    } finally {
      setIsUpdatingOrder(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const addCategory = (name: string) => {
    const formatted = name.toLowerCase().trim();
    if (formatted && !categories.includes(formatted)) {
      setCategories(prev => [...prev, formatted]);
    }
  };

  const addMenuItem = async (itemData: Omit<MenuItem, 'id' | 'restaurantId'>) => {
    if (!currentRestaurant) return;

    const { error } = await supabase.from('menu_items').insert({
      restaurant_id: currentRestaurant.id,
      name: itemData.name,
      description: itemData.description,
      price: itemData.price,
      category: itemData.category,
      image: itemData.image,
      dietary: itemData.dietary,
      in_stock: itemData.inStock
    });
    if (error) {
      console.error("Failed to add item:", JSON.stringify(error));
      alert("Failed to add menu item.");
    }
  };

  const addMenuItems = async (itemsData: Omit<MenuItem, 'id' | 'restaurantId'>[]) => {
    if (!currentRestaurant) return;
    const dbItems = itemsData.map(item => ({
      restaurant_id: currentRestaurant.id,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      image: item.image,
      dietary: item.dietary,
      in_stock: item.inStock
    }));

    const { error } = await supabase.from('menu_items').insert(dbItems);
    if (error) {
      console.error("Failed to add items:", JSON.stringify(error));
      alert("Failed to bulk add items.");
    }
  };

  const updateMenuItem = async (id: string, updates: Partial<MenuItem>) => {
    const dbUpdates: any = {};
    if (updates.name) dbUpdates.name = updates.name;
    if (updates.price) dbUpdates.price = updates.price;
    if (updates.inStock !== undefined) dbUpdates.in_stock = updates.inStock;
    if (updates.description) dbUpdates.description = updates.description;
    if (updates.image) dbUpdates.image = updates.image;
    if (updates.category) dbUpdates.category = updates.category;
    if (updates.dietary) dbUpdates.dietary = updates.dietary;

    const { error } = await supabase.from('menu_items').update(dbUpdates).eq('id', id);
    if (error) console.error("Update failed:", JSON.stringify(error));
  };

  const deleteMenuItem = async (id: string) => {
    // Soft delete: Set deleted_at timestamp instead of actually deleting
    const { error } = await supabase
      .from('menu_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error("Soft delete failed:", JSON.stringify(error));
      alert(`Failed to delete menu item: ${error.message}`);
      throw error;
    }
  };

  // Modified to accept an optional ID to handle the race condition in onboarding
  const replaceMenu = async (items: MenuItem[], targetRestaurantId?: string) => {
    const rid = targetRestaurantId || currentRestaurant?.id;
    if (!rid) return;

    // 1. Delete existing
    const { error: deleteError } = await supabase.from('menu_items').delete().eq('restaurant_id', rid);
    if (deleteError) {
      console.error("Failed to clear menu:", JSON.stringify(deleteError));
      return;
    }

    // 2. Insert new
    const itemsToInsert = items.map(i => ({
      restaurant_id: rid,
      name: i.name,
      description: i.description,
      price: i.price,
      category: i.category,
      image: i.image,
      dietary: i.dietary,
      in_stock: i.inStock
    }));
    const { error: insertError } = await supabase.from('menu_items').insert(itemsToInsert);
    if (insertError) console.error("Failed to replace menu:", JSON.stringify(insertError));
  };

  // --- AUTH ACTIONS ---

  const signInWithEmail = async (email: string, pass: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    return { error };
  };

  const signUpWithEmail = async (email: string, pass: string, meta: { first: string; last: string }) => {
    const { error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        emailRedirectTo: window.location.origin, // Dynamically use current domain (Netlify or Localhost)
        data: {
          first_name: meta.first,
          last_name: meta.last
        }
      }
    });
    return { error };
  };

  const signInWithPhone = async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return { error };
  };

  const verifyOtp = async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    return { error };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear(); // Clear any persisted state
    setIsAdmin(false);
    setProfile(null);
    setUser(null);
    window.location.href = '/'; // Hard reload to landing page
  };

  // --- STRICT RENDER LOGIC ---

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center text-gold-500">
        <div className="w-16 h-16 border-4 border-gold-900 border-t-gold-500 rounded-full animate-spin mb-6"></div>
        <p className="font-display text-xl animate-pulse">Loading Kitchen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-6 border border-red-500/50">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-3xl font-display font-bold text-white mb-4">Connection Error</h1>
        <p className="text-stone-400 max-w-md mx-auto mb-8">{error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition">
          Retry
        </button>
      </div>
    );
  }

  return (
    <RestaurantContext.Provider value={{
      viewMode, setViewMode, isLoading, isPlacingOrder,
      isUpdatingOrder,
      error,
      currentRestaurant, updateRestaurantProfile, switchRestaurant,
      tableId, setTableId, tableNumber, setTableNumber,
      cart, addToCart, removeFromCart, updateQuantity, placeOrder,
      activeOrders, activeRequests, requestService, completeRequest, updateOrderStatus,
      isCartOpen, setIsCartOpen,
      menuItems, categories, addCategory, addMenuItem, addMenuItems, updateMenuItem, deleteMenuItem, replaceMenu,
      lastOrder, clearLastOrder,
      toast,
      user, profile, isAdmin, setIsAdmin, isLoginModalOpen, setIsLoginModalOpen,
      authModalMode, openAuthModal,
      signInWithEmail, signUpWithEmail, signInWithPhone, verifyOtp, handleLogout,
      loadMoreOrders, hasMoreOrders, isOrdersLoading,
      dailyStats, refreshStats
    }}>
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurant = () => {
  const context = useContext(RestaurantContext);
  if (!context) throw new Error("useRestaurant must be used within a RestaurantProvider");
  return context;
};
