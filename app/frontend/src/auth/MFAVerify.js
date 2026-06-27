import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import './Auth.css';

function MFAVerify({ onSuccess }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { token: authToken, verifyMFA } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token || token.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);

    const result = await verifyMFA(token, true);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || 'Invalid code. Please try again.');
      setLoading(false);
    }
  };

  const openMicrosoftAuthenticator = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      window.location.href = 'msauth://';
      setTimeout(() => {
        window.open('https://apps.apple.com/app/microsoft-authenticator/id983156458', '_blank');
      }, 500);
    } else if (isAndroid) {
      window.location.href = 'msauth://';
      setTimeout(() => {
        window.open('https://play.google.com/store/apps/details?id=com.azure.authenticator', '_blank');
      }, 500);
    } else {
      window.open('https://www.microsoft.com/en-us/security/mobile-authenticator-app', '_blank');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="mfa-header">
          <div className="mfa-icon">🔐</div>
          <h2>Microsoft Authenticator</h2>
          <p className="auth-subtitle">
            Enter the 6-digit code from Microsoft Authenticator
          </p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="mfa-verify-hint">
          <button
            type="button"
            onClick={openMicrosoftAuthenticator}
            className="microsoft-auth-button-small"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.4 11.4H1V1h10.4v10.4zM23 11.4H12.6V1H23v10.4zM11.4 23H1V12.6h10.4V23zM23 23H12.6V12.6H23V23z" fill="currentColor"/>
            </svg>
            Open Microsoft Authenticator
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="mfa-verify-token">Enter 6-digit code</label>
            <input
              type="text"
              id="mfa-verify-token"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              pattern="[0-9]{6}"
              placeholder="000000"
              disabled={loading}
              className="mfa-input"
              autoFocus
            />
            <small>Open Microsoft Authenticator and enter the code shown</small>
          </div>

          <button type="submit" className="auth-button" disabled={loading || token.length !== 6}>
            {loading ? 'Verifying...' : '✓ Verify'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default MFAVerify;

