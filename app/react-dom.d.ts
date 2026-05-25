declare module "react-dom" {
  export function flushSync(callback: () => void): void;
}
