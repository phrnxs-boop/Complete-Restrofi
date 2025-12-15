import React, { useState, useMemo } from 'react';
import { supabase } from '../src/lib/supabaseClient'; // Added for QR table resolution
import { useRestaurant } from '../context/RestaurantContext';
import { MenuItem, Order, OrderStatus, ServiceRequest, ServiceType } from '../types';
import { Icons } from '../components/ui/Icons';
import { analyzeMenuImage } from '../services/geminiService';
import { CustomerApp } from './CustomerApp';
import { formatToIST, formatTimeIST, getRelativeTimeIST, formatDateIST } from '../utils/dateUtils';

export const AdminDashboard: React.FC = () => {
    const {
        activeOrders, updateOrderStatus, activeRequests, completeRequest,
        menuItems, addMenuItem, addMenuItems, updateMenuItem, deleteMenuItem,
        currentRestaurant, categories, addCategory, updateRestaurantProfile, replaceMenu,
        user, isAdmin, handleLogout, isUpdatingOrder,
        loadMoreOrders, hasMoreOrders, isOrdersLoading,
        dailyStats // Used for accurate cards
    } = useRestaurant();

    // Protection: Simple check, can be expanded to check database roles
    if (!user) {
        return (
            <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-8 text-center text-stone-400">
                <Icons.Lock className="w-12 h-12 mb-4 text-stone-600" />
                <h2 className="text-xl font-display text-white mb-2">Access Restricted</h2>
                <p>Please log in to manage this restaurant.</p>
            </div>
        );
    }

    const [activeTab, setActiveTab] = useState<'orders' | 'menu' | 'qr' | 'analytics' | 'viewmenu'>('orders');
    const [qrTable, setQrTable] = useState('');
    const [qrTableId, setQrTableId] = useState<string | null>(null);

    // Auto-resolve Table ID for QR Generator
    React.useEffect(() => {
        const resolveQRTable = async () => {
            if (!qrTable || !currentRestaurant) {
                setQrTableId(null);
                return;
            }
            try {
                // Try to find existing table
                const { data, error } = await supabase
                    .from('tables')
                    .select('id')
                    .eq('restaurant_id', currentRestaurant.id)
                    .ilike('table_number', qrTable)
                    .maybeSingle();

                if (data) {
                    setQrTableId(data.id);
                } else {
                    // Auto-create if not exists (Admin Feature)
                    const { data: newTable, error: createError } = await supabase
                        .from('tables')
                        .insert({ restaurant_id: currentRestaurant.id, table_number: qrTable })
                        .select('id')
                        .single();

                    if (newTable) setQrTableId(newTable.id);
                }
            } catch (err) {
                console.error("Error resolving table for QR:", err);
            }
        };

        const timer = setTimeout(resolveQRTable, 500); // 500ms debounce
        return () => clearTimeout(timer);
    }, [qrTable, currentRestaurant]);

    // Mobile Menu State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Menu Editing State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);

    // Category Adding State inside Form
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // AI Scanner State
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [aiScanning, setAiScanning] = useState(false);
    const [scannedResults, setScannedResults] = useState<Partial<MenuItem>[]>([]);
    const DEFAULT_FOOD_IMG = "/home/hnx/Desktop/seven/restrofi.jpeg";

    // Delete Item State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    // Loading States for Menu Actions
    const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());

    // Cancel Order State
    const [isCancelOrderModalOpen, setIsCancelOrderModalOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState<string | null>(null);

    // Current Live Stats (Exclude Cancelled)
    const validOrders = useMemo(() => activeOrders.filter(o => o.status !== OrderStatus.CANCELLED), [activeOrders]);

    // Calculate Today's Revenue (IST)
    const todayRevenue = useMemo(() => {
        const todayStr = formatDateIST(Date.now());
        return validOrders
            .filter(o => formatDateIST(o.timestamp) === todayStr)
            .reduce((sum, o) => sum + o.total, 0);
    }, [validOrders]);

    const stats = {
        revenue: dailyStats.revenue,
        active: dailyStats.activeCount,
        completed: dailyStats.completedCount,
        // avgOrder is less critical, can keep approximate or remove
        avgOrderValue: dailyStats.completedCount > 0 ? dailyStats.revenue / dailyStats.completedCount : 0
    };

    const getStatusColor = (status: OrderStatus) => {
        switch (status) {
            case OrderStatus.PENDING: return 'bg-amber-100 text-amber-800 border-amber-200';
            case OrderStatus.PREPARING: return 'bg-blue-50 text-blue-700 border-blue-200';
            case OrderStatus.READY: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case OrderStatus.SERVED: return 'bg-stone-100 text-stone-500 border-stone-200';
            case OrderStatus.PAID: return 'bg-stone-900 text-gold-400 border-stone-900';
            case OrderStatus.CANCELLED: return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100';
        }
    };

    // --- ANALYTICS DATA GENERATION (Dynamic from Live Data) ---
    const [timeRange, setTimeRange] = useState<'current_week' | 'last_week' | 'month'>('current_week');

    // Filter Orders by Time Range
    const filteredOrders = useMemo(() => {
        const now = new Date();
        const startOfWeek = new Date(now);
        // Adjust to Monday (1)
        const day = startOfWeek.getDay() || 7;
        if (day !== 1) startOfWeek.setHours(-24 * (day - 1));
        else startOfWeek.setHours(0, 0, 0, 0); // Is Monday
        startOfWeek.setHours(0, 0, 0, 0); // Reset time

        let start: number, end: number;

        if (timeRange === 'current_week') {
            start = startOfWeek.getTime();
            end = now.getTime() + 86400000; // Include today
        } else if (timeRange === 'last_week') {
            const startOfLastWeek = new Date(startOfWeek);
            startOfLastWeek.setDate(startOfWeek.getDate() - 7);
            const endOfLastWeek = new Date(startOfWeek);
            endOfLastWeek.setDate(startOfWeek.getDate() - 1 // Sunday night
            );
            endOfLastWeek.setHours(23, 59, 59, 999);

            start = startOfLastWeek.getTime();
            end = endOfLastWeek.getTime();
        } else {
            // Month
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            start = startOfMonth.getTime();
            end = now.getTime() + 86400000;
        }

        return validOrders.filter(o => o.timestamp >= start && o.timestamp <= end);
    }, [validOrders, timeRange]);

    const analyticsData = useMemo(() => {
        // 1. Weekly Revenue - Map real orders to days
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const revenueByDay = new Array(7).fill(0);
        const ordersByDay = new Array(7).fill(0);

        filteredOrders.forEach(order => {
            const d = new Date(order.timestamp);
            const dayIndex = d.getDay(); // 0 = Sun, 6 = Sat
            revenueByDay[dayIndex] += order.total;
            ordersByDay[dayIndex] += 1;
        });

        const maxDailyRevenue = Math.max(...revenueByDay, 1000); // Default to 1000 scale if empty

        // Create chart data structure
        const weeklyRevenue = days.map((day, index) => ({
            day,
            value: revenueByDay[index],
            orders: ordersByDay[index],
            height: (revenueByDay[index] / maxDailyRevenue) * 100
        }));

        // Shift array so Monday is first
        const shiftedRevenue = [...weeklyRevenue.slice(1), weeklyRevenue[0]];

        // 2. Category Distribution
        const categoryCounts: Record<string, number> = {};
        // Use filtered revenue for percentages
        const rangeRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
        const activeCategories = new Set<string>(categories);

        filteredOrders.forEach(order => {
            order.items.forEach(item => {
                const cat = (item.category || 'other').toLowerCase();
                categoryCounts[cat] = (categoryCounts[cat] || 0) + (item.price * item.quantity);
                activeCategories.add(cat);
            });
        });

        // Sort categories by value desc for better visualization
        const sortedCategories = Array.from(activeCategories).sort((a, b) => {
            return (categoryCounts[b] || 0) - (categoryCounts[a] || 0);
        });

        const categoriesStats = sortedCategories
            .map((cat, idx) => {
                const val = categoryCounts[cat] || 0;
                if (val === 0) return null; // Filter out empty categories

                const percentage = rangeRevenue > 0 ? Math.round((val / rangeRevenue) * 100) : 0;
                return {
                    name: cat.charAt(0).toUpperCase() + cat.slice(1),
                    value: percentage,
                    rawValue: val,
                    color: ['bg-gold-400', 'bg-stone-800', 'bg-stone-400', 'bg-gold-200', 'bg-emerald-400', 'bg-red-400', 'bg-blue-400', 'bg-purple-400'][idx % 8]
                };
            })
            .filter(Boolean) as { name: string, value: number, rawValue: number, color: string }[];

        // 3. Top Items (Filtered)
        const itemSales: Record<string, any> = {};
        filteredOrders.forEach(order => {
            order.items.forEach(item => {
                if (!itemSales[item.id]) {
                    itemSales[item.id] = { ...item, sales: 0 };
                }
                itemSales[item.id].sales += item.quantity;
            });
        });

        const topItems = Object.values(itemSales)
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 5);

        return { weeklyRevenue: shiftedRevenue, maxRevenue: maxDailyRevenue, categories: categoriesStats, topItems, rangeRevenue };
    }, [filteredOrders, categories]);

    const handleEditClick = (item: MenuItem) => {
        setEditingItem(item);
        setIsAddingCategory(false);
        setIsFormOpen(true);
    };

    const handleDeleteClick = (id: string) => {
        setItemToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (itemToDelete) {
            setLoadingItems(prev => new Set(prev).add(itemToDelete));
            try {
                // Ensure minimum loading time for UX feedback
                await Promise.all([
                    deleteMenuItem(itemToDelete),
                    new Promise(resolve => setTimeout(resolve, 300))
                ]);
                // Only close modal if deletion succeeded
                setItemToDelete(null);
                setIsDeleteModalOpen(false);
            } catch (error) {
                // Error already shown by deleteMenuItem, just keep modal open
                console.error("Delete confirmation error:", error);
            } finally {
                setLoadingItems(prev => {
                    const next = new Set(prev);
                    if (itemToDelete) next.delete(itemToDelete);
                    return next;
                });
            }
        }
    };

    const handleCancelOrderClick = (orderId: string) => {
        setOrderToCancel(orderId);
        setIsCancelOrderModalOpen(true);
    };

    const confirmCancelOrder = () => {
        if (orderToCancel) {
            updateOrderStatus(orderToCancel, OrderStatus.CANCELLED);
            setOrderToCancel(null);
            setIsCancelOrderModalOpen(false);
        }
    };

    const handleAddClick = () => {
        setEditingItem({
            name: '', description: '', price: 0, category: categories[0] || 'main', image: '', dietary: [], isPopular: false, inStock: true
        });
        setIsAddingCategory(false);
        setIsFormOpen(true);
    };

    const handleAddNewCategory = () => {
        if (newCategoryName.trim()) {
            const formatted = newCategoryName.toLowerCase().trim();
            addCategory(formatted);
            if (editingItem) {
                setEditingItem({ ...editingItem, category: formatted });
            }
            setIsAddingCategory(false);
            setNewCategoryName('');
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingItem) return;

        // Use default image if none provided
        const finalItem = {
            ...editingItem,
            image: editingItem.image || DEFAULT_FOOD_IMG
        };

        if ('id' in finalItem && finalItem.id) {
            // Update existing
            updateMenuItem(finalItem.id as string, finalItem);
        } else {
            // Add new
            addMenuItem(finalItem as Omit<MenuItem, 'id'>);
        }
        setIsFormOpen(false);
        setEditingItem(null);
    };

    const handleDishImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editingItem) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            setEditingItem({ ...editingItem, image: reader.result as string });
        };
    };

    const handleDietaryToggle = (tag: string) => {
        if (!editingItem) return;
        const currentTags = editingItem.dietary || [];
        const newTags = currentTags.includes(tag)
            ? currentTags.filter(t => t !== tag)
            : [...currentTags, tag];
        setEditingItem({ ...editingItem, dietary: newTags });
    };

    // --- AI SCANNER HANDLERS ---
    const handleAIMenuUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            setAiScanning(true);
            const base64 = reader.result as string;
            const base64Data = base64.split(',')[1];
            const items = await analyzeMenuImage(base64Data);
            setScannedResults(items.map(i => ({ ...i, image: DEFAULT_FOOD_IMG })));
            setAiScanning(false);
        };
    };

    const updateScannedResult = (index: number, field: keyof MenuItem, value: any) => {
        const newItems = [...scannedResults];
        newItems[index] = { ...newItems[index], [field]: value };
        setScannedResults(newItems);
    };

    const removeScannedResult = (index: number) => {
        setScannedResults(prev => prev.filter((_, i) => i !== index));
    };

    const handleImportScannedItems = () => {
        const itemsToImport = scannedResults.map(item => ({
            name: item.name || 'Unknown',
            description: item.description || '',
            price: item.price || 0,
            category: item.category || 'main',
            image: item.image || DEFAULT_FOOD_IMG,
            dietary: item.dietary || [],
            isPopular: false,
            inStock: true
        }));
        addMenuItems(itemsToImport);
        setIsAIModalOpen(false);
        setScannedResults([]);
    };

    const handleTabChange = (tab: typeof activeTab) => {
        setActiveTab(tab);
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="min-h-screen bg-stone-100 text-stone-900 font-sans relative flex flex-col md:flex-row">

            {/* --- PRINTABLE QR CARD (Only visible when printing) --- */}
            <div
                className="hidden print:flex fixed inset-0 z-[9999] bg-white items-center justify-center p-0"
                style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
            >
                {qrTable && currentRestaurant && (
                    <div className="w-[100mm] h-[150mm] border-8 border-double border-stone-900 p-8 flex flex-col items-center justify-between text-center bg-white relative overflow-hidden">
                        {/* Background pattern - forced print */}
                        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#D4AF37 1px, transparent 1px)', backgroundSize: '20px 20px', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}></div>

                        <div className="z-10 mt-6 w-full">
                            <div className="w-16 h-16 border-2 border-stone-900 rounded-sm flex items-center justify-center rotate-45 mx-auto mb-6">
                                <span className="font-display font-bold text-3xl text-stone-900 -rotate-45">{currentRestaurant.name.charAt(0)}</span>
                            </div>
                            <h1 className="font-display text-4xl font-bold text-stone-900 tracking-widest uppercase mb-2 leading-tight">{currentRestaurant.name}</h1>
                            <p className="text-xs text-gold-600 uppercase tracking-[0.4em] font-bold">{currentRestaurant.type}</p>
                        </div>

                        <div className="z-10 my-auto">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${window.location.origin}/#/ ?rid=${currentRestaurant.id}&table=${qrTable}`)}&color=1c1917`}
                                alt={`QR for Table ${qrTable}`}
                                className="w-56 h-56 mix-blend-multiply"
                            />
                            <p className="mt-4 text-xs font-bold uppercase tracking-widest text-stone-400">Scan to Order</p>
                        </div>

                        <div className="z-10 mb-6 w-full border-t-2 border-stone-200 pt-6">
                            <p className="font-display text-5xl font-bold text-stone-900">Table {qrTable}</p>
                        </div>

                        <div className="absolute bottom-2 text-[8px] text-stone-300 uppercase tracking-widest">
                            Powered by RestroFi
                        </div>
                    </div>
                )}
            </div>

            {/* --- MOBILE HEADER (Visible on Mobile) --- */}
            <div className="md:hidden bg-stone-900 text-white p-4 flex justify-between items-center sticky top-0 z-30 shadow-md">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-gradient-to-br from-gold-400 to-gold-600 rounded text-stone-900">
                        <Icons.Chef className="w-4 h-4" />
                    </div>
                    <h1 className="font-display text-lg font-bold tracking-wide truncate max-w-[200px]">{currentRestaurant.name}</h1>
                </div>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 text-gold-400 hover:text-white transition"
                >
                    {isMobileMenuOpen ? <Icons.Close className="w-6 h-6" /> : <Icons.Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* --- SIDEBAR NAVIGATION --- */}
            {/* Backdrop for mobile */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                ></div>
            )}

            <div className={`
            fixed inset-y-0 left-0 z-50 w-72 bg-stone-900 text-white flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out
            md:relative md:translate-x-0 md:shadow-none md:flex
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            print:hidden
        `}>
                {/* Sidebar Header (Hidden on Mobile as it's in the top bar, visible on Desktop) */}
                <div className="hidden md:block p-8 border-b border-stone-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-gold-400 to-gold-600 rounded-lg text-stone-900">
                            <Icons.Chef className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="font-display text-xl font-bold tracking-wide break-words">{currentRestaurant.name}</h1>
                            <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">Powered by RestroFi</p>
                        </div>
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 p-6 flex flex-col gap-2 overflow-y-auto">
                    <div className="md:hidden pb-4 mb-4 border-b border-stone-800">
                        <p className="text-[10px] text-stone-500 uppercase tracking-widest mb-2">Dashboard</p>
                    </div>
                    <button
                        onClick={() => handleTabChange('orders')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${activeTab === 'orders'
                            ? 'bg-gold-600 text-white shadow-lg shadow-gold-900/20'
                            : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                            }`}
                    >
                        <Icons.List className="w-5 h-5" />
                        <span className="font-medium tracking-wide">Live Orders</span>
                    </button>
                    <button
                        onClick={() => handleTabChange('analytics')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${activeTab === 'analytics'
                            ? 'bg-gold-600 text-white shadow-lg shadow-gold-900/20'
                            : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                            }`}
                    >
                        <Icons.BarChart className="w-5 h-5" />
                        <span className="font-medium tracking-wide">Analytics</span>
                    </button>
                    <button
                        onClick={() => handleTabChange('menu')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${activeTab === 'menu'
                            ? 'bg-gold-600 text-white shadow-lg shadow-gold-900/20'
                            : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                            }`}
                    >
                        <Icons.Utensils className="w-5 h-5" />
                        <span className="font-medium tracking-wide">Menu Manager</span>
                    </button>
                    <button
                        onClick={() => handleTabChange('viewmenu')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${activeTab === 'viewmenu'
                            ? 'bg-gold-600 text-white shadow-lg shadow-gold-900/20'
                            : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                            }`}
                    >
                        <Icons.Menu className="w-5 h-5" />
                        <span className="font-medium tracking-wide">View Menu</span>
                    </button>
                    <button
                        onClick={() => handleTabChange('qr')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${activeTab === 'qr'
                            ? 'bg-gold-600 text-white shadow-lg shadow-gold-900/20'
                            : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                            }`}
                    >
                        <Icons.Qr className="w-5 h-5" />
                        <span className="font-medium tracking-wide">QR Generator</span>
                    </button>
                    <button
                        onClick={() => handleLogout()}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-stone-400 hover:bg-stone-800 hover:text-red-400 mt-auto"
                    >
                        <Icons.LogOut className="w-5 h-5" />
                        <span className="font-medium tracking-wide">Sign Out</span>
                    </button>
                </nav>

                <div className="p-6 border-t border-stone-800 text-xs text-stone-600 text-center">
                    System Active • v1.4.0
                </div>
            </div>

            {/* --- MAIN CONTENT AREA --- */}
            <div className="flex-1 p-4 md:p-10 overflow-y-auto max-h-[calc(100vh-64px)] md:max-h-screen print:hidden">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 md:mb-10 gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-display font-bold text-stone-900">
                            {activeTab === 'orders' ? 'Kitchen Display System' :
                                activeTab === 'analytics' ? 'Performance Insights' :
                                    activeTab === 'menu' ? 'Menu Management' :
                                        activeTab === 'viewmenu' ? '' : 'Table Management'}
                        </h2>
                        <p className="text-stone-500 mt-1 text-sm md:text-base">
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                </header>

                {/* --- ORDERS TAB --- */}
                {activeTab === 'orders' && (
                    <>
                        {/* Quick Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center justify-between">
                                <div>
                                    <p className="text-stone-400 text-xs font-bold uppercase tracking-widest">Today's Revenue</p>
                                    <p className="text-3xl md:text-4xl font-display font-bold text-stone-900 mt-2">₹{stats.revenue.toLocaleString('en-IN')}</p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-gold-50 flex items-center justify-center text-gold-600">
                                    <span className="font-serif font-bold text-xl">₹</span>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center justify-between">
                                <div>
                                    <p className="text-stone-400 text-xs font-bold uppercase tracking-widest">Active Orders</p>
                                    <p className="text-3xl md:text-4xl font-display font-bold text-stone-900 mt-2">{stats.active}</p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                    <Icons.Utensils className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center justify-between">
                                <div>
                                    <p className="text-stone-400 text-xs font-bold uppercase tracking-widest">Completed</p>
                                    <p className="text-3xl md:text-4xl font-display font-bold text-stone-900 mt-2">{stats.completed}</p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                                    <Icons.List className="w-5 h-5" />
                                </div>
                            </div>
                        </div>

                        {/* Live Service Requests */}
                        {activeRequests.length > 0 && (
                            <div className="mb-10">
                                <h3 className="text-xl font-bold text-stone-900 mb-4 flex items-center gap-2">
                                    <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                                    Live Service Requests
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {activeRequests.map(req => (
                                        <div key={req.id} className="bg-stone-900 text-white p-5 rounded-xl shadow-lg flex justify-between items-center animate-fade-in-up">
                                            <div>
                                                <div className="text-2xl font-bold text-gold-400">Table {req.tableId}</div>
                                                <div className="text-sm font-bold uppercase tracking-wider mt-1">{req.type}</div>
                                                <div className="text-xs text-stone-400 mt-1">{getRelativeTimeIST(req.timestamp)}</div>
                                            </div>
                                            <button
                                                onClick={() => completeRequest(req.id)}
                                                className="px-4 py-2 bg-white text-stone-900 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-gold-400 transition"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Order Board - Filtering out Cancelled */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                            {validOrders.map(order => (
                                <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-300">
                                    <div className="p-5 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-display font-bold text-xl text-stone-900">Table {order.tableId}</span>
                                                {order.status === OrderStatus.PENDING && <span className="flex w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                                            </div>
                                            <span className="text-xs text-stone-400 font-mono">{formatToIST(order.timestamp)}</span>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(order.status)}`}>
                                            {order.status}
                                        </span>
                                    </div>
                                    <div className="p-5 flex-1 bg-white">
                                        <ul className="space-y-4">
                                            {order.items.map((item, idx) => (
                                                <li key={idx} className="flex justify-between items-start">
                                                    <div className="flex gap-3">
                                                        <span className="w-6 h-6 bg-stone-100 text-stone-600 rounded flex items-center justify-center text-xs font-bold border border-stone-200 mt-0.5">{item.quantity}</span>
                                                        <div>
                                                            <span className="font-medium text-stone-800 block leading-tight">{item.name}</span>
                                                            <span className="text-xs text-stone-400 italic">{item.description.substring(0, 30)}...</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-sm font-medium text-stone-900">₹{(item.price * item.quantity).toFixed(0)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="mt-6 pt-4 border-t border-dashed border-stone-200 flex justify-between items-center">
                                            <span className="text-stone-500 text-sm">Total Amount</span>
                                            <span className="font-display font-bold text-xl text-stone-900">₹{order.total.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-stone-50 border-t border-stone-100 flex flex-col gap-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            {order.status === OrderStatus.PENDING && (
                                                <button
                                                    onClick={() => updateOrderStatus(order.id, OrderStatus.PREPARING)}
                                                    disabled={isUpdatingOrder.has(order.id)}
                                                    className="col-span-2 py-3 bg-stone-900 text-white rounded-xl font-bold text-sm tracking-wide hover:bg-black transition shadow-lg shadow-stone-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                                                >
                                                    {isUpdatingOrder.has(order.id) ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : "Accept & Cook"}
                                                </button>
                                            )}
                                            {order.status === OrderStatus.PREPARING && (
                                                <button
                                                    onClick={() => updateOrderStatus(order.id, OrderStatus.READY)}
                                                    disabled={isUpdatingOrder.has(order.id)}
                                                    className="col-span-2 py-3 bg-gold-500 text-white rounded-xl font-bold text-sm tracking-wide hover:bg-gold-600 transition shadow-lg shadow-gold-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                                                >
                                                    {isUpdatingOrder.has(order.id) ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : "Order Ready"}
                                                </button>
                                            )}
                                            {order.status === OrderStatus.READY && (
                                                <button
                                                    onClick={() => updateOrderStatus(order.id, OrderStatus.SERVED)}
                                                    disabled={isUpdatingOrder.has(order.id)}
                                                    className="col-span-2 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm tracking-wide hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                                                >
                                                    {isUpdatingOrder.has(order.id) ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : "Mark Served"}
                                                </button>
                                            )}
                                            {order.status === OrderStatus.SERVED && (
                                                <button
                                                    onClick={() => updateOrderStatus(order.id, OrderStatus.PAID)}
                                                    disabled={isUpdatingOrder.has(order.id)}
                                                    className="col-span-2 py-3 bg-white border border-stone-300 text-stone-900 rounded-xl font-bold text-sm tracking-wide hover:bg-stone-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                                                >
                                                    {isUpdatingOrder.has(order.id) ? (
                                                        <div className="w-4 h-4 border-2 border-stone-900/30 border-t-stone-900 rounded-full animate-spin" />
                                                    ) : "Process Payment"}
                                                </button>
                                            )}
                                        </div>

                                        {/* Cancel Button */}
                                        {(order.status === OrderStatus.PENDING || order.status === OrderStatus.PREPARING) && (
                                            <button
                                                onClick={() => handleCancelOrderClick(order.id)}
                                                className="w-full text-center py-2 text-xs font-bold text-red-500 hover:text-red-700 uppercase tracking-widest border border-transparent hover:border-red-100 rounded-lg transition-colors"
                                            >
                                                Cancel Order
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {validOrders.length === 0 && (
                                <div className="col-span-full py-32 text-center text-stone-300 border-2 border-dashed border-stone-200 rounded-3xl bg-white/50">
                                    <Icons.Utensils className="w-16 h-16 mx-auto mb-6 opacity-20" />
                                    <p className="text-2xl font-display text-stone-400">Kitchen is Quiet</p>
                                    <p className="text-sm text-stone-400 mt-2">Waiting for new orders...</p>
                                </div>
                            )}
                        </div>

                        {/* Load More Button */}
                        {validOrders.length > 0 && hasMoreOrders && (
                            <div className="mt-8 flex justify-center">
                                <button
                                    onClick={loadMoreOrders}
                                    disabled={isOrdersLoading}
                                    className="px-6 py-3 bg-white text-stone-600 border border-stone-300 rounded-full font-bold text-sm hover:bg-stone-50 hover:text-stone-900 hover:border-stone-400 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isOrdersLoading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-stone-400 border-t-stone-600 rounded-full animate-spin"></div>
                                            Loading...
                                        </>
                                    ) : (
                                        <>
                                            Load Older Orders
                                            <Icons.ArrowRight className="w-4 h-4 rotate-90" />
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* --- ANALYTICS TAB --- */}
                {activeTab === 'analytics' && (
                    <div className="space-y-8">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="bg-stone-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group">
                                <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                                    <Icons.TrendingUp className="w-24 h-24" />
                                </div>
                                <div className="relative z-10">
                                    <p className="text-gold-400 text-xs font-bold uppercase tracking-widest mb-1">Today's Revenue</p>
                                    <h3 className="text-3xl font-display font-bold">₹{stats.revenue.toLocaleString()}</h3>
                                    <div className="flex items-center gap-1 mt-2 text-green-400 text-xs">
                                        <Icons.TrendingUp className="w-3 h-3" />
                                        <span>Live Updates</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm relative overflow-hidden">
                                <div className="absolute right-0 top-0 p-6 opacity-5">
                                    <Icons.Bag className="w-24 h-24" />
                                </div>
                                <div className="relative z-10">
                                    <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mb-1">Avg. Order Value</p>
                                    <h3 className="text-3xl font-display font-bold text-stone-900">₹{stats.avgOrderValue.toFixed(0)}</h3>
                                    <div className="mt-2 text-stone-500 text-xs">
                                        Per active table
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm relative overflow-hidden">
                                <div className="absolute right-0 top-0 p-6 opacity-5">
                                    <Icons.Users className="w-24 h-24" />
                                </div>
                                <div className="relative z-10">
                                    <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mb-1">Total Guests</p>
                                    <h3 className="text-3xl font-display font-bold text-stone-900">{stats.active + stats.completed}</h3>
                                    <div className="mt-2 text-stone-500 text-xs">
                                        Current Session
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm relative overflow-hidden">
                                <div className="absolute right-0 top-0 p-6 opacity-5">
                                    <Icons.Star className="w-24 h-24" />
                                </div>
                                <div className="relative z-10">
                                    <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mb-1">Top Item Sales</p>
                                    <h3 className="text-3xl font-display font-bold text-stone-900">
                                        {analyticsData.topItems.length > 0 ? analyticsData.topItems[0].sales : 0}
                                    </h3>
                                    <div className="mt-2 text-stone-500 text-xs">
                                        Best Seller Count
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Revenue Graph */}
                            <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
                                <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
                                    <div>
                                        <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2 mb-1">
                                            <Icons.BarChart className="w-5 h-5 text-gold-500" /> Revenue Trend
                                        </h3>
                                        <div className="flex gap-6 mt-4">
                                            <div>
                                                <p className="text-[10px] uppercase text-stone-400 font-bold tracking-widest">{timeRange === 'month' ? 'Monthly Total' : 'Weekly Total'}</p>
                                                <p className="text-2xl font-display font-bold text-stone-900">₹{analyticsData.rangeRevenue.toLocaleString()}</p>
                                            </div>
                                            <div className="w-px h-8 bg-stone-100"></div>
                                            <div>
                                                <p className="text-[10px] uppercase text-stone-400 font-bold tracking-widest">Daily Average</p>
                                                <p className="text-xl font-display font-bold text-stone-600">₹{(analyticsData.rangeRevenue / (timeRange === 'month' ? 30 : 7)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <select
                                        value={timeRange}
                                        onChange={(e) => setTimeRange(e.target.value as any)}
                                        className="bg-stone-50 border border-stone-200 rounded-lg text-xs px-3 py-1 outline-none text-stone-500 w-full md:w-auto cursor-pointer hover:border-gold-400 transition-colors"
                                    >
                                        <option value="current_week">Current Week</option>
                                        <option value="last_week">Last Week</option>
                                        <option value="month">This Month</option>
                                    </select>
                                </div>

                                {/* Custom CSS Chart with Y-Axis */}
                                <div className="h-64 relative pl-12">
                                    {/* Y-Axis Grid & Labels */}
                                    <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-stone-400 font-mono pointer-events-none pb-8 pr-2">
                                        {[100, 75, 50, 25, 0].map((pct) => (
                                            <div key={pct} className="flex items-center gap-3 w-full">
                                                <span className="w-8 text-right shrink-0">
                                                    {(() => {
                                                        const val = Math.round((analyticsData.maxRevenue * pct) / 100);
                                                        if (val === 0) return '0';
                                                        if (val < 1000) return `₹${val}`;
                                                        if (val < 100000) return `₹${(val / 1000).toFixed(1).replace('.0', '')}k`;
                                                        return `₹${(val / 100000).toFixed(1).replace('.0', '')}L`;
                                                    })()}
                                                </span>
                                                <div className="flex-1 h-px bg-stone-50 border-t border-dashed border-stone-200"></div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Bars */}
                                    <div className="absolute inset-0 flex items-end justify-between gap-2 pl-12 pr-2 pb-8 h-full">
                                        {analyticsData.weeklyRevenue.map((item, idx) => (
                                            <div key={idx} className="flex flex-col items-center gap-2 w-full group cursor-pointer h-full justify-end relative z-10">
                                                <div className="relative w-full bg-stone-50/50 rounded-t-lg flex items-end h-full hover:bg-stone-100 transition-colors">
                                                    <div
                                                        className={`w-full mx-auto max-w-[40px] bg-stone-900 group-hover:bg-gold-500 transition-all duration-500 rounded-t-sm relative ${item.value === 0 ? 'min-h-[1px] bg-stone-200' : 'shadow-lg shadow-gold-900/10'}`}
                                                        style={{ height: `${item.value > 0 ? Math.max(item.height, 2) : 1}%` }}
                                                    >
                                                        {/* Tooltip */}
                                                        {item.value > 0 && (
                                                            <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-stone-900 text-white p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:-translate-y-2 whitespace-nowrap z-20 shadow-xl pointer-events-none">
                                                                <p className="font-bold text-gold-400 mb-0.5">₹{item.value.toLocaleString()}</p>
                                                                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{item.orders} Orders</p>
                                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-stone-900"></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{item.day}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Top Selling Items */}
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
                                <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2 mb-6">
                                    <Icons.Star className="w-5 h-5 text-gold-500" /> Top Dishes
                                </h3>
                                {analyticsData.topItems.length === 0 ? (
                                    <div className="text-center py-10 text-stone-400">
                                        <p className="text-sm italic">No sales yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {analyticsData.topItems.map((item, idx) => (
                                            <div key={idx} className="flex items-center gap-4 p-3 hover:bg-stone-50 rounded-xl transition-colors border border-transparent hover:border-stone-100">
                                                <div className="font-display font-bold text-lg text-stone-300 w-6">#{idx + 1}</div>
                                                <img src={item.image} className="w-10 h-10 rounded-lg object-cover" alt={item.name} />
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-stone-900 text-sm truncate">{item.name}</h4>
                                                    <p className="text-xs text-stone-500">{item.sales} sold</p>
                                                </div>
                                                <div className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                                    ₹{(item.sales * item.price).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Category Breakdown */}
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
                            <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2 mb-8">
                                <Icons.PieChart className="w-5 h-5 text-gold-500" /> Category Performance
                            </h3>
                            {analyticsData.categories.length === 0 ? (
                                <div className="text-center py-12 text-stone-400">
                                    <p className="text-sm italic">Place an order to see category breakdown.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {analyticsData.categories.map((cat, idx) => (
                                        <div key={idx}>
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="font-bold text-stone-700">{cat.name}</span>
                                                <span className="text-stone-500">{cat.value}% (₹{cat.rawValue})</span>
                                            </div>
                                            <div className="h-3 w-full bg-stone-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${cat.color} rounded-full transition-all duration-1000 ease-out`}
                                                    style={{ width: `${cat.value}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- MENU TAB --- */}
                {activeTab === 'menu' && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row justify-end gap-3">
                            <button
                                onClick={() => setIsAIModalOpen(true)}
                                className="bg-gold-500 text-stone-900 px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-gold-400 transition flex items-center justify-center gap-2 shadow-lg"
                            >
                                <Icons.Chef className="w-5 h-5" /> Scan Menu (AI)
                            </button>
                            <button
                                onClick={handleAddClick}
                                className="bg-stone-900 text-gold-400 px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-black transition flex items-center justify-center gap-2 shadow-lg"
                            >
                                <Icons.PlusCircle className="w-5 h-5" /> Add New Item
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {menuItems.map(item => (
                                <div key={item.id} className={`bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden group transition-all ${item.inStock === false ? 'opacity-70' : ''}`}>
                                    <div className="h-48 overflow-hidden relative">
                                        <img src={item.image} alt={item.name} className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${item.inStock === false ? 'grayscale' : ''}`} />
                                        <div className="absolute top-2 right-2 flex gap-1 z-10">
                                            <button
                                                onClick={async () => {
                                                    setLoadingItems(prev => new Set(prev).add(item.id));
                                                    try {
                                                        // Ensure minimum loading time for UX feedback
                                                        await Promise.all([
                                                            updateMenuItem(item.id, { inStock: item.inStock === false }),
                                                            new Promise(resolve => setTimeout(resolve, 300))
                                                        ]);
                                                    } finally {
                                                        setLoadingItems(prev => {
                                                            const next = new Set(prev);
                                                            next.delete(item.id);
                                                            return next;
                                                        });
                                                    }
                                                }}
                                                disabled={loadingItems.has(item.id)}
                                                className={`p-2 backdrop-blur rounded-lg transition shadow-sm ${item.inStock !== false ? 'bg-emerald-100/90 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100/90 text-red-700 hover:bg-red-200'} ${loadingItems.has(item.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                title={item.inStock !== false ? "Mark Out of Stock" : "Mark In Stock"}
                                            >
                                                {loadingItems.has(item.id) ? (
                                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                                ) : (
                                                    <Icons.Power className="w-4 h-4" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleEditClick(item)}
                                                className="p-2 bg-white/90 backdrop-blur text-stone-700 rounded-lg hover:text-gold-600 transition shadow-sm"
                                            >
                                                <Icons.Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id); }}
                                                className="p-2 bg-white/90 backdrop-blur text-stone-700 rounded-lg hover:text-red-500 transition shadow-sm"
                                            >
                                                <Icons.Trash className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="absolute bottom-0 left-0 bg-stone-900 text-gold-400 text-xs font-bold px-3 py-1 uppercase tracking-widest">
                                            {item.category}
                                        </div>
                                        {item.inStock === false && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                                                <span className="border-2 border-white text-white px-3 py-1 font-bold uppercase tracking-widest text-xs transform -rotate-12">Out of Stock</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-display font-bold text-lg text-stone-900 leading-tight">{item.name}</h3>
                                            <span className="font-serif font-bold text-stone-900">₹{item.price}</span>
                                        </div>
                                        <p className="text-xs text-stone-500 line-clamp-2 mb-3">{item.description}</p>
                                        <div className="flex gap-1 flex-wrap">
                                            {item.dietary?.map(tag => (
                                                <span key={tag} className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded border border-stone-200">{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- VIEW MENU TAB --- */}
                {activeTab === 'viewmenu' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
                        <div className="p-6 border-b border-stone-200 bg-stone-50">
                            <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                                <Icons.Menu className="w-5 h-5 text-gold-500" /> Customer Menu Preview
                            </h3>
                            <p className="text-stone-500 text-sm mt-2">This is how customers see your menu when they scan QR codes.</p>
                        </div>
                        <div className="overflow-y-auto relative" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                            <CustomerApp isEmbedded={true} />
                        </div>
                    </div>
                )}

                {/* --- QR TAB --- */}
                {activeTab === 'qr' && (
                    <div className="max-w-2xl mx-auto">
                        <div className="bg-white p-10 rounded-3xl shadow-premium text-center border border-stone-100">
                            <div className="w-16 h-16 bg-gold-100 text-gold-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Icons.Qr className="w-8 h-8" />
                            </div>
                            <h2 className="font-display text-3xl font-bold mb-3 text-stone-900">Table QR Generator</h2>
                            <p className="text-stone-500 mb-8 max-w-md mx-auto">Enter a table number below to generate a unique QR code. Print this code and place it on the table for guests to scan.</p>

                            <div className="relative max-w-xs mx-auto mb-10">
                                <input
                                    type="text"
                                    placeholder="Table No."
                                    value={qrTable}
                                    onChange={(e) => setQrTable(e.target.value)}
                                    className="w-full px-6 py-4 text-center text-2xl font-display font-bold border-2 border-stone-200 rounded-2xl focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-500/10 transition-all bg-stone-50"
                                />
                            </div>

                            {qrTable && !qrTableId && (
                                <div className="text-stone-400 animate-pulse">Generating unique Table ID...</div>
                            )}

                            {qrTable && qrTableId && (
                                <div className="flex flex-col items-center animate-fade-in-up">
                                    {/* Visual Preview (what user sees on screen) */}
                                    <div className="p-6 bg-white border-4 border-stone-900 rounded-2xl shadow-2xl mb-6 relative overflow-hidden group w-72 h-auto aspect-[2/3] flex flex-col justify-between">
                                        {/* Decorative Corner */}
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-gold-500 transform translate-x-8 -translate-y-8 rotate-45"></div>

                                        <div className="text-center mt-4">
                                            <div className="w-10 h-10 border border-stone-900 rounded-sm flex items-center justify-center rotate-45 mx-auto mb-3">
                                                <span className="font-display font-bold text-xl text-stone-900 -rotate-45">{currentRestaurant.name.charAt(0)}</span>
                                            </div>
                                            <p className="font-display font-bold text-lg text-stone-900 tracking-widest uppercase leading-none">{currentRestaurant.name}</p>
                                        </div>

                                        {/* Same 600x600 URL for caching */}
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${window.location.origin}/#/ ?rid=${currentRestaurant.id}&table=${qrTable}&tableId=${qrTableId}`)}&color=1c1917`}
                                            alt={`QR for Table ${qrTable}`}
                                            className="w-40 h-40 mix-blend-multiply mx-auto my-4"
                                        />

                                        <div className="pb-4 border-t-2 border-stone-100 text-center">
                                            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1">Scan to Order</p>
                                            <p className="font-display font-bold text-2xl uppercase tracking-widest text-stone-900">Table {qrTable}</p>
                                        </div>
                                    </div>

                                    {/* --- PRINTABLE QR CARD (Only visible when printing) --- */}
                                    {/* Note: In real usage, you'd iterate through selected tables or just print current */}
                                    {qrTable && currentRestaurant && qrTableId && (
                                        <div className="hidden print:flex flex-col items-center justify-center w-full h-full page-break-after-always">
                                            <div className="border-4 border-stone-900 p-8 rounded-3xl w-[400px] h-[600px] flex flex-col justify-between items-center relative">
                                                {/* Decorative Corner */}
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-stone-200 transform translate-x-12 -translate-y-12 rotate-45"></div>

                                                <div className="text-center mt-8 z-10">
                                                    <h1 className="font-display font-bold text-3xl text-stone-900 uppercase tracking-widest mb-1">{currentRestaurant.name}</h1>
                                                    <p className="font-serif text-stone-500 italic">Scan to Order</p>
                                                </div>

                                                <img
                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${window.location.origin}/#/ ?rid=${currentRestaurant.id}&table=${qrTable}&tableId=${qrTableId}`)}&color=1c1917`}
                                                    alt={`QR for Table ${qrTable}`}
                                                    className="w-64 h-64 mix-blend-multiply z-10"
                                                />

                                                <div className="text-center mb-8 z-10">
                                                    <p className="text-sm text-stone-400 font-bold uppercase tracking-widest mb-2">Table Number</p>
                                                    <p className="font-display text-5xl font-bold text-stone-900">Table {qrTable}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}                     <div className="flex flex-col md:flex-row gap-4 w-full justify-center">
                                        <button
                                            onClick={() => window.print()}
                                            className="px-6 py-3 bg-stone-900 text-gold-400 font-bold rounded-xl hover:bg-black transition shadow-lg flex items-center justify-center gap-2 print:hidden"
                                        >
                                            <Icons.Qr className="w-4 h-4" /> Print Table Card
                                        </button>

                                        <a
                                            href={`${window.location.origin}/#/ ?rid=${currentRestaurant.id}&table=${qrTable}&tableId=${qrTableId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-6 py-3 bg-white text-stone-700 font-bold rounded-xl border border-stone-200 hover:bg-stone-50 hover:text-gold-600 transition shadow-sm flex items-center justify-center gap-2 print:hidden"
                                        >
                                            <Icons.ExternalLink className="w-4 h-4" /> Simulate Scan
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* --- MODALS --- */}

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Icons.Trash className="w-8 h-8" />
                            </div>
                            <h3 className="font-display font-bold text-2xl text-stone-900 mb-2">Delete Dish?</h3>
                            <p className="text-stone-500 text-sm mb-6">
                                This will permanently remove the item from the menu. It will be removed from your digital menu immediately.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsDeleteModalOpen(false)}
                                    className="flex-1 px-4 py-3 text-stone-500 font-bold hover:bg-stone-50 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition shadow-lg shadow-red-500/20"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Order Confirmation Modal */}
            {isCancelOrderModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Icons.Close className="w-8 h-8" />
                            </div>
                            <h3 className="font-display font-bold text-2xl text-stone-900 mb-2">Cancel Order?</h3>
                            <p className="text-stone-500 text-sm mb-6">
                                Are you sure you want to cancel this order? This action cannot be undone and the customer will be notified if applicable.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsCancelOrderModalOpen(false)}
                                    className="flex-1 px-4 py-3 text-stone-500 font-bold hover:bg-stone-50 rounded-xl transition"
                                >
                                    Keep Order
                                </button>
                                <button
                                    onClick={confirmCancelOrder}
                                    className="flex-1 px-4 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition shadow-lg shadow-red-500/20"
                                >
                                    Yes, Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Scanner Modal */}
            {isAIModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-fade-in-up flex flex-col max-h-[85vh]">
                        <div className="px-8 py-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-gold-500 rounded text-stone-900">
                                    <Icons.Chef className="w-5 h-5" />
                                </div>
                                <h3 className="font-display font-bold text-2xl text-stone-900">AI Menu Digitizer</h3>
                            </div>
                            <button onClick={() => { setIsAIModalOpen(false); setScannedResults([]); }} className="text-stone-400 hover:text-stone-900">
                                <Icons.Close className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            {scannedResults.length === 0 && !aiScanning && (
                                <div className="text-center py-12">
                                    <div className="border-2 border-dashed border-stone-300 rounded-2xl p-12 text-center hover:bg-stone-50 hover:border-gold-400 transition-all group relative cursor-pointer max-w-lg mx-auto">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleAIMenuUpload}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="w-16 h-16 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-gold-100 group-hover:text-gold-600 transition-colors">
                                            <Icons.Image className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-lg font-bold text-stone-700 group-hover:text-gold-700">Upload Menu Image</h3>
                                        <p className="text-sm text-stone-400 mt-2">Take a photo of your printed menu. We'll extract dishes automatically.</p>
                                    </div>
                                    <p className="mt-8 text-stone-400 text-sm">Supported formats: JPG, PNG</p>
                                </div>
                            )}

                            {aiScanning && (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-16 h-16 border-4 border-gold-200 border-t-gold-600 rounded-full animate-spin mb-6"></div>
                                    <h3 className="font-display text-xl font-bold text-stone-900">Analyzing Menu Card...</h3>
                                    <p className="text-stone-500 mt-2">Identifying dishes, prices, and descriptions.</p>
                                </div>
                            )}

                            {scannedResults.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <p className="text-stone-500">{scannedResults.length} items found. Review before importing.</p>
                                        <button
                                            onClick={() => setScannedResults([])}
                                            className="text-xs text-red-400 hover:text-red-600 underline"
                                        >
                                            Clear & Scan Again
                                        </button>
                                    </div>
                                    {scannedResults.map((item, idx) => (
                                        <div key={idx} className="bg-white border border-stone-200 rounded-xl p-4 flex gap-4 shadow-sm hover:border-gold-300 transition-colors relative group">
                                            <button
                                                onClick={() => removeScannedResult(idx)}
                                                className="absolute top-2 right-2 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Icons.Close className="w-4 h-4" />
                                            </button>

                                            <div className="flex-1 space-y-3">
                                                <div className="flex gap-4">
                                                    <input
                                                        type="text"
                                                        value={item.name}
                                                        onChange={(e) => updateScannedResult(idx, 'name', e.target.value)}
                                                        className="flex-1 font-bold text-stone-900 border-b border-stone-200 focus:border-gold-500 outline-none pb-1 bg-transparent"
                                                        placeholder="Dish Name"
                                                    />
                                                    <div className="flex items-center w-24">
                                                        <span className="text-stone-400 text-sm mr-1">₹</span>
                                                        <input
                                                            type="number"
                                                            value={item.price}
                                                            onChange={(e) => updateScannedResult(idx, 'price', Number(e.target.value))}
                                                            className="w-full font-bold text-stone-900 border-b border-stone-200 focus:border-gold-500 outline-none pb-1 bg-transparent"
                                                        />
                                                    </div>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={item.description}
                                                    onChange={(e) => updateScannedResult(idx, 'description', e.target.value)}
                                                    className="w-full text-sm text-stone-500 border-b border-stone-100 focus:border-gold-300 outline-none pb-1 bg-transparent"
                                                    placeholder="Description"
                                                />
                                                <div className="flex justify-between items-center">
                                                    <select
                                                        value={item.category}
                                                        onChange={(e) => updateScannedResult(idx, 'category', e.target.value)}
                                                        className="text-xs bg-stone-50 border border-stone-200 rounded px-2 py-1 outline-none capitalize"
                                                    >
                                                        {categories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                        {!categories.includes(item.category || '') && <option value={item.category}>{item.category}</option>}
                                                    </select>
                                                    <div className="flex gap-1">
                                                        {item.dietary?.map(tag => (
                                                            <span key={tag} className="text-[9px] uppercase border border-stone-200 px-1 rounded text-stone-500">{tag}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-stone-100 bg-stone-50 flex justify-end gap-3">
                            <button
                                onClick={() => { setIsAIModalOpen(false); setScannedResults([]); }}
                                className="px-6 py-3 text-stone-500 font-bold hover:text-stone-900 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImportScannedItems}
                                disabled={scannedResults.length === 0}
                                className="px-8 py-3 bg-gold-500 text-stone-900 rounded-xl font-bold uppercase tracking-widest hover:bg-gold-400 transition shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Icons.Save className="w-4 h-4" /> Import {scannedResults.length} Items
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Menu Editor Modal (Manual) */}
            {isFormOpen && editingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in-up">
                        <div className="px-8 py-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                            <h3 className="font-display font-bold text-2xl text-stone-900">
                                {'id' in editingItem ? 'Edit Dish' : 'Add New Dish'}
                            </h3>
                            <button onClick={() => setIsFormOpen(false)} className="text-stone-400 hover:text-stone-900">
                                <Icons.Close className="w-6 h-6" />
                            </button>
                        </div>

                        {/* AI Prompt inside Manual Modal */}
                        {(!('id' in editingItem) || !editingItem.id) && (
                            <div className="px-8 pt-6 pb-2">
                                <div className="bg-gold-50 border border-gold-200 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-gold-500 rounded-full p-1.5 text-stone-900">
                                            <Icons.Chef className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-stone-900 text-sm">Have a printed menu?</p>
                                            <p className="text-xs text-stone-600">Scan it to add multiple items instantly.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setIsFormOpen(false); setIsAIModalOpen(true); }}
                                        className="text-xs font-bold uppercase tracking-wider text-stone-900 border-b border-stone-900 pb-0.5 hover:text-gold-600 hover:border-gold-600 transition"
                                    >
                                        Use AI Scanner
                                    </button>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleFormSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Dish Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingItem.name}
                                        onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-gold-400 outline-none transition"
                                        placeholder="e.g. Royal Saffron Biryani"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Description</label>
                                    <textarea
                                        required
                                        rows={3}
                                        value={editingItem.description}
                                        onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-gold-400 outline-none transition"
                                        placeholder="Describe flavors, ingredients, and preparation..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Price (INR)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3 text-stone-400">₹</span>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            value={editingItem.price}
                                            onChange={(e) => setEditingItem({ ...editingItem, price: parseInt(e.target.value) })}
                                            className="w-full pl-8 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-gold-400 outline-none transition"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Category</label>
                                    {!isAddingCategory ? (
                                        <div className="flex gap-2">
                                            <select
                                                value={editingItem.category}
                                                onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                                                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-gold-400 outline-none transition appearance-none capitalize"
                                            >
                                                {categories.map(cat => (
                                                    <option key={cat} value={cat} className="capitalize">{cat}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => setIsAddingCategory(true)}
                                                className="px-4 bg-stone-900 text-gold-400 rounded-lg hover:bg-black transition flex items-center justify-center"
                                                title="Add New Category"
                                            >
                                                <Icons.Plus className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                placeholder="New Category"
                                                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-gold-400 outline-none transition"
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddNewCategory}
                                                className="px-4 bg-gold-500 text-stone-900 font-bold rounded-lg hover:bg-gold-400 transition text-sm uppercase tracking-wider"
                                            >
                                                Add
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsAddingCategory(false)}
                                                className="px-3 bg-stone-200 text-stone-600 rounded-lg hover:bg-stone-300 transition"
                                            >
                                                <Icons.Close className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Dish Image</label>
                                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-stone-300 border-dashed rounded-lg hover:bg-stone-50 transition-colors relative cursor-pointer group">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleDishImageUpload}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="space-y-1 text-center">
                                            {editingItem.image ? (
                                                <div className="relative w-full h-48 mx-auto rounded-lg overflow-hidden group-hover:opacity-70 transition-opacity">
                                                    <img src={editingItem.image} alt="Preview" className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <span className="bg-black/50 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Click to Change</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <Icons.Image className="mx-auto h-12 w-12 text-stone-400" />
                                                    <div className="flex text-sm text-stone-600">
                                                        <span className="relative cursor-pointer bg-white rounded-md font-medium text-gold-600 hover:text-gold-500 focus-within:outline-none">
                                                            Upload a file
                                                        </span>
                                                        <p className="pl-1">or drag and drop</p>
                                                    </div>
                                                    <p className="text-xs text-stone-500">PNG, JPG, GIF up to 5MB</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Dietary Tags</label>
                                    <div className="flex gap-4">
                                        {['GF', 'V', 'JAIN', 'VG'].map(tag => (
                                            <label key={tag} className="flex items-center gap-2 cursor-pointer bg-stone-50 px-3 py-2 rounded-lg border border-stone-200 hover:border-gold-300 transition">
                                                <input
                                                    type="checkbox"
                                                    checked={editingItem.dietary?.includes(tag)}
                                                    onChange={() => handleDietaryToggle(tag)}
                                                    className="rounded text-gold-600 focus:ring-gold-500"
                                                />
                                                <span className="text-sm font-medium text-stone-700">{tag}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="flex items-center gap-3 cursor-pointer bg-stone-50 px-4 py-3 rounded-lg border border-stone-200 hover:border-gold-300 transition">
                                        <div className={`w-10 h-6 rounded-full p-1 transition-colors ${editingItem.inStock !== false ? 'bg-green-500' : 'bg-stone-300'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${editingItem.inStock !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={editingItem.inStock !== false}
                                            onChange={() => setEditingItem({ ...editingItem, inStock: !(editingItem.inStock !== false) })}
                                        />
                                        <span className="font-bold text-stone-700">Currently In Stock</span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-stone-100 flex justify-end gap-4">
                                <button
                                    type="button"
                                    onClick={() => setIsFormOpen(false)}
                                    className="px-6 py-3 text-stone-500 font-bold hover:text-stone-900 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-8 py-3 bg-gold-500 text-stone-900 rounded-xl font-bold uppercase tracking-widest hover:bg-gold-400 transition shadow-lg flex items-center gap-2"
                                >
                                    <Icons.Save className="w-4 h-4" /> Save Dish
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
