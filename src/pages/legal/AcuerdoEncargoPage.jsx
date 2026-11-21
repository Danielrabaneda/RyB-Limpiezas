import React from "react";
import { Link } from "react-router-dom";
import { DATA_PROCESSING_AGREEMENT_VERSION } from "../../constants/dataProcessingAgreement";

export default function AcuerdoEncargoPage() {
  React.useEffect(() => window.scrollTo(0, 0), []);

  return (
    <div className="legal-page-container">
      <Link to="/" className="legal-back-btn">← Volver al inicio</Link>
      <article className="legal-card">
        <h1 className="legal-title">Acuerdo de encargo del tratamiento</h1>
        <p><strong>Versión {DATA_PROCESSING_AGREEMENT_VERSION}</strong></p>
        <p>
          Este acuerdo regula el tratamiento de datos personales realizado mediante
          LimpiaGest. Se integra en el contrato del servicio entre la empresa que
          contrata la plataforma, en adelante el <strong>Responsable</strong>, y
          <strong> Limpiezas Raiba, S.L.</strong>, CIF B04843843, con domicilio en
          Calle Algarrobo 0, Cortijos de Marín, Almería, en adelante el
          <strong> Encargado</strong>.
        </p>

        <h2 className="legal-subtitle">1. Objeto, duración y finalidad</h2>
        <p>
          El Encargado alojará y procesará los datos que el Responsable introduzca
          en LimpiaGest exclusivamente para prestar, mantener, proteger y dar soporte
          al servicio contratado. El encargo durará mientras permanezca vigente el
          servicio y durante los plazos necesarios para devolver, bloquear o eliminar
          los datos conforme a este acuerdo y a la legislación aplicable.
        </p>

        <h2 className="legal-subtitle">2. Personas y datos afectados</h2>
        <p>
          Pueden verse afectados administradores, trabajadores, clientes, contactos,
          proveedores y personas vinculadas a comunidades o centros gestionados. Los
          datos pueden incluir identificación y contacto, cuenta y permisos, jornada y
          fichajes, servicios y tareas, fotografías y documentos aportados, ubicación
          asociada al servicio, kilometraje, facturación y datos fiscales. El
          Responsable no deberá introducir categorías especiales de datos salvo que
          exista una necesidad legítima, base jurídica y medidas adecuadas.
        </p>

        <h2 className="legal-subtitle">3. Instrucciones y obligaciones</h2>
        <ul>
          <li>El Encargado tratará los datos únicamente siguiendo instrucciones documentadas del Responsable y no los utilizará para fines propios.</li>
          <li>Las personas autorizadas estarán sujetas a confidencialidad y accederán solo a la información necesaria.</li>
          <li>El Responsable garantiza la licitud de la recogida, informa a los interesados y configura usuarios, permisos y plazos de forma adecuada.</li>
          <li>Si una instrucción pudiera infringir la normativa, el Encargado lo comunicará al Responsable y podrá suspender su ejecución.</li>
        </ul>

        <h2 className="legal-subtitle">4. Seguridad y separación entre empresas</h2>
        <p>
          LimpiaGest aplicará medidas apropiadas al riesgo, incluyendo autenticación,
          control de acceso por empresa y rol, comunicaciones cifradas, copias y
          recuperación gestionadas por la infraestructura contratada, registro de
          operaciones sensibles y revisión de vulnerabilidades. Cada empresa se
          mantiene separada mediante un identificador propio y reglas de autorización.
        </p>

        <h2 className="legal-subtitle">5. Subencargados</h2>
        <p>
          El Responsable autoriza con carácter general los subencargados necesarios
          para prestar el servicio, incluidos Google Cloud/Firebase para alojamiento,
          base de datos, autenticación, archivos y notificaciones; Stripe cuando se
          utilice la facturación de la suscripción; y el proveedor de correo configurado
          por el propio Responsable. El Encargado informará de cambios relevantes para
          permitir una oposición fundada antes de que surtan efecto.
        </p>

        <h2 className="legal-subtitle">6. Derechos, incidentes y colaboración</h2>
        <p>
          El Encargado ayudará al Responsable a atender solicitudes de acceso,
          rectificación, supresión, oposición, limitación y portabilidad. Comunicará
          sin dilación indebida cualquier violación de seguridad de la que tenga
          conocimiento y facilitará la información disponible para que el Responsable
          valore sus obligaciones de notificación. También colaborará, dentro del
          alcance razonable del servicio, en análisis de riesgos, evaluaciones de
          impacto y consultas con la autoridad de control.
        </p>

        <h2 className="legal-subtitle">7. Conservación y finalización</h2>
        <p>
          Al terminar el servicio, el Responsable podrá solicitar la devolución o
          exportación de sus datos. Después se eliminarán o anonimizarán, salvo los que
          deban permanecer bloqueados por una obligación legal o para atender posibles
          responsabilidades. La eliminación de copias de seguridad seguirá el ciclo
          técnico de conservación aplicable.
        </p>

        <h2 className="legal-subtitle">8. Evidencia y auditoría</h2>
        <p>
          LimpiaGest conservará evidencia de la versión aceptada, empresa, usuario y
          fecha. El Encargado facilitará la información razonablemente necesaria para
          demostrar el cumplimiento y permitirá auditorías proporcionadas, coordinadas
          previamente y sujetas a confidencialidad y a la seguridad de otros clientes.
        </p>

        <h2 className="legal-subtitle">9. Contacto</h2>
        <p>
          Para asuntos relacionados con este acuerdo: <a href="mailto:limpiezasrayba@gmail.com">limpiezasrayba@gmail.com</a>.
        </p>
      </article>
    </div>
  );
}
