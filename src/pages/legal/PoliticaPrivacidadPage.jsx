import React from 'react';
import { Link } from 'react-router-dom';

const COMPANY_CONFIG = {
  name: 'Daniel Rabaneda / RyB Limpiezas',
  tradeName: 'RyB Limpiezas',
  cif: '12345678X',
  address: 'Calle Limpieza, 12, Planta 1, 28001 Madrid, España',
  email: 'limpiezasrayba@gmail.com',
  phone: '600 000 000',
  dpoEmail: 'limpiezasrayba@gmail.com' // Email para el ejercicio de derechos
};

export default function PoliticaPrivacidadPage() {
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="legal-page-container">
      <Link to="/" className="legal-back-btn">
        ← Volver al inicio
      </Link>

      <div className="legal-card">
        <h1 className="legal-title">Política de Privacidad</h1>

        <p>
          La presente Política de Privacidad describe el modo en que <strong>{COMPANY_CONFIG.name}</strong> recopila, 
          trata, almacena y protege los datos personales de los usuarios y empleados a través de este sitio web y de la 
          aplicación móvil <strong>LimpiaGest</strong>, de conformidad con lo establecido en el Reglamento General de Protección 
          de Datos (RGPD UE 2016/679) y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía 
          de los derechos digitales (LOPDGDD).
        </p>

        <h2 className="legal-subtitle">1. Responsable del Tratamiento de sus Datos</h2>
        <table className="legal-table">
          <tbody>
            <tr>
              <th>Identidad:</th>
              <td>{COMPANY_CONFIG.name} ({COMPANY_CONFIG.tradeName})</td>
            </tr>
            <tr>
              <th>NIF / CIF:</th>
              <td>{COMPANY_CONFIG.cif}</td>
            </tr>
            <tr>
              <th>Dirección Postal:</th>
              <td>{COMPANY_CONFIG.address}</td>
            </tr>
            <tr>
              <th>Teléfono:</th>
              <td>{COMPANY_CONFIG.phone}</td>
            </tr>
            <tr>
              <th>Correo de Privacidad:</th>
              <td>{COMPANY_CONFIG.dpoEmail}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="legal-subtitle">2. ¿Qué Datos Tratamos y con qué Finalidad?</h2>
        <p>
          En función de cómo interactúes con nuestra plataforma, trataremos los siguientes datos para las siguientes finalidades:
        </p>
        <ul>
          <li>
            <strong>Formularios de Solicitud de Demo / Contacto:</strong> Tratamos su nombre, email, teléfono, nombre de la 
            empresa y número de operarios con la finalidad de gestionar su solicitud de información, ponernos en contacto para 
            ofrecerle una demostración y evaluar el plan de interés comercial.
          </li>
          <li>
            <strong>Registro y Gestión de Empleados (Operarios):</strong> Tratamos el nombre, email, credenciales de acceso, 
            historial de fichajes de entrada y salida, reporte de tareas realizadas, fotos de evidencia del servicio ejecutado y, 
            en caso de estar activado el control de presencia, las <strong>coordenadas de geolocalización GPS</strong> en el momento 
            exacto del fichaje o de la sugerencia de trayecto. La finalidad es el control laboral, la justificación del servicio 
            prestado a los clientes y la liquidación de kilometraje.
          </li>
          <li>
            <strong>Navegación Web:</strong> Tratamos cookies analíticas y de marketing para analizar hábitos de navegación e 
            interacciones del usuario en el portal web público, siempre que se haya otorgado consentimiento.
          </li>
        </ul>

        <h2 className="legal-subtitle">3. Legitimación del Tratamiento</h2>
        <p>
          Las bases legales para tratar sus datos son:
        </p>
        <ul>
          <li>
            <strong>El Consentimiento:</strong> Para el envío del formulario de contacto/demo, la suscripción a newsletters o 
            la instalación de cookies no técnicas (analíticas y publicitarias). El interesado puede retirar su consentimiento 
            en cualquier momento.
          </li>
          <li>
            <strong>Ejecución de un Contrato:</strong> Para el registro y uso de la aplicación por parte de los operarios 
            contratados y los clientes con cuentas activas, ya que es imprescindible para prestar el servicio y llevar el 
            control de jornada laboral (exigido por el Estatuto de los Trabajadores).
          </li>
          <li>
            <strong>Cumplimiento de Obligaciones Legales:</strong> Para la comunicación de datos a administraciones públicas, 
            agencias tributarias o de la seguridad social en cumplimiento de la normativa vigente.
          </li>
        </ul>

        <h2 className="legal-subtitle">4. ¿Durante cuánto tiempo conservaremos sus datos?</h2>
        <p>
          Los datos personales se conservarán durante el tiempo necesario para cumplir con la finalidad para la que se recabaron:
        </p>
        <ul>
          <li>Los datos de los formularios de contacto se conservarán durante un máximo de 1 año si no derivan en contratación.</li>
          <li>
            Los registros de control horario de los trabajadores se conservarán durante <strong>4 años</strong>, a disposición de 
            la Inspección de Trabajo y Seguridad Social, en cumplimiento del Art. 34.9 del Estatuto de los Trabajadores.
          </li>
          <li>Los datos de geolocalización puntual se suprimirán en un plazo máximo de 2 meses desde su registro, salvo que deban conservarse para justificar incidencias graves o reclamaciones legales.</li>
        </ul>

        <h2 className="legal-subtitle">5. Destinatarios de los Datos</h2>
        <p>
          Sus datos no se cederán a terceros ajenos a la empresa, salvo obligación legal. Sin embargo, para la correcta 
          prestación del servicio técnico, contamos con proveedores de infraestructura tecnológica que actúan como 
          Encargados del Tratamiento (tales como Firebase / Google Cloud Platform, que almacena las bases de datos de forma segura 
          bajo el marco de cláusulas contractuales tipo y estándares aprobados por la Unión Europea).
        </p>

        <h2 className="legal-subtitle">6. Sus Derechos (Derechos ARCO-POL)</h2>
        <p>
          Cualquier persona tiene derecho a obtener confirmación sobre si estamos tratando datos personales que les conciernen o no. 
          Los interesados tienen derecho a:
        </p>
        <ul>
          <li><strong>Acceder</strong> a sus datos personales en nuestro poder.</li>
          <li>Solicitar la <strong>rectificación</strong> de los datos que sean inexactos.</li>
          <li>Solicitar la <strong>supresión</strong> de sus datos cuando, entre otros motivos, ya no sean necesarios para los fines que fueron recogidos.</li>
          <li>Solicitar la <strong>limitación</strong> del tratamiento de sus datos, en cuyo caso únicamente los conservaremos para el ejercicio o la defensa de reclamaciones.</li>
          <li>Solicitar la <strong>portabilidad</strong> de sus datos en formato estructurado, de uso común y lectura mecánica.</li>
          <li><strong>Oponerse</strong> al tratamiento de sus datos por motivos relacionados con su situación particular.</li>
        </ul>
        <p>
          Para ejercer estos derechos, puede enviar un escrito adjuntando fotocopia de su DNI o documento equivalente al correo electrónico:{' '}
          <a href={`mailto:${COMPANY_CONFIG.dpoEmail}`}>{COMPANY_CONFIG.dpoEmail}</a>, indicando el derecho que desea ejercer.
        </p>
        <p>
          Si considera que sus derechos no se han atendido debidamente, tiene derecho a presentar una reclamación ante la{' '}
          <strong>Agencia Española de Protección de Datos (AEPD)</strong> a través de su sede electrónica (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>).
        </p>

        <h2 className="legal-subtitle">7. Privacidad y Seguridad por Defecto</h2>
        <p>
          Hemos implementado todas las medidas de seguridad técnicas y organizativas necesarias para garantizar la integridad, 
          confidencialidad y disponibilidad de los datos personales recopilados, minimizando su recogida conforme al principio de 
          <strong> Privacidad por Defecto</strong>.
        </p>
      </div>
    </div>
  );
}
