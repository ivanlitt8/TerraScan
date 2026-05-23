"use client";

import { login, signup } from "@/app/actions/auth";
import {
  Box,
  Button,
  Flex,
  Heading,
  Separator,
  Tabs,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Loader2, Lock, Mail, Satellite } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type AuthTab = "login" | "signup";

type AuthFormProps = {
  initialTab: AuthTab;
};

export default function AuthForm({ initialTab }: AuthFormProps) {
  const [pendingAction, setPendingAction] = useState<AuthTab | null>(null);

  const wrapAction = (tab: AuthTab, action: typeof login) => {
    return async (formData: FormData) => {
      setPendingAction(tab);
      try {
        await action(formData);
      } finally {
        setPendingAction(null);
      }
    };
  };

  return (
    <Box className="relative w-full max-w-md">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl"
      />

      <Flex
        direction="column"
        gap="5"
        className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/80 p-8 shadow-2xl shadow-emerald-950/20 backdrop-blur-md"
      >
        <Flex direction="column" align="center" gap="2" className="text-center">
          <Flex
            align="center"
            justify="center"
            className="mb-1 h-12 w-12 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            <Satellite size={24} strokeWidth={1.75} aria-hidden />
          </Flex>
          <Heading as="h1" size="6" className="tracking-tight text-slate-50">
            TerraScan
          </Heading>
          <Text size="2" color="gray" className="max-w-xs text-slate-400">
            Historial satelital y salud de lotes en la Región Pampeana
          </Text>
        </Flex>

        <Tabs.Root key={initialTab} defaultValue={initialTab}>
          <Tabs.List
            size="2"
            className="grid w-full grid-cols-2 rounded-lg bg-slate-900/80 p-1"
          >
            <Tabs.Trigger
              value="login"
              className="rounded-md data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-300"
            >
              Iniciar sesión
            </Tabs.Trigger>
            <Tabs.Trigger
              value="signup"
              className="rounded-md data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-300"
            >
              Registrarse
            </Tabs.Trigger>
          </Tabs.List>

          <Box pt="4">
            <Tabs.Content value="login">
              <form action={wrapAction("login", login)} className="space-y-4">
                <AuthFields
                  emailId="login-email"
                  passwordId="login-password"
                  disabled={pendingAction !== null}
                />
                <Button
                  type="submit"
                  size="3"
                  className="w-full cursor-pointer bg-emerald-600 hover:bg-emerald-500"
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "login" ? (
                    <Flex align="center" gap="2">
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Ingresando…
                    </Flex>
                  ) : (
                    "Ingresar"
                  )}
                </Button>
              </form>
            </Tabs.Content>

            <Tabs.Content value="signup">
              <form action={wrapAction("signup", signup)} className="space-y-4">
                <AuthFields
                  emailId="signup-email"
                  passwordId="signup-password"
                  disabled={pendingAction !== null}
                  passwordMinLength={6}
                  passwordHelper="Mínimo 6 caracteres."
                />
                <Button
                  type="submit"
                  size="3"
                  variant="soft"
                  className="w-full cursor-pointer border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "signup" ? (
                    <Flex align="center" gap="2">
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Creando cuenta…
                    </Flex>
                  ) : (
                    "Crear cuenta"
                  )}
                </Button>
              </form>
            </Tabs.Content>
          </Box>
        </Tabs.Root>

        <Separator size="4" className="bg-slate-800" />

        <Text size="1" align="center" color="gray" className="text-slate-500">
          Al continuar aceptás el uso de TerraScan para análisis agrícola.{" "}
          <Link
            href="/mapa"
            className="text-emerald-400/90 underline-offset-2 hover:text-emerald-300 hover:underline"
          >
            Explorar sin cuenta
          </Link>
        </Text>
      </Flex>
    </Box>
  );
}

type AuthFieldsProps = {
  emailId: string;
  passwordId: string;
  disabled?: boolean;
  passwordMinLength?: number;
  passwordHelper?: string;
};

function AuthFields({
  emailId,
  passwordId,
  disabled = false,
  passwordMinLength = 1,
  passwordHelper,
}: AuthFieldsProps) {
  return (
    <Flex direction="column" gap="3">
      <label htmlFor={emailId}>
        <Text as="div" size="2" weight="medium" mb="1" className="text-slate-300">
          Correo electrónico
        </Text>
        <TextField.Root
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="productor@campo.com.ar"
          required
          disabled={disabled}
          size="3"
        >
          <TextField.Slot side="left" className="text-slate-500">
            <Mail size={16} aria-hidden />
          </TextField.Slot>
        </TextField.Root>
      </label>

      <label htmlFor={passwordId}>
        <Text as="div" size="2" weight="medium" mb="1" className="text-slate-300">
          Contraseña
        </Text>
        <TextField.Root
          id={passwordId}
          name="password"
          type="password"
          autoComplete={
            passwordMinLength >= 6 ? "new-password" : "current-password"
          }
          placeholder="••••••••"
          required
          minLength={passwordMinLength}
          disabled={disabled}
          size="3"
        >
          <TextField.Slot side="left" className="text-slate-500">
            <Lock size={16} aria-hidden />
          </TextField.Slot>
        </TextField.Root>
        {passwordHelper ? (
          <Text size="1" color="gray" mt="1" className="text-slate-500">
            {passwordHelper}
          </Text>
        ) : null}
      </label>
    </Flex>
  );
}
