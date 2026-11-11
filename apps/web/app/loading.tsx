import { BrandLoader } from "@/components/brand/brand-loader";

/** Full-screen loader for pages outside the portal shell (sign-in, onboarding, account, driver). */
export default function Loading() {
  return <BrandLoader fullScreen />;
}
