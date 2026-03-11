import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Box, History, LogOut, User } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-border/30">
      <div className="container flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center glow-violet-sm group-hover:glow-violet transition-all duration-300">
            <Box className="w-5 h-5 text-primary" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight">
            3D Reconstructor
          </span>
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <>
              <Link href="/reconstruct">
                <Button
                  variant={location === "/reconstruct" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2 text-sm"
                >
                  <Box className="w-4 h-4" />
                  <span className="hidden sm:inline">Reconstruct</span>
                </Button>
              </Link>
              <Link href="/history">
                <Button
                  variant={location === "/history" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2 text-sm"
                >
                  <History className="w-4 h-4" />
                  <span className="hidden sm:inline">History</span>
                </Button>
              </Link>
            </>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-2 ml-2">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{user?.name || "User"}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="glow-violet-sm"
              onClick={() => { window.location.href = getLoginUrl(); }}
            >
              Sign In
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
