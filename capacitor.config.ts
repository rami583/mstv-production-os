import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";
import { Style } from "@capacitor/status-bar";

const config: CapacitorConfig = {
  appId: "com.monsieurmonsieur.mstvproductionos",
  appName: "MSTV Production OS",
  webDir: "out",
  backgroundColor: "#f7f9fb",
  ios: {
    backgroundColor: "#f7f9fb",
    contentInset: "never",
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Light,
    },
    StatusBar: {
      overlaysWebView: false,
      style: Style.Light,
      backgroundColor: "#f7f9fb",
    },
  },
};

export default config;
