"use client";

import { createClient } from "@/utils/supabase/client";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Progress,
  SegmentedControl,
  Separator,
  Switch,
  Tabs,
  Text,
  TextField,
} from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Building2,
  CheckCircle2,
  Mail,
  MessageCircle,
  Ruler,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type Perfil = { nombre: string; email: string } | null;

type UnidadSuperficie = "hectareas" | "acres";

export default function ConfiguracionView() {
  const [perfil, setPerfil] = useState<Perfil>(null);

  // Preferencias regionales (estado local visual para el MVP).
  const [unidad, setUnidad] = useState<UnidadSuperficie>("hectareas");
  const [alertaEmail, setAlertaEmail] = useState(true);
  const [alertaWhatsapp, setAlertaWhatsapp] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = useCallback((message: string) => {
    setToast({ message, id: Date.now() });
  }, []);

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
      setPerfil({
        nombre: metaName?.trim() || email.split("@")[0] || "Usuario",
        email,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Flex
      direction="column"
      className="agro-panel h-full w-full overflow-hidden"
      px={{ initial: "4", md: "6" }}
      py={{ initial: "4", md: "6" }}
    >
      <Box
        className="h-full min-h-0 w-full"
        style={{
          maxWidth: 1100,
          marginInline: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Cabecera */}
        <Box className="shrink-0">
          <Heading size="7" weight="bold" style={{ letterSpacing: "-0.02em" }}>
            Configuración
          </Heading>
          <Text as="p" size="2" className="text-slate-400" mt="1">
            Administrá tu perfil, preferencias y el plan de tu cuenta.
          </Text>
        </Box>

        {/* Pestañas */}
        <Tabs.Root defaultValue="perfil" className="mt-5 flex min-h-0 flex-1 flex-col">
          <Tabs.List>
            <Tabs.Trigger value="perfil">
              <Flex align="center" gap="2">
                <User size={15} aria-hidden />
                Mi Perfil
              </Flex>
            </Tabs.Trigger>
            <Tabs.Trigger value="suscripcion">
              <Flex align="center" gap="2">
                <Sparkles size={15} aria-hidden />
                Suscripción y Facturación
              </Flex>
            </Tabs.Trigger>
          </Tabs.List>

          <Box pt="5" className="min-h-0 flex-1 overflow-y-auto">
            <Tabs.Content value="perfil">
              <PerfilTab
                perfil={perfil}
                unidad={unidad}
                onUnidadChange={setUnidad}
                alertaEmail={alertaEmail}
                onAlertaEmailChange={setAlertaEmail}
                alertaWhatsapp={alertaWhatsapp}
                onAlertaWhatsappChange={setAlertaWhatsapp}
              />
            </Tabs.Content>

            <Tabs.Content value="suscripcion">
              <SuscripcionTab
                onMejorarPlan={() =>
                  showToast(
                    "El módulo de pagos estará disponible próximamente en la versión comercial de Terra Scan.",
                  )
                }
              />
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </Box>

      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Pestaña: Mi Perfil                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

type PerfilTabProps = {
  perfil: Perfil;
  unidad: UnidadSuperficie;
  onUnidadChange: (value: UnidadSuperficie) => void;
  alertaEmail: boolean;
  onAlertaEmailChange: (value: boolean) => void;
  alertaWhatsapp: boolean;
  onAlertaWhatsappChange: (value: boolean) => void;
};

function PerfilTab({
  perfil,
  unidad,
  onUnidadChange,
  alertaEmail,
  onAlertaEmailChange,
  alertaWhatsapp,
  onAlertaWhatsappChange,
}: PerfilTabProps) {
  return (
    <Grid columns={{ initial: "1", md: "2" }} gap="4">
      {/* Datos de la cuenta (solo lectura) */}
      <Card size="3" variant="surface" className="agro-surface">
        <Flex align="center" gap="2" mb="4">
          <User size={16} aria-hidden style={{ color: "var(--jade-11)" }} />
          <Heading size="3" weight="medium">
            Datos de la cuenta
          </Heading>
        </Flex>

        <Flex direction="column" gap="4">
          <Box>
            <Text
              as="label"
              size="2"
              weight="medium"
              htmlFor="perfil-nombre"
              style={{ display: "block", marginBottom: 6 }}
            >
              Nombre
            </Text>
            <TextField.Root
              id="perfil-nombre"
              value={perfil?.nombre ?? ""}
              placeholder="Cargando…"
              readOnly
              size="3"
            >
              <TextField.Slot>
                <User size={15} aria-hidden />
              </TextField.Slot>
            </TextField.Root>
          </Box>

          <Box>
            <Text
              as="label"
              size="2"
              weight="medium"
              htmlFor="perfil-email"
              style={{ display: "block", marginBottom: 6 }}
            >
              Email
            </Text>
            <TextField.Root
              id="perfil-email"
              value={perfil?.email ?? ""}
              placeholder="Cargando…"
              readOnly
              size="3"
            >
              <TextField.Slot>
                <Mail size={15} aria-hidden />
              </TextField.Slot>
            </TextField.Root>
          </Box>

          <Text size="1" color="gray">
            Estos datos provienen de tu cuenta de Supabase. La edición del perfil
            llegará en una próxima iteración.
          </Text>
        </Flex>
      </Card>

      {/* Preferencias regionales */}
      <Card size="3" variant="surface" className="agro-surface">
        <Flex align="center" gap="2" mb="4">
          <Ruler size={16} aria-hidden style={{ color: "var(--jade-11)" }} />
          <Heading size="3" weight="medium">
            Preferencias regionales
          </Heading>
        </Flex>

        <Flex direction="column" gap="5">
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              Unidad de superficie
            </Text>
            <Text as="p" size="1" color="gray" mb="2">
              Cómo se muestran las áreas de tus lotes en toda la plataforma.
            </Text>
            <SegmentedControl.Root
              value={unidad}
              onValueChange={(v) => onUnidadChange(v as UnidadSuperficie)}
              size="2"
            >
              <SegmentedControl.Item value="hectareas">
                Hectáreas
              </SegmentedControl.Item>
              <SegmentedControl.Item value="acres">Acres</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Box>

          <Separator size="4" />

          <Box>
            <Flex align="center" gap="2" mb="1">
              <Bell size={14} aria-hidden style={{ color: "var(--jade-11)" }} />
              <Text as="div" size="2" weight="medium">
                Sistema de alertas
              </Text>
            </Flex>
            <Text as="p" size="1" color="gray" mb="3">
              Elegí cómo querés recibir avisos de incendios e inundaciones.
            </Text>

            <Flex direction="column" gap="3">
              <AlertaToggle
                icon={<Mail size={15} aria-hidden />}
                label="Notificaciones por Email"
                checked={alertaEmail}
                onCheckedChange={onAlertaEmailChange}
              />
              <AlertaToggle
                icon={<MessageCircle size={15} aria-hidden />}
                label="Notificaciones por WhatsApp"
                checked={alertaWhatsapp}
                onCheckedChange={onAlertaWhatsappChange}
                badge="Pronto"
              />
            </Flex>
          </Box>
        </Flex>
      </Card>
    </Grid>
  );
}

function AlertaToggle({
  icon,
  label,
  checked,
  onCheckedChange,
  badge,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  badge?: string;
}) {
  return (
    <Flex
      align="center"
      justify="between"
      gap="3"
      p="3"
      style={{
        borderRadius: "var(--radius-3)",
        backgroundColor: "var(--gray-a2)",
        border: "1px solid var(--gray-a4)",
      }}
    >
      <Flex align="center" gap="2" style={{ minWidth: 0, color: "var(--gray-11)" }}>
        {icon}
        <Text size="2" highContrast truncate>
          {label}
        </Text>
        {badge && (
          <Badge color="amber" variant="soft" size="1" radius="full">
            {badge}
          </Badge>
        )}
      </Flex>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        color="jade"
        size="2"
      />
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Pestaña: Suscripción y Facturación                                         */
/* ──────────────────────────────────────────────────────────────────────── */

type ConsumoItem = {
  label: string;
  usado: number;
  limite: number;
};

const CONSUMO: ConsumoItem[] = [
  { label: "Lotes dibujados", usado: 3, limite: 10 },
  { label: "Reportes PDF generados", usado: 2, limite: 50 },
];

type PlanFuturo = {
  nombre: string;
  precio: string;
  periodo: string;
  descripcion: string;
  features: string[];
  destacado: boolean;
  icon: ReactNode;
};

const PLANES_FUTUROS: PlanFuturo[] = [
  {
    nombre: "Productor",
    precio: "$29",
    periodo: "/ mes",
    descripcion: "Para el productor que gestiona sus propios campos.",
    features: ["Hasta 50 lotes", "Reportes ilimitados", "Alertas por Email"],
    destacado: true,
    icon: <Sparkles size={18} aria-hidden />,
  },
  {
    nombre: "Corporativo",
    precio: "A medida",
    periodo: "",
    descripcion: "Para asesores, cooperativas y grandes operaciones.",
    features: ["Lotes ilimitados", "Equipo multiusuario", "Soporte prioritario"],
    destacado: false,
    icon: <Building2 size={18} aria-hidden />,
  },
];

function SuscripcionTab({ onMejorarPlan }: { onMejorarPlan: () => void }) {
  return (
    <Flex direction="column" gap="5">
      {/* Estado actual de la cuenta */}
      <Card size="3" variant="surface" className="agro-surface">
        <Flex justify="between" align="start" gap="4" wrap="wrap">
          <Box style={{ minWidth: 0 }}>
            <Flex align="center" gap="2" mb="1">
              <Heading size="4" weight="bold">
                Plan Demo MVP
              </Heading>
              <Badge color="jade" variant="soft" radius="full">
                Activo
              </Badge>
            </Flex>
            <Text size="2" className="text-slate-400">
              Tu plan actual para explorar Terra Scan sin costo.
            </Text>
          </Box>
          <Box style={{ textAlign: "right" }}>
            <Text as="div" size="7" weight="bold" style={{ lineHeight: 1 }}>
              $0
            </Text>
            <Text size="1" color="gray">
              / mes
            </Text>
          </Box>
        </Flex>

        <Separator size="4" my="5" />

        <Text as="div" size="2" weight="medium" mb="3">
          Consumo del mes
        </Text>
        <Flex direction="column" gap="4">
          {CONSUMO.map((item) => {
            const pct = Math.min(
              100,
              Math.round((item.usado / item.limite) * 100),
            );
            return (
              <Box key={item.label}>
                <Flex justify="between" align="center" mb="1">
                  <Text size="2" className="text-slate-300">
                    {item.label}
                  </Text>
                  <Text size="2" weight="medium" highContrast>
                    {item.usado} / {item.limite}
                  </Text>
                </Flex>
                <Progress value={pct} color="jade" size="2" />
              </Box>
            );
          })}
        </Flex>
      </Card>

      {/* Planes futuros */}
      <Box>
        <Heading size="4" weight="medium" mb="1">
          Planes disponibles
        </Heading>
        <Text as="p" size="2" className="text-slate-400" mb="4">
          Escalá cuando tu operación lo necesite. Más límites, equipo y soporte.
        </Text>

        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          {PLANES_FUTUROS.map((plan) => (
            <Card
              key={plan.nombre}
              size="3"
              variant="surface"
              className="agro-surface"
              style={{
                position: "relative",
                border: plan.destacado
                  ? "1px solid var(--jade-7)"
                  : "1px solid var(--gray-a4)",
              }}
            >
              {plan.destacado && (
                <Badge
                  color="jade"
                  variant="solid"
                  radius="full"
                  size="1"
                  style={{ position: "absolute", top: 12, right: 12 }}
                >
                  Recomendado
                </Badge>
              )}

              <Flex
                align="center"
                justify="center"
                mb="3"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-4)",
                  backgroundColor: "var(--jade-a3)",
                  color: "var(--jade-11)",
                }}
              >
                {plan.icon}
              </Flex>

              <Heading size="4" weight="bold">
                {plan.nombre}
              </Heading>
              <Flex align="end" gap="1" mt="1" mb="2">
                <Text size="6" weight="bold" style={{ lineHeight: 1 }}>
                  {plan.precio}
                </Text>
                {plan.periodo && (
                  <Text size="2" color="gray">
                    {plan.periodo}
                  </Text>
                )}
              </Flex>
              <Text as="p" size="2" className="text-slate-400" mb="3">
                {plan.descripcion}
              </Text>

              <Flex direction="column" gap="2" mb="4">
                {plan.features.map((feature) => (
                  <Flex key={feature} align="center" gap="2">
                    <CheckCircle2
                      size={15}
                      aria-hidden
                      style={{ color: "var(--jade-11)", flexShrink: 0 }}
                    />
                    <Text size="2" className="text-slate-300">
                      {feature}
                    </Text>
                  </Flex>
                ))}
              </Flex>

              <Button
                type="button"
                color="jade"
                variant={plan.destacado ? "solid" : "soft"}
                highContrast={plan.destacado}
                size="3"
                style={{ width: "100%" }}
                onClick={onMejorarPlan}
              >
                Mejorar Plan
              </Button>
            </Card>
          ))}
        </Grid>
      </Box>
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Toast                                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

type ToastState = {
  message: string;
  id: number;
};

function ToastNotification({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            maxWidth: 400,
          }}
          role="status"
          aria-live="polite"
        >
          <Card
            size="2"
            className="agro-glass"
            style={{ borderLeft: "3px solid var(--jade-9)" }}
          >
            <Flex align="center" gap="3">
              <Sparkles
                size={18}
                aria-hidden
                style={{ color: "var(--jade-11)", flexShrink: 0 }}
              />
              <Text size="2" weight="medium" style={{ minWidth: 0 }}>
                {toast.message}
              </Text>
              <IconButton
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                aria-label="Cerrar notificación"
                onClick={onDismiss}
                style={{ flexShrink: 0, marginLeft: "auto" }}
              >
                <X size={14} aria-hidden />
              </IconButton>
            </Flex>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
