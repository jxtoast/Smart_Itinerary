'use client'
import { signinWithGoogle } from '@/lib/actions'
import React from 'react'

const AuthForm = () => {
  return (
    <form className="flex flex-col gap-4">
    <button 
        className="btn flex items-center justify-center gap-2 py-3 px-8 text-black bg-white border border-gray-300 rounded-md shadow-md hover:bg-gray-100 transition-all"
        onClick={signinWithGoogle}
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