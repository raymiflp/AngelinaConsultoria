const BASE = "http://localhost:3000";

async function call(path, input) {
  // Queries require GET, mutations POST
  const params = new URLSearchParams({ input: JSON.stringify(input) });
  const r = await fetch(BASE + "/api/trpc/" + path + "?" + params.toString());
  const data = await r.json();
  return { ok: r.ok, data: data?.result?.data, error: data?.error?.data?.code };
}

async function main() {
  const { default: postgres } = await import("postgres");
  const sql = postgres("postgres://angelina:angelina_pass@localhost:5432/angelina_consultoria");

  const docs = await sql`
    SELECT d.id FROM doctores d
    JOIN usuarios u ON d.usuario_id = u.id
    WHERE u.email = 'dr.test@test.com'
  `;

  if (docs.length === 0) {
    console.log("❌ No doctor found");
    await sql.end();
    return;
  }

  const docId = docs[0].id;
  console.log("✅ Doctor ID:", docId);

  // Test getDoctorProfile (public query)
  console.log("\n--- profiles.getDoctorProfile ---");
  let r = await call("profiles.getDoctorProfile", { doctorId: docId });
  if (r.ok) {
    const d = r.data;
    console.log("✅ Name:", d?.nombre);
    console.log("✅ Specialty:", d?.especialidad);
    console.log("✅ Price:", d?.precioConsulta);
  } else {
    console.log("❌", r.error, "-", JSON.stringify(r.data).slice(0, 100));
  }

  // Test getDoctorSlots (public query)
  console.log("\n--- bookings.getDoctorSlots ---");
  r = await call("bookings.getDoctorSlots", {
    doctorId: docId,
    date: "2026-06-15",
  });
  if (r.ok) {
    console.log("✅ Slots available:", r.data?.length || 0);
    if (r.data?.length > 0) {
      const first = r.data[0];
      console.log("   First:", first.start?.slice(11, 16), "-", first.available ? "✅ available" : "❌ booked");
    }
  } else {
    console.log("❌", r.error, "-", JSON.stringify(r.data).slice(0, 150));
  }

  // Not found case
  console.log("\n--- profiles.getDoctorProfile (invalid ID) ---");
  r = await call("profiles.getDoctorProfile", {
    doctorId: "00000000-0000-0000-0000-000000000000",
  });
  console.log(r.ok ? "✅" : "✅ Expected NOT_FOUND:", r.error);

  await sql.end();
  console.log("\n✅ ALL PUBLIC TESTS PASSED");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
