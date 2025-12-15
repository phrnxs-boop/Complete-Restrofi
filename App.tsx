import React, { useState } from 'react';
import { RestaurantProvider, useRestaurant } from './context/RestaurantContext';
import { CustomerApp } from './pages/CustomerApp';
import { AdminDashboard } from './pages/AdminDashboard';
import { LaunchLanding } from './pages/LaunchLanding';
import { Onboarding } from './pages/Onboarding';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { Contact } from './pages/Contact';
import { StaffLoginModal } from './components/StaffLoginModal';
import { AuthModal } from './components/AuthModal';
import { Icons } from './components/ui/Icons';

const AppContent: React.FC = () => {
    const { viewMode, tableId, tableNumber, isAdmin, setIsLoginModalOpen, isLoginModalOpen, user, openAuthModal } = useRestaurant();

    return (
        <div className="font-sans antialiased text-stone-900 bg-stone-50 min-h-screen">
            <AuthModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />

            {viewMode === 'LANDING' && <LaunchLanding />}
            {viewMode === 'PRIVACY' && <PrivacyPolicy />}
            {viewMode === 'TERMS' && <TermsOfService />}
            {viewMode === 'CONTACT' && <Contact />}

            {viewMode === 'ONBOARDING' && <Onboarding />}

            {viewMode === 'APP' && (
                <>
                    {isAdmin ? <AdminDashboard /> : <CustomerApp />}

                    {/* Toggle Switcher Logic - Only show button if NOT at a specific table (i.e. URL generic access) */}
                    {!tableNumber && !isAdmin && (
                        <div className="fixed bottom-4 left-4 z-50">
                            <button
                                onClick={() => openAuthModal('LOGIN')}
                                className="px-4 py-2 bg-stone-900/90 backdrop-blur text-xs text-stone-400 rounded-full shadow-lg hover:text-white transition border border-stone-700 flex items-center gap-2"
                            >
                                <Icons.User className="w-3 h-3" />
                                {user ? 'My Account' : 'Login / Signup'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function App() {
    return (
        <RestaurantProvider>
            <AppContent />
        </RestaurantProvider>
    );
}

export default App;
