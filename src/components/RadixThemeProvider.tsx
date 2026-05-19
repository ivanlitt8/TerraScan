"use client";

import { Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";

type RadixThemeProviderProps = {
  children: ReactNode;
};

export default function RadixThemeProvider({ children }: RadixThemeProviderProps) {
  return (
    <Theme
      appearance="dark"
      accentColor="jade"
      grayColor="slate"
      radius="medium"
      scaling="100%"
      panelBackground="translucent"
    >
      {children}
    </Theme>
  );
}
