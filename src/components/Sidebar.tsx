"use client";

import { createClient } from "@/utils/supabase/client";
import { Avatar, Box, Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import {
  ChevronLeft,
  FileText,
  LayoutDashboard,
  Leaf,
  LogOut,
  Map as MapIcon,
  Settings,
  Sprout,
  Users,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

/** Item de navegación de la Sidebar. `href` alimenta el router de Next. */
type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
};

/**
 * Bloque superior: navegación operativa/analítica de la plataforma.
 * Las pantallas se irán conectando a medida que existan sus rutas.
 */
const PRIMARY_NAV: readonly NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { key: "mapa", label: "Mapa interactivo", icon: MapIcon, href: "/mapa" },
  { key: "establecimientos", label: "Establecimientos", icon: Sprout, href: "/establecimientos" },
  { key: "reportes", label: "Reportes", icon: FileText, href: "/reportes" },
] as const;

/** Bloque inferior: soporte, equipo e infraestructura de la cuenta. */
const SECONDARY_NAV: readonly NavItem[] = [
  { key: "equipo", label: "Mi equipo", icon: Users, href: "/equipo" },
  { key: "configuracion", label: "Configuración", icon: Settings, href: "/configuracion" },
] as const;

const WIDTH_EXPANDED = 256;
const WIDTH_COLLAPSED = 72;

type SidebarProps = {
  /** Estado inicial colapsado (por defecto expandida). */
  defaultCollapsed?: boolean;
};

export default function Sidebar({ defaultCollapsed = false }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const [profile, setProfile] = useState<{ nombre: string; email: string } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      if (!user) return;
      const email = user.email ?? "";
      const metaName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined);
      setProfile({
        nombre: metaName?.trim() || email.split("@")[0] || "Usuario",
        email,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const isActive = useCallback(
    (href: string) =>
      pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`)),
    [pathname],
  );

  const handleNavigate = useCallback(
    (href: string) => {
      if (pathname !== href) router.push(href);
    },
    [pathname, router],
  );

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }, [router]);

  const initials = profile
    ? profile.nombre
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
    : "";

  return (
    <Flex
      direction="column"
      justify="between"
      flexShrink="0"
      className="agro-panel h-screen transition-all duration-300 ease-in-out"
      style={{
        width: isCollapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED,
        borderRight: "1px solid var(--agro-border)",
      }}
    >
      <Box>
        {/* ── Cabecera: isotipo + wordmark + toggle ─────────────────────── */}
        <Flex
          align="center"
          justify={isCollapsed ? "center" : "between"}
          gap="2"
          px={isCollapsed ? "0" : "3"}
          style={{
            height: 64,
            borderBottom: "1px solid var(--agro-border)",
          }}
        >
          <Flex align="center" gap="2" style={{ minWidth: 0 }}>
            <Flex
              align="center"
              justify="center"
              flexShrink="0"
              style={{
                width: 36,
                height: 36,
                borderRadius: "var(--radius-3)",
                backgroundColor: "var(--jade-9)",
                color: "var(--jade-12)",
              }}
            >
              <Leaf size={20} strokeWidth={2.25} aria-hidden />
            </Flex>
            <CollapsibleText isCollapsed={isCollapsed}>
              <Text size="3" weight="bold" highContrast style={{ letterSpacing: "-0.01em" }}>
                Terra Scan
              </Text>
            </CollapsibleText>
          </Flex>

          {!isCollapsed && (
            <Tooltip content="Colapsar barra" side="right">
              <IconButton
                type="button"
                size="2"
                variant="ghost"
                color="gray"
                aria-label="Colapsar barra lateral"
                onClick={() => setIsCollapsed(true)}
              >
                <ChevronLeft size={18} aria-hidden />
              </IconButton>
            </Tooltip>
          )}
        </Flex>

        {/* Botón de expandir cuando está colapsada (debajo del isotipo). */}
        {isCollapsed && (
          <Flex justify="center" py="2">
            <Tooltip content="Expandir barra" side="right">
              <IconButton
                type="button"
                size="2"
                variant="ghost"
                color="gray"
                aria-label="Expandir barra lateral"
                onClick={() => setIsCollapsed(false)}
              >
                <ChevronLeft
                  size={18}
                  aria-hidden
                  style={{ transform: "rotate(180deg)" }}
                />
              </IconButton>
            </Tooltip>
          </Flex>
        )}

        {/* ── Bloque principal de navegación ────────────────────────────── */}
        <nav aria-label="Navegación principal">
          <Flex direction="column" gap="1" px="2" py="3">
            {PRIMARY_NAV.map((item) => (
              <NavButton
                key={item.key}
                item={item}
                isCollapsed={isCollapsed}
                isActive={Boolean(isActive(item.href))}
                onNavigate={handleNavigate}
              />
            ))}
          </Flex>
        </nav>
      </Box>

      {/* ── Bloque inferior: soporte + perfil ───────────────────────────── */}
      <Box>
        <nav aria-label="Cuenta y soporte">
          <Flex
            direction="column"
            gap="1"
            px="2"
            py="3"
            style={{ borderTop: "1px solid var(--agro-border)" }}
          >
            {SECONDARY_NAV.map((item) => (
              <NavButton
                key={item.key}
                item={item}
                isCollapsed={isCollapsed}
                isActive={Boolean(isActive(item.href))}
                onNavigate={handleNavigate}
              />
            ))}
          </Flex>
        </nav>

        {/* Perfil de usuario al pie. */}
        <Flex
          align="center"
          gap="2"
          px={isCollapsed ? "0" : "3"}
          py="3"
          justify={isCollapsed ? "center" : "between"}
          style={{ borderTop: "1px solid var(--agro-border)" }}
        >
          <Tooltip
            content={profile?.nombre ?? "Perfil"}
            side="right"
            // Solo es informativo cuando está colapsada; expandida ya se ve.
            open={isCollapsed ? undefined : false}
          >
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              <Avatar
                size="2"
                radius="full"
                fallback={initials || "U"}
                color="jade"
                variant="soft"
              />
              <CollapsibleText isCollapsed={isCollapsed}>
                <Flex direction="column" style={{ minWidth: 0, lineHeight: 1.2 }}>
                  <Text size="2" weight="medium" highContrast truncate>
                    {profile?.nombre ?? "—"}
                  </Text>
                  <Text size="1" color="gray" truncate>
                    {profile?.email ?? "Sin sesión"}
                  </Text>
                </Flex>
              </CollapsibleText>
            </Flex>
          </Tooltip>

          {!isCollapsed && (
            <Tooltip content="Cerrar sesión" side="top">
              <IconButton
                type="button"
                size="2"
                variant="ghost"
                color="gray"
                aria-label="Cerrar sesión"
                onClick={() => void handleLogout()}
              >
                <LogOut size={16} aria-hidden />
              </IconButton>
            </Tooltip>
          )}
        </Flex>
      </Box>
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

type NavButtonProps = {
  item: NavItem;
  isCollapsed: boolean;
  isActive: boolean;
  onNavigate: (href: string) => void;
};

/** Botón de navegación: icono + texto, con tooltip cuando está colapsado. */
function NavButton({ item, isCollapsed, isActive, onNavigate }: NavButtonProps) {
  const { icon: Icon, label, href } = item;

  const button = (
    <button
      type="button"
      onClick={() => onNavigate(href)}
      aria-current={isActive ? "page" : undefined}
      className="transition-colors duration-200"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        height: 40,
        paddingInline: isCollapsed ? 0 : 12,
        justifyContent: isCollapsed ? "center" : "flex-start",
        borderRadius: "var(--radius-3)",
        cursor: "pointer",
        border: "none",
        background: isActive ? "var(--jade-a4)" : "transparent",
        color: isActive ? "var(--jade-11)" : "var(--gray-11)",
        fontWeight: isActive ? 600 : 500,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "var(--gray-a3)";
          e.currentTarget.style.color = "var(--gray-12)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--gray-11)";
        }
      }}
    >
      <Icon size={20} strokeWidth={2} aria-hidden style={{ flexShrink: 0 }} />
      <CollapsibleText isCollapsed={isCollapsed}>
        <Text size="2" style={{ color: "inherit", fontWeight: "inherit" }}>
          {label}
        </Text>
      </CollapsibleText>
    </button>
  );

  if (isCollapsed) {
    return (
      <Tooltip content={label} side="right">
        {button}
      </Tooltip>
    );
  }

  return button;
}

/* ──────────────────────────────────────────────────────────────────────── */

type CollapsibleTextProps = {
  isCollapsed: boolean;
  children: ReactNode;
};

/**
 * Envoltorio que anima la desaparición del texto al colapsar: la barra
 * achica su ancho y el texto se desvanece + colapsa su espacio en sincronía.
 */
function CollapsibleText({ isCollapsed, children }: CollapsibleTextProps) {
  return (
    <span
      className="transition-all duration-300 ease-in-out"
      style={{
        overflow: "hidden",
        whiteSpace: "nowrap",
        opacity: isCollapsed ? 0 : 1,
        maxWidth: isCollapsed ? 0 : 180,
        minWidth: 0,
      }}
      aria-hidden={isCollapsed}
    >
      {children}
    </span>
  );
}
