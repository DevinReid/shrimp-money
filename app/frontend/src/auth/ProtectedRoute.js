import React from 'react';
import { useAuth } from './AuthContext';
import Login from './Login';
import Register from './Register';
import MFASetup from './MFASetup';
import MFAVerify from './MFAVerify';

function ProtectedRoute({ children }) {
  const { user, token, mfaVerified, loading } = useAuth();
  const [showRegister, setShowRegister] = React.useState(false);
  const [showMFASetup, setShowMFASetup] = React.useState(false);
  const [showMFAVerify, setShowMFAVerify] = React.useState(false);

  React.useEffect(() => {
    if (user && !user.mfaEnabled && !showMFASetup) {
      setShowMFASetup(true);
    } else if (user && user.mfaEnabled && !mfaVerified && !showMFAVerify) {
      setShowMFAVerify(true);
    }
  }, [user, mfaVerified, showMFASetup, showMFAVerify]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{ 
          background: 'white', 
          padding: '40px', 
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)'
        }}>
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!user || !token) {
    if (showRegister) {
      return <Register onLoginClick={() => setShowRegister(false)} />;
    }
    return <Login onRegisterClick={() => setShowRegister(true)} onMFARequired={() => setShowMFAVerify(true)} />;
  }

  if (user && !user.mfaEnabled && showMFASetup) {
    return (
      <MFASetup 
        onComplete={() => {
          setShowMFASetup(false);
          window.location.reload();
        }} 
      />
    );
  }

  if (user && user.mfaEnabled && !mfaVerified && showMFAVerify) {
    return (
      <MFAVerify 
        onSuccess={() => {
          setShowMFAVerify(false);
          window.location.reload();
        }} 
      />
    );
  }

  if (user && mfaVerified) {
    return children;
  }

  // Fallback - should not reach here
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{ 
        background: 'white', 
        padding: '40px', 
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)'
      }}>
        <h2>Setting up authentication...</h2>
      </div>
    </div>
  );
}

export default ProtectedRoute;

