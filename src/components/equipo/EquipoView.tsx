"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Table,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Sparkles, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/** Tope de usuarios del plan actual (MVP, hardcodeado). */
const PLAN_SEATS = 5;

type RoleTone = "jade" | "blue";

type Miembro = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  rolTone: RoleTone;
  esTu: boolean;
};

/**
 * Miembros simulados del workspace (MVP). En una iteración futura esto vendrá
 * de `GET /api/equipo` cuando exista el módulo multi-usuario en el backend.
 */
const MIEMBROS: Miembro[] = [
  {
    id: "owner",
    nombre: "Iván",
    email: "Ivan@terrascan.com",
    rol: "Productor / Dueño",
    rolTone: "jade",
    esTu: true,
  },
  {
    id: "asesor-1",
    nombre: "Ing. Agr. Carlos Mendoza",
    email: "carlos.mendoza@agroasesores.com",
    rol: "Asesor Agrónomo",
    rolTone: "blue",
    esTu: false,
  },
];

/** Iniciales para el avatar (máx. 2 letras). */
function iniciales(nombre: string): string {
  const limpio = nombre.replace(/^(Ing\.|Agr\.)\s*/gi, "").trim();
  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export default function EquipoView() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ message, id: Date.now() });
  }, []);

  const handleContactarSoporte = useCallback(() => {
    setInviteOpen(false);
    showToast("Redirigiendo a soporte…");
  }, [showToast]);

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
          maxWidth: 1280,
          marginInline: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Cabecera */}
        <Flex
          align="center"
          justify="between"
          gap="4"
          wrap="wrap"
          className="shrink-0"
        >
          <Box style={{ minWidth: 0 }}>
            <Flex align="center" gap="3" wrap="wrap">
              <Heading
                size="7"
                weight="bold"
                style={{ letterSpacing: "-0.02em" }}
              >
                Miembros del Equipo
              </Heading>
              <Badge color="jade" variant="soft" radius="full" size="2">
                {MIEMBROS.length} / {PLAN_SEATS} usuarios
              </Badge>
            </Flex>
            <Text as="p" size="2" className="text-slate-400" mt="1">
              Gestioná quién accede a tu espacio de trabajo y con qué rol.
            </Text>
          </Box>

          <Button
            type="button"
            size="3"
            color="jade"
            highContrast
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus size={16} aria-hidden />
            Invitar Miembro
          </Button>
        </Flex>

        {/* Tabla de miembros */}
        <Box className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <Card size="2" variant="surface" className="agro-surface">
            <Table.Root variant="ghost" size="2">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Miembro</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Rol</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Estado</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">
                    Acciones
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {MIEMBROS.map((miembro) => (
                  <Table.Row key={miembro.id} align="center">
                    <Table.RowHeaderCell>
                      <Flex align="center" gap="3" style={{ minWidth: 0 }}>
                        <Flex
                          align="center"
                          justify="center"
                          flexShrink="0"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "var(--radius-3)",
                            backgroundColor:
                              miembro.rolTone === "jade"
                                ? "var(--jade-a3)"
                                : "var(--blue-a3)",
                            color:
                              miembro.rolTone === "jade"
                                ? "var(--jade-11)"
                                : "var(--blue-11)",
                            fontSize: "var(--font-size-1)",
                            fontWeight: 600,
                          }}
                          aria-hidden
                        >
                          {iniciales(miembro.nombre)}
                        </Flex>
                        <Box style={{ minWidth: 0 }}>
                          <Flex align="center" gap="2">
                            <Text
                              size="2"
                              weight="medium"
                              highContrast
                              truncate
                            >
                              {miembro.nombre}
                            </Text>
                            {miembro.esTu && (
                              <Badge color="gray" variant="soft" size="1">
                                Tú
                              </Badge>
                            )}
                          </Flex>
                          <Text size="1" className="text-slate-400" truncate>
                            {miembro.email}
                          </Text>
                        </Box>
                      </Flex>
                    </Table.RowHeaderCell>

                    <Table.Cell>
                      <Badge
                        color={miembro.rolTone}
                        variant="soft"
                        radius="full"
                      >
                        {miembro.rol}
                      </Badge>
                    </Table.Cell>

                    <Table.Cell>
                      <Flex align="center" gap="2">
                        <Box
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            backgroundColor: "var(--jade-9)",
                            boxShadow: "0 0 0 3px var(--jade-a4)",
                          }}
                          aria-hidden
                        />
                        <Text size="2" className="text-slate-300">
                          Activo
                        </Text>
                      </Flex>
                    </Table.Cell>

                    <Table.Cell justify="end">
                      <Flex justify="end">
                        <Tooltip content="Revocar acceso (próximamente)">
                          {/* `span` para que el Tooltip funcione sobre un botón disabled. */}
                          <span style={{ display: "inline-flex" }}>
                            <IconButton
                              type="button"
                              variant="ghost"
                              color="red"
                              size="1"
                              disabled
                              aria-label={`Revocar acceso de ${miembro.nombre}`}
                            >
                              <X size={15} aria-hidden />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Card>

          <Text as="p" size="1" className="text-slate-500" mt="3">
            La gestión de accesos y roles avanzados forma parte de los planes
            Corporativos. Tu plan actual incluye {PLAN_SEATS} usuarios.
          </Text>
        </Box>
      </Box>

      {/* Modal: bloqueo de feature corporativa */}
      <Dialog.Root open={inviteOpen} onOpenChange={setInviteOpen}>
        <Dialog.Content maxWidth="480px">
          <Flex
            align="center"
            justify="center"
            mb="3"
            style={{
              width: 52,
              height: 52,
              borderRadius: "var(--radius-5)",
              background:
                "linear-gradient(135deg, var(--jade-a4), var(--blue-a3))",
              color: "var(--jade-11)",
            }}
            aria-hidden
          >
            <Sparkles size={26} />
          </Flex>

          <Dialog.Title size="5" mb="2">
            ¡Potencia tu operación en equipo!
          </Dialog.Title>
          <Dialog.Description size="2" color="gray">
            La gestión de múltiples usuarios, roles avanzados (Agrónomos,
            Contratistas) y auditoría de cambios está disponible exclusivamente
            en nuestros planes Corporativos premium. Ponte en contacto con
            nuestro equipo de soporte para habilitar esta función en tu cuenta.
          </Dialog.Description>

          <Flex gap="3" mt="5" justify="end">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray">
                Cerrar
              </Button>
            </Dialog.Close>
            <Button type="button" color="jade" onClick={handleContactarSoporte}>
              <Sparkles size={16} aria-hidden />
              Contactar Soporte
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </Flex>
  );
}

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
    const timer = window.setTimeout(onDismiss, 3000);
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
            maxWidth: 380,
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
              <CheckCircle2
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
