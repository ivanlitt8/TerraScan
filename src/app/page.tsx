import AuthForm from "@/components/AuthForm";
import { Box, Callout, Flex, Text } from "@radix-ui/themes";
import { AlertCircle, CheckCircle2 } from "lucide-react";

type HomePageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    tab?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const initialTab = params.tab === "signup" ? "signup" : "login";
  const errorMessage = params.error?.trim();
  const successMessage = params.message?.trim();

  return (
    <Box
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-12"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(16, 185, 129, 0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(15, 23, 42, 0.8), transparent)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[length:4rem_4rem] bg-[linear-gradient(to_right,rgba(51,65,85,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(51,65,85,0.08)_1px,transparent_1px)]"
      />

      <Flex
        direction="column"
        align="center"
        gap="5"
        className="relative z-10 w-full max-w-md"
      >
        {errorMessage ? (
          <Callout.Root
            color="red"
            variant="surface"
            role="alert"
            className="w-full border border-red-500/20 bg-red-950/40"
          >
            <Callout.Icon>
              <AlertCircle size={18} aria-hidden />
            </Callout.Icon>
            <Callout.Text>
              <Text weight="medium">No pudimos completar la operación</Text>
              <Text as="p" size="2" mt="1" className="text-red-200/90">
                {errorMessage}
              </Text>
            </Callout.Text>
          </Callout.Root>
        ) : null}

        {successMessage ? (
          <Callout.Root
            color="green"
            variant="surface"
            role="status"
            className="w-full border border-emerald-500/25 bg-emerald-950/40"
          >
            <Callout.Icon>
              <CheckCircle2 size={18} aria-hidden />
            </Callout.Icon>
            <Callout.Text>
              <Text weight="medium" className="text-emerald-100">
                Registro exitoso
              </Text>
              <Text as="p" size="2" mt="1" className="text-emerald-200/90">
                {successMessage}
              </Text>
            </Callout.Text>
          </Callout.Root>
        ) : null}

        <AuthForm key={initialTab} initialTab={initialTab} />
      </Flex>
    </Box>
  );
}
