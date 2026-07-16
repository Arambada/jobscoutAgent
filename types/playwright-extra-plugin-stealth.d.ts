declare module "playwright-extra-plugin-stealth" {
  import type { PlaywrightExtraPlugin } from "playwright-extra";
  function StealthPlugin(): PlaywrightExtraPlugin;
  export = StealthPlugin;
}
