import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  Shield,
  LogOut,
} from "lucide-react";
import { useProfile, useLogout } from "@/hooks/useApi";
import { clsx } from "clsx";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/queue", label: "Review queue", icon: ListChecks },
  { to: "/submit", label: "Submit content", icon: PlusCircle },
];

export default function Layout() {
  const { data: user } = useProfile();
  const logout = useLogout();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-4">
          <Shield className="h-6 w-6 text-brand-600" />
          <span className="text-sm font-semibold text-gray-900">
            Moderation
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-brand-50 font-medium text-brand-700"
                    : "text-gray-600 hover:bg-gray-100"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {user?.username ?? "Loading..."}
              </p>
              <p className="truncate text-xs text-gray-400">
                {user?.email ?? ""}
              </p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
