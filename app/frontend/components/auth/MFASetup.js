'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import './Auth.css';

function MFASetup({ onComplete }) {
  const [qrCode, setQrCode] = useState(null);
  const [secret, setSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const { token, verifyMFA, user } = useAuth();

  useEffect(() => {
    // Detect if user is on mobile device
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    };
    setIsMobile(checkMobile());
  }, []);

  useEffect(() => {
    // Wait for token to be available before setting up MFA
    if (token) {
      setupMFA();
    }
  }, [token]);

  const setupMFA = async () => {
    if (!token) {
      setError('Authentication token not available. Please log in again.');
      setSetupLoading(false);
      return;
    }

    try {
      setSetupLoading(true);
      const response = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setQrCode(data.qrCode);
        setSecret(data.secret);
      } else {
        setError(data.error || 'Failed to set up MFA');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  };

  const openMicrosoftAuthenticator = () => {
    // Try to open Microsoft Authenticator app
    // On iOS: msauth://
    // On Android: msauth:// or com.microsoft.authenticator://
    // Fallback: Open app store if not installed
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      // Try to open Microsoft Authenticator on iOS
      window.location.href = 'msauth://';
      // Fallback to App Store after a delay
      setTimeout(() => {
        window.open('https://apps.apple.com/app/microsoft-authenticator/id983156458', '_blank');
      }, 500);
    } else if (isAndroid) {
      // Try to open Microsoft Authenticator on Android
      window.location.href = 'msauth://';
      // Fallback to Play Store after a delay
      setTimeout(() => {
        window.open('https://play.google.com/store/apps/details?id=com.azure.authenticator', '_blank');
      }, 500);
    } else {
      // Desktop - open Microsoft Authenticator website or instructions
      window.open('https://www.microsoft.com/en-us/security/mobile-authenticator-app', '_blank');
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!mfaCode || mfaCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);

    const result = await verifyMFA(mfaCode, false);

    if (result.success) {
      onComplete();
    } else {
      setError(result.error || 'Invalid code. Please try again.');
      setLoading(false);
    }
  };

  if (setupLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Setting up MFA...</h2>
          <p>Please wait while we generate your MFA secret.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="mfa-header">
          <div className="mfa-icon">🔐</div>
          <h2>Set Up Microsoft Authenticator</h2>
          <p className="auth-subtitle">
            Secure your account with Microsoft Authenticator
          </p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {qrCode && (
          <div className="mfa-setup">
            {/* Microsoft Authenticator Button */}
            <div className="microsoft-auth-section">
              <button
                type="button"
                onClick={openMicrosoftAuthenticator}
                className="microsoft-auth-button"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.4 11.4H1V1h10.4v10.4zM23 11.4H12.6V1H23v10.4zM11.4 23H1V12.6h10.4V23zM23 23H12.6V12.6H23V23z" fill="currentColor"/>
                </svg>
                {isMobile ? 'Open Microsoft Authenticator' : 'Get Microsoft Authenticator'}
              </button>
              <p className="microsoft-auth-hint">
                {isMobile 
                  ? 'Tap the button above to open the app, then scan the QR code below'
                  : 'Install Microsoft Authenticator on your phone, then scan the QR code'}
              </p>
            </div>

            {/* Step-by-step instructions */}
            <div className="mfa-instructions">
              <h3>Quick Setup Steps:</h3>
              <ol className="mfa-steps">
                <li>
                  {isMobile ? (
                    <>Tap the button above to open <strong>Microsoft Authenticator</strong></>
                  ) : (
                    <>Open <strong>Microsoft Authenticator</strong> on your phone</>
                  )}
                </li>
                <li>Tap the <strong>+</strong> button to add an account</li>
                <li>Select <strong>"Work or school account"</strong> or <strong>"Other"</strong></li>
                <li>Scan the QR code below</li>
                <li>Enter the 6-digit code to verify</li>
              </ol>
            </div>

            {/* QR Code */}
            <div className="qr-code-container">
              <div className="qr-code-wrapper">
                <img src={qrCode} alt="MFA QR Code" className="qr-code" />
                <div className="qr-code-label">Scan this QR code</div>
              </div>
            </div>

            {/* Manual Entry Option */}
            <details className="mfa-manual-entry">
              <summary>Can't scan? Enter code manually</summary>
              <div className="mfa-secret">
                <p><strong>Enter this code in Microsoft Authenticator:</strong></p>
                <code className="secret-code">{secret}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(secret)}
                  className="copy-secret-button"
                >
                  📋 Copy Code
                </button>
              </div>
            </details>

            {/* Verification Form */}
            <form onSubmit={handleVerify} className="mfa-verify-form">
              <div className="form-group">
                <label htmlFor="mfa-token">
                  Enter 6-digit code from Microsoft Authenticator
                </label>
                <input
                  type="text"
                  id="mfa-token"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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

              <button type="submit" className="auth-button" disabled={loading || mfaCode.length !== 6}>
                {loading ? 'Verifying...' : '✓ Verify & Enable MFA'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default MFASetup;

