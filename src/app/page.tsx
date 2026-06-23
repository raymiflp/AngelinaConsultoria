import type { Metadata } from "next";

import { createCaller } from "@/infrastructure/api/server-caller";
import { createContext } from "@/infrastructure/api/context";
import {
  HomeNav,
  Hero,
  SpecialtyPills,
  FeaturedDoctors,
  ValueProps,
  Footer,
} from "@/components/home";

// Home page is a public marketing page; freshness is acceptable (counts
// update as doctors verify), and the alternative — making the home static
// and fetching stats client-side — kills the SEO win. Matches the root
// layout's `force-dynamic` declaration.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Encuentra tu especialista y pide cita",
};

export default async function HomePage() {
  const caller = await createCaller(await createContext());
  const stats = await caller.profiles.getHomeStats();

  return (
    <>
      <HomeNav />
      <main>
        <Hero
          totalVerifiedDoctors={stats.totalVerifiedDoctors}
          totalSpecialties={stats.totalSpecialties}
        />
        <SpecialtyPills />
        <FeaturedDoctors />
        <ValueProps />
      </main>
      <Footer />
    </>
  );
}
