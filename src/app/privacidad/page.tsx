import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Cómo AngelinaConsultoria protege tus datos personales y de salud conforme al RGPD y la LOPD.",
};

export default function PrivacidadPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        Política de privacidad
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Última actualización: junio de 2026
      </p>

      <Separator className="my-6" />

      <section className="prose prose-slate dark:prose-invert max-w-none space-y-6">
        <div>
          <h2 className="text-xl font-semibold">1. Responsable del tratamiento</h2>
          <p>
            AngelinaConsultoria, con domicilio en España, es el responsable del
            tratamiento de los datos personales recabados a través de esta
            plataforma. Para cualquier consulta relacionada con la protección
            de tus datos, puedes escribirnos a{" "}
            <a
              href="mailto:privacidad@angelinaconsultoria.example"
              className="text-primary underline"
            >
              privacidad@angelinaconsultoria.example
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">2. Datos que tratamos</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Datos de cuenta: nombre, correo electrónico, contraseña (cifrada).</li>
            <li>
              Datos de perfil de doctor: especialidad, número de colegiado,
              idiomas, foto, biografía, ubicación de consulta.
            </li>
            <li>
              Datos de citas: fecha y hora, motivo, notas clínicas, estado de la
              cita.
            </li>
            <li>
              Datos de uso: registros de acceso, dirección IP, agente de
              navegador, con fines de seguridad y mejora del servicio.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">3. Finalidad del tratamiento</h2>
          <p>Tratamos tus datos para:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Gestionar tu cuenta y autenticación.</li>
            <li>
              Permitir la reserva, gestión y realización de citas médicas (incluidas
              las videollamadas).
            </li>
            <li>
              Cumplir con las obligaciones legales aplicables al sector sanitario.
            </li>
            <li>
              Mejorar la calidad del servicio mediante analítica agregada y
              seudonimizada.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">4. Base jurídica</h2>
          <p>
            La base jurídica del tratamiento es la ejecución del contrato de
            prestación de servicios de salud entre el paciente y el profesional,
            el cumplimiento de obligaciones legales, y el consentimiento explícito
            para tratamientos opcionales (videollamadas, analítica).
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            5. Conservación de los datos
          </h2>
          <p>
            Los datos clínicos se conservan durante el plazo legalmente exigido
            por la normativa sanitaria española (mínimo 5 años desde la última
            atención). Los datos de cuenta se eliminan tras 24 meses de
            inactividad.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">6. Tus derechos</h2>
          <p>
            Puedes ejercer en cualquier momento tus derechos de acceso,
            rectificación, supresión, oposición, limitación del tratamiento y
            portabilidad escribiendo a{" "}
            <a
              href="mailto:privacidad@angelinaconsultoria.example"
              className="text-primary underline"
            >
              privacidad@angelinaconsultoria.example
            </a>
            . También puedes presentar una reclamación ante la Agencia Española
            de Protección de Datos.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            7. Medidas de seguridad
          </h2>
          <p>
            Aplicamos medidas técnicas y organizativas apropiadas para proteger
            tus datos: cifrado en tránsito (HTTPS/TLS), hashing de contraseñas
            (bcrypt, factor de coste 12), autenticación con tokens JWT firmados,
            registro de auditoría inmutable, y segregación de datos entre
            pacientes y profesionales.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            8. Videollamadas y datos de salud
          </h2>
          <p>
            Las videollamadas se realizan sobre un servidor LiveKit autoalojado.
            No se graban por defecto. El acceso a la sala está restringido al
            doctor y al paciente de la cita correspondiente, mediante tokens
            firmados y de corta duración. El consentimiento explícito se solicita
            antes de iniciar la primera videollamada.
          </p>
        </div>
      </section>
    </main>
  );
}
