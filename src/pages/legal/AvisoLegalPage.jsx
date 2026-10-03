import React from "react";
import { Link } from "react-router-dom";

// variables configurables para la empresa
const COMPANY_CONFIG = {
  name: "Daniel Rabaneda / RyB Limpiezas",
  tradeName: "RyB Limpiezas",
  cif: "12345678X", // Reemplazar con CIF/NIF real
  address: "Calle Limpieza, 12, Planta 1, 28001 Madrid, España", // Reemplazar con dirección real
  email: "limpiezasrayba@gmail.com",
  phone: "600 000 000", // Reemplazar con teléfono real
  registryInfo:
    "Inscrita en el Registro Mercantil de Madrid, Tomo 12345, Folio 67, Hoja M-89012, Inscripción 1ª.", // Reemplazar si aplica
  website: "https://limpiagest.es",
};

export default function AvisoLegalPage() {
  // Asegurar que la página empiece en el top de scroll al cargar
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="legal-page-container">
      <Link to="/" className="legal-back-btn">
        ← Volver al inicio
      </Link>

      <div className="legal-card">
        <h1 className="legal-title">Aviso Legal</h1>

        <p>
          En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de
          Servicios de la Sociedad de la Información y Comercio Electrónico
          (LSSI-CE), se exponen a continuación los datos identificativos del
          prestador de servicios.
        </p>

        <h2 className="legal-subtitle">1. Datos Identificativos</h2>
        <p>El sitio web y la aplicación móvil son titularidad de:</p>
        <table className="legal-table">
          <tbody>
            <tr>
              <th>Denominación Social:</th>
              <td>{COMPANY_CONFIG.name}</td>
            </tr>
            <tr>
              <th>Nombre Comercial:</th>
              <td>{COMPANY_CONFIG.tradeName}</td>
            </tr>
            <tr>
              <th>NIF / CIF:</th>
              <td>{COMPANY_CONFIG.cif}</td>
            </tr>
            <tr>
              <th>Domicilio Social:</th>
              <td>{COMPANY_CONFIG.address}</td>
            </tr>
            <tr>
              <th>Datos de Registro:</th>
              <td>{COMPANY_CONFIG.registryInfo}</td>
            </tr>
            <tr>
              <th>Teléfono de Contacto:</th>
              <td>{COMPANY_CONFIG.phone}</td>
            </tr>
            <tr>
              <th>Correo Electrónico:</th>
              <td>{COMPANY_CONFIG.email}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="legal-subtitle">
          2. Propiedad Intelectual e Industrial
        </h2>
        <p>
          Todos los derechos de propiedad intelectual del contenido de esta
          página web, su diseño gráfico, códigos fuente, marcas, nombres
          comerciales o signos distintivos de cualquier clase, son titularidad
          de <strong>{COMPANY_CONFIG.tradeName}</strong> o de terceros que han
          autorizado su uso, sin que pueda entenderse que el uso o acceso al
          portal atribuya al usuario derecho alguno sobre los mismos.
        </p>
        <p>
          Queda prohibida su reproducción, distribución, comunicación pública,
          transformación o cualquier otra actividad que se pueda realizar con
          los contenidos de sus páginas web ni aun citando las fuentes, salvo
          consentimiento por escrito de <strong>{COMPANY_CONFIG.name}</strong>.
        </p>

        <h2 className="legal-subtitle">3. Condiciones de Uso del Portal</h2>
        <p>
          El usuario se compromete a hacer un uso adecuado de los contenidos y
          servicios que se ofrecen a través del portal y a no emplearlos para
          incurrir en actividades ilícitas, ilegales o contrarias a la buena fe
          y al orden público; difundir contenidos o propaganda de carácter
          racista, xenófobo, pornográfico-ilegal, de apología del terrorismo o
          atentatorio contra los derechos humanos; provocar daños en los
          sistemas físicos y lógicos del prestador, de sus proveedores o de
          terceras personas; o intentar acceder y, en su caso, utilizar las
          cuentas de correo electrónico de otros usuarios y modificar o
          manipular sus mensajes.
        </p>

        <h2 className="legal-subtitle">4. Exclusión de Responsabilidad</h2>
        <p>
          <strong>{COMPANY_CONFIG.tradeName}</strong> no se hace responsable, en
          ningún caso, de los daños y perjuicios de cualquier naturaleza que
          pudieran ocasionar, a título enunciativo: errores u omisiones en los
          contenidos, falta de disponibilidad del portal o la transmisión de
          virus o programas maliciosos o lesivos en los contenidos, a pesar de
          haber adoptado todas las medidas tecnológicas necesarias para
          evitarlo.
        </p>

        <h2 className="legal-subtitle">5. Enlaces (Links)</h2>
        <p>
          En el caso de que en este sitio web se dispusiesen enlaces o
          hipervínculos hacia otros sitios de Internet,
          <strong> {COMPANY_CONFIG.tradeName}</strong> no ejercerá ningún tipo
          de control sobre dichos sitios y contenidos. En ningún caso asumirá
          responsabilidad alguna por los contenidos de algún enlace
          perteneciente a un sitio web ajeno.
        </p>

        <h2 className="legal-subtitle">6. Modificación del aviso legal</h2>
        <p>
          El prestador se reserva el derecho a modificar el presente Aviso Legal
          para adaptarlo a las novedades legislativas o jurisprudenciales que
          vayan surgiendo, así como a las prácticas de la industria, informando
          previamente a los usuarios de los cambios que en ella se produzcan.
        </p>

        <h2 className="legal-subtitle">
          7. Legislación Aplicable y Jurisdicción
        </h2>
        <p>
          Con carácter general las relaciones entre{" "}
          <strong>{COMPANY_CONFIG.name}</strong> con los usuarios de sus
          servicios telemáticos, presentes en esta web, se encuentran sometidas
          a la legislación y jurisdicción españolas. Para cualquier litigio
          derivado de la existencia, acceso, utilización o contenido de este
          portal, las partes se someten expresamente a los Juzgados y Tribunales
          competentes del domicilio del titular.
        </p>
      </div>
    </div>
  );
}
