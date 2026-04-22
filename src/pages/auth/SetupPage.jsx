import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { SEED_ADMIN, SEED_TASK_TEMPLATES } from '../../seed/seedData';
import { collection, addDoc } from 'firebase/firestore';

export default function SetupPage() {
  const [email, setEmail] = useState(SEED_ADMIN.email);
  const [password, setPassword] = useState(SEED_ADMIN.password);
  const [name, setName] = useState(SEED_ADMIN.profile.name);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSetup(e) {
    e.preventDefault();
    setLoading(true);
    setStatus('Creando usuario admin...');

    try {
      // Create auth user
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      setStatus('Usuario creado. Guardando perfil...');

      // Create Firestore profile
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name,
        email,
        phone: '',
        role: 'admin',
        active: true,
        createdAt: serverTimestamp(),
      });
      setStatus('Perfil admin guardado. Creando plantillas de tareas...');

      // Create task templates
      for (const template of SEED_TASK_TEMPLATES) {
        await addDoc(collection(db, 'taskTemplates'), {
          ...template,
          createdAt: serverTimestamp(),
        });
      }

      setStatus('✅ ¡Setup completado! Ya puedes iniciar sesión.');
      setDone(true);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setStatus('⚠️ Este email ya está registrado. Intentando crear perfil admin...');
        // Try to still set up templates
        try {
          for (const template of SEED_TASK_TEMPLATES) {
            await addDoc(collection(db, 'taskTemplates'), {
              ...template,
              createdAt: serverTimestamp(),
            });
          }
          setStatus('✅ Plantillas creadas. Inicia sesión con tu email/contraseña existente.');
          setDone(true);
        } catch (err2) {
          setStatus('❌ Error: ' + err2.message);
        }
      } else {
        setStatus('❌ Error: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card animate-slideUp" style={{ maxWidth: '480px' }}>
        <div className="login-logo">
          <div className="login-logo-icon">⚙️</div>
          <h1 className="login-title">Setup inicial</h1>
          <p className="login-subtitle">Crear usuario admin y datos iniciales</p>
        </div>

        {status && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            background: done ? 'rgba(16, 185, 129, 0.1)' : 'rgba(37, 99, 235, 0.1)',
            border: `1px solid ${done ? 'rgba(16, 185, 129, 0.3)' : 'rgba(37, 99, 235, 0.3)'}`,
            color: done ? '#6ee7b7' : '#93c5fd',
            fontSize: 'var(--font-sm)',
          }}>
            {status}
          </div>
        )}

        {!done && (
          <form onSubmit={handleSetup}>
            <div className="form-group">
              <label className="form-label">Nombre del admin</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <button type="submit" className="btn btn-primary btn-lg w-full mt-4" disabled={loading}>
              {loading ? '⏳ Configurando...' : '🚀 Iniciar Setup'}
            </button>
          </form>
        )}

        {done && (
          <a href="/login" className="btn btn-success btn-lg w-full mt-4" style={{ textDecoration: 'none' }}>
            → Ir al Login
          </a>
        )}

        <p style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
          ⚠️ Elimina esta ruta /setup después de usarla
        </p>
      </div>
    </div>
  );
}
