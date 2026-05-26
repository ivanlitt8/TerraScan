import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `@huggingface/transformers` y `onnxruntime-web` están pensados para
  // correr en el navegador. Si Next intenta bundlearlos en el server
  // (vía RSC / route handlers), tropieza con dependencias `node:` y workers
  // que no existen del lado server. Los marcamos como externos para que se
  // resuelvan en runtime y nunca entren al bundle de Node.
  serverExternalPackages: [
    "@huggingface/transformers",
    "onnxruntime-web",
    "onnxruntime-node",
  ],
};

export default nextConfig;
