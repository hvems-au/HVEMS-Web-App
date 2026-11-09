import { ClipboardCheck, Truck, Wrench } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const FEATURES = [
  { icon: Truck, title: "Equipment Management", body: "Track and manage all heavy vehicles and equipment" },
  { icon: Wrench, title: "Maintenance Scheduling", body: "Keep your fleet running with planned maintenance." },
  { icon: ClipboardCheck, title: "Inspections & Compliance", body: "Digital checklists and inspection records." },
];

/** Split-screen auth layout from the Figma "Company - Login" frame. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[52%_48%]">
      <aside className="hidden bg-shade px-14 py-12 text-white lg:flex lg:flex-col">
        <div className="w-[230px]">
          <Logo onDark priority />
        </div>
        <div className="mt-auto mb-auto max-w-md pt-10">
          <h2 className="text-h1">Manage Your Fleet Smarter, Safer and More Efficiently</h2>
          <p className="mt-5 text-[18px] leading-[30px] font-medium text-white/90">
            A complete platform to manage your equipment, maintenance, inspections, jobs and team — all in one place.
          </p>
          <ul className="mt-10 flex flex-col gap-7">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-4">
                <span className="flex size-[60px] shrink-0 items-center justify-center rounded-[6px] border-2 border-brand text-brand">
                  <f.icon className="size-7" aria-hidden />
                </span>
                <span>
                  <span className="block text-[18px] font-semibold">{f.title}</span>
                  <span className="block text-[14px] font-medium text-white/85">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center bg-canvas px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
