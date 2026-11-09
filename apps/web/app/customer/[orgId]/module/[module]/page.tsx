import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function CustomerModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return <ModulePlaceholder module={module} />;
}
