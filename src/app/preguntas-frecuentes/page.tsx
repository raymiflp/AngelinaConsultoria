import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description: "Respuestas a las preguntas más comunes sobre AngelinaConsultoria.",
};

const FAQS = [
  {
    q: "¿Cómo reservo una cita?",
    a: "Busca tu doctor por especialidad o nombre, entra en su perfil, y haz clic en 'Reservar cita'. Elige el día y la hora que prefieras, indica el motivo, y confirma. Recibirás un email de confirmación con todos los detalles.",
  },
  {
    q: "¿Puedo tener una videoconsulta?",
    a: "Sí. Cuando la cita esté confirmada y dentro de los 15 minutos anteriores o posteriores a la hora programada, verás un botón 'Unirse a la videollamada' en la página de la cita. Necesitarás un navegador con cámara y micrófono.",
  },
  {
    q: "¿Cuánto cuesta el servicio?",
    a: "El uso de la plataforma es gratuito para pacientes. El doctor establece su propio precio por consulta, que verás antes de confirmar la cita. No hay costes adicionales por usar la videollamada.",
  },
  {
    q: "¿Cómo cancelo o cambio una cita?",
    a: "Entra en la página de la cita y haz clic en 'Cancelar cita'. Te recomendamos cancelar con al menos 24 horas de antelación. Para cambiar la hora, cancela la cita actual y reserva una nueva.",
  },
  {
    q: "¿Mis datos de salud están protegidos?",
    a: "Sí. Cumplimos con el RGPD y la LOPD. Tus datos clínicos están cifrados en tránsito y en reposo, y solo el profesional que te atiende tiene acceso. Cada emisión de token de videollamada queda registrada en un log de auditoría inmutable.",
  },
  {
    q: "¿Cómo me registro como doctor?",
    a: "Haz clic en 'Activar perfil' en la página principal, completa el formulario de alta profesional, y verifica tu número de colegiado. Nuestro equipo revisará tu solicitud en 24-48 horas.",
  },
  {
    q: "¿Puedo cambiar de doctor?",
    a: "Por supuesto. No tienes compromiso de permanencia con ningún profesional. Puedes reservar con tantos doctores como necesites, en cualquier momento.",
  },
  {
    q: "¿Qué pasa si tengo un problema técnico durante la videollamada?",
    a: "Si pierdes la conexión durante una videollamada, puedes volver a entrar usando el mismo botón 'Unirse a la videollamada' (la sala sigue abierta). Si el problema persiste, contacta con soporte.",
  },
  {
    q: "¿Hay app móvil?",
    a: "Por ahora la plataforma es web responsive y funciona en cualquier navegador moderno, incluido el de móviles. Una app nativa está en el roadmap.",
  },
  {
    q: "¿Puedo pagar online?",
    a: "El pago online está en desarrollo. Por ahora, el pago se gestiona directamente entre el paciente y el doctor en consulta. Estamos trabajando en una integración de pagos para los próximos meses.",
  },
];

export default function PreguntasFrecuentesPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        Preguntas frecuentes
      </h1>
      <p className="text-muted-foreground mt-2">
        Respuestas a las dudas más comunes. Si no encuentras lo que buscas,
        escríbenos a{" "}
        <a
          href="mailto:soporte@angelinaconsultoria.example"
          className="text-primary underline"
        >
          soporte@angelinaconsultoria.example
        </a>
        .
      </p>

      <Separator className="my-6" />

      <div className="divide-y">
        {FAQS.map((item, i) => (
          <details
            key={i}
            className="group py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
              <span>{item.q}</span>
              <span
                aria-hidden="true"
                className="text-muted-foreground transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </main>
  );
}
