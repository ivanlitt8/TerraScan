"use client";

import {
  ApiServiceError,
  fetchEstablecimientos,
  type EstablecimientoListItem,
} from "@/services";
import {
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  Select,
  Text,
  TextField,
} from "@radix-ui/themes";
import { AlertTriangle, Loader2, MapPin, Sprout } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

const SIN_CAMPO = "__none__";

export type CrearLoteValues = {
  nombre: string;
  establecimientoId: string | null;
};

type CrearLoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Nombre autogenerado que se usa como placeholder y como valor por defecto
   * si el usuario no escribe nada.
   */
  nombreSugerido: string;
  /** Hectáreas del polígono dibujado (contexto para el usuario). */
  hectareas: number;
  /** `true` mientras corre el análisis/creación en el backend. */
  creating: boolean;
  /** Se dispara al confirmar; el padre ejecuta la creación real. */
  onConfirm: (values: CrearLoteValues) => void;
  /** Redirección a login si la carga de establecimientos da 401. */
  onAuthError: () => void;
};

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

/**
 * Diálogo previo a la creación del lote: el usuario confirma el nombre y,
 * opcionalmente, lo asigna a un establecimiento. Si cancela, no se crea nada
 * (el padre conserva el polígono y el estado "Confirmar lote").
 */
export default function CrearLoteDialog({
  open,
  onOpenChange,
  nombreSugerido,
  hectareas,
  creating,
  onConfirm,
  onAuthError,
}: CrearLoteDialogProps) {
  const [nombre, setNombre] = useState("");
  const [establecimientoId, setEstablecimientoId] = useState<string | null>(
    null,
  );
  const [opciones, setOpciones] = useState<EstablecimientoListItem[]>([]);
  const [loadingCampos, setLoadingCampos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir: reset de campos y carga de establecimientos del usuario.
  useEffect(() => {
    if (!open) return;

    setNombre("");
    setEstablecimientoId(null);
    setError(null);
    setLoadingCampos(true);

    const controller = new AbortController();
    let cancelled = false;

    fetchEstablecimientos({ signal: controller.signal })
      .then((data) => {
        if (cancelled) return;
        setOpciones(data);
        setLoadingCampos(false);
      })
      .catch((cause: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        if (cause instanceof ApiServiceError && cause.status === 401) {
          onAuthError();
          return;
        }
        // No es bloqueante: el usuario igual puede crear el lote sin campo.
        setOpciones([]);
        setLoadingCampos(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, onAuthError]);

  const tieneCampos = opciones.length > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nombreFinal = nombre.trim() || nombreSugerido;
    if (nombreFinal.length > 120) {
      setError("El nombre no puede superar los 120 caracteres.");
      return;
    }
    onConfirm({ nombre: nombreFinal, establecimientoId });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // No permitimos cerrar mientras se está creando.
        if (creating) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Content maxWidth="440px">
        <Dialog.Title>Crear lote</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Confirmá el nombre y, si querés, asignalo a un establecimiento.
        </Dialog.Description>

        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="4">
            {/* Nombre */}
            <Box>
              <Text
                as="label"
                size="2"
                weight="medium"
                htmlFor="crear-lote-nombre"
                style={{ display: "block", marginBottom: 6 }}
              >
                Nombre del lote
              </Text>
              <TextField.Root
                id="crear-lote-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={nombreSugerido}
                size="3"
                autoFocus
                disabled={creating}
                maxLength={120}
                aria-label="Nombre del lote"
              />
              <Text as="p" size="1" color="gray" mt="1">
                Si lo dejás vacío usaremos “{nombreSugerido}”.
              </Text>
            </Box>

            {/* Establecimiento (opcional) */}
            <Box>
              <Flex align="center" gap="2" style={{ marginBottom: 6 }}>
                <Sprout size={15} aria-hidden style={{ color: "var(--jade-11)" }} />
                <Text as="label" size="2" weight="medium">
                  Establecimiento
                </Text>
                <Text size="1" color="gray">
                  (opcional)
                </Text>
              </Flex>

              {loadingCampos ? (
                <Flex align="center" gap="2" style={{ color: "var(--gray-11)" }}>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  <Text size="1">Cargando establecimientos…</Text>
                </Flex>
              ) : tieneCampos ? (
                <Select.Root
                  value={establecimientoId ?? SIN_CAMPO}
                  onValueChange={(v) =>
                    setEstablecimientoId(v === SIN_CAMPO ? null : v)
                  }
                  disabled={creating}
                  size="3"
                >
                  <Select.Trigger
                    placeholder="Sin establecimiento"
                    style={{ width: "100%" }}
                  />
                  <Select.Content position="popper">
                    <Select.Item value={SIN_CAMPO}>
                      Sin establecimiento
                    </Select.Item>
                    <Select.Separator />
                    {opciones.map((est) => (
                      <Select.Item key={est.id} value={est.id}>
                        {est.nombre}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              ) : (
                <Text size="1" color="gray">
                  Todavía no tenés establecimientos. Podés crear el lote sin
                  asignarlo y agruparlo más tarde.
                </Text>
              )}
            </Box>

            {/* Contexto: superficie */}
            <Callout.Root size="1" variant="soft" color="gray">
              <Callout.Icon>
                <MapPin size={14} aria-hidden />
              </Callout.Icon>
              <Callout.Text>
                Superficie dibujada: {HECTAREAS_FMT.format(hectareas)} ha.
              </Callout.Text>
            </Callout.Root>

            {error && (
              <Callout.Root size="1" variant="soft" color="red">
                <Callout.Icon>
                  <AlertTriangle size={14} aria-hidden />
                </Callout.Icon>
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            <Flex gap="3" justify="end" mt="2">
              <Dialog.Close>
                <Button
                  type="button"
                  variant="soft"
                  color="gray"
                  disabled={creating}
                >
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button type="submit" color="grass" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                    Creando…
                  </>
                ) : (
                  "Crear lote"
                )}
              </Button>
            </Flex>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
