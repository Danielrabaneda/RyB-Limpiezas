import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { updateEmail, updatePassword } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../config/firebase';

export default function SettingsPage() {
  const { currentUser, userProfile } = useAuth();
  
  // Profile state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Company state
  const [companyName, setCompanyName] = useState('RyB Limpiezas');
  const [logoUrl, setLogoUrl] = useState('');
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyMsg, setCompanyMsg] = useState('');
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name || '');
      setEmail(currentUser.email || '');
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
        }
      } catch (e) {
        console.error("No se pudo cargar la configuración", e);
      }
    }
    fetchSettings();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMsg('');
    try {
      if (name !== userProfile.name) {
        await updateDoc(doc(db, 'users', currentUser.uid), { name });
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
      await setDoc(doc(db, 'settings', 'global'), {
        companyName,
        logoUrl
      }, { merge: true });
      setCompanyMsg('Ajustes de la empresa actualizados. Solo aplicarán tras recargar recargar la página principal.');
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
              <input 
                type="password" 
                className="form-input" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="Dejar en blanco para no cambiar"
                minLength={6}
              />
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
      </div>
    </div>
  );
}
