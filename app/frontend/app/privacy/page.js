import React from 'react';
import fs from 'fs';
import path from 'path';

export default function PrivacyPage() {
  // In a real implementation, you might want to fetch this from an API
  // or use a markdown renderer. For now, we'll provide a link to the policy.
  
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '40px 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      lineHeight: '1.6',
      color: '#333'
    }}>
      <h1 style={{ 
        fontSize: '2.5rem', 
        marginBottom: '1rem',
        color: '#2c3e50'
      }}>
        Privacy Policy
      </h1>
      
      <p style={{ 
        color: '#666', 
        marginBottom: '2rem',
        fontSize: '1.1rem'
      }}>
        Last Updated: November 20, 2025
      </p>

      <div style={{
        background: '#f8f9fa',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: '1px solid #e9ecef'
      }}>
        <h2 style={{ marginTop: 0 }}>Quick Summary</h2>
        <ul style={{ lineHeight: '1.8' }}>
          <li><strong>Data Collection:</strong> We collect account information and financial data (via Plaid) to provide our services.</li>
          <li><strong>Data Protection:</strong> All sensitive data is encrypted at-rest using AES-256-GCM encryption.</li>
          <li><strong>Your Rights:</strong> You can access, correct, delete, or export your data at any time.</li>
          <li><strong>No Data Selling:</strong> We do not sell your personal information to third parties.</li>
          <li><strong>Security:</strong> Multi-factor authentication and secure access controls protect your account.</li>
        </ul>
      </div>

      <div style={{
        background: '#fff',
        padding: '30px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <h2>Full Privacy Policy</h2>
        <p>
          For the complete Privacy Policy document, including detailed information about:
        </p>
        <ul>
          <li>What information we collect and how we use it</li>
          <li>How we store and protect your information</li>
          <li>Your privacy rights (GDPR, CCPA)</li>
          <li>Data sharing and disclosure practices</li>
          <li>Contact information for privacy inquiries</li>
        </ul>
        <p>
          Please see the full Privacy Policy document in our documentation:
        </p>
        <a 
          href="/docs/PRIVACY_POLICY.md" 
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#667eea',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            marginTop: '1rem',
            fontWeight: '500'
          }}
        >
          View Full Privacy Policy
        </a>
      </div>

      <div style={{
        background: '#e8f4f8',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #bee5eb'
      }}>
        <h3 style={{ marginTop: 0 }}>Your Privacy Rights</h3>
        <p>You have the right to:</p>
        <ul>
          <li><strong>Access</strong> your personal information</li>
          <li><strong>Correct</strong> inaccurate information</li>
          <li><strong>Delete</strong> your account and data</li>
          <li><strong>Export</strong> your data</li>
          <li><strong>Opt-out</strong> of certain processing</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          To exercise these rights, use the account management features in the application or contact us.
        </p>
      </div>

      <div style={{
        marginTop: '2rem',
        padding: '20px',
        background: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '0.9rem',
        color: '#666'
      }}>
        <p style={{ margin: 0 }}>
          <strong>Questions?</strong> If you have questions about this Privacy Policy or wish to exercise your privacy rights, 
          please contact us through the application or use the contact information provided in the full policy document.
        </p>
      </div>
    </div>
  );
}

