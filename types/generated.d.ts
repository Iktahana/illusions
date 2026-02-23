/** Type declarations for build-time generated files (may not exist during tsc) */
declare module "@/generated/credits.json" {
  interface CreditEntry {
    name: string;
    version: string;
    license: string;
    repository: string;
  }
  const value: CreditEntry[];
  export default value;
}
