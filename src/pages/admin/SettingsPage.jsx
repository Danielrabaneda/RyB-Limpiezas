import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, updateDoc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { updateEmail, updatePassword } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../config/firebase';
import { getBillingSettings, saveBillingSettings } from '../../services/invoiceService';

export default function SettingsPage() {
  const { currentUser, userProfile } = useAuth();
  
  // Profile state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [isOperario, setIsOperario] = useState(false);

  // Company state
  const [companyName, setCompanyName] = useState('RyB Limpiezas');
  const [logoUrl, setLogoUrl] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [originalInvitationCode, setOriginalInvitationCode] = useState('');
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyMsg, setCompanyMsg] = useState('');
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name || '');
      setEmail(currentUser.email || '');
      setIsOperario(userProfile.isOperario || false);
    }
  }, [userProfile, currentUser]);

  useEffect(() => {
    // Load company settings
    async function fetchSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'global'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.companyName) setCompanyName(data.companyName);
          if (data.logoUrl) setLogoUrl(data.logoUrl);
          if (data.invitationCode) {
            setInvitationCode(data.invitationCode);
            setOriginalInvitationCode(data.invitationCode);
          }
        }
      } catch (e) {
        console.error("No se pudo cargar la configuración", e);
      }
    }
    fetchSettings();
  }, []);

  // SMTP state
  const [smtpSettings, setSmtpSettings] = useState({
    smtpHost: '',
    smtpPort: '587',
    smtpSecure: false,
    smtpEmail: '',
    smtpPassword: '',
    emailSubjectTemplate: 'Factura {numero} - RyB Limpiezas',
    emailBodyTemplate: ''
  });
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState('');

  useEffect(() => {
    // Load SMTP settings
    async function fetchSmtpSettings() {
      try {
        const settings = await getBillingSettings();
        setSmtpSettings({
          smtpHost: settings.smtpHost || '',
          smtpPort: settings.smtpPort || '587',
          smtpSecure: settings.smtpSecure || false,
          smtpEmail: settings.smtpEmail || '',
          smtpPassword: settings.smtpPassword || '',
          emailSubjectTemplate: settings.emailSubjectTemplate || 'Factura {numero} - RyB Limpiezas',
          emailBodyTemplate: settings.emailBodyTemplate || ''
        });
      } catch (e) {
        console.error("No se pudo cargar la configuración SMTP", e);
      }
    }
    fetchSmtpSettings();
  }, []);

  const handleUpdateSmtp = async (e) => {
    e.preventDefault();
    setSmtpLoading(true);
    setSmtpMsg('');
    try {
      await saveBillingSettings(smtpSettings);
      setSmtpMsg('Configuración de correo SMTP actualizada correctamente.');
    } catch (err) {
      console.error(err);
      setSmtpMsg('Error al actualizar SMTP: ' + err.message);
    } finally {
      setSmtpLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMsg('');
    try {
      const updates = {};
      if (name !== userProfile.name) updates.name = name;
      if (isOperario !== (userProfile.isOperario || false)) updates.isOperario = isOperario;
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'users', currentUser.uid), updates);
      }
      if (email !== currentUser.email) {
        await updateEmail(currentUser, email);
        await updateDoc(doc(db, 'users', currentUser.uid), { email });
      }
      if (password) {
        await updatePassword(currentUser, password);
        setPassword('');
      }
      setProfileMsg('Perfil actualizado correctamente. Es posible que debas reiniciar sesión si cambiaste correo o contraseña.');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        setProfileMsg('Error: Por motivos de seguridad, para cambiar el correo o contraseña debes haber iniciado sesión recientemente. Cierra sesión y vuelve a entrar.');
      } else {
        setProfileMsg('Error al actualizar el perfil: ' + err.message);
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handleUpdateCompany = async (e) => {
    e.preventDefault();
    setCompanyLoading(true);
    setCompanyMsg('');
    try {
      const formattedCode = invitationCode.trim().toUpperCase();

      await setDoc(doc(db, 'settings', 'global'), {
        companyName,
        logoUrl,
        invitationCode: formattedCode
      }, { merge: true });

      // Synchronize with accessCodes collection
      if (formattedCode && formattedCode !== originalInvitationCode) {
        // Create new code
        await setDoc(doc(db, 'accessCodes', formattedCode), {
          active: true,
          createdAt: serverTimestamp(),
          createdBy: currentUser.uid
        });

        // Delete old code if it existed
        if (originalInvitationCode) {
          await deleteDoc(doc(db, 'accessCodes', originalInvitationCode));
        }
        
        setOriginalInvitationCode(formattedCode);
        setInvitationCode(formattedCode);
      } else if (!formattedCode && originalInvitationCode) {
        // Code removed entirely
        await deleteDoc(doc(db, 'accessCodes', originalInvitationCode));
        setOriginalInvitationCode('');
      }

      setCompanyMsg('Ajustes de la empresa actualizados correctamente. Si cambiaste el nombre o logo, recarga la página para ver los cambios.');
    } catch (err) {
      console.error(err);
      setCompanyMsg('Error al actualizar: ' + err.message);
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setCompanyLoading(true);
    try {
      const storageRef = ref(storage, `logos/company_logo_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setLogoUrl(url);
    } catch (err) {
      console.error("Error subiendo logo:", err);
      alert("Error subiendo logo: " + err.message);
    } finally {
      setCompanyLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="animate-fadeIn max-w-4xl">
      <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>⚙️ Ajustes</h2>

      <div className="grid grid-2 gap-6">
        {/* Company Settings */}
        <div className="card">
          <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>🏢 Empresa</h3>
          <form onSubmit={handleUpdateCompany} className="flex flex-col gap-4">
            
            <div className="form-group">
              <label className="form-label">Logo de la empresa</label>
              <div className="flex items-center gap-4 mt-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ width: '64px', height: '64px', objectFit: 'contain', background: '#f8f9fa', borderRadius: '4px' }} />
                ) : (
                  <div style={{ width: '64px', height: '64px', background: '#f8f9fa', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    🏢
                  </div>
                )}
                <div>
                  <button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
                    Subir nueva imagen
                  </button>
                  <label style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>PNG, JPG recomendados. Máx 5MB.</label>
                  <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleLogoUpload} />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nombre de la empresa</label>
              <input 
                type="text" 
                className="form-input" 
                value={companyName} 
                onChange={e => setCompanyName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Código de Invitación (Para Operarios)</label>
              <input 
                type="text" 
                className="form-input" 
                value={invitationCode} 
                onChange={e => setInvitationCode(e.target.value.toUpperCase())} 
                placeholder="Ej: RYB2024"
                style={{ textTransform: 'uppercase' }}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Comparte este código con los operarios para que puedan registrarse en la aplicación.
              </p>
            </div>

            {companyMsg && (
              <div className={`p-3 rounded text-sm ${companyMsg.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {companyMsg}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={companyLoading}>
              {companyLoading ? 'Guardando...' : 'Guardar empresa'}
            </button>
          </form>
        </div>

        {/* Profile Settings */}
        <div className="card">
          <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>👤 Perfil del Administrador</h3>
          <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4">
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input 
                type="text" 
                className="form-input" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email de acceso</label>
              <input 
                type="email" 
                className="form-input" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nueva Contraseña</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  className="form-input" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  placeholder="Dejar en blanco para no cambiar"
                  minLength={6}
                  style={{ paddingRight: '40px', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    userSelect: 'none'
                  }}
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group flex items-center gap-2 mt-2">
              <input 
                type="checkbox" 
                id="is-operario" 
                checked={isOperario} 
                onChange={e => setIsOperario(e.target.checked)} 
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="is-operario" className="form-label mb-0 cursor-pointer" style={{ userSelect: 'none' }}>
                <strong>Actuar también como operario</strong>
                <span className="block text-xs text-muted">Permite asignarte servicios y aparecer en la lista de operarios</span>
              </label>
            </div>

            {profileMsg && (
              <div className={`p-3 rounded text-sm ${profileMsg.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {profileMsg}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={profileLoading}>
              {profileLoading ? 'Guardando...' : 'Actualizar perfil'}
            </button>
          </form>
        </div>

        {/* SMTP Configuration Card */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>📧 Configuración de Correo de la Empresa (SMTP)</h3>
          <form onSubmit={handleUpdateSmtp} className="flex flex-col gap-4">
            <div className="grid grid-2 gap-4">
              <div className="form-group">
                <label className="form-label">Servidor SMTP (Host)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="smtp.gmail.com"
                  value={smtpSettings.smtpHost} 
                  onChange={e => setSmtpSettings({...smtpSettings, smtpHost: e.target.value})} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Puerto SMTP</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="587"
                  value={smtpSettings.smtpPort} 
                  onChange={e => setSmtpSettings({...smtpSettings, smtpPort: e.target.value})} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email de la Empresa (Usuario SMTP)</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="facturas@empresa.com"
                  value={smtpSettings.smtpEmail} 
                  onChange={e => setSmtpSettings({...smtpSettings, smtpEmail: e.target.value})} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contraseña SMTP / Contraseña de Aplicación</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••••••••••"
                  value={smtpSettings.smtpPassword} 
                  onChange={e => setSmtpSettings({...smtpSettings, smtpPassword: e.target.value})} 
                  required 
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="checkbox" 
                    id="smtp-secure" 
                    checked={smtpSettings.smtpSecure} 
                    onChange={e => setSmtpSettings({...smtpSettings, smtpSecure: e.target.checked})} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="smtp-secure" className="form-label mb-0 cursor-pointer" style={{ userSelect: 'none' }}>
                    <strong>Usar conexión segura SSL/TLS</strong> (Activar para puerto 465, desactivar para puerto 587 u otros)
                  </label>
                </div>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Plantilla del Asunto del Correo</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Factura {numero} - RyB Limpiezas"
                  value={smtpSettings.emailSubjectTemplate} 
                  onChange={e => setSmtpSettings({...smtpSettings, emailSubjectTemplate: e.target.value})} 
                  required 
                />
                <small style={{ color: 'var(--text-muted)' }}>Puedes usar variables dinámicas: <code>{`{numero}`}</code>, <code>{`{comunidad}`}</code>, <code>{`{mes}`}</code>, <code>{`{año}`}</code></small>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Plantilla del Cuerpo del Correo (Soporta HTML)</label>
                <textarea 
                  className="form-textarea" 
                  rows="4" 
                  placeholder="<p>Estimado cliente,</p><p>Le adjuntamos la factura...</p>"
                  value={smtpSettings.emailBodyTemplate} 
                  onChange={e => setSmtpSettings({...smtpSettings, emailBodyTemplate: e.target.value})} 
                  required 
                />
                <small style={{ color: 'var(--text-muted)' }}>Puedes usar variables dinámicas: <code>{`{numero}`}</code>, <code>{`{comunidad}`}</code>, <code>{`{mes}`}</code>, <code>{`{año}`}</code></small>
              </div>
            </div>

            {smtpMsg && (
              <div className={`p-3 rounded text-sm ${smtpMsg.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {smtpMsg}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={smtpLoading}>
              {smtpLoading ? 'Guardando...' : 'Guardar Ajustes de Correo'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
