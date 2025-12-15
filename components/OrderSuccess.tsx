
import React from 'react';
import { Icons } from './ui/Icons';
import { useRestaurant } from '../context/RestaurantContext';

export const OrderSuccess: React.FC = () => {
    const { lastOrder, clearLastOrder } = useRestaurant();

    if (!lastOrder) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-stone-50 flex items-center justify-center p-6 animate-fade-in-up">
            {/* Background Decor */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-64 h-64 bg-gold-200/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-gold-300/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3"></div>
            </div>

            <div className="relative bg-white max-w-md w-full rounded-3xl shadow-premium p-8 md:p-12 text-center border border-gold-100">
                {/* Success Icon */}
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                        <Icons.Check className="w-6 h-6 stroke-[3]" />
                    </div>
                </div>

                <h2 className="font-display text-3xl font-bold text-stone-900 mb-2">Order Confirmed</h2>
                <p className="text-gold-600 font-serif italic mb-8">Your royal feast is being prepared.</p>

                <div className="bg-stone-50 rounded-2xl p-6 mb-8 border border-stone-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300"></div>

                    <div className="flex justify-between items-center mb-4 border-b border-stone-200 pb-4">
                        <div className="text-left">
                            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Order ID</p>
                            <p className="font-mono font-bold text-stone-900 text-lg">#{lastOrder.id.toUpperCase()}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Table</p>
                            <p className="font-display font-bold text-xl text-stone-900">{lastOrder.tableId}</p>
                        </div>
                    </div>

                    <div className="space-y-3 text-left max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        {lastOrder.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm items-start">
                                <div>
                                    <span className="font-bold text-stone-900 mr-2">{item.quantity}x</span>
                                    <span className="text-stone-600">{item.name}</span>
                                </div>
                                <span className="font-medium text-stone-900">₹{item.price * item.quantity}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-stone-200 flex justify-between items-center">
                        <span className="font-display font-bold text-stone-900 text-lg">Total</span>
                        <span className="font-serif font-bold text-2xl text-gold-600">₹{lastOrder.total.toFixed(2)}</span>
                    </div>
                </div>

                <p className="text-xs text-stone-400 mb-8 max-w-xs mx-auto leading-relaxed font-serif italic">
                    "Patience is the secret ingredient to perfection." <br /> Please allow 15-20 minutes for preparation.
                </p>

                <button
                    onClick={clearLastOrder}
                    className="w-full bg-stone-900 text-gold-400 py-4 rounded-xl font-bold tracking-widest uppercase hover:bg-black hover:text-gold-300 transition-all shadow-lg hover:shadow-gold-500/20 group"
                >
                    Return to Menu
                </button>
            </div>
        </div>
    );
}
