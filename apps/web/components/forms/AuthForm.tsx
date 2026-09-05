'use client'
import { signinWithGoogle } from '@/lib/actions'
import React from 'react'
// Deep import, not the @smart/api-client barrel: the barrel pulls the shared
// server adapters (nodemailer → Node "net") into the browser bundle — same
// reason context/AuthContext.tsx deep-imports.
import { isMockModeEnabled } from '@smart/api-client/src/env';

const AuthForm = () => {
  const handleSignIn = () => {
    if (isMockModeEnabled()) {
      // Mock mode (Cypress/offline): the legacy server action, unchanged.
      void signinWithGoogle();
      return;
    }
    // Real mode: go straight to /auth/start (dev token locally, Cognito
    // hosted UI with a pool). A plain navigation — this button used to sit
    // in a <form> without type="button", so the native submit reloaded the
    // page as "/?" and raced away the server-action redirect + its cookie.
    window.location.href = '/auth/start';
  };

  return (
    <form className="flex flex-col gap-4">
    <button
        type="button"
        className="btn flex items-center justify-center gap-2 py-3 px-8 text-black bg-white border border-gray-300 rounded-md shadow-md hover:bg-gray-100 transition-all"
        onClick={handleSignIn}
    >
        {/* Google Logo */}
        <img
        src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
        alt="Google Logo"
        className="w-6 h-6 mb-1"
        />
        <span className="mb-1">Sign in with Google</span>
    </button>
    </form>

  )
}

export default AuthForm