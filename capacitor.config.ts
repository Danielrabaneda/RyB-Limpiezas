import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ryblimpiezas.operarios",
  appName: "RyB Operarios",
  webDir: "dist",
  backgroundColor: "#ffffff",
  android: {
    allowMixedContent: false,
  },
};

export default config;
