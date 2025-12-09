'use client';

// components/UserProfile.tsx
// Displays logged-in user info with dropdown menu and logout option

import { useEffect, useState, useRef } from 'react';

interface UserData {
  name: string;
  email: string;
  id?: string;
  provider?: string;
}

export default function UserProfile() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch user info from our API route
    fetch('/api/auth/user')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(err => console.error('Failed to fetch user:', err))
      .finally(() => setLoading(false));

    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    // Azure App Service logout endpoint
    window.location.href = '/.auth/logout?post_logout_redirect_uri=/';
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
        <div className="w-24 h-4 bg-gray-200 animate-pulse rounded"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Get initials from name for avatar
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Info Button */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="User menu"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
          {getInitials(user.name)}
        </div>
        
        {/* User Info */}
        <div className="text-left hidden md:block">
          <div className="text-sm font-semibold text-gray-900 leading-tight">
            {user.name}
          </div>
          <div className="text-xs text-gray-500 leading-tight">
            {user.email}
          </div>
        </div>
        
        {/* Dropdown Arrow */}
        <svg 
          className={`w-4 h-4 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {/* User Info in Dropdown (for mobile) */}
          <div className="px-4 py-3 border-b border-gray-100 md:hidden">
            <div className="font-semibold text-gray-900 text-sm">
              {user.name}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {user.email}
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {/* Profile (optional - can link to a profile page) */}
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              onClick={() => {
                setDropdownOpen(false);
                // You can implement profile page navigation here if needed
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </button>

            {/* Settings (optional) */}
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              onClick={() => {
                setDropdownOpen(false);
                // You can implement settings page navigation here if needed
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 my-1"></div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}