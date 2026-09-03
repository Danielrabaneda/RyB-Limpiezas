import React from "react";
import { Link } from "react-router-dom";

const COMPANY_CONFIG = {
  name: "Daniel Rabaneda / RyB Limpiezas",
  tradeName: "RyB Limpiezas",
  website: "https://limpiagest.es",
};

export default function PoliticaCookiesPage() {
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="legal-page-container">
      <Link to="/" className="legal-back-btn">
        ← Volver al inicio
      </Link>

      <div className="legal-card">
        <h1 className="legal-title">Política de Cookies</h1>

        <p>
          Este sitio web utiliza cookies propias y de terceros para recopilar
          información con la finalidad de mejorar nuestros servicios y analizar
          sus hábitos de navegación. Si continúas navegando, aceptas la
          instalación de las cookies configuradas. El usuario tiene la
          posibilidad de configurar su navegador pudiendo, si así lo desea,
          impedir que sean instaladas en su disco duro, aunque deberá tener en
          cuenta que dicha acción podrá ocasionar dificultades de navegación de
          la página web.
        </p>

        <h2 className="legal-subtitle">1. ¿Qué es una Cookie?</h2>
        <p>
          Una cookie es un fichero que se descarga en su ordenador o dispositivo
          móvil al acceder a determinadas páginas web. Las cookies permiten a
          una página web, entre otras cosas, almacenar y recuperar información
          sobre los hábitos de navegación de un usuario o de su equipo y,
          dependiendo de la información que contengan y de la forma en que
          utilice su equipo, pueden utilizarse para reconocer al usuario.
        </p>

        <h2 className="legal-subtitle">2. Clasificación de las Cookies</h2>
        <p>
          Las cookies utilizadas en esta aplicación se clasifican en las
          siguientes categorías según su finalidad:
        </p>
        <ul>
          <li>
            <strong>Cookies Técnicas (Necesarias):</strong> Son aquellas que
            permiten al usuario la navegación a través de una página web,
            plataforma o aplicación y la utilización de las diferentes opciones
            o servicios que en ella existan como, por ejemplo, controlar el
            tráfico y la comunicación de datos, identificar la sesión, acceder a
            partes de acceso restringido, recordar los elementos que integran un
            pedido, gestionar el pago, o controlar el fraude vinculado a la
            seguridad del servicio. Estas cookies no requieren el consentimiento
            del usuario.
          </li>
          <li>
            <strong>Cookies Analíticas (De rendimiento):</strong> Son aquellas
            que, tratadas por nosotros o por terceros, nos permiten cuantificar
            el número de usuarios y así realizar la medición y análisis
            estadístico de la utilización que hacen los usuarios del servicio
            ofertado. Para ello se analiza su navegación en nuestra página web
            con el fin de mejorar la oferta de productos o servicios que le
            ofrecemos.
          </li>
          <li>
            <strong>Cookies Publicitarias / Marketing:</strong> Son aquellas
            que, tratadas por nosotros o por terceros, nos permiten analizar sus
            hábitos de navegación en Internet para que podamos mostrarle
            publicidad relacionada con su perfil de navegación.
          </li>
        </ul>

        <h2 className="legal-subtitle">3. Listado de Cookies Utilizadas</h2>
        <p>
          A continuación, se detallan las cookies específicas utilizadas en el
          portal <strong>{COMPANY_CONFIG.tradeName}</strong>:
        </p>

        <table className="legal-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Proveedor</th>
              <th>Finalidad</th>
              <th>Duración</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>ryb_cookie_consent</strong>
              </td>
              <td>Propia ({COMPANY_CONFIG.tradeName})</td>
              <td>
                Almacena las preferencias de consentimiento de cookies del
                usuario para no tener que volver a solicitárselas en cada
                acceso.
              </td>
              <td>1 año</td>
              <td>Técnica (Obligatoria)</td>
            </tr>
            <tr>
              <td>
                <strong>__session</strong>
              </td>
              <td>Propia (Firebase)</td>
              <td>
                Mantiene el estado de la sesión activa del usuario para navegar
                por las pantallas del panel privado.
              </td>
              <td>Sesión</td>
              <td>Técnica (Obligatoria)</td>
            </tr>
            <tr>
              <td>
                <strong>_ga</strong>
              </td>
              <td>Google Analytics</td>
              <td>
                Identificador anónimo utilizado para distinguir a los usuarios
                únicos en la medición de visitas y estadísticas de la web.
              </td>
              <td>2 años</td>
              <td>Analítica (Opcional)</td>
            </tr>
            <tr>
              <td>
                <strong>_gid</strong>
              </td>
              <td>Google Analytics</td>
              <td>
                Identificador utilizado para agrupar el comportamiento del
                usuario durante una sesión de navegación de 24 horas.
              </td>
              <td>24 horas</td>
              <td>Analítica (Opcional)</td>
            </tr>
            <tr>
              <td>
                <strong>_fbp</strong>
              </td>
              <td>Meta (Facebook)</td>
              <td>
                Utilizada para rastrear visitas, interacciones y el rendimiento
                de campañas publicitarias en la red social Meta.
              </td>
              <td>3 meses</td>
              <td>Marketing (Opcional)</td>
            </tr>
          </tbody>
        </table>

        <h2 className="legal-subtitle">
          4. ¿Cómo desactivar o eliminar cookies en su navegador?
        </h2>
        <p>
          Puedes permitir, bloquear o eliminar las cookies instaladas en tu
          equipo mediante la configuración de las opciones del navegador
          instalado en tu ordenador o dispositivo móvil:
        </p>
        <ul>
          <li>
            <strong>Google Chrome:</strong> Herramientas → Configuración →
            Privacidad y seguridad → Cookies y otros datos de sitios.{" "}
            <a
              href="https://support.google.com/chrome/answer/95647?hl=es"
              target="_blank"
              rel="noopener noreferrer"
            >
              Más información
            </a>
            .
          </li>
          <li>
            <strong>Mozilla Firefox:</strong> Herramientas → Opciones →
            Privacidad & Seguridad → Historial → Usar una configuración
            personalizada para el historial.{" "}
            <a
              href="https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web-rastrear-preferencias"
              target="_blank"
              rel="noopener noreferrer"
            >
              Más información
            </a>
            .
          </li>
          <li>
            <strong>Safari (Mac/iOS):</strong> Edición → Preferencias →
            Privacidad → Bloquear todas las cookies.{" "}
            <a
              href="https://support.apple.com/es-es/guide/safari/sfri11471/mac"
              target="_blank"
              rel="noopener noreferrer"
            >
              Más información
            </a>
            .
          </li>
          <li>
            <strong>Microsoft Edge:</strong> Configuración → Cookies y permisos
            del sitio → Administrar y eliminar cookies y datos del sitio.{" "}
            <a
              href="https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
              target="_blank"
              rel="noopener noreferrer"
            >
              Más información
            </a>
            .
          </li>
        </ul>

        <h2 className="legal-subtitle">5. Revocación del Consentimiento</h2>
        <p>
          Usted puede cambiar o retirar su consentimiento para el uso de cookies
          no obligatorias en cualquier momento haciendo clic en el botón
          flotante con el icono de galleta (🍪) situado en la esquina inferior
          izquierda de la pantalla, el cual abrirá nuevamente el panel de
          configuración de preferencias.
        </p>
      </div>
    </div>
  );
}
